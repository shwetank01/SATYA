package app.satya.prahari

import android.content.Context
import app.satya.core.AskMapping
import app.satya.core.Capture
import app.satya.core.Channel
import app.satya.core.Hit
import app.satya.core.Indicator
import app.satya.core.IndicatorType
import app.satya.core.KillChain
import app.satya.core.Normalize
import app.satya.core.Router
import app.satya.core.RuleResult
import app.satya.core.Rules
import app.satya.core.Severity
import app.satya.core.Trigger
import app.satya.core.Verdict
import app.satya.core.VerdictRules
import app.satya.data.AiLabel
import app.satya.data.Deepfake
import app.satya.data.Herd
import app.satya.data.IndicatorRef
import app.satya.data.Reality
import app.satya.data.Receipt
import app.satya.data.ReceiptHit
import app.satya.kavach.Kavach
import app.satya.kavach.KavachClient
import app.satya.sakshi.CheckEntity
import app.satya.sakshi.SakshiDb
import app.satya.vachan.Registry
import app.satya.vachan.RegistryStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.floatOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/** Optional inputs gathered by DRISHTI before the check. */
data class Extras(
    val faceFrames: List<ByteArray> = emptyList(),
    val voice: Pair<ByteArray, String>? = null,
    val sourceLabel: String? = null,
    val captured: String = "",
)

/**
 * PRAHARI orchestration: rules on the phone first (always), then the slower, optional signals in
 * parallel. Cloud results can label, score and count; they never decide (Law 3).
 */
