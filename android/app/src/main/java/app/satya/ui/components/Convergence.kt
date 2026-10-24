package app.satya.ui.components

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.satya.ui.theme.Satya
import app.satya.ui.theme.display
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * "The Convergence" (Brand Guide v1.0, 02 Motion). Paper and pattern arrive from the four corners and
 * meet in the centre; tiles nearest the centre land first and every line draws as it travels. A yellow
 * cross seals the seams, then the blue band opens and the seal and wordmark land in yellow.
 *
 * Timeline at 1x (seconds): Paper 0.15-1.15 expo out · Pattern 0.35-2.06 expo out, 60 ms stagger ·
 * Seal 2.05-2.50 quad in-out · Name 2.40-3.40 cubic in-out · Hold · Release = the same, reversed at 2x.
 */
object ConvergenceTimeline {
    const val PAPER_START = 150f; const val PAPER_END = 1150f
    const val PATTERN_START = 350f; const val PATTERN_END = 2060f; const val STAGGER = 60f
    const val SEAL_START = 2050f; const val SEAL_END = 2500f
    const val NAME_START = 2400f; const val NAME_END = 3400f
    const val ARRIVE = NAME_END

    val ExpoOut = Easing { x -> if (x >= 1f) 1f else 1f - Math.pow(2.0, (-10.0 * x)).toFloat() }
    val QuadInOut = Easing { x -> if (x < .5f) 2 * x * x else 1 - (-2 * x + 2).let { it * it } / 2 }
    val CubicInOut = CubicBezierEasing(.65f, 0f, .35f, 1f)

    fun seg(t: Float, a: Float, b: Float) = ((t - a) / (b - a)).coerceIn(0f, 1f)
}

/**
 * Plays the Convergence once: arrive (3.4 s), hold for [holdMs], then release at 2x and call [onDone].
 * With Android's "Remove animations" on, it shows the finished frame briefly and moves on.
 */
