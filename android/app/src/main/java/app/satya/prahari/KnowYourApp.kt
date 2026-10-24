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
    /** Plain-words reason for the verdict, shown on the app's page. */
    val why: String = "",
) {
    val fingerprintPrefix: String? get() = certSha256?.let { Normalize.app(it).prefix }
    val kycSafe: String get() = when {
        verified && bank != null -> "Yes. This is ${owner}’s own app."
        verified -> "Yes, inside the app. It never asks for KYC by chat or call."
        suspect -> "No. Don’t enter KYC details, PIN or OTP in this app."
        else -> "Probably, if you installed it yourself from the Play Store. SATYA can’t confirm the owner."
    }
}

/**
 * Genuine Indian finance apps outside the five Promise Card banks, by package id. A match counts only
 * when the app also came from a trusted store (or the phone maker): a sideloaded APK can copy any
 * package id, a store listing can't.
 */
object KnownApps {
    val OWNERS: Map<String, String> = mapOf(
        // Banks
        "com.msf.kbank.mobile" to "Kotak Mahindra Bank",
        "com.bankofbaroda.mconnect" to "Bank of Baroda",
        "com.canarabank.mobility" to "Canara Bank",
        "com.infrasoft.uboi" to "Union Bank of India",
        "com.idfcfirstbank.optimus" to "IDFC FIRST Bank",
        "com.fedmobile" to "Federal Bank",
        "com.rblbank.mobank" to "RBL Bank",
        "com.myairtelapp" to "Airtel Payments Bank",
        "com.enstage.wibmo.hdfc" to "HDFC Bank",
        "com.freecharge.android" to "Axis Bank (Freecharge)",
        // Wallets, UPI, cards and lenders
        "in.amazon.mShop.android.shopping" to "Amazon",
        "com.dreamplug.androidapp" to "CRED",
        "com.mobikwik_new" to "MobiKwik",
        "com.paypal.android.p2pmobile" to "PayPal",
        "com.naviapp" to "Navi",
        "money.jupiter" to "Jupiter",
        "com.epifi.paisa" to "Fi",
        "indwin.c3.shareapp" to "slice",
        "org.altruist.BajajExperia" to "Bajaj Finserv",
        // Brokers
        "com.zerodha.kite3" to "Zerodha",
        "com.nextbillion.groww" to "Groww",
        "com.msf.angelmobile" to "Angel One",
    )
}

/**
 * Know Your App (Section 8.2). The app list stays on the phone; a check sends only the 5-char
 * prefix of the signing certificate's fingerprint, and "Ask SATYA AI" sends one app's public metadata.
 *
 * v0.3 rule: an app is a *suspect* only if it was NOT installed from a trusted store and it presents
 * itself as a bank, KYC or payment app, or if it copies an official package with the wrong signature.
 * Before v0.3 every app with "bank" or "pay" in its name that was not one of the five Promise Card
 * banks was a suspect, including genuine Play Store apps such as Kotak or Canara.
 */
class KnowYourApp(private val ctx: Context, private val registry: RegistryStore, private val db: SakshiDb) {
    private val pm = ctx.packageManager
    private val TRUSTED_STORES = mapOf(
        "com.android.vending" to "Play Store",
        "com.sec.android.app.samsungapps" to "Galaxy Store",
        "com.xiaomi.mipicks" to "GetApps",
        "com.heytap.market" to "App Market",
        "com.oppo.market" to "App Market",
        "com.bbk.appstore" to "V-Appstore",
    )
    /** Matched inside a word ("netbanking", "mywallet"). */
    private val FIN_LONG = listOf("bank", "yono", "loan", "wallet", "credit", "finance", "imobile", "reward", "refund", "cashback")
    /** Matched only as a whole word or a word's start or end ("paytm", "gpay", "upi"), never inside "cupid". */
    private val FIN_SHORT = listOf("kyc", "upi", "pay")
    private val BANKY = listOf("bank", "kyc", "yono", "upi", "reward")