class CheckRunner(
    private val ctx: Context,
    private val db: SakshiDb,
    private val client: KavachClient,
    private val registry: RegistryStore,
    private val reality: RealityCheck,
    private val appScope: CoroutineScope,
) {
    private fun reg(): Registry = registry.now ?: registry.loadLocal() ?: error("Promise Registry missing")

    /** A user-triggered check (tap, tile, share): may use the cloud for labels and scores. */
    suspend fun run(c0: Capture, extras: Extras = Extras(), onStep: (Int) -> Unit = {}): Receipt = coroutineScope {
        val reg = reg()
        val checkId = UUID.randomUUID().toString()
        var c = c0
        var deepfake: Deepfake? = null

        onStep(0)
        // U5: a shared voice note is transcribed first, then judged like any other text.
        extras.voice?.let { (bytes, mime) ->
            val r = withTimeoutOrNull(28_000) { client.send(Kavach.voiceNote(bytes, mime, checkId)) }
            val o = r?.takeIf { it.ok }?.let { client.json(it.body) as? JsonObject }
            val transcript = o?.get("transcript")?.jsonPrimitive?.contentOrNull.orEmpty()
            val score = o?.get("synthetic_score")?.jsonPrimitive?.floatOrNull
            val thr = o?.get("threshold")?.jsonPrimitive?.floatOrNull ?: .7f
            deepfake = Deepfake(voice = score, threshold = thr, modelId = o?.get("model_id")?.jsonPrimitive?.contentOrNull,
                note = if (o == null) "Voice check unavailable right now." else "A signal, not proof.")
            c = c.copy(text = listOf(c.text, transcript).filter { it.isNotBlank() }.joinToString("\n"), channel = Channel.VOICE)
        }

        val plan = Router.plan(reg.book, c)
        onStep(1)

        val herdD = async { withTimeoutOrNull(9_000) { herdFor(plan.herdLookups, reg, checkId, "check") } }
        val realityD = async { plan.realityAmount?.let { reality.check(it) } }
        val askD = async {
            if (!plan.askCloud) null
            else withTimeoutOrNull(10_000) {
                val r = client.send(Kavach.askLabel(c.text, plan.rules.claimedBank, checkId))
                (client.json(r.body) as? JsonObject)?.takeIf { r.ok }?.let { o ->
                    AiLabel(
                        askType = o["ask_type"]?.jsonPrimitive?.contentOrNull ?: "unknown",
                        source = o["source"]?.jsonPrimitive?.contentOrNull ?: "ai",
                        confidence = o["confidence"]?.jsonPrimitive?.floatOrNull ?: 0f,
                        claimedBank = o["claimed_bank"]?.jsonPrimitive?.contentOrNull,
                    )
                }
            } ?: AiLabel("unknown", "fallback")
        }
        val faceD = async {
            if (extras.faceFrames.isEmpty()) null
            else withTimeoutOrNull(15_000) {
                val r = client.send(Kavach.faceFrames(extras.faceFrames, checkId))
                (client.json(r.body) as? JsonObject)?.takeIf { r.ok }?.let { o ->
                    Deepfake(face = o["synthetic_score"]?.jsonPrimitive?.floatOrNull, threshold = o["threshold"]?.jsonPrimitive?.floatOrNull ?: .7f,
                        modelId = o["model_id"]?.jsonPrimitive?.contentOrNull)
                }
            } ?: Deepfake(note = "Deepfake check unavailable right now.")
        }

        // Sightings: values the user chose to check (Section 8.8). Fire and forget.
        val day = utcDay()
        plan.herdSightings.take(8).forEach { ind -> appScope.launch { runCatching { client.send(Kavach.herdSighting(ind, day, checkId)) } } }

        onStep(2)
        val herd = herdD.await()
        val ai = askD.await()
        val face = faceD.await()
        val realityRes = realityD.await()

        var hits = plan.rules.hits
        if (ai != null && ai.askType != "unknown") {
            AskMapping.aiHit(reg.book, ai.askType, plan.rules.claimedBank, plan.entities.hosts.isNotEmpty(), c.sender, hits)?.let { hits = hits + it }
        }
        val result = RuleResult(plan.rules.claimedBank, hits)
        val df = mergeDeepfake(deepfake, face)
        val receipt = buildReceipt(checkId, c, result, reg, herd, realityRes, df, ai, extras, plan.entities.indicators(c.sender, c.channel))
        save(receipt)
        receipt
    }

    /** Re-judge with the bank the user picked (Bank picker). Reuses every cloud result. */
    suspend fun withBank(prev: Receipt, c: Capture, bank: String): Receipt {
        val reg = reg()
        val plan = Router.plan(reg.book, c.copy(bankOverride = bank))
        var hits = plan.rules.hits
        prev.ai?.let { ai -> AskMapping.aiHit(reg.book, ai.askType, bank, plan.entities.hosts.isNotEmpty(), c.sender, hits)?.let { hits = hits + it } }
        val r = buildReceipt(prev.checkId, c.copy(bankOverride = bank), RuleResult(bank, hits), reg, prev.herd, prev.reality, prev.deepfake, prev.ai,
            Extras(sourceLabel = prev.source, captured = prev.captured), plan.entities.indicators(c.sender, c.channel), prev.no)
        save(r)
        return r
    }

    /**
     * Background check (U2/U3): rules only, no content leaves the phone. Herd lookups are hash
     * prefixes of values a rule already flagged. Returns null when nothing is worth a word.
     */
    suspend fun background(c: Capture, captured: String): Receipt? {
        require(!c.trigger.isUser)
        val reg = reg()
        val plan = Router.plan(reg.book, c)
        val inds = plan.entities.indicators(c.sender, c.channel)
        val blocked = inds.firstOrNull { reg.blocklist.containsKey(it.hash) }
        if (plan.rules.hits.isEmpty() && blocked == null) return null
        val checkId = UUID.randomUUID().toString()
        val herd = withTimeoutOrNull(6_000) { herdFor(plan.herdLookups, reg, checkId, "check") }
        val day = utcDay()
        plan.herdSightings.take(4).forEach { ind -> appScope.launch { runCatching { client.send(Kavach.herdSighting(ind, day, checkId)) } } }
        val receipt = buildReceipt(checkId, c, plan.rules, reg, herd, null, null, null, Extras(captured = captured), inds)
        save(receipt)
        return receipt
    }

    /** SANGH lookup by 5-char prefix; the phone picks its own hash from the matches (k-anonymity). */
    suspend fun herdFor(lookups: List<Indicator>, reg: Registry, checkId: String?, category: String): Herd? {
        if (lookups.isEmpty()) return null
        var seen = 0L; var reports = 0; var confirmed: String? = null; var label: String? = null; var any = false
        for (ind in lookups.take(8)) {
            reg.blocklist[ind.hash]?.let { confirmed = confirmed ?: it.by; label = label ?: it.label }
            val r = client.send(Kavach.herdLookup(ind, category, checkId))
            if (!r.ok) continue
            any = true
            val matches = (client.json(r.body) as? JsonObject)?.get("matches")?.jsonArray ?: continue
            matches.map { it.jsonObject }.firstOrNull { it["h"]?.jsonPrimitive?.contentOrNull == ind.hash }?.let { m ->
                seen = maxOf(seen, m["seen_7d"]?.jsonPrimitive?.longOrNull ?: 0)
                reports += m["reports"]?.jsonPrimitive?.intOrNull ?: 0
                m["confirmed_by"]?.jsonPrimitive?.contentOrNull?.let { confirmed = confirmed ?: it }
                m["label"]?.jsonPrimitive?.contentOrNull?.let { label = label ?: it }
            }
        }
        if (!any && confirmed == null) return Herd(checked = false)
        return Herd(seen, reports, confirmed, label)
    }

    private fun mergeDeepfake(voice: Deepfake?, face: Deepfake?): Deepfake? = when {
        voice == null -> face
        face == null -> voice
        else -> voice.copy(face = face.face, modelId = listOfNotNull(voice.modelId, face.modelId).joinToString(" + "))
    }

    private suspend fun buildReceipt(
        checkId: String, c: Capture, result: RuleResult, reg: Registry, herd: Herd?, reality: Reality?, deepfake: Deepfake?, ai: AiLabel?,
        extras: Extras, inds: List<Indicator>, number: String? = null,
    ): Receipt {
        val bank = reg.book.bank(result.claimedBank)
        val verdict = VerdictRules.verdict(reg.book, result, c.text, c.channel, c.sender)
        val sorted = result.hits.sortedByDescending { it.severity.rank }
        val top = sorted.firstOrNull()
        val askType = top?.let { AskMapping.askTypeOf(it.id) }?.takeIf { it != "other" } ?: ai?.askType?.takeIf { it != "unknown" }
            ?: if (top != null) "other" else null
        val askedEn = when {
            askType != null && askType != "other" -> AskMapping.words(askType)
            top != null -> topWords(top, false)
            verdict == Verdict.KEEPS -> "Nothing your bank promised it would never ask"
            else -> AskMapping.words(null)
        }
        val askedHi = when {
            askType != null && askType != "other" -> AskMapping.words(askType, hi = true)
            top != null -> topWords(top, true)
            verdict == Verdict.KEEPS -> "ऐसा कुछ नहीं जो बैंक ने कभी न माँगने का वादा किया"
            else -> AskMapping.words(null, hi = true)
        }
        val overall = when {
            herd?.confirmedBy != null && result.overall.rank < Severity.HIGH.rank -> Severity.HIGH
            else -> result.overall
        }
        val egress = runCatching { db.egress().forCheck(checkId) }.getOrDefault(emptyList())
        return Receipt(
            checkId = checkId,
            no = number ?: nextNumber(),
            ts = System.currentTimeMillis(),
            trigger = c.trigger.wire,
            channel = c.channel.wire,
            source = extras.sourceLabel ?: Sources.label(c.sourcePkg, c.channel),
            sourcePkg = c.sourcePkg,
            sender = c.sender,
            claimedBank = result.claimedBank,
            bankName = bank?.name ?: result.claimedBank ?: "No bank named",
            bankNameHi = bank?.nameHi ?: result.claimedBank ?: "कोई बैंक नहीं",
            askedFor = askedEn,
            askedForHi = askedHi,
            askExcerpt = Excerpt.of(c.text, top?.at ?: -1),
            hits = sorted.map {
                ReceiptHit(it.id, it.severity.wire, it.promise.text, it.promise.textHi, it.promise.issuer, it.promise.source, it.aiAssisted, it.promise.killChainStage)
            },
            overall = overall.wire,
            verdict = if (herd?.confirmedBy != null) Verdict.BREAKS.wire else verdict.wire,
            killChainStage = VerdictRules.stage(result.hits),
            herd = herd,
            reality = reality ?: if (c.trigger.isUser) Reality("skipped", "No debit or refund was claimed, so the SMS inbox was not checked.") else null,
            deepfake = deepfake,
            ai = ai,
            leftPhone = egress.map { it.summary },
            maskedText = Kavach.maskOnly(c.text).take(4000),
            indicators = inds.map { IndicatorRef(it.type.wire, it.hash, it.value, labelFor(it)) },
            captured = extras.captured,
            cardRef = cardRef(top, reg),
        )
    }

    private fun topWords(top: Hit, hi: Boolean): String = when (top.promise.check.type) {
        "caller_prefix" -> if (hi) "बैंक के नाम पर निजी नंबर से संपर्क" else "Contacted you in the bank's name from a personal number"
        "sms_sender_is_header" -> if (hi) "बैंक के नाम पर मोबाइल नंबर से SMS" else "Texted in the bank's name from a mobile number"
        "incoming_caller_in" -> if (hi) "बैंक के टोल-फ़्री नंबर से आने वाली कॉल" else "A call that claims to come from the bank's toll-free number"
        "message_asks_callback_to_prefix" -> if (hi) "1600 नंबर पर वापस कॉल करने को कहा" else "Asked you to call back a 1600 number"
        "email_sender_domain_in" -> if (hi) "बैंक के नाम पर किसी और डोमेन से ईमेल" else "Emailed in the bank's name from another domain"
        else -> if (hi) "कुछ ऐसा माँगा जो बैंक कभी नहीं माँगता" else "Asked for something the bank never asks for"
    }

    private fun cardRef(top: Hit?, reg: Registry): String {
        if (top == null) return "Checked against ${reg.verifiedCards} Promise Cards"
        val issuer = top.promise.issuer
        val name = if (issuer == "GLOBAL") "SATYA Global" else reg.book.bank(issuer)?.name ?: issuer
        val v = if (issuer == "GLOBAL") 1 else reg.book.bank(issuer)?.version ?: 1
        return "$name Promise Card · ${top.id.substringBefore('_')} · v2026.10" + if (v > 1) " r$v" else ""
    }

    private fun labelFor(i: Indicator): String = when (i.type) {
        IndicatorType.UPI -> "UPI ID"
        IndicatorType.TEL -> "Phone number"
        IndicatorType.HOST -> "Website"
        IndicatorType.APP -> "App"
        IndicatorType.ACCT -> "Account"
    }

    private suspend fun save(r: Receipt) {
        db.checks().put(CheckEntity(r.checkId, r.ts, r.trigger, r.channel, r.sourcePkg, r.claimedBank, r.overall, r.hits.joinToString(",") { it.id }, r.verdict, r.toJson()))
    }

    private suspend fun nextNumber(): String {
        val n = runCatching { db.checks().count() }.getOrDefault(0) + 1
        return "PR-" + SimpleDateFormat("ddMM", Locale.US).format(Date()) + "-" + n.toString().padStart(4, '0')
    }

    companion object {
        fun utcDay(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
        fun telIndicator(number: String): Indicator = Normalize.tel(number)
        fun isUserTrigger(t: Trigger) = t.isUser
        fun stageText(stage: Int, hi: Boolean) = KillChain.next(stage, hi)
        fun national(s: String) = Rules.national(s)
    }
}

/** The sentence of the message that carries the request. Stays on this phone. */
object Excerpt {
    fun of(text: String, tokenIndex: Int): String {
        val t = text.trim()
        if (t.isEmpty()) return ""
        val sentences = Regex("""[^.!?।\n]+[.!?।]?""").findAll(t).map { it.value.trim() }.filter { it.isNotEmpty() }.toList()
        if (tokenIndex >= 0) {
            val toks = Rules.tokenize(t)
            if (tokenIndex < toks.size) {
                val pos = toks[tokenIndex].range.first
                var acc = 0
                for (s in Regex("""[^.!?।\n]+[.!?।]?""").findAll(t)) {
                    if (pos in s.range) return s.value.trim().take(160)
                    acc++
                }
            }
        }
        return (sentences.lastOrNull { s -> Regex("(?i)pay|share|send|install|call|transfer|update|click|login|log in|batao|bhejo").containsMatchIn(s) } ?: sentences.firstOrNull() ?: t).take(160)
    }
}

/** Source app names in the design's words. */
object Sources {
    private val MAP = mapOf(
        "com.whatsapp" to "WhatsApp", "com.whatsapp.w4b" to "WhatsApp",
        "com.google.android.apps.messaging" to "Messages", "com.samsung.android.messaging" to "Messages",
        "com.android.chrome" to "Chrome", "com.sec.android.app.sbrowser" to "Browser",
        "com.instagram.android" to "Instagram", "org.telegram.messenger" to "Telegram",
        "com.google.android.gm" to "Gmail", "com.samsung.android.email.provider" to "Email",
        "com.google.android.dialer" to "Phone call", "com.samsung.android.dialer" to "Phone call", "com.samsung.android.incallui" to "Phone call",
        "com.android.server.telecom" to "Phone call",
        "com.google.android.apps.nbu.paisa.user" to "UPI app", "com.phonepe.app" to "UPI app", "net.one97.paytm" to "UPI app",
    )
    fun label(pkg: String?, channel: Channel): String = pkg?.let { MAP[it] } ?: when (channel) {
        Channel.SMS -> "Messages"; Channel.WHATSAPP -> "WhatsApp"; Channel.CALL -> "Phone call"; Channel.EMAIL -> "Email"
        Channel.VOICE -> "Voice note"; Channel.VIDEO -> "Video call"; Channel.APP -> "App"; else -> "Screen"
    }
    /** Channel from the app on screen (Section 13.5 step 4). */
    fun channelFor(pkg: String?): Channel = when (pkg) {
        "com.whatsapp", "com.whatsapp.w4b" -> Channel.WHATSAPP
        "com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms" -> Channel.SMS
        "com.google.android.gm", "com.samsung.android.email.provider", "com.microsoft.office.outlook" -> Channel.EMAIL
        "com.google.android.dialer", "com.samsung.android.dialer", "com.samsung.android.incallui", "com.android.incallui" -> Channel.CALL
        else -> Channel.SCREEN
    }
}
