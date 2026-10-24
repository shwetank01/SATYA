package app.satya.ui.overlay

import android.graphics.Bitmap
import android.graphics.Rect
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import app.satya.data.Receipt

/** What the check overlay is showing right now. */
sealed interface Phase {
    data object Idle : Phase
    data object Circle : Phase
    data class Video(val taken: Int) : Phase
    data class Checking(val step: Int, val absorbing: Boolean, val flash: Boolean) : Phase
    data class Verdict(val receipt: Receipt, val needsBank: Boolean) : Phase
}

/** The step lines under the pill (design: steps). */
fun stepLines(share: Boolean, bank: String?): List<String> {
    val match = "Matching ${bank?.let { "$it’s" } ?: "the bank’s"} Promise Card"
    return if (share) listOf("Reading the shared screenshot", "Masking your name and number", match)
    else listOf("Masking your name and number", match, "Writing your Proof Receipt")
}

/**
 * Observable state for one check, shared by the accessibility overlay, the share sheet and the
 * tile fallback so every trigger looks and behaves the same.
 */
class CheckFlowState(val share: Boolean) {
    var phase: Phase by mutableStateOf(Phase.Idle)
    var shot: Bitmap? by mutableStateOf(null)
    var bankGuess: String? by mutableStateOf(null)
    var chip: String by mutableStateOf(if (share) "Screenshot received" else "1 frame captured · capture stopped")
    var canReport: Boolean by mutableStateOf(false)
}

interface CheckFlowActions {
    fun onRegion(r: Rect?)
    fun onVideo()
    fun onCancel()
    fun onAbsorbed()
    fun onClose()
    fun onOpenReceipt(r: Receipt)
    fun onReport(r: Receipt)
    fun onPickBank(r: Receipt, bank: String)
}

@Composable
fun CheckFlowUi(state: CheckFlowState, actions: CheckFlowActions) {
    Box(Modifier.fillMaxSize()) {
        when (val p = state.phase) {
            Phase.Idle -> {}
            Phase.Circle -> CircleOverlay(state.shot, actions::onRegion, actions::onVideo, actions::onCancel)
            is Phase.Video -> VideoSnapOverlay(p.taken)
            is Phase.Checking -> CheckingOverlay(
                state.shot, state.chip, stepLines(state.share, state.bankGuess).getOrElse(p.step) { "" }, p.absorbing, p.flash, actions::onAbsorbed,
            )
            is Phase.Verdict -> VerdictSheet(
                p.receipt, state.canReport, actions::onClose, { actions.onOpenReceipt(p.receipt) }, { actions.onReport(p.receipt) },
                p.needsBank, { actions.onPickBank(p.receipt, it) },
            )
        }
    }
}
