package app.satya.core

/** Channels a capture can come from (Section 9.3). */
enum class Channel(val wire: String) {
    SMS("sms"), CALL("call"), WHATSAPP("whatsapp"), EMAIL("email"), SCREEN("screen"), VIDEO("video"), VOICE("voice"), APP("app");

    companion object {
        fun fromWire(s: String): Channel = entries.firstOrNull { it.wire == s } ?: SCREEN
    }
}

/** One broken promise. [at] is the token index that triggered it (for the evidence excerpt), -1 if none. */
data class Hit(val promise: Promise, val severity: Severity, val at: Int = -1, val aiAssisted: Boolean = false) {
    val id: String get() = promise.id
}

data class RuleResult(val claimedBank: String?, val hits: List<Hit>) {
    val ids: List<String> get() = hits.map { it.id }
    val overall: Severity get() = hits.maxByOrNull { it.severity.rank }?.severity ?: Severity.NONE
}

/**
 * PRAHARI rules engine: a port of spec/reference/rules_ref.py `evaluate()`.
 * Pure function of (text, channel, sender, rule book). No I/O, no clock.
 */
object Rules {
    private val TOKEN = Regex("[a-z0-9ऀ-ॿ]+")
    private val STRIP_EMAIL = Regex(Rx.EMAIL)
    private val STRIP_UPI = Regex(Rx.UPI)
    private val HOSTS = Regex(Rx.LINK)
    private val HEADER = Regex("^([A-Z]{2}-)?(?=[A-Z0-9]*[A-Z])[A-Z0-9]{3,11}(-[STPG])?$")
    private val PLAIN_MOBILE = Regex("[6-9][0-9x]{9}")

    data class Tok(val text: String, val range: IntRange)

    fun tokenize(text: String): List<Tok> {
        val low = text.lowercase()
        return TOKEN.findAll(low).map { Tok(it.value, it.range) }.toList()
    }

    fun toks(text: String): List<String> = TOKEN.findAll(text.lowercase()).map { it.value }.toList()

    fun find(tk: List<String>, phrase: List<String>): List<Int> {
        val n = phrase.size
        if (n == 0) return emptyList()
        return (0..tk.size - n).filter { i -> (0 until n).all { tk[i + it] == phrase[it] } }
    }

    fun finds(tk: List<String>, phrases: List<List<String>>): List<Int> = phrases.flatMap { find(tk, it) }

    private fun negated(tk: List<String>, i: Int): Boolean = (maxOf(0, i - 3) until i).any { tk[it] in Lexicon.NEG }

    fun verbs(tk: List<String>, phrases: List<List<String>>): List<Int> = finds(tk, phrases).filter { !negated(tk, it) }

    private fun secretHits(tk: List<String>, values: List<String>): List<Int> {
        val occ = mutableListOf<Int>()
        for (v in values) {
            val p = toks(v)
            for (i in find(tk, p)) {
                if (p == listOf("pin") && i + 1 < tk.size && tk[i + 1] == "code") continue
                occ.add(i)
            }
        }
        return occ
    }

    private fun near(a: List<Int>, b: List<Int>, w: Int = Lexicon.WINDOW): Int? {
        for (x in a) for (y in b) if (kotlin.math.abs(x - y) <= w) return x
        return null
    }

    fun stripIds(text: String): String = STRIP_UPI.replace(STRIP_EMAIL.replace(text, " "), " ")

    fun hosts(text: String): List<String> = HOSTS.findAll(stripIds(text)).map { it.groupValues[1].lowercase() }.toList()

    fun digits(s: String): String = s.lowercase().filter { it in '0'..'9' || it == 'x' }

    fun national(s: String): String {
        var d = digits(s)
        if (d.length == 12 && d.startsWith("91")) d = d.substring(2)
        else if (d.length == 11 && d.startsWith("0")) d = d.substring(1)
        return d
    }

    fun plainMobile(s: String): Boolean = PLAIN_MOBILE.matches(national(s))

    fun isHeader(s: String): Boolean = HEADER.matches(s.trim().uppercase())

    /** Header core, e.g. "VM-HDFCBK-S" -> "HDFCBK". */
    fun headerCore(sender: String): String? {
        if (!isHeader(sender)) return null
        val parts = sender.trim().uppercase().split("-")
        return if (parts.size > 1) parts[1] else parts[0]
    }

    fun claimed(tk: List<String>, sender: String): String? {
        for ((bank, aliases) in Lexicon.ALIASES) if (finds(tk, aliases).isNotEmpty()) return bank
        val core = headerCore(sender) ?: return null
        for ((bank, codes) in Lexicon.HEADER_CODES) if (codes.any { core.startsWith(it) }) return bank
        return null
    }

