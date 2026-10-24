package app.satya.core

/** `ask_type` enum of /v1/ask (Section 11) and how each maps onto a promise (Section 8.2). */
object AskMapping {
    val ASK_TYPES = listOf("share_secret", "remote_access", "move_money", "pay_fee", "click_link", "kyc_update", "call_back", "sales_offer", "info_only", "other", "unknown")

    /** Plain words for the receipt's "What was asked". */
    fun words(askType: String?, hi: Boolean = false): String = when (askType) {
        "share_secret" -> if (hi) "आपका OTP, PIN या पासवर्ड माँगा" else "Asked for your OTP, PIN or password"
        "remote_access" -> if (hi) "स्क्रीन-शेयरिंग या रिमोट ऐप इंस्टॉल करने को कहा" else "Asked you to install a screen-sharing or remote app"
        "move_money" -> if (hi) "पैसा दूसरे खाते में डालने को कहा" else "Asked you to move money to another account"
        "pay_fee" -> if (hi) "फ़ीस या जुर्माना भरने को कहा" else "Asked you to pay a fee or fine"
        "click_link" -> if (hi) "लिंक खोलकर लॉग इन करने को कहा" else "Asked you to open a link and log in"
        "kyc_update" -> if (hi) "KYC अपडेट करने को कहा" else "Asked you to update KYC"
        "call_back" -> if (hi) "किसी नंबर पर कॉल करने को कहा" else "Asked you to call a number"
        "sales_offer" -> if (hi) "लोन या कार्ड का ऑफ़र" else "A loan or card offer"
        "info_only" -> if (hi) "सिर्फ़ जानकारी, कुछ नहीं माँगा" else "Information only, nothing asked"
        else -> if (hi) "माँग साफ़ नहीं है" else "The request is not clear"
    }

    /** Ask type implied by a broken promise (used when rules fired; no AI call needed). */
    fun askTypeOf(ruleId: String): String = when {
        ruleId.startsWith("G01") || ruleId.startsWith("PNB02") -> "share_secret"
        ruleId.startsWith("G06") -> "remote_access"
        ruleId.startsWith("G07") -> "move_money"
        ruleId.startsWith("G08") -> "pay_fee"
        ruleId.startsWith("G02") || ruleId.startsWith("AXIS_EMAIL") -> "click_link"
        ruleId.startsWith("SBI01") -> "kyc_update"
        ruleId.startsWith("G04") -> "call_back"
        else -> "other"
    }

    /**
     * Turn an AI label into an AI-assisted hit, only when the rules found nothing for that promise.
     * AI-assisted hits are capped at High (Section 8.2).
     */
    fun aiHit(book: RuleBook, askType: String, bank: String?, hasLink: Boolean, sender: String, existing: List<Hit>): Hit? {
        val id = when {
            askType == "share_secret" -> "G01_NO_SECRETS"
            askType == "remote_access" -> "G06_NO_REMOTE_ACCESS"
            askType == "move_money" -> "G07_NO_SAFE_ACCOUNT"
            askType == "pay_fee" -> "G08_NO_KYC_FEE"
            askType == "kyc_update" && hasLink && bank == "SBI" -> "SBI01_NO_KYC_LINKS"
            askType == "sales_offer" && Rules.national(sender).startsWith("1600") -> "G03_SERVICE_CALLS_1600"
            else -> return null
        }
        if (existing.any { it.id == id }) return null
        val promise = (book.global + book.banks.flatMap { it.promises }).firstOrNull { it.id == id } ?: return null
        val sev = if (id == "G03_SERVICE_CALLS_1600") Severity.MEDIUM else Severity.fromWire(promise.ifBroken).let { if (it.rank > Severity.HIGH.rank) Severity.HIGH else it }
        return Hit(promise, sev, aiAssisted = true)
    }
}
