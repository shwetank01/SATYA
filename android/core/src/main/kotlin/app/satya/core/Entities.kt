package app.satya.core

/** Values pulled out of a message: what the scammer wants you to pay, open or call. */
data class Entities(
    val upiIds: List<String>,
    val hosts: List<String>,
    val phones: List<String>,
    val amounts: List<Long>,
    val banks: List<String>,
) {
    /** Indicators for the herd (SANGH), already normalised. */
    fun indicators(sender: String? = null, channel: Channel? = null): List<Indicator> {
        val out = LinkedHashMap<String, Indicator>()
        upiIds.forEach { Normalize.upi(it).let { i -> out[i.canonical] = i } }
        hosts.forEach { Normalize.host(it).let { i -> out[i.canonical] = i } }
        phones.forEach { Normalize.tel(it).let { i -> out[i.canonical] = i } }
        if (sender != null && channel != null && (channel == Channel.CALL || channel == Channel.WHATSAPP || channel == Channel.SMS) &&
            !Rules.isHeader(sender) && Rules.digits(sender).let { d -> d.isNotEmpty() && 'x' !in d && d.length >= 8 }
        ) Normalize.tel(sender).let { i -> out[i.canonical] = i }
        return out.values.toList()
    }
}

object EntityExtractor {
    private val UPI = Regex(Rx.UPI)
    private val PHONE = Regex("""(?:\+91[\s-]?|(?<!${Rx.D})0)?(?<!${Rx.D})(?:[6-9]${Rx.D}{4}[\s-]?${Rx.D}{5}|1600${Rx.D}{6}|140${Rx.D}{7}|1800[\s-]?${Rx.D}{3,4}[\s-]?${Rx.D}{0,4})(?!${Rx.D})""")
    /** Rupee amounts: "Rs 2,40,000", "₹10", "INR 5000.50", "4.8 lakh", "2 crore". */
    private val AMOUNT_RS = Regex("""(?i)(?:rs\.?|₹|inr)\s*([0-9][0-9,]*(?:\.[0-9]+)?)""")
    private val AMOUNT_WORD = Regex("""(?i)([0-9]+(?:\.[0-9]+)?)\s*(lakhs?|lacs?|crores?|cr)\b""")

    fun extract(text: String): Entities {
        val upis = UPI.findAll(Regex(Rx.EMAIL).replace(text, " ")).map { it.value.lowercase() }.distinct().toList()
        val hosts = Rules.hosts(text).distinct()
        val phones = PHONE.findAll(text).map { it.value.trim() }.distinctBy { Normalize.telDigits(it) }.toList()
        val amounts = (AMOUNT_RS.findAll(text).mapNotNull { it.groupValues[1].replace(",", "").toDoubleOrNull()?.let { v -> Math.round(v) } } +
            AMOUNT_WORD.findAll(text).mapNotNull { m ->
                val v = m.groupValues[1].toDoubleOrNull() ?: return@mapNotNull null
                Math.round(v * if (m.groupValues[2].lowercase().startsWith("c")) 10_000_000.0 else 100_000.0)
            }).toList()
        val tk = Rules.toks(text)
        val banks = Lexicon.ALIASES.filter { (_, al) -> Rules.finds(tk, al).isNotEmpty() }.keys.toList()
        return Entities(upis, hosts, phones, amounts, banks)
    }

    /** Normalised amount string for comparisons: "10,000" = "10000" = "10000.00". */
    fun normaliseAmount(s: String): Long? = s.replace(",", "").trim().toDoubleOrNull()?.let { Math.round(it) }
}