    /** Returns the token index of the secret that was asked for, or null. */
    private fun askContains(tk: List<String>, ck: CheckSpec): Int? {
        for (h in ck.valuesHi) {
            val p = toks(h)
            if (p.size > 1) find(tk, p).firstOrNull()?.let { return it }
        }
        val sec = secretHits(tk, ck.values + ck.valuesHi.filter { toks(it).size == 1 })
        if (sec.isEmpty()) return null
        return near(sec, verbs(tk, Lexicon.ASK_VERBS))
    }

    private fun phraseNearVerb(tk: List<String>, values: List<String>, verbList: List<List<String>>, window: Int): Int? {
        val occ = values.flatMap { find(tk, toks(it)) }
        if (occ.isEmpty()) return null
        return near(occ, verbs(tk, verbList), window)
    }

    /**
     * @param bankOverride the bank the user picked in the Bank picker when nothing was detected.
     */
    fun evaluate(book: RuleBook, text: String, channel: Channel, sender: String, bankOverride: String? = null): RuleResult {
        val tk = toks(text)
        val bank = bankOverride ?: claimed(tk, sender)
        val hits = mutableListOf<Hit>()
        fun hit(p: Promise, sev: String, at: Int = -1) { hits.add(Hit(p, Severity.fromWire(sev), at)) }
        val bk = book.bank(bank)
        val ch = channel.wire

        for (g in book.global) {
            val ck = g.check
            when (ck.type) {
                "ask_contains_any" -> askContains(tk, ck)?.let { hit(g, g.ifBroken, it) }
                "asks_install_any" -> phraseNearVerb(tk, ck.values, Lexicon.INSTALL_VERBS, Lexicon.WINDOW)?.let { hit(g, g.ifBroken, it) }
                "asks_transfer_with_phrase" -> phraseNearVerb(tk, ck.values, Lexicon.TRANSFER_VERBS, 8)?.let { hit(g, g.ifBroken, it) }
                "asks_fee_with_phrase" -> phraseNearVerb(tk, ck.values, Lexicon.PAY_VERBS, Lexicon.WINDOW)?.let { hit(g, g.ifBroken, it) }
            }
            if (bank == null || bk == null) continue
            when (ck.type) {
                "link_host_suffix" -> {
                    val bad = hosts(text).firstOrNull { h ->
                        !(ck.allowedSuffixes.any { h.endsWith(it) } || bk.extraAllowedLinkHosts.any { e -> h == e || h.endsWith(".$e") })
                    }
                    if (bad != null) hit(g, g.ifBroken, tk.indexOfFirst { it == bad.substringBefore('.') })
                }
                "caller_prefix" -> if (ch == "call" || ch == "whatsapp") {
                    if (plainMobile(sender)) hit(g, ck.ifPlainMobile ?: g.ifBroken)
                    else if (national(sender).startsWith("1600") && finds(tk, Lexicon.SALES).isNotEmpty()) hit(g, ck.if1600Selling ?: g.ifBroken)
                }
                "message_asks_callback_to_prefix" -> {
                    val nums = tk.indices.filter { i -> tk[i].all { it.isDigit() } && ck.prefixes.any { tk[i].startsWith(it) } }
                    if (nums.isNotEmpty()) near(nums, verbs(tk, Lexicon.CALL_VERBS))?.let { hit(g, g.ifBroken, it) }
                }
                "sms_sender_is_header" -> if (ch == "sms" && !isHeader(sender)) hit(g, g.ifBroken)
            }
        }
        for (b in book.banks) {
            for (p in b.promises) {
                val ck = p.check
                if (ck.type == "incoming_caller_in" && ch == "call" && national(sender) in ck.values) hit(p, p.ifBroken)
                if (b.id != bank) continue
                when (ck.type) {
                    "kyc_request_with_link" -> {
                        val k = finds(tk, Lexicon.KYC)
                        if (k.isNotEmpty() && hosts(text).isNotEmpty()) hit(p, p.ifBroken, k.first())
                    }
                    "email_sender_domain_in" -> if (ch == "email") {
                        val dom = sender.split("@").last().lowercase()
                        if (!ck.values.any { dom == it || dom.endsWith(".$it") }) hit(p, p.ifBroken)
                    }
                    "ask_contains_any" -> askContains(tk, ck)?.let { hit(p, p.ifBroken, it) }
                }
            }
        }
        // Python: sorted(set((id, severity))). Keep one hit per (id, severity), ordered the same way.
        val unique = hits.distinctBy { it.id to it.severity.wire }.sortedWith(compareBy({ it.id }, { it.severity.wire }))
        return RuleResult(bank, unique)
    }
}
