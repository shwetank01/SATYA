package app.satya.core

/** Words, never colours (Section 0 rule 8, Section 9.5). */
enum class Verdict(val wire: String, val word: String, val wordHi: String) {
    BREAKS("breaks", "Breaks promise", "वादा तोड़ता है"),
    KEEPS("keeps", "Keeps promise", "वादा निभाता है"),
    UNKNOWN("unknown", "Unknown", "अज्ञात"),
}

/** Kill chain (design: Contact → Ask → OTP → Drain). */
object KillChain {
    val STAGES = listOf("Contact" to "संपर्क", "Ask" to "माँग", "OTP" to "OTP", "Drain" to "पैसा गया")

    fun next(stage: Int, hi: Boolean = false): String = when (stage) {
        1 -> if (hi) "अगली बार वे पैसे या फ़ीस माँगेंगे" else "next they ask for money or a fee"
        2 -> if (hi) "अगली बार वे OTP माँगेंगे" else "next they ask for OTP"
        3 -> if (hi) "अगली बार वे खाता खाली करेंगे" else "next they empty the account"
        4 -> if (hi) "यही पैसा निकालने का कदम है" else "this is the step where money leaves"
        else -> ""
    }
}

object VerdictRules {
    fun stage(hits: List<Hit>): Int = hits.maxOfOrNull { it.promise.killChainStage } ?: 0

    /**
     * `keeps` needs positive evidence that the message used the claimed bank's official channel,
     * and still carries "This does not prove it is safe." on screen.
     */
    fun verdict(book: RuleBook, result: RuleResult, text: String, channel: Channel, sender: String): Verdict {
        if (result.hits.isNotEmpty()) return Verdict.BREAKS
        val bank = book.bank(result.claimedBank) ?: return Verdict.UNKNOWN
        val core = Rules.headerCore(sender)
        val headerOk = channel == Channel.SMS && core != null && (bank.smsHeaders.any { core.startsWith(it) } ||
            Lexicon.HEADER_CODES[bank.id].orEmpty().any { core.startsWith(it) })
        val nat = Rules.national(sender)
        val numberOk = nat.isNotEmpty() && (nat in bank.inboundHelplines || nat in bank.service1600 || nat in bank.promo140)
        val hosts = Rules.hosts(text)
        val linkOk = hosts.isNotEmpty() && hosts.all { h ->
            h.endsWith(".bank.in") || bank.webDomains.any { h == it || h.endsWith(".$it") } || bank.extraAllowedLinkHosts.any { h == it || h.endsWith(".$it") }
        }
        val emailOk = channel == Channel.EMAIL && sender.contains('@') && sender.substringAfterLast('@').lowercase().let { d ->
            bank.emailDomains.any { d == it || d.endsWith(".$it") }
        }
        return if (headerOk || numberOk || linkOk || emailOk) Verdict.KEEPS else Verdict.UNKNOWN
    }
}
