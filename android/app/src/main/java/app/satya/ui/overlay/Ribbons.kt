package app.satya.ui.overlay

import android.os.Build
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlurEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import app.satya.ui.components.grain
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.sin

/**
 * The "Checking" ribbons from the prototype's canvas tick(): five Catmull-Rom ribbons flow in from
 * the edges and converge on the centre ("check"), then collapse into it ("absorb").
 */
object RibbonMath {
    val RIB: List<List<Pair<Float, Float>>> = listOf(
        listOf(-.3f to .95f, .06f to .84f, .26f to .7f, .1f to .52f, .2f to .34f, .42f to .37f, .4f to .47f, .5f to .5f),
        listOf(1.3f to .04f, .92f to .12f, .68f to .24f, .88f to .38f, .76f to .5f, .62f to .505f, .5f to .5f),
        listOf(1.3f to 1.02f, .94f to .92f, .62f to .88f, .84f to .72f, .72f to .58f, .6f to .52f, .5f to .5f),
        listOf(.18f to 1.3f, .32f to 1.02f, .58f to .84f, .34f to .68f, .36f to .57f, .5f to .5f),
        listOf(-.3f to .14f, .06f to .2f, .3f to .12f, .5f to .2f, .34f to .34f, .42f to .46f, .5f to .5f),
    )
    private fun c(hex: Long) = Color(hex or 0xFF000000)
    val BRAND: List<List<Color>> = listOf(
        listOf(c(0x1F5FC4), c(0x5B95FF), c(0xC4DAFF), c(0x5B95FF)),
        listOf(c(0xF7C800), c(0xFFE36A), c(0xFFF6C9), c(0xFFD43B)),
        listOf(c(0x2F6FE4), c(0x8FBAFF), c(0xF4F3EE), c(0x8FBAFF)),
        listOf(c(0xFFE36A), c(0xF4F3EE), c(0x7FB0FF), c(0xF7C800)),
        listOf(c(0x9CC3FF), c(0x3A78E0), c(0xF7C800), c(0x5B95FF)),
    )

    fun cl(u: Float) = u.coerceIn(0f, 1f)
    fun expoOut(u0: Float): Float { val u = cl(u0); return if (u >= 1f) 1f else 1f - 2f.pow(-10f * u) }
    fun inCubic(u0: Float): Float { val u = cl(u0); return u * u * u }

    fun cr(p: List<Offset>, s: Float): Offset {
        val n = p.size - 1
        val f = s.coerceIn(0f, .99999f) * n
        val i = floor(f).toInt()
        val u = f - i
        val p0 = p[maxOf(i - 1, 0)]; val p1 = p[i]; val p2 = p[i + 1]; val p3 = p[minOf(i + 2, n)]
        val u2 = u * u; val u3 = u2 * u
        fun k(a: Float, b: Float, c: Float, d: Float) = .5f * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3)
        return Offset(k(p0.x, p1.x, p2.x, p3.x), k(p0.y, p1.y, p2.y, p3.y))
    }

    fun colAt(stops: List<Color>, x0: Float): Color {
        val x = ((x0 % 1f) + 1f) % 1f
        val n = stops.size
        val f = x * n
        val i = floor(f).toInt() % n
        val u = f - floor(f)
        val a = stops[i]; val b = stops[(i + 1) % n]
        return Color(a.red + (b.red - a.red) * u, a.green + (b.green - a.green) * u, a.blue + (b.blue - a.blue) * u, 1f)
    }

    /** Draw all ribbons for elapsed time t (s, since the mode started) and wall time T (s). */
    fun DrawScope.ribbons(mode: String, t: Float, T: Float, widthScale: Float) {
        val W = size.width; val H = size.height
        RIB.forEachIndexed { i, R ->
            val head: Float; val tail: Float
            if (mode == "check") { head = .27f + .73f * expoOut((t - i * .07f) / .9f); tail = 0f } else { head = 1f; tail = inCubic(t / .48f) }
            if (head - tail < .004f) return@forEachIndexed
            val last = R.size - 1
            val pts = R.mapIndexed { k, (u, v) ->
                val e = if (k == 0 || k == last) .15f else 1f
                Offset((u + .03f * e * sin(T * .9f + k * 1.9f + i * 2.3f)) * W, (v + .022f * e * cos(T * .75f + k * 1.4f + i * 1.7f)) * H)
            }
            val lw = 42f * widthScale * (.9f + .1f * sin(T * 2 + i))
            val steps = maxOf(2, ceil(80 * (head - tail)).toInt())
            var prev = cr(pts, tail)
            for (k in 1..steps) {
                val s = tail + (head - tail) * k / steps
                val p = cr(pts, s)
                drawLine(colAt(BRAND[i], s * .85f - T * .2f + i * .13f), prev, p, strokeWidth = lw, cap = StrokeCap.Round)
                prev = p
            }
        }
    }
}

/**
 * Ribbon layer: a soft 16px-blurred under-glow at 45% plus a 6px-blurred body with grain, as in the
 * prototype's two-pass composite. [mode] "check" flows in; "absorb" collapses into the centre.
 */
@Composable
fun RibbonLayer(mode: String, modifier: Modifier = Modifier, onAbsorbed: () -> Unit = {}) {
    var t by remember { mutableFloatStateOf(0f) }
    var T by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(mode) {
        val start = withFrameNanos { it }
        while (true) {
            val now = withFrameNanos { it }
            t = (now - start) / 1e9f
            T = now / 1e9f
            if (mode == "absorb" && t > .6f) { onAbsorbed(); break }
        }
    }
    val density = LocalDensity.current
    val blurOk = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    Box(modifier.fillMaxSize()) {
        Canvas(
            Modifier.fillMaxSize().graphicsLayer {
                alpha = .45f
                if (blurOk) renderEffect = BlurEffect(with(density) { 16f * this.density }, with(density) { 16f * this.density }, TileMode.Decal)
            },
        ) { with(RibbonMath) { ribbons(mode, t, T, size.width / 396f) } }
        Canvas(
            Modifier.fillMaxSize().graphicsLayer {
                if (blurOk) renderEffect = BlurEffect(6f * density.density, 6f * density.density, TileMode.Decal)
            }.grain(.55f),
        ) { with(RibbonMath) { ribbons(mode, t, T, size.width / 396f) } }
    }
}
