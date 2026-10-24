package app.satya.prahari

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import app.satya.config.Config
import app.satya.core.Hash
import app.satya.core.Lexicon
import app.satya.core.Normalize
import app.satya.core.Rules
import app.satya.sakshi.SakshiDb
import app.satya.sakshi.WatchEntity
import app.satya.vachan.RegistryStore

/** One finance app on this phone, as the Apps page shows it. */
data class FinanceApp(
    val pkg: String,
    val label: String,
    val installer: String?,
    val source: String,
    val certSha256: String?,
    val owner: String,
    val bank: String?,
    val verified: Boolean,
    val suspect: Boolean,
) {
    val fingerprintPrefix: String? get() = certSha256?.let { Normalize.app(it).prefix }
    val kycSafe: String get() = when {
        verified && bank != null -> "Yes. This is ${owner}’s own app."
        verified -> "Yes, inside the app. It never asks for KYC by chat or call."
        suspect -> "No. Don’t enter KYC details, PIN or OTP in this app."
        else -> "Not confirmed. Use your bank’s app from the Play Store instead."
    }
}

/**
 * Know Your App (Section 8.2). The app list stays on the phone; a check sends only the 5-char
 * prefix of the signing certificate's fingerprint.
 */
class KnowYourApp(private val ctx: Context, private val registry: RegistryStore, private val db: SakshiDb) {
    private val pm = ctx.packageManager
    private val TRUSTED_STORES = mapOf("com.android.vending" to "Play Store", "com.sec.android.app.samsungapps" to "Galaxy Store")
    private val FIN_WORDS = listOf("bank", "kyc", "yono", "upi", "pay", "loan", "wallet", "credit", "finance", "netbanking", "imobile")

    fun certSha256(pkg: String): String? = runCatching {
        val info = pm.getPackageInfo(pkg, PackageManager.GET_SIGNING_CERTIFICATES)
        val signers = info.signingInfo?.let { si -> if (si.hasMultipleSigners()) si.apkContentsSigners else si.signingCertificateHistory }
        signers?.firstOrNull()?.let { Hash.sha256Hex(it.toByteArray()) }
    }.getOrNull()

    private fun installerOf(pkg: String): String? = runCatching { pm.getInstallSourceInfo(pkg).installingPackageName }.getOrNull()

    private fun sourceLabel(installer: String?, system: Boolean): String = when {
        system -> "Pre-installed"
        installer != null && installer in TRUSTED_STORES -> TRUSTED_STORES.getValue(installer)
        installer == "com.whatsapp" -> "Sideloaded · sent on WhatsApp"
        installer == "com.android.chrome" || installer == "com.sec.android.app.sbrowser" -> "Sideloaded · downloaded in a browser"
        installer == "com.android.shell" -> "Sideloaded · installed over USB"
        installer.isNullOrBlank() -> "Sideloaded · unknown source"
        else -> "Sideloaded · ${runCatching { pm.getApplicationLabel(pm.getApplicationInfo(installer, 0)).toString() }.getOrDefault(installer)}"
    }

    private fun mentionsBank(text: String): String? {
        val tk = Rules.toks(text)
        for ((bank, al) in Lexicon.ALIASES) if (Rules.finds(tk, al).isNotEmpty()) return bank
        return null
    }

    fun assess(pkg: String): FinanceApp? {
        if (pkg == ctx.packageName || pkg.startsWith("app.satya")) return null
        val info: PackageInfo = runCatching { pm.getPackageInfo(pkg, 0) }.getOrNull() ?: return null
        val ai = info.applicationInfo ?: return null
        val label = pm.getApplicationLabel(ai).toString()
        val reg = registry.now
        val hay = "$label $pkg".lowercase()
        val official = reg?.book?.banks?.flatMap { b -> b.officialApps.map { b to it } }?.firstOrNull { it.second.pkg == pkg }
        val upi = reg?.book?.upiApps?.firstOrNull { it.pkg == pkg }
        val bankWord = mentionsBank(hay)
        val isFinance = official != null || upi != null || bankWord != null || FIN_WORDS.any { hay.contains(it) }
        if (!isFinance) return null
        val system = (ai.flags and ApplicationInfo.FLAG_SYSTEM) != 0
        val installer = installerOf(pkg)
        val cert = certSha256(pkg)
        val expectedCert = official?.second?.certSha256 ?: upi?.certSha256
        val certOk = expectedCert == null || expectedCert.equals(cert, ignoreCase = true)
        val fromStore = system || (installer != null && installer in TRUSTED_STORES)
        val verified = (official != null || upi != null) && certOk && (fromStore || expectedCert != null)
        val claimsBank = bankWord != null || hay.contains("kyc") || hay.contains("yono") || hay.contains("bank")
        val suspect = !verified && claimsBank && !system
        val owner = when {
            official != null -> official.first.name
            upi != null -> ownerOf(pkg)
            else -> "No company on record"
        }
        return FinanceApp(pkg, label, installer, sourceLabel(installer, system), cert, owner, official?.first?.id ?: bankWord, verified, suspect)
    }

    private fun ownerOf(pkg: String?): String = when (pkg) {
        "com.google.android.apps.nbu.paisa.user" -> "Google LLC"
        "com.phonepe.app" -> "PhonePe Pvt Ltd"
        "net.one97.paytm" -> "One97 Communications Ltd"
        "in.org.npci.upiapp" -> "NPCI"
        "com.samsung.android.spay" -> "Samsung Electronics"
        else -> "On the UPI app list"
    }

    /** The Apps page list, unknown and suspect first. */
    fun list(): List<FinanceApp> = runCatching {
        pm.getInstalledPackages(0).mapNotNull { assess(it.packageName) }.sortedWith(compareBy({ it.verified }, { it.label.lowercase() }))
    }.getOrDefault(emptyList())

    /** Called for every new install (PACKAGE_ADDED inside the accessibility service, or the sync fallback). */
    suspend fun onInstalled(pkg: String, notify: (FinanceApp) -> Unit) {
        val app = assess(pkg) ?: return
        if (!app.suspect) return
        db.watch().put(WatchEntity(pkg, app.label, "Claims to be a bank or KYC app but is not on any official list", app.bank, System.currentTimeMillis()))
        notify(app)
    }

    /** getChangedPackages fallback (Section 8.1): catches installs missed while the service was off. */
    suspend fun scanChangedPackages(notify: (FinanceApp) -> Unit = {}) {
        val seq = Config.now.lastPkgSeq
        val changed = runCatching { pm.getChangedPackages(seq) }.getOrNull() ?: return
        Config.update { it.lastPkgSeq(changed.sequenceNumber) }
        if (seq == 0) return // first run: baseline only
        for (p in changed.packageNames) onInstalled(p, notify)
    }

    /** Doctor tool: package + cert SHA-256 of every finance app, to fill official_apps in the registry. */
    fun exportFingerprints(): String = list().joinToString("\n") { "${it.label}\t${it.pkg}\t${it.certSha256 ?: "?"}\t${it.source}" }
}
