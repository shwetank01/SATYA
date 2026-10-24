package app.satya.vachan

import android.content.Context
import app.satya.BuildConfig
import app.satya.config.Config
import app.satya.core.RuleBook
import app.satya.crypto.Sodium
import app.satya.kavach.Kavach
import app.satya.kavach.KavachClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

@Serializable data class BundleCard(val card_json: String, val sig: String, val signed_by: String, val version: Int = 1)
@Serializable data class BundleCert(val sign_pk: String, val box_pk: String = "", val cert_sig: String)
@Serializable data class BundleBank(val bank_id: String, val name: String, val cert: BundleCert, val card: BundleCard)
@Serializable data class BundleGlobal(val card_json: String, val sig: String, val signed_by: String = "satya_root")
@Serializable data class BlockItem(val h: String, val t: String, val by: String, val label: String)
@Serializable data class RegistryBundle(val v: Int = 1, val generated_at: String, val global: BundleGlobal, val banks: List<BundleBank>, val blocklist: List<BlockItem> = emptyList())

/** A verified registry: what PRAHARI judges with. */
data class Registry(
    val book: RuleBook,
    /** bank_id -> verified box public key (hex), only for banks that can receive reports. */
    val boxKeys: Map<String, String>,
    val blocklist: Map<String, BlockItem>,
    val source: String,
    val generatedAt: String,
    val verifiedCards: Int,
    val rejected: List<String>,
)

/**
 * VACHAN on the phone (Section 8.7). Verification order: cert_sig with the pinned ROOT_PK, then the
 * card signature with cert.sign_pk (or ROOT_PK when signed_by = satya_root), then parse.
 * An invalid card is dropped and the last good copy is kept.
 */
class RegistryStore(private val ctx: Context, private val client: KavachClient) {
    private val json = Json { ignoreUnknownKeys = true }
    private val cacheFile = File(ctx.filesDir, "registry_bundle.json")
    private val _state = MutableStateFlow<Registry?>(null)
    val state: StateFlow<Registry?> = _state
    val now: Registry? get() = _state.value

    /** Cached copy if present and valid, else the signed asset shipped in the APK (works offline). */
    fun loadLocal(): Registry? {
        val cached = runCatching { if (cacheFile.exists()) verify(cacheFile.readText(), "cache") else null }.getOrNull()
        val reg = cached?.takeIf { it.verifiedCards > 0 } ?: runCatching {
            verify(ctx.assets.open("registry_bundle.json").bufferedReader().use { it.readText() }, "assets")
        }.getOrNull()
        if (reg != null) _state.value = reg
        return reg
    }

    /** U8: fetch, verify, cache. Returns a short human result for the UI and Doctor. */
    suspend fun sync(): Result<Registry> {
        val r = client.send(Kavach.sync())
        if (!r.ok || r.body == null) return Result.failure(IllegalStateException(r.error ?: "HTTP ${r.code}"))
        val reg = runCatching { verify(r.body, "network") }.getOrElse { return Result.failure(it) }
        if (reg.verifiedCards == 0) return Result.failure(IllegalStateException("no card verified"))
        // Keep the last good copy of any bank whose new card failed verification.
        val prev = _state.value
        val merged = if (prev != null && reg.rejected.isNotEmpty()) mergeKeepingGood(prev, reg) else reg
        cacheFile.writeText(r.body)
        _state.value = merged
        Config.update { it.lastSync(System.currentTimeMillis()) }
        return Result.success(merged)
    }

    private fun mergeKeepingGood(prev: Registry, next: Registry): Registry {
        val keepIds = next.rejected.mapNotNull { it.substringBefore(':').takeIf { id -> prev.book.bank(id) != null } }.toSet()
        val banks = next.book.banks + prev.book.banks.filter { it.id in keepIds && next.book.bank(it.id) == null }
        return next.copy(book = next.book.copy(banks = banks), boxKeys = prev.boxKeys.filterKeys { it in keepIds } + next.boxKeys)
    }

    fun verify(text: String, source: String): Registry {
        val bundle = json.decodeFromString(RegistryBundle.serializer(), text)
        val root = BuildConfig.ROOT_PK
        val rejected = mutableListOf<String>()
        require(Sodium.verify(bundle.global.card_json, bundle.global.sig, root)) { "GLOBAL card signature invalid" }
        val good = mutableListOf<Pair<String, Boolean>>()
        val versions = HashMap<String, Int>()
        val boxKeys = HashMap<String, String>()
        for (b in bundle.banks) {
            val certOk = Sodium.verify(Sodium.certMessage(b.bank_id, b.cert.sign_pk, b.cert.box_pk), b.cert.cert_sig, root)
            if (!certOk) { rejected += "${b.bank_id}: certificate"; continue }
            val signer = if (b.card.signed_by == "satya_root") root else b.cert.sign_pk
            if (!Sodium.verify(b.card.card_json, b.card.sig, signer)) { rejected += "${b.bank_id}: card signature"; continue }
            val parsedId = runCatching { json.parseToJsonElement(b.card.card_json).let { (it as kotlinx.serialization.json.JsonObject)["bank_id"]?.toString()?.trim('"') } }.getOrNull()
            if (parsedId != b.bank_id) { rejected += "${b.bank_id}: card bank_id mismatch"; continue }
            val hasBox = b.cert.box_pk.length == 64
            if (hasBox) boxKeys[b.bank_id] = b.cert.box_pk
            good += b.card.card_json to hasBox
            versions[b.bank_id] = b.card.version
        }
        val book = RuleBook.fromCards(bundle.global.card_json, good, versions)
        return Registry(book, boxKeys, bundle.blocklist.associateBy { it.h }, source, bundle.generated_at, 1 + good.size, rejected)
    }
}
