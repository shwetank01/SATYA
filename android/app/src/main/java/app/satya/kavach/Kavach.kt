package app.satya.kavach

import app.satya.config.Config
import app.satya.core.Indicator
import app.satya.core.Mask

/**
 * KAVACH factory (Section 8.3): the only place packets are built. It masks text, validates sizes
 * and refuses anything that would carry raw content. Callers never touch OkHttp.
 */
object Kavach {
    const val MAX_ASK_CHARS = 4_000
    const val MAX_FRAME_BYTES = 60 * 1024
    const val MAX_FRAMES = 5
    const val MAX_VOICE_BYTES = 15 * 1024 * 1024
    const val MAX_REPORT_BYTES = 2 * 1024 * 1024
    private val PREFIX = Regex("^[0-9a-f]{5}$")
    private val HEX64 = Regex("^[0-9a-f]{64}$")

    class Refused(msg: String) : IllegalArgumentException(msg)

    fun sync(): KavachPacket = KavachPacket.SyncReq(null)

    fun herdLookup(ind: Indicator, category: String = "check", checkId: String? = null): KavachPacket {
        val p = ind.prefix
        if (!PREFIX.matches(p)) throw Refused("prefix must be 5 hex")
        return KavachPacket.HerdLookup(p, category, checkId)
    }

    /** Only for values the user checked or a rule already flagged (Section 8.8); Router decides. */
    fun herdSighting(ind: Indicator, day: String, checkId: String?): KavachPacket {
        val token = app.satya.core.Hash.dayToken(Config.now.installSecret, day, ind.hash)
        return KavachPacket.HerdSighting(ind.hash, ind.type.wire, token, checkId)
    }

    /** Masks with the user's own names and numbers before the text can be sent. */
    fun askLabel(rawText: String, hintBank: String?, checkId: String?, channel: String = "screen", sender: String = ""): KavachPacket {
        val s = Config.now
        val masked = Mask.mask(rawText, s.myNames, s.myPhones).take(MAX_ASK_CHARS)
        val maskedSender = Mask.mask(sender, s.myNames, s.myPhones).take(80)
        return KavachPacket.AskLabel(masked, hintBank, channel, maskedSender, checkId)
    }

    /** Public metadata of one installed app, never the app list (Know Your App, on the user's tap). */
    fun appOpinion(label: String, pkg: String, installer: String?, source: String): KavachPacket =
        KavachPacket.AppOpinion(label.take(120), pkg.take(160), installer?.take(160), source.take(80))

    fun maskOnly(rawText: String): String = Config.now.let { Mask.mask(rawText, it.myNames, it.myPhones) }

    fun faceFrames(frames: List<ByteArray>, checkId: String?): KavachPacket {
        if (frames.isEmpty()) throw Refused("no frames")
        val kept = frames.take(MAX_FRAMES)
        if (kept.any { it.size > MAX_FRAME_BYTES }) throw Refused("frame over 60 KB")
        return KavachPacket.FaceFrames(kept, checkId)
    }

    fun voiceNote(bytes: ByteArray, mime: String, checkId: String?): KavachPacket {
        if (bytes.isEmpty() || bytes.size > MAX_VOICE_BYTES) throw Refused("voice note must be 1 B .. 15 MB")
        return KavachPacket.VoiceNote(bytes, mime.ifBlank { "audio/*" }, checkId)
    }

    /** The envelope holds only tags, hashes and an opaque sealed box (Section 9.3). */
    fun report(envelopeJson: String, bankName: String, sealedBytes: Int, checkId: String?): KavachPacket {
        if (sealedBytes > MAX_REPORT_BYTES) throw Refused("report over 2 MB")
        return KavachPacket.Report(envelopeJson, bankName, sealedBytes, checkId)
    }

    fun statusCheck(reportId: String, ticket: String, reportNo: String, checkId: String?): KavachPacket {
        if (!HEX64.matches(ticket)) throw Refused("ticket must be 32 random bytes in hex")
        return KavachPacket.StatusCheck(reportId, ticket, reportNo, checkId)
    }

    fun doctorSeal(sealedB64: String): KavachPacket = KavachPacket.DoctorSeal(sealedB64)
    fun health(target: String): KavachPacket = KavachPacket.Health(target)
    fun echoHeaders(): KavachPacket = KavachPacket.EchoHeaders()
}
