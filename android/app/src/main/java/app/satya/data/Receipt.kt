package app.satya.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** Proof Receipt (Section 9.5). Stored as JSON in sakshi `checks.receipt_json`; never leaves the phone as-is. */
@Serializable
data class Receipt(
    val checkId: String,
    val no: String,
    val ts: Long,
    val trigger: String,
    val channel: String,
    /** Plain name of the app it came from, e.g. "WhatsApp". */
    val source: String,
    val sourcePkg: String? = null,
    val sender: String = "",
    val claimedBank: String? = null,
    val bankName: String = "No bank named",
    val bankNameHi: String = "कोई बैंक नहीं",
    /** "What was asked", in words. */
    val askedFor: String,
    val askedForHi: String,
    /** The sentence that carries the request, from the message itself (shown on this phone only). */
    val askExcerpt: String = "",
    val hits: List<ReceiptHit> = emptyList(),
    /** critical | high | medium | none */
    val overall: String = "none",
    /** breaks | keeps | unknown */
    val verdict: String = "unknown",
    val killChainStage: Int = 0,
    val herd: Herd? = null,
    val reality: Reality? = null,
    val deepfake: Deepfake? = null,
    val ai: AiLabel? = null,
    /** Plain-words lines of what left the phone for this check (from the egress log). */
    val leftPhone: List<String> = emptyList(),
    /** KAVACH-masked text: what the bank would see. */
    val maskedText: String = "",
    /** The scammer's values (UPI IDs, hosts, numbers), needed by the bank if reported. */
    val indicators: List<IndicatorRef> = emptyList(),
    val captured: String = "",
    val reportLocalId: Long? = null,
    /** Promise Card version line, e.g. "SBI Promise Card · v2026.10". */
    val cardRef: String = "",
) {
    fun toJson(): String = JSON.encodeToString(serializer(), this)

    companion object {
        val JSON = Json { ignoreUnknownKeys = true; encodeDefaults = true }
        fun fromJson(s: String): Receipt = JSON.decodeFromString(serializer(), s)
    }
}

@Serializable
data class ReceiptHit(
    val id: String,
    val severity: String,
    val promise: String,
    val promiseHi: String? = null,
    val issuer: String,
    val source: String? = null,
    val aiAssisted: Boolean = false,
    val killChainStage: Int = 1,
)

@Serializable
data class Herd(val seen7d: Long = 0, val reports: Int = 0, val confirmedBy: String? = null, val label: String? = null, val checked: Boolean = true)

@Serializable
data class Reality(val status: String, val message: String)

@Serializable
data class Deepfake(val face: Float? = null, val voice: Float? = null, val threshold: Float = .7f, val modelId: String? = null, val note: String = "A signal, not proof.")

@Serializable
data class AiLabel(val askType: String, val source: String, val confidence: Float = 0f, val claimedBank: String? = null)

@Serializable
data class IndicatorRef(val t: String, val h: String, val value: String, val label: String)
