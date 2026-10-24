package app.satya.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.PathParser
import app.satya.ui.theme.Motion
import app.satya.ui.theme.Satya
import kotlin.math.cos
import kotlin.math.sin

/** Parsed once: the seal geometry in its 240x240 design space. */
private object SealGeometry {
    fun parse(d: String): Path = PathParser().parsePathString(d).toPath()
    val disc = parse(SealPaths.DISC)
    val eye = parse(SealPaths.EYE)
    val keyhole = parse(SealPaths.KEYHOLE)
    /** 24 ticks, each its own segment so the activation can draw them in one by one. */
    val ticks: List<Pair<Offset, Offset>> = (0 until 24).map { k ->
        val a = Math.toRadians(7.5 + k * 15)
        Offset((120 + 100 * sin(a)).toFloat(), (120 - 100 * cos(a)).toFloat()) to
            Offset((120 + 107 * sin(a)).toFloat(), (120 - 107 * cos(a)).toFloat())
    }
}

/**
 * Animatable parts of the seal. Defaults draw the static brand seal exactly as the design's seal().
 * @param pupil iris offset in design units (-18..18 during the scan)
 * @param eyeOpen 0 = closed line, 1 = open almond
 * @param ticks fraction of the 24 ticks drawn, clockwise from the top
 * @param ring fraction of the r=91 ring drawn
 */
data class SealState(
    val pupil: Float = 0f,
    val eyeOpen: Float = 1f,
    val ticks: Float = 1f,
    val ring: Float = 1f,
    val disc: Float = 1f,
    val ink: Color = Satya.Blue,
    val gold: Color = Satya.Yellow,
)

fun DrawScope.drawSeal(state: SealState = SealState()) {
    val s = size.minDimension / 240f
    val dx = (size.width - 240f * s) / 2f
    val dy = (size.height - 240f * s) / 2f
    translate(dx, dy) {
        scale(s, s, pivot = Offset.Zero) {
            if (state.disc > 0f) scale(state.disc, state.disc, pivot = Offset(120f, 120f)) { drawPath(SealGeometry.disc, state.gold) }
            val n = (state.ticks * 24f).toInt().coerceIn(0, 24)
            for (k in 0 until n) {
                val (a, b) = SealGeometry.ticks[k]
                drawLine(state.ink, a, b, strokeWidth = 3f, cap = StrokeCap.Round)
            }
            if (state.ring >= 1f) {
                drawCircle(state.ink, radius = 91f, center = Offset(120f, 120f), style = Stroke(4f))
            } else if (state.ring > 0f) {
                drawArc(state.ink, -90f, 360f * state.ring, false, topLeft = Offset(29f, 29f), size = androidx.compose.ui.geometry.Size(182f, 182f), style = Stroke(4f, cap = StrokeCap.Round))
            }
            if (state.eyeOpen > 0f) {
                scale(1f, state.eyeOpen.coerceAtLeast(.02f), pivot = Offset(120f, 120f)) {
                    clipPath(SealGeometry.eye) {
                        translate(state.pupil, 0f) {
                            drawCircle(state.ink, radius = 30f, center = Offset(120f, 120f), style = Stroke(8f))
                            drawPath(SealGeometry.keyhole, state.ink)
                        }
                    }
                    drawPath(SealGeometry.eye, state.ink, style = Stroke(8f, join = StrokeJoin.Round))
                }
            } else {
                drawLine(state.ink, Offset(52f, 120f), Offset(188f, 120f), strokeWidth = 8f, cap = StrokeCap.Round)
            }
            drawCircle(state.ink, 4.5f, Offset(120f, 52f))
            drawCircle(state.ink, 4.5f, Offset(120f, 188f))
        }
    }
}

/** The static brand seal (design: sealSolid). */
@Composable
fun SealSolid(modifier: Modifier, state: SealState = SealState()) {
    Canvas(modifier) { drawSeal(state) }
}

/** The animated seal (design: sealAnim): iris scans L to R on a 2.4 s loop, pupilL keyframes. */
@Composable
fun SealAnimated(modifier: Modifier, speed: Float = 1f) {
    val t = rememberInfiniteTransition(label = "pupil")
    val dur = (2400 / speed).toInt()
    val x by t.animateFloat(
        initialValue = -18f, targetValue = -18f,
        animationSpec = infiniteRepeatable(
            keyframes {
                durationMillis = dur
                -18f at 0 using Motion.Scan
                -18f at (dur * .18f).toInt() using Motion.Scan
                18f at (dur * .50f).toInt() using Motion.Scan
                18f at (dur * .68f).toInt() using Motion.Scan
                -18f at dur using LinearEasing
            },
            repeatMode = RepeatMode.Restart,
        ),
        label = "pupilX",
    )
    Canvas(modifier) { drawSeal(SealState(pupil = x)) }
}

/** Length helper for path-tracing animations. */
fun pathLength(p: Path): Float = PathMeasure().apply { setPath(p, false) }.length
