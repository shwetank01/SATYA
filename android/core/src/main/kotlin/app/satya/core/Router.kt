package app.satya.core

/** What started a check (Section 8.4 `checks.trigger`). Only user triggers may send content off the phone. */
enum class Trigger(val wire: String, val isUser: Boolean) {
    TAP("tap", true), TILE("tile", true), SHARE("share", true), BACKGROUND("background", false), CALL("call", false), INSTALL("install", false);
}

/** One thing to check. `text` is raw (unmasked) and never leaves the phone from here. */
data class Capture(
    val trigger: Trigger,
    val channel: Channel,
    val text: String,
    val sender: String = "",
    val sourcePkg: String? = null,
    val bankOverride: String? = null,
    val videoMode: Boolean = false,
    val hasAudio: Boolean = false,
)

/** The router's decision: rule result now, plus which slower checks to run. */
data class Plan(
    val rules: RuleResult,
    val entities: Entities,
    /** Amount to look for in the SMS inbox (Reality Check), when the text claims a debit/credit. */
    val realityAmount: Long?,
    /** Values to look up in the herd (hash prefix only leaves the phone). */
    val herdLookups: List<Indicator>,
    /** Values to record a sighting for (checked by the user, or already flagged by a rule). */
    val herdSightings: List<Indicator>,
    /** Ask VIVEK for an AI label of the masked text. Never true for background captures. */
    val askCloud: Boolean,
    val faceCloud: Boolean,
    val voiceCloud: Boolean,
    /** No bank detected but the message asks for something: show the Bank picker. */
    val needsBankPicker: Boolean,
)

/** Section 8.2 Router: pure, testable. */
object Router {
    private val MONEY_CLAIM = Regex("""(?i)\b(debited|credited|refund(?:ed)?|deducted|charged|withdrawn)\b""")

    fun plan(book: RuleBook, c: Capture): Plan {
        val rules = Rules.evaluate(book, c.text, c.channel, c.sender, c.bankOverride)
        val ents = EntityExtractor.extract(c.text)
        val tk = Rules.toks(c.text)

        val reality = if (c.trigger.isUser && MONEY_CLAIM.containsMatchIn(c.text)) ents.amounts.maxOrNull() else null

        val all = ents.indicators(c.sender, c.channel)
        val flagged = flaggedIndicators(rules, ents, c)
        val lookups = if (c.trigger.isUser) all else flagged
        val sightings = if (c.trigger.isUser) all else flagged

        val askLike = Rules.finds(tk, Lexicon.ASK_VERBS + Lexicon.INSTALL_VERBS + Lexicon.TRANSFER_VERBS + Lexicon.CALL_VERBS + Lexicon.PAY_VERBS).isNotEmpty()
        val secretOrMoney = tk.any { it in Lexicon.MONEY_WORDS } || book.global.firstOrNull { it.id == "G01_NO_SECRETS" }?.check?.values?.any { v ->
            Rules.find(tk, Rules.toks(v)).isNotEmpty()
        } == true || ents.amounts.isNotEmpty() || ents.upiIds.isNotEmpty()
        val askCloud = c.trigger.isUser && rules.hits.isEmpty() && (askLike || secretOrMoney) && c.text.isNotBlank()

        val needsPicker = c.trigger.isUser && rules.claimedBank == null && (askLike || secretOrMoney || rules.hits.isNotEmpty())

        return Plan(
            rules = rules, entities = ents, realityAmount = reality,
            herdLookups = lookups, herdSightings = sightings,
            askCloud = askCloud, faceCloud = c.videoMode && c.trigger.isUser, voiceCloud = c.hasAudio && c.trigger.isUser,
            needsBankPicker = needsPicker,
        )
    }

    /** Values implicated by a broken promise. Background code may only look these up. */
    fun flaggedIndicators(rules: RuleResult, ents: Entities, c: Capture): List<Indicator> {
        if (rules.hits.isEmpty()) return emptyList()
        val out = LinkedHashMap<String, Indicator>()
        val types = rules.hits.map { it.promise.check.type }.toSet()
        if (types.any { it == "caller_prefix" || it == "sms_sender_is_header" || it == "incoming_caller_in" }) {
            val d = Rules.digits(c.sender)
            if (d.isNotEmpty() && 'x' !in d) Normalize.tel(c.sender).let { out[it.canonical] = it }
        }
        if (types.any { it == "link_host_suffix" || it == "kyc_request_with_link" }) ents.hosts.forEach { Normalize.host(it).let { i -> out[i.canonical] = i } }
        if (types.any { it == "message_asks_callback_to_prefix" }) ents.phones.forEach { Normalize.tel(it).let { i -> out[i.canonical] = i } }
        if (types.any { it == "asks_transfer_with_phrase" || it == "asks_fee_with_phrase" || it == "ask_contains_any" }) {
            ents.upiIds.forEach { Normalize.upi(it).let { i -> out[i.canonical] = i } }
            ents.hosts.forEach { Normalize.host(it).let { i -> out[i.canonical] = i } }
        }
        return out.values.toList()
    }
}
