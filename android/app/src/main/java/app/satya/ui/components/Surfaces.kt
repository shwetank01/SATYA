package app.satya.ui.components

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.ImageShader
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.PaintingStyle
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.satya.R
import app.satya.ui.theme.Satya
import kotlin.math.floor

/**
 * The SATYA lattice, drawn from the Brand Guide construction (tile() + kindAt() in the design):
 * 100-unit tiles alternating "node" leaves with four motifs (detect, verify, lock, protect),
 * stroke 2.4, round caps and joins, dots at every grid crossing. One 8x8 tile repeats seamlessly.
 */
object Lattice {
    private val FRAME = listOf(
        "M14 14H41A9 9 0 0 1 59 14H86V41A9 9 0 0 1 86 59V86H59A9 9 0 0 1 41 86H14V59A9 9 0 0 1 14 41Z",
        "M19 27L27 19", "M73 19L81 27", "M81 73L73 81", "M27 81L19 73",
    )
    private class Motif(val p: List<String>, val c: List<Triple<Float, Float, Float>> = emptyList(), val d: List<Triple<Float, Float, Float>> = emptyList())
    private val MOTIFS = mapOf(
        "detect" to Motif(listOf("M27 50Q50 27 73 50Q50 73 27 50Z"), listOf(Triple(50f, 50f, 9f)), listOf(Triple(50f, 50f, 2.8f))),
        "verify" to Motif(listOf("M45 61V55A5 5 0 0 1 55 55V59", "M39 67V55A11 11 0 0 1 61 55V69", "M33 64V55A17 17 0 0 1 67 55V71", "M27 58V55A23 23 0 0 1 73 55V63")),
        "lock" to Motif(listOf("M40 47V40A10 10 0 0 1 60 40V47", "M37 47H63A4 4 0 0 1 67 51V69A4 4 0 0 1 63 73H37A4 4 0 0 1 33 69V51A4 4 0 0 1 37 47Z", "M50 61V66"), listOf(Triple(50f, 57f, 3.5f))),
        "protect" to Motif(listOf("M50 27L70 34V50C70 61 61 69 50 74C39 69 30 61 30 50V34Z", "M41 51L48 58L60 45")),
    )
    private val ORDER = listOf("detect", "verify", "lock", "protect")
    private const val LEAF = "M50 43Q59 29 50 15Q41 29 50 43Z"
    private val BRACKETS = listOf("M7 19V7H19", "M81 7H93V19", "M93 81V93H81", "M19 93H7V81")
    private val parsed = HashMap<String, Path>()
    private fun path(d: String) = parsed.getOrPut(d) { PathParser().parsePathString(d).toPath() }

    private fun kindAt(i: Int, j: Int): String {
        if ((((i + j) % 2) + 2) % 2 != 0) return "node"
        return ORDER[((floor((i - j) / 2.0).toInt() % 4) + 4) % 4]
    }

    private val cache = HashMap<Pair<Int, Int>, ImageBitmap>()

    /** One seamless 800x800-unit tile rendered at [px] pixels, in [color]. */
    fun bitmap(color: Color, px: Int): ImageBitmap = cache.getOrPut(color.hashCode() to px) {
        val bmp = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp.asImageBitmap())
        val s = px / 800f
        canvas.scale(s, s)
        val stroke = Paint().apply { this.color = color; style = PaintingStyle.Stroke; strokeWidth = 2.4f; strokeCap = StrokeCap.Round; strokeJoin = StrokeJoin.Round; isAntiAlias = true }
        val fill = Paint().apply { this.color = color; style = PaintingStyle.Fill; isAntiAlias = true }
        for (j in 0 until 8) for (i in 0 until 8) {
            canvas.save()
            canvas.translate(i * 100f, j * 100f)
            when (val kind = kindAt(i, j)) {
                "node" -> {
                    for (a in listOf(0f, 90f, 180f, 270f)) {
                        canvas.save(); canvas.translate(50f, 50f); canvas.rotate(a); canvas.translate(-50f, -50f)
                        canvas.drawPath(path(LEAF), stroke)
                        canvas.drawCircle(Offset(50f, 29f), 2.2f, fill)
                        canvas.restore()
                    }
                    canvas.drawCircle(Offset(50f, 50f), 3.5f, stroke)
                    BRACKETS.forEach { canvas.drawPath(path(it), stroke) }
                }
                else -> {
                    FRAME.forEach { canvas.drawPath(path(it), stroke) }
                    val m = MOTIFS.getValue(kind)
                    m.p.forEach { canvas.drawPath(path(it), stroke) }
                    m.c.forEach { (x, y, r) -> canvas.drawCircle(Offset(x, y), r, stroke) }
                    m.d.forEach { (x, y, r) -> canvas.drawCircle(Offset(x, y), r, fill) }
                }
            }
            canvas.restore()
        }
        for (j in 0..8) for (i in 0..8) canvas.drawCircle(Offset(i * 100f, j * 100f), 2f, fill)
        bmp.asImageBitmap()
    }
}

