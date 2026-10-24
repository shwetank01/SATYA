package app.satya.drishti

import android.graphics.Rect
import app.satya.AppGraph
import app.satya.core.Capture
import app.satya.core.Channel
import app.satya.core.Rules
import app.satya.core.Trigger
import app.satya.data.Receipt
import app.satya.prahari.Extras
import app.satya.prahari.Sources
import app.satya.ui.overlay.CheckFlowActions
import app.satya.ui.overlay.CheckFlowState
import app.satya.ui.overlay.Phase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Guess who sent what is on screen: the conversation title near the top, if it looks like a number or SMS header. */
object SenderGuess {
    private val PHONE = Regex("""^\+?[0-9(][0-9 ()-]{7,18}$""")
    /** Android wraps numbers in bidi isolates (U+2066..2069, U+202A..202E) and uses NBSPs; strip them first. */
    fun clean(s: String): String = s.filterNot { it.code in 0x200E..0x200F || it.code in 0x202A..0x202E || it.code in 0x2066..0x2069 }
        .map { if (it.code == 0xA0) ' ' else it }.joinToString("").trim()

    fun from(blocks: List<TextBlock>, screenHeight: Int): String {
        // Only real text near the top (the conversation title); button descriptions like "Back" are not senders.
        val top = blocks.filter { !it.fromDescription && it.bounds.top in 0..(screenHeight / 5) }.map { clean(it.text) }
        top.firstOrNull { PHONE.matches(it) }?.let { return it }
        // SMS headers show in capitals (SBIINB, VM-HDFCBK); "Back" or "Call" must never pass as one.
        return top.firstOrNull { it == it.uppercase() && it.length in 6..14 && Rules.isHeader(it) } ?: ""
    }
}

/**
 * One user-triggered check, driving [CheckFlowState]. Rules run on the phone; the overlay shows the
 * ribbons for at least ~2.4 s so the moment reads, never longer than the work needs plus that floor.
 */
class CheckSession(
    private val graph: AppGraph,
    val state: CheckFlowState,
    private val scope: CoroutineScope,
    private val trigger: Trigger,
    private val sourcePkg: String?,
    private val sender: String,
    /** Text inside a region (null = whole screen). */
    private val textFor: suspend (Rect?) -> String,
    private val onVideoMode: (suspend () -> Pair<List<ByteArray>, Int>?)? = null,
    private val sourceLabel: String? = null,
    private val captured: String,
    private val finish: () -> Unit,
    private val openInApp: (String) -> Unit,
) : CheckFlowActions {
    private var lastCapture: Capture? = null

    fun startCircle() { state.phase = Phase.Circle }

    fun startDirect(channel: Channel? = null, extras: Extras = Extras()) {
        scope.launch { execute(textFor(null), channel, extras) }
    }

    override fun onRegion(r: Rect?) {
        state.phase = Phase.Checking(0, absorbing = false, flash = true)
        scope.launch { execute(textFor(r), null, Extras()) }
    }

    override fun onVideo() {
        val snap = onVideoMode ?: return
        scope.launch {
            val res = snap() ?: run { state.phase = Phase.Circle; return@launch }
            state.chip = "5 frames captured · ${res.second} face" + (if (res.second == 1) "" else "s") + " found"
            execute(textFor(null), Channel.VIDEO, Extras(faceFrames = res.first))
        }
    }

    private suspend fun execute(text: String, channel: Channel?, extras: Extras) {
        state.phase = Phase.Checking(0, absorbing = false, flash = state.phase !is Phase.Checking)
        val ch = channel ?: Sources.channelFor(sourcePkg)
        android.util.Log.i("SATYA", "check: trigger=${trigger.wire} pkg=$sourcePkg channel=${ch.wire} sender=${if (sender.isBlank()) "none" else sender.take(5) + "…"} chars=${text.length}")
        val c = Capture(trigger, ch, text, sender, sourcePkg, videoMode = extras.faceFrames.isNotEmpty(), hasAudio = extras.voice != null)
        lastCapture = c
        val started = System.currentTimeMillis()
        val job = scope.async(Dispatchers.Default) {
            graph.runner.run(c, extras.copy(sourceLabel = sourceLabel, captured = captured)) { step ->
                scope.launch(Dispatchers.Main) { if (state.phase is Phase.Checking) state.phase = Phase.Checking(step.coerceAtMost(2), false, false) }
            }
        }
        // The guess for the step line ("Matching SBI’s Promise Card").
        state.bankGuess = withContext(Dispatchers.Default) { Rules.claimed(Rules.toks(text), sender) }
        val receipt = runCatching { job.await() }.getOrElse {
            state.phase = Phase.Idle
            finish()
            return
        }
        android.util.Log.i("SATYA", "check done in ${System.currentTimeMillis() - started} ms: ${receipt.verdict} ${receipt.hits.joinToString { it.id }} herd=${receipt.herd?.checked}")
        val floor = 2400 - (System.currentTimeMillis() - started)
        if (floor > 0) {
            delay(floor / 2); state.phase = Phase.Checking(1, false, false)
            delay(floor / 2); state.phase = Phase.Checking(2, false, false)
        }
        state.canReport = receipt.claimedBank == null || graph.doot.canSend(receipt.claimedBank)
        pending = receipt
        state.phase = Phase.Checking(2, absorbing = true, flash = false)
    }

    private var pending: Receipt? = null

    override fun onAbsorbed() {
        val r = pending ?: return
        // SATYA AI already read who the message claims to be: use a Promise Card bank it names, and
        // don't ask "Who do they say they are?" when it says no bank is named (an electricity-bill scam).
        val ai = r.ai?.takeIf { it.source == "ai" }
        val aiBank = ai?.claimedBank?.takeIf { graph.registry.now?.book?.bank(it) != null }
        if (r.claimedBank == null && aiBank != null) { onPickBank(r, aiBank); return }
        val needsBank = r.claimedBank == null && trigger.isUser && ai == null &&
            (r.hits.isNotEmpty() || (r.ai?.askType ?: "unknown") !in setOf("unknown", "info_only", "other") || r.indicators.any { it.t == "upi" })
        state.phase = Phase.Verdict(r, needsBank)
    }

    override fun onPickBank(r: Receipt, bank: String) {
        if (bank == "NONE") { state.phase = Phase.Verdict(r, false); return }
        val c = lastCapture ?: return
        scope.launch {
            val next = withContext(Dispatchers.Default) { graph.runner.withBank(r, c, bank) }
            state.canReport = next.claimedBank == null || graph.doot.canSend(next.claimedBank)
            state.phase = Phase.Verdict(next, false)
        }
    }

    override fun onCancel() { state.phase = Phase.Idle; finish() }
    override fun onClose() { state.phase = Phase.Idle; finish() }
    override fun onOpenReceipt(r: Receipt) { state.phase = Phase.Idle; finish(); openInApp("receipt:${r.checkId}") }
    override fun onReport(r: Receipt) { state.phase = Phase.Idle; finish(); openInApp("compose:${r.checkId}") }
}
