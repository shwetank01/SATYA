package app.satya.core

import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** Section 7.2: sha256 hex, 5-char prefix, day tokens and ticket hashes. All lowercase hex. */
object Hash {
    private val HEX = "0123456789abcdef".toCharArray()

    fun hex(bytes: ByteArray): String {
        val out = CharArray(bytes.size * 2)
        for (i in bytes.indices) {
            val v = bytes[i].toInt() and 0xff
            out[i * 2] = HEX[v ushr 4]
            out[i * 2 + 1] = HEX[v and 0x0f]
        }
        return String(out)
    }

    fun unhex(s: String): ByteArray {
        require(s.length % 2 == 0) { "odd hex length" }
        return ByteArray(s.length / 2) { i -> ((Character.digit(s[i * 2], 16) shl 4) or Character.digit(s[i * 2 + 1], 16)).toByte() }
    }

    fun sha256(bytes: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(bytes)
    fun sha256Hex(bytes: ByteArray): String = hex(sha256(bytes))
    fun sha256Hex(text: String): String = sha256Hex(text.toByteArray(Charsets.UTF_8))

    fun prefix(hash: String): String = hash.substring(0, 5)

    fun hmacSha256Hex(key: ByteArray, msg: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return hex(mac.doFinal(msg.toByteArray(Charsets.UTF_8)))
    }

    /** `hmac_sha256_hex(install_secret, "YYYY-MM-DD|" + hash)`: one sighting per value per phone per day. */
    fun dayToken(installSecret: ByteArray, day: String, hash: String): String = hmacSha256Hex(installSecret, "$day|$hash")

    /** The server only ever sees sha256(ticket_hex); the ticket itself stays on the phone. */
    fun ticketHash(ticketHex: String): String = sha256Hex(ticketHex)
}
