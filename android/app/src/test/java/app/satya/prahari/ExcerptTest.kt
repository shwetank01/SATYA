package app.satya.prahari

import app.satya.core.Rules
import kotlin.test.Test
import kotlin.test.assertEquals

class ExcerptTest {
    private fun at(text: String, word: String) = Rules.toks(text).indexOf(word)

    @Test
    fun domainsStayWhole() {
        val t = "Dear SBI customer your YONO will be blocked today. Update PAN KYC: sbi-kyc-update.in/verify"
        assertEquals("Update PAN KYC: sbi-kyc-update.in/verify", Excerpt.of(t, at(t, "kyc")))
    }

    @Test
    fun firstLineWithoutPunctuationIsKept() {
        val t = "Share your OTP now\nThanks, bank team."
        assertEquals("Share your OTP now", Excerpt.of(t, at(t, "otp")))
    }

    @Test
    fun fallsBackToTheAskingSentence() {
        val t = "Hello sir. Your parcel is held. Pay Rs 25 to release it."
        assertEquals("Pay Rs 25 to release it.", Excerpt.of(t, -1))
    }
}
