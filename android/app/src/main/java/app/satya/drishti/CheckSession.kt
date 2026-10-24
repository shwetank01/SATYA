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
    private val PHONE = Regex("""^\+?[0-9][0-9 ()-]{7,16}$""")
    fun from(blocks: List<TextBlock>, screenHeight: Int): String {
        val top = blocks.filter { it.bounds.top in 0..(screenHeight / 5) }.map { it.text.trim() }
        return top.firstOrNull { PHONE.matches(it) || Rules.isHeader(it) } ?: ""
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
        val floor = 2400 - (System.currentTimeMillis() - started)
        if (floor > 0) {
            delay(floor / 2); state.phase = Phase.Checking(1, false, false)
            delay(floor / 2); state.phase = Phase.Checking(2, false, false)
        }
        state.canReport = graph.doot.canSend(receipt.claimedBank)
        pending = receipt
        state.phase = Phase.Checking(2, absorbing = true, flash = false)
    }

    private var pending: Receipt? = null

    override fun onAbsorbed() {
        val r = pending ?: return
        val needsBank = r.claimedBank == null && trigger.isUser &&
            (r.hits.isNotEmpty() || (r.ai?.askType ?: "unknown") !in setOf("unknown", "info_only", "other") || r.indicators.any { it.t == "upi" })
        state.phase = Phase.Verdict(r, needsBank)
    }

    override fun onPickBank(r: Receipt, bank: String) {
        if (bank == "NONE") { state.phase = Phase.Verdict(r, false); return }
        val c = lastCapture ?: return
        scope.launch {
            val next = withContext(Dispatchers.Default) { graph.runner.withBank(r, c, bank) }
            state.canReport = graph.doot.canSend(next.claimedBank)
            state.phase = Phase.Verdict(next, false)
        }
    }

    override fun onCancel() { state.phase = Phase.Idle; finish() }
    override fun onClose() { state.phase = Phase.Idle; finish() }
    override fun onOpenReceipt(r: Receipt) { state.phase = Phase.Idle; finish(); openInApp("receipt:${r.checkId}") }
    override fun onReport(r: Receipt) { state.phase = Phase.Idle; finish(); openInApp("compose:${r.checkId}") }
}