    private fun words(hay: String) = hay.split(Regex("[^a-z0-9]+")).filter { it.length > 1 }
    private fun finance(hay: String) = words(hay).any { w -> FIN_LONG.any { w.contains(it) } || FIN_SHORT.any { w == it || w.startsWith(it) || w.endsWith(it) } }
    private fun banky(hay: String) = words(hay).any { w -> BANKY.any { w.contains(it) } }

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
        val known = KnownApps.OWNERS[pkg]
        val bankWord = mentionsBank(hay)
        val system = (ai.flags and ApplicationInfo.FLAG_SYSTEM) != 0
        // Built-in apps are listed only when they are on a list or name a bank; a generic "wallet" or
        // "pay" in a system app's name is not a reason to call it unknown.
        val isFinance = official != null || upi != null || known != null || bankWord != null || (!system && finance(hay))
        if (!isFinance) return null
        val installer = installerOf(pkg)
        val cert = certSha256(pkg)
        val fromStore = system || (installer != null && installer in TRUSTED_STORES)
        val listed = official != null || upi != null
        val expectedCert = official?.second?.certSha256 ?: upi?.certSha256
        val certMismatch = expectedCert != null && cert != null && !expectedCert.equals(cert, ignoreCase = true)
        val verified = when {
            certMismatch -> false
            listed -> fromStore || expectedCert != null
            known != null -> fromStore
            else -> false
        }
        val claimsBank = bankWord != null || banky(hay)
        val suspect = !system && !verified && (certMismatch || (!fromStore && (listed || known != null || claimsBank || finance(hay))))
        val owner = when {
            official != null -> official.first.name
            upi != null -> ownerOf(pkg)
            known != null -> known
            else -> "No company on record"
        }
        val why = when {
            certMismatch -> "It uses the package name of ${owner}’s app but is signed by someone else. This is a repackaged copy."
            verified && listed -> "On ${owner}’s official app list and installed from ${sourceLabel(installer, system)}."
            verified -> "A known genuine app from $owner, installed from ${sourceLabel(installer, system)}."
            suspect && (listed || known != null) -> "It has $owner’s package name but was not installed from an app store. Real bank apps come from the Play Store."
            suspect && claimsBank -> "It presents itself as a bank or KYC app${bankWord?.let { " ($it)" } ?: ""} but was installed from outside an app store, the way KYC-scam apps spread."
            suspect -> "A payment-related app installed from outside an app store."
            fromStore -> "Installed from ${sourceLabel(installer, system)}. It is not on SATYA’s lists, so the owner is not confirmed."
            else -> "Not on SATYA’s lists."
        }
        return FinanceApp(pkg, label, installer, sourceLabel(installer, system), cert, owner, official?.first?.id ?: bankWord, verified, suspect, why)
    }

    private fun ownerOf(pkg: String?): String = when (pkg) {
        "com.google.android.apps.nbu.paisa.user" -> "Google LLC"
        "com.phonepe.app" -> "PhonePe Pvt Ltd"
        "net.one97.paytm" -> "One97 Communications Ltd"
        "in.org.npci.upiapp" -> "NPCI"
        "com.samsung.android.spay" -> "Samsung Electronics"
        else -> "On the UPI app list"
    }

    /** The Apps page list: suspects first, then unconfirmed, then verified. */
    fun list(): List<FinanceApp> = runCatching {
        pm.getInstalledPackages(0).mapNotNull { assess(it.packageName) }
            .sortedWith(compareBy({ !it.suspect }, { it.verified }, { it.label.lowercase() }))
    }.getOrDefault(emptyList())

    /** Called for every new install (PACKAGE_ADDED inside the accessibility service, or the sync fallback). */
    suspend fun onInstalled(pkg: String, notify: (FinanceApp) -> Unit) {
        val app = assess(pkg) ?: return
        if (!app.suspect) return
        db.watch().put(WatchEntity(pkg, app.label, app.why, app.bank, System.currentTimeMillis()))
        notify(app)
    }

    /**
     * Drops watchlist entries that are no longer suspects (uninstalled, or flagged by the pre-0.3 rule).
     * Suspect Watch blocks KYC screens of watched apps, so a genuine bank app must never stay on it.
     */
    suspend fun pruneWatch(): Int {
        var removed = 0
        for (w in db.watch().list()) if (assess(w.pkg)?.suspect != true) { db.watch().remove(w.pkg); removed++ }
        return removed
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
