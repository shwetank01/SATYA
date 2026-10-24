package app.satya.kavach

/**
 * Everything that may leave the phone (Section 8.3). Packets are built only by [Kavach]
 * (tools/check_one_door.sh fails the build if any other file constructs one) and sent only by
 * [KavachClient]. Each packet carries its own plain-words description for the Privacy Log.
 */
sealed class KavachPacket(
    val protocol: String,
    val packetType: String,
    val category: String,
    val checkId: String?,
) {
    /** "Sent ..." line for the Privacy Log. */
    abstract val summary: String
    /** Exactly what was sent, already masked, for the Privacy Log payload box. */
    abstract val payloadPreview: String

    class SyncReq internal constructor(checkId: String?) : KavachPacket("VACHAN", "sync", "sync", checkId) {
        override val summary = "Asked for new Promise Cards and the blocklist. Sent nothing about you."
        override val payloadPreview = "App version only"
    }

    class HerdLookup internal constructor(val prefix: String, category: String, checkId: String?) : KavachPacket("SANGH", "herd_lookup", category, checkId) {
        override val summary = if (category == "app") "Sent 5 characters of an app fingerprint." else "Sent 5 characters of a fingerprint to the herd count."
        override val payloadPreview = prefix
    }

    class HerdSighting internal constructor(val h: String, val t: String, val dayToken: String, checkId: String?) : KavachPacket("SANGH", "herd_sighting", "check", checkId) {
        override val summary = "Counted one sighting of a flagged ${label(t)}. Only its fingerprint was sent."
        override val payloadPreview = "fingerprint ${h.take(8)}… · day token ${dayToken.take(6)}…"
    }

    class AskLabel internal constructor(val maskedText: String, val hintBank: String?, val channel: String, val maskedSender: String, checkId: String?) : KavachPacket("SARVAM", "ask", "check", checkId) {
        override val summary = "Sent masked text to SATYA cloud for Sarvam AI to read. Not stored."
        override val payloadPreview = maskedText
    }

    class FaceFrames internal constructor(val frames: List<ByteArray>, checkId: String?) : KavachPacket("VIVEK", "face", "check", checkId) {
        override val summary = "Sent ${frames.size} face crops (224 px) for a deepfake score. Deleted after answer."
        override val payloadPreview = "${frames.size} JPEG face crops · ${kb(frames.sumOf { it.size })}"
    }

    class VoiceNote internal constructor(val bytes: ByteArray, val mime: String, checkId: String?) : KavachPacket("SARVAM", "voice", "check", checkId) {
        override val summary = "Sent the voice note you shared to SATYA cloud for a Sarvam transcript. Not stored."
        override val payloadPreview = "Audio · ${kb(bytes.size)} · $mime"
    }

    class AppOpinion internal constructor(val label: String, val pkg: String, val installer: String?, val source: String) : KavachPacket("SARVAM", "app_opinion", "app", null) {
        override val summary = "Asked SATYA AI about one app: its name, package id and install source. Nothing else."
        override val payloadPreview = "$label · $pkg · $source"
    }

    class Report internal constructor(val envelopeJson: String, val bankName: String, val sealedBytes: Int, checkId: String?) : KavachPacket("DOOT", "report", "report", checkId) {
        override val summary = "Sent a sealed report to $bankName. SATYA can’t read it."
        override val payloadPreview = "Encrypted · ${kb(sealedBytes)} · only $bankName can open it"
    }

    class StatusCheck internal constructor(val reportId: String, val ticket: String, val reportNo: String, checkId: String?) : KavachPacket("DOOT", "status", "report", checkId) {
        override val summary = "Asked for the bank’s progress on report $reportNo."
        override val payloadPreview = "Report id and its private ticket (in a header)"
    }

    class DoctorSeal internal constructor(val sealedB64: String) : KavachPacket("DOOT", "doctor_seal", "doctor", null) {
        override val summary = "Doctor: sent a sealed test box to check encryption works."
        override val payloadPreview = "The word \"satya-doctor\", sealed"
    }

    class Health internal constructor(val target: String) : KavachPacket(if (target == "vivek") "VIVEK" else "GATEWAY", "health", "doctor", null) {
        override val summary = "Doctor: checked that the ${if (target == "vivek") "deepfake service" else "SATYA cloud and its AI"} is reachable."
        override val payloadPreview = "Nothing"
    }

    class EchoHeaders internal constructor() : KavachPacket("SETU", "echo_headers", "doctor", null) {
        override val summary = "Doctor: asked which identifying headers reach the cloud."
        override val payloadPreview = "Nothing"
    }

    companion object {
        fun kb(n: Int): String = if (n < 1024) "$n B" else String.format(java.util.Locale.US, "%.1f KB", n / 1024f)
        fun label(t: String): String = when (t) { "upi" -> "UPI ID"; "tel" -> "phone number"; "host" -> "website"; "app" -> "app"; else -> "value" }
    }
}
