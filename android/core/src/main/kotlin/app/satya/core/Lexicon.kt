package app.satya.core

/** Word lists, copied exactly from spec/reference/rules_ref.py (defined once there). */
object Lexicon {
    val ALIASES: LinkedHashMap<String, List<List<String>>> = linkedMapOf(
        "SBI" to listOf(listOf("sbi"), listOf("state", "bank"), listOf("yono")),
        "HDFC" to listOf(listOf("hdfc")),
        "ICICI" to listOf(listOf("icici"), listOf("imobile")),
        "AXIS" to listOf(listOf("axis")),
        "PNB" to listOf(listOf("pnb"), listOf("punjab", "national")),
    )
    val ASK_VERBS = p(
        "share", "send", "tell", "give", "provide", "enter", "forward", "read", "type",
        "batao", "bata", "bataye", "bataiye", "bhejo", "bhej", "dijiye", "de do", "karo",
        "bolo", "बताओ", "बताइए", "भेजो", "दीजिए",
    )
    val INSTALL_VERBS = p("install", "download", "kholo", "open", "use", "lagao", "daalo", "इंस्टॉल", "डाउनलोड")
    val TRANSFER_VERBS = p("move", "transfer", "send", "shift", "deposit", "bhejo", "daal", "dalo", "daalo", "jama")
    val CALL_VERBS = p("call", "callback", "dial", "contact", "phone", "sampark")
    /** v1.1: verbs for asks_fee_with_phrase (G08). */
    val PAY_VERBS = p("pay", "send", "transfer", "deposit", "bharo", "bhar", "bhariye", "bhejo", "jama", "भरें", "भरो", "भेजें", "भेजो", "जमा")
    val NEG = setOf("not", "never", "dont", "don", "mat", "na", "nahi", "nahin", "kabhi", "नहीं", "मत")
    val SALES = p("offer", "pre approved", "preapproved", "loan", "interested", "limit increase", "cashback")
    val KYC = p("kyc", "ekyc", "rekyc", "re kyc", "update pan", "pan update", "aadhaar update", "केवाईसी")

    /** Header codes used only to detect the claimed bank from an SMS header. */
    val HEADER_CODES: LinkedHashMap<String, List<String>> = linkedMapOf(
        "SBI" to listOf("SBIINB", "SBIPSG", "SBICRD", "SBI"),
        "HDFC" to listOf("HDFCBK", "HDFCBN", "HDFC"),
        "ICICI" to listOf("ICICIB", "ICICI"),
        "AXIS" to listOf("AXISBK", "AXIS"),
        "PNB" to listOf("PNBSMS", "PNB"),
    )
    const val WINDOW = 6

    /** Words that make a message worth an AI label when no rule fired (Router step 5). */
    val MONEY_WORDS = setOf("rs", "inr", "rupees", "rupaye", "paisa", "paise", "lakh", "crore", "amount", "fee", "refund", "payment", "upi", "account", "khata", "रुपये", "पैसे", "खाता")

    private fun p(vararg phrases: String): List<List<String>> = phrases.map { it.split(' ') }
}
