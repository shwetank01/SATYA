package app.satya.core

/**
 * KAVACH masking (Section 7.3), a line-by-line port of spec/reference/mask_ref.py.
 * Runs on the phone before any text leaves it. Order matters; same value -> same token,
 * numbered by first appearance.
 */
object Mask {
    private val EMAIL = Regex(Rx.EMAIL)
    private val UPI = Regex(Rx.UPI)
    private val LINK = Regex(Rx.LINK)
    private val KEEP = Regex("""(?<!${Rx.D})(?:1600${Rx.D}{6}|140${Rx.D}{7}|1800${Rx.D}{4,7}|1860${Rx.D}{6,7})(?!${Rx.D})""")
    private val CARD = Regex("""(?<!${Rx.D})(?:${Rx.D}[ -]?){12,18}${Rx.D}(?!${Rx.D})""")
    private val AADHAAR = Regex("""(?<!${Rx.D})(?:${Rx.D}{4}${Rx.S}${Rx.D}{4}${Rx.S}${Rx.D}{4}|${Rx.D}{12})(?!${Rx.D})""")
    private val PHONE = Regex("""(?:\+91[${Rx.S.removePrefix("[").removeSuffix("]")}-]?|(?<!${Rx.D})0)?(?<!${Rx.D})[6-9]${Rx.D}{4}[${Rx.S.removePrefix("[").removeSuffix("]")}-]?${Rx.D}{5}(?!${Rx.D})""")
    private val ACCOUNT = Regex("""(?<!${Rx.D})${Rx.D}{9,18}(?!${Rx.D})""")
    private val PAN = Regex("""${Rx.B_START}[A-Z]{5}[0-9]{4}[A-Z]${Rx.B_END}""")
    private val IFSC = Regex("""${Rx.B_START}[A-Z]{4}0[A-Z0-9]{6}${Rx.B_END}""")
    private val CODE = Regex("""(?<!${Rx.D})${Rx.D}{4,8}(?!${Rx.D})""")
    private val AMOUNT_PREFIX = Regex("""(rs\.?|₹|inr)${Rx.S}*$""")
    private val NON_DIGIT = Regex(Rx.ND)
    private val PLACEHOLDER = Regex("\u0000(\\d+)\u0000")

    fun luhn(digits: String): Boolean {
        var sum = 0
        digits.reversed().forEachIndexed { i, c ->
            var n = Rx.digitValue(c)
            if (i % 2 == 1) {
                n *= 2
                if (n > 9) n -= 9
            }
            sum += n
        }
        return sum % 10 == 0
    }

    /**
     * @param myNames the user's own names (masked as [NAME], only names of 3+ characters)
     * @param myPhones the user's own 10-digit numbers ([MY_PHONE] instead of [PHONE_n])
     */
    fun mask(input: String, myNames: Collection<String> = emptyList(), myPhones: Collection<String> = emptyList()): String {
        val counters = mutableMapOf("UPI" to 0, "LINK" to 0, "PHONE" to 0)
        val seen = mutableMapOf<Pair<String, String>, String>()
        val keep = mutableListOf<String>()
        fun tok(kind: String, value: String): String = seen.getOrPut(kind to value) {
            counters[kind] = counters.getValue(kind) + 1
            "[${kind}_${counters.getValue(kind)}]"
        }

        var text = EMAIL.replace(input, "[EMAIL]")
        text = UPI.replace(text) { tok("UPI", it.value.lowercase()) }
        text = LINK.replace(text) { m ->
            var s = m.value
            var tail = ""
            while (s.isNotEmpty() && s.last() in ".,;:!?)") {
                tail = s.last() + tail
                s = s.dropLast(1)
            }
            tok("LINK", s.lowercase()) + tail
        }
        text = KEEP.replace(text) { m ->
            keep.add(m.value)
            "\u0000${keep.size - 1}\u0000"
        }
        text = CARD.replace(text) { m -> if (luhn(NON_DIGIT.replace(m.value, ""))) "[CARD]" else m.value }
        text = AADHAAR.replace(text, "[AADHAAR]")
        text = PHONE.replace(text) { m ->
            val d = NON_DIGIT.replace(m.value, "").takeLast(10)
            if (d in myPhones) "[MY_PHONE]" else tok("PHONE", d)
        }
        text = ACCOUNT.replace(text, "[ACCOUNT]")
        text = PAN.replace(text, "[PAN]")
        text = IFSC.replace(text, "[IFSC]")
        val before = text
        text = CODE.replace(before) { m ->
            val start = m.range.first
            val pre = before.substring(maxOf(0, start - 5), start).lowercase()
            if (AMOUNT_PREFIX.containsMatchIn(pre)) m.value else "[CODE]"
        }
        for (n in myNames) {
            if (n.length >= 3) text = Regex("(?i)${Rx.B_START}${Regex.escape(n)}${Rx.B_END}").replace(text, "[NAME]")
        }
        return PLACEHOLDER.replace(text) { keep[it.groupValues[1].toInt()] }
    }
}