/** Lattice pattern background (design: background-image lattice-*.svg, background-size, opacity). */
fun Modifier.lattice(color: Color = Satya.Paper, alpha: Float = .14f, tile: Dp = 640.dp, offset: Offset = Offset(-40f, -20f)): Modifier = this.drawBehind {
    val px = tile.toPx().toInt().coerceIn(64, 2048)
    val bmp = Lattice.bitmap(color, px)
    val brush = ShaderBrush(ImageShader(bmp, TileMode.Repeated, TileMode.Repeated))
    translateBrush(offset.x * density, offset.y * density) { drawRect(brush, alpha = alpha, size = androidx.compose.ui.geometry.Size(size.width - offset.x * density, size.height - offset.y * density)) }
}

private inline fun androidx.compose.ui.graphics.drawscope.DrawScope.translateBrush(x: Float, y: Float, block: androidx.compose.ui.graphics.drawscope.DrawScope.() -> Unit) {
    drawContext.canvas.save()
    drawContext.canvas.translate(x, y)
    block()
    drawContext.canvas.restore()
}

object Grain {
    @Volatile private var bmp: ImageBitmap? = null
    fun get(ctx: android.content.Context): ImageBitmap = bmp ?: BitmapFactory.decodeResource(ctx.resources, R.drawable.grain).asImageBitmap().also { bmp = it }
}

/**
 * Film grain over a surface (design: grain.png, mix-blend-mode: overlay). Draws after content inside an
 * offscreen layer so the overlay blend acts on this surface only.
 */
@Composable
fun Modifier.grain(alpha: Float = .5f, tile: Dp = 128.dp): Modifier {
    val ctx = LocalContext.current
    val density = LocalDensity.current
    val brush = remember(tile) {
        val src = Grain.get(ctx)
        val px = with(density) { tile.toPx() }.toInt().coerceAtLeast(16)
        val scaled = Bitmap.createScaledBitmap(src.asAndroidBitmapCompat(), px, px, true).asImageBitmap()
        ShaderBrush(ImageShader(scaled, TileMode.Repeated, TileMode.Repeated))
    }
    return this
        .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
        .drawWithContent {
            drawContent()
            drawRect(brush, alpha = alpha, blendMode = BlendMode.Overlay)
        }
}

private fun ImageBitmap.asAndroidBitmapCompat(): Bitmap = androidx.compose.ui.graphics.asAndroidBitmap(this)

/** Soft radial glow blobs on blue screens. */
fun Modifier.glow(center: Offset, radius: Float, color: Color, alpha: Float): Modifier = this.drawBehind {
    val c = Offset(center.x * density, center.y * density)
    val r = radius * density
    drawCircle(Brush.radialGradient(0f to color.copy(alpha = alpha), .68f to color.copy(alpha = 0f), center = c, radius = r), r, c)
}

/** Standard white card: 22dp radius, 1dp ink-8% border, soft double shadow. */
fun Modifier.card(radius: Dp = 22.dp, bg: Color = Color.White, shadow: Boolean = true): Modifier {
    val shape = RoundedCornerShape(radius)
    return (if (shadow) this.shadow(10.dp, shape, ambientColor = Satya.Ink.copy(alpha = .06f), spotColor = Satya.Ink.copy(alpha = .10f)) else this)
        .clip(shape).background(bg).border(1.dp, Satya.CardBorder, shape)
}

/** Glass card on blue: white 22%->6% at 160deg, 1dp white-38% border, inner top highlight. */
fun Modifier.glass(shape: Shape = RoundedCornerShape(24.dp), strong: Float = .22f): Modifier = this
    .clip(shape)
    .background(Brush.linearGradient(listOf(Color.White.copy(alpha = strong), Color.White.copy(alpha = .06f)), start = Offset(0f, 0f), end = Offset(400f, 1100f)))
    .border(1.dp, Satya.GlassBorder, shape)
    .drawBehind { drawLine(Color.White.copy(alpha = .45f), Offset(24f, 1f), Offset(size.width - 24f, 1f), strokeWidth = 1.5f) }

/** A blue brand surface: base colour, lattice, two glows, grain (Onboarding, Reports, sealing). */
@Composable
fun BlueSurface(modifier: Modifier = Modifier, latticeAlpha: Float = .14f, content: @Composable BoxScope.() -> Unit) {
    Box(
        modifier
            .background(Satya.Blue)
            .lattice(Satya.Paper, latticeAlpha)
            .glow(Offset(380f, 40f), 210f, Color(0xFFE2ECFF), .5f)
            .glow(Offset(30f, 820f), 230f, Color(0xFF8CBEFF), .55f)
            .grain(.5f),
        content = content,
    )
}
