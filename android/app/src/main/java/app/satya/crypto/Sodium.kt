package app.satya.crypto

import app.satya.core.Hash
import com.goterl.lazysodium.LazySodiumAndroid
import com.goterl.lazysodium.SodiumAndroid
import java.security.SecureRandom
import java.util.Base64

/**
 * libsodium on the phone (Section 7.4). Only the Native byte-array APIs are used: the Lazy
 * string APIs silently hex-encode and produce the wrong bytes.
 */
object Sodium {
    private val lazy: LazySodiumAndroid by lazy { LazySodiumAndroid(SodiumAndroid()) }
    private val rng = SecureRandom()

    /** Loads the native library; called once at app start and by the Doctor. */
    fun init(): Boolean = runCatching { lazy; true }.getOrDefault(false)

    /** crypto_box_seal: only the holder of the box secret key (the bank's browser) can open it. */
    fun seal(plaintext: ByteArray, boxPkHex: String): ByteArray {
        val pk = Hash.unhex(boxPkHex)
        require(pk.size == 32) { "box public key must be 32 bytes" }
        val out = ByteArray(plaintext.size + 48)
        check(lazy.cryptoBoxSeal(out, plaintext, plaintext.size.toLong(), pk)) { "crypto_box_seal failed" }
        return out
    }

    fun sealOpen(sealed: ByteArray, boxPkHex: String, boxSkHex: String): ByteArray? {
        if (sealed.size < 48) return null
        val out = ByteArray(sealed.size - 48)
        return if (lazy.cryptoBoxSealOpen(out, sealed, sealed.size.toLong(), Hash.unhex(boxPkHex), Hash.unhex(boxSkHex))) out else null
    }

    /** Verify a detached Ed25519 signature over the exact UTF-8 bytes of [message]. */
    fun verify(message: String, sigHex: String, pkHex: String): Boolean = verifyBytes(message.toByteArray(Charsets.UTF_8), sigHex, pkHex)

    fun verifyBytes(message: ByteArray, sigHex: String, pkHex: String): Boolean {
        if (!HEX128.matches(sigHex) || !HEX64.matches(pkHex)) return false
        return runCatching { lazy.cryptoSignVerifyDetached(Hash.unhex(sigHex), message, message.size, Hash.unhex(pkHex)) }.getOrDefault(false)
    }

    fun randomBytes(n: Int): ByteArray = ByteArray(n).also { rng.nextBytes(it) }
    fun randomHex(n: Int): String = Hash.hex(randomBytes(n))

    /** Section 7.1: sealed boxes travel as STANDARD base64 with padding. */
    fun b64(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)
    fun unb64(s: String): ByteArray = Base64.getDecoder().decode(s)

    private val HEX64 = Regex("^[0-9a-f]{64}$")
    private val HEX128 = Regex("^[0-9a-f]{128}$")

    // Exact signed message formats (Section 7.4).
    fun certMessage(bankId: String, signPk: String, boxPk: String?) = "satya-cert-v1|$bankId|$signPk|${boxPk ?: ""}"
    fun receiptMessage(reportId: String, sealedHash: String, receivedAt: String) = "satya-receipt-v1|$reportId|$sealedHash|$receivedAt"
    fun doctorMessage(plaintextSha256: String) = "satya-doctor-v1|$plaintextSha256"
}