@Composable
fun Convergence(modifier: Modifier = Modifier, holdMs: Long = 1400, release: Boolean = true, onArrived: () -> Unit = {}, onDone: () -> Unit = {}) {
    val ctx = LocalContext.current
    val t = remember { Animatable(0f) }
    val reduced = remember { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
    LaunchedEffect(Unit) {
        if (reduced) {
            t.snapTo(ConvergenceTimeline.ARRIVE); onArrived(); kotlinx.coroutines.delay(holdMs + 600); onDone(); return@LaunchedEffect
        }
        t.animateTo(ConvergenceTimeline.ARRIVE, tween(ConvergenceTimeline.ARRIVE.toInt(), easing = LinearEasing))
        onArrived()
        kotlinx.coroutines.delay(holdMs)
        if (release) t.animateTo(0f, tween((ConvergenceTimeline.ARRIVE / 2).toInt(), easing = LinearEasing))
        onDone()
    }
    ConvergenceFrame(t.value, modifier)
}

/** One frame of the Convergence at time [ms] on the 1x timeline. Pure: the same [ms] draws the same frame. */
@Composable
fun ConvergenceFrame(ms: Float, modifier: Modifier = Modifier) {
    BoxWithConstraints(modifier.fillMaxSize()) {
        val tiles = remember(constraints.maxWidth, constraints.maxHeight) { TileLayout(constraints.maxWidth.toFloat(), constraints.maxHeight.toFloat()) }
        Canvas(Modifier.fillMaxSize()) { drawConvergence(ms, tiles) }
        // 04 Name: seal and wordmark land in yellow on the band.
        val name = ConvergenceTimeline.CubicInOut.transform(ConvergenceTimeline.seg(ms, ConvergenceTimeline.NAME_START + 250f, ConvergenceTimeline.NAME_END))
        if (name > 0f) {
            Row(
                Modifier.align(Alignment.Center).graphicsLayer {
                    alpha = name; val s = 1.25f - .25f * name; scaleX = s; scaleY = s; translationY = (1 - name) * 18.dp.toPx()
                },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                SealSolid(Modifier.size(64.dp))
                Text("SATYA", style = display(44, 700, Satya.Yellow, 1f, .12f))
            }
        }
    }
}

/** Where each lattice tile sits, which quarter carries it, and when it starts travelling. */
private class TileLayout(w: Float, h: Float) {
    class Tile(val x: Float, val y: Float, val kind: String, val dirX: Float, val dirY: Float, val start: Float, val dur: Float)

    val size = 100f // unit tile, scaled at draw time
    val tiles: List<Tile>
    val px: Float = (min(w, h) / 4.6f).coerceIn(72f, 360f)

    init {
        val cols = ceil(w / px).toInt() + 1
        val rows = ceil(h / px).toInt() + 1
        val cx = w / 2; val cy = h / 2
        // Grid anchored so the seams fall between tiles.
        val ox = cx - ceil(cx / px) * px
        val oy = cy - ceil(cy / px) * px
        val raw = ArrayList<Triple<Float, Float, Int>>()
        for (j in 0 until rows) for (i in 0 until cols) {
            val x = ox + i * px; val y = oy + j * px
            if (x > w || y > h || x + px < 0 || y + px < 0) continue
            val ring = max(abs(x + px / 2 - cx), abs(y + px / 2 - cy)).div(px).roundToInt()
            raw += Triple(x, y, ring)
        }
        val maxRing = raw.maxOfOrNull { it.third } ?: 0
        val span = ConvergenceTimeline.PATTERN_END - ConvergenceTimeline.PATTERN_START
        val dur = max(650f, span - ConvergenceTimeline.STAGGER * maxRing)
        tiles = raw.map { (x, y, ring) ->
            val i = ((x - ox) / px).roundToInt(); val j = ((y - oy) / px).roundToInt()
            val dx = if (x + px / 2 < cx) -1f else 1f
            val dy = if (y + px / 2 < cy) -1f else 1f
            Tile(x, y, Lattice.kindAt(i, j), dx, dy, ConvergenceTimeline.PATTERN_START + ConvergenceTimeline.STAGGER * ring, dur)
        }
    }
}

private val measure = PathMeasure()
private val partial = Path()

private fun DrawScope.drawConvergence(ms: Float, layout: TileLayout) {
    val w = size.width; val h = size.height
    val cx = w / 2; val cy = h / 2
    drawRect(Satya.Blue)

    // 01 Paper: four Paper White quarters slide in from the corners.
    val paper = ConvergenceTimeline.ExpoOut.transform(ConvergenceTimeline.seg(ms, ConvergenceTimeline.PAPER_START, ConvergenceTimeline.PAPER_END))
    if (paper > 0f) {
        val off = 1f - paper
        for ((sx, sy) in listOf(-1f to -1f, 1f to -1f, -1f to 1f, 1f to 1f)) {
            val left = if (sx < 0) 0f else cx
            val top = if (sy < 0) 0f else cy
            drawRect(Satya.Paper, Offset(left + sx * cx * off, top + sy * cy * off), Size(cx, cy))
        }
    }

    // 02 Pattern: Majolica Blue tiles travel diagonally with their quarter; each stroke draws on.
    val unit = layout.px / layout.size
    val travel = hypot(w, h) * .55f
    val stroke = Stroke(width = 2.4f, cap = StrokeCap.Round, join = StrokeJoin.Round)
    for (tile in layout.tiles) {
        val p = ConvergenceTimeline.ExpoOut.transform(((ms - tile.start) / tile.dur).coerceIn(0f, 1f))
        if (p <= 0f) continue
        val (strokes, dots) = Lattice.tile(tile.kind)
        val d = (1f - p) * travel * .7071f
        translate(tile.x + tile.dirX * d, tile.y + tile.dirY * d) {
            scale(unit, unit, Offset.Zero) {
                for (s in strokes) rotate(s.rotation, Offset(50f, 50f)) { drawTrimmed(s.path, p, stroke) }
                if (p > .85f) for (dot in dots) rotate(dot.rotation, Offset(50f, 50f)) {
                    drawCircle(Satya.Blue.copy(alpha = (p - .85f) / .15f), dot.r, Offset(dot.x, dot.y))
                }
            }
        }
    }

    // 03 Seal: a yellow cross grows from the centre along both seams, then fades.
    val seal = ConvergenceTimeline.seg(ms, ConvergenceTimeline.SEAL_START, ConvergenceTimeline.SEAL_END)
    if (seal > 0f && seal < 1f) {
        val grow = ConvergenceTimeline.QuadInOut.transform((seal / .6f).coerceIn(0f, 1f))
        val fade = 1f - ((seal - .6f) / .4f).coerceIn(0f, 1f)
        val reach = max(w, h) * grow
        val c = Satya.Yellow.copy(alpha = fade)
        val sw = 6.dp.toPx()
        drawLine(c, Offset(cx - reach, cy), Offset(cx + reach, cy), sw, StrokeCap.Round)
        drawLine(c, Offset(cx, cy - reach), Offset(cx, cy + reach), sw, StrokeCap.Round)
    }

    // 04 Name: the blue band opens from the centre (the seal and wordmark are composed on top).
    val band = ConvergenceTimeline.CubicInOut.transform(ConvergenceTimeline.seg(ms, ConvergenceTimeline.NAME_START, ConvergenceTimeline.NAME_END))
    if (band > 0f) {
        val bh = min(h * .2f, 168.dp.toPx()) * band
        drawRect(Satya.Blue, Offset(0f, cy - bh / 2), Size(w, bh))
    }
}

/** Draws the first [fraction] of [path]'s length: the "line draws as it travels" effect. Every tile stroke is one contour. */
private fun DrawScope.drawTrimmed(path: Path, fraction: Float, style: Stroke) {
    if (fraction >= .999f) { drawPath(path, Satya.Blue, style = style); return }
    measure.setPath(path, false)
    partial.reset()
    measure.getSegment(0f, measure.length * fraction, partial, true)
    drawPath(partial, Satya.Blue, style = style)
}
