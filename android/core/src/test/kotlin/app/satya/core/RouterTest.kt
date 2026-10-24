package app.satya.core

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RouterTest {
    private val spec = File(System.getProperty("spec.dir") ?: "../../spec")
    private val book by lazy { RuleBook.fromRegistryJson(File(spec, "satya_bank_promises.json").readText(Charsets.UTF_8)) }

    private val t09 = "Dear Ramesh, your YONO account will be blocked today because your KYC is pending. Pay ₹10 KYC fee to sbi.kyc@ybl to keep your account active. — SBI KYC Team"

    @Test
    fun backgroundNeverAsksCloudAndOnlyLooksUpFlaggedValues() {
        val p = Router.plan(book, Capture(Trigger.BACKGROUND, Channel.WHATSAPP, t09, "+91 70448 21319"))
        assertFalse(p.askCloud)
        assertFalse(p.faceCloud)
        assertNull(p.realityAmount)
        val canon = p.herdLookups.map { it.canonical }
        assertTrue("upi:sbi.kyc@ybl" in canon, "flagged UPI is looked up: $canon")
        assertTrue("tel:7044821319" in canon, "flagged sender is looked up: $canon")
    }

    @Test
    fun cleanBackgroundMessageLooksUpNothing() {
        val p = Router.plan(book, Capture(Trigger.BACKGROUND, Channel.SMS, "Your parcel will arrive at 5 pm. Track at bluedart.com", "+91 98xxxxxx11"))
        // G05 fires (plain number SMS) only with a claimed bank; none here, so nothing is flagged.
        assertTrue(p.rules.hits.isEmpty())
        assertTrue(p.herdLookups.isEmpty())
    }

    @Test
    fun userTapWithNoRuleHitAsksTheCloud() {
        val p = Router.plan(book, Capture(Trigger.TAP, Channel.SCREEN, "Sir please send the amount today itself, it is urgent", ""))
        assertTrue(p.rules.hits.isEmpty())
        assertTrue(p.askCloud)
        assertTrue(p.needsBankPicker)
    }

    @Test
    fun moneyClaimTriggersRealityCheckOnUserTriggerOnly() {
        val text = "Rs 10,000 debited from your account. If not you, call this number."
        assertEquals(10_000L, Router.plan(book, Capture(Trigger.TAP, Channel.SCREEN, text)).realityAmount)
        assertNull(Router.plan(book, Capture(Trigger.BACKGROUND, Channel.SMS, text, "+91 98xxxxxx11")).realityAmount)
    }

    @Test
    fun verdictWords() {
        val r = Rules.evaluate(book, t09, Channel.WHATSAPP, "+91 70448 21319")
        assertEquals(Verdict.BREAKS, VerdictRules.verdict(book, r, t09, Channel.WHATSAPP, "+91 70448 21319"))
        assertEquals(2, VerdictRules.stage(r.hits))

        val genuine = "Rs 2,450 debited from a/c **1234 on 24-10-26. Not you? Call 18002026161"
        val g = Rules.evaluate(book, genuine, Channel.SMS, "VM-HDFCBK-S")
        assertEquals(Verdict.KEEPS, VerdictRules.verdict(book, g, genuine, Channel.SMS, "VM-HDFCBK-S"))

        val noBank = "Invest 5000 and get 500 every day"
        val u = Rules.evaluate(book, noBank, Channel.SCREEN, "")
        assertEquals(Verdict.UNKNOWN, VerdictRules.verdict(book, u, noBank, Channel.SCREEN, ""))
    }

    @Test
    fun bankPickerOverrideRerunsBankRules() {
        val text = "Update PAN KYC now at kyc-verify-now.in/login or your account is blocked"
        val before = Rules.evaluate(book, text, Channel.SCREEN, "")
        assertNull(before.claimedBank)
        val after = Rules.evaluate(book, text, Channel.SCREEN, "", bankOverride = "SBI")
        assertTrue("SBI01_NO_KYC_LINKS" in after.ids && "G02_LINK_BANK_IN" in after.ids, after.ids.toString())
    }

    @Test
    fun aiAssistedHitsAreCappedAtHigh() {
        val h = AskMapping.aiHit(book, "share_secret", null, false, "", emptyList())
        assertNotNull(h)
        assertEquals(Severity.HIGH, h.severity)
        assertTrue(h.aiAssisted)
    }

    @Test
    fun aiLabelNeedsEvidenceInTheText() {
        val debit = "Rs 2,450 debited from a/c **1234 on 24-10-26. Not you? Call 18002026161"
        assertNull(AskMapping.aiHit(book, "share_secret", "HDFC", false, "VM-HDFCBK", emptyList(), debit), "no secret word: no AI-assisted G01")
        val paraphrase = "Sir just tell me the 6 digit number you got on your phone"
        val h = AskMapping.aiHit(book, "share_secret", null, false, "", emptyList(), paraphrase)
        assertNotNull(h)
        assertEquals("G01_NO_SECRETS", h.id)
        assertEquals(Severity.HIGH, h.severity)
        assertNull(AskMapping.aiHit(book, "share_secret", null, false, "", emptyList(), "Please share your pin code for delivery"), "pin code is an address, not a secret (N02)")
        assertNotNull(AskMapping.aiHit(book, "share_secret", null, false, "", emptyList(), "share the code you got"))
    }

    @Test
    fun officialChannelOutranksAnAiGuess() {
        val debit = "Rs 2,450 debited from a/c **1234 on 24-10-26. Not you? Call 18002026161"
        val r = Rules.evaluate(book, debit, Channel.SMS, "VM-HDFCBK-S")
        assertEquals(Verdict.KEEPS, VerdictRules.verdict(book, r, debit, Channel.SMS, "VM-HDFCBK-S"))
    }

    @Test
    fun entities() {
        val e = EntityExtractor.extract("Pay Rs 2,40,000 or 4.8 lakh to sbi.kyc@ybl, mail a.b@gmail.com, visit https://www.sbi-kyc.in/x, call +91 70123 45645 or 1600108333")
        assertEquals(listOf("sbi.kyc@ybl"), e.upiIds)
        assertTrue("sbi-kyc.in" in e.hosts)
        assertEquals(setOf("7012345645", "1600108333"), e.phones.map { Normalize.telDigits(it) }.toSet())
        assertEquals(480_000L, e.amounts.max())
    }
}
