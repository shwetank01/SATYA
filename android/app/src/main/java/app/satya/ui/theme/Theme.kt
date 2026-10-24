package app.satya.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.satya.R

/** Design tokens from design/INVENTORY.md (Satya Android.dc.html v0.2). */
object Satya {
    val Blue = Color(0xFF1F5FC4)
    val Yellow = Color(0xFFF7C800)
    val Paper = Color(0xFFF4F3EE)
    val Ink = Color(0xFF0E2348)
    val Muted = Color(0xFF4A5672)
    val Muted2 = Color(0xFF7A849A)
    val Body2 = Color(0xFF2A3B5E)
    val Evidence = Color(0xFFECE8E1)
    val Bubble = Color(0xFFD7E5FF)
    val Sub = Color(0xFFC9D3E6)
    val Notif = Color(0xFFEEF1F8)
    val White = Color.White
    val Line = Ink.copy(alpha = .07f)
    val CardBorder = Ink.copy(alpha = .08f)
    val ButtonBorder = Ink.copy(alpha = .10f)
    val GlassBorder = Color.White.copy(alpha = .38f)
    val Night = Color(0xFF040918)
}

/** Motion curves used throughout the prototype. */
object Motion {
    /** cubic-bezier(.16,1,.3,1): screens, sheets, cards. */
    val Ease = CubicBezierEasing(.16f, 1f, .3f, 1f)
    /** cubic-bezier(.2,1.3,.3,1): stamps, seal drop, pill pop. */
    val Pop = CubicBezierEasing(.2f, 1.3f, .3f, 1f)
    /** cubic-bezier(.6,0,.3,1): pupil scan. */
    val Scan = CubicBezierEasing(.6f, 0f, .3f, 1f)
    /** cubic-bezier(.3,1.5,.5,1): toggle knob. */
    val Knob = CubicBezierEasing(.3f, 1.5f, .5f, 1f)
}

@OptIn(ExperimentalTextApi::class)
private fun variable(res: Int, weight: Int, italic: Boolean = false) = Font(
    res, FontWeight(weight), if (italic) FontStyle.Italic else FontStyle.Normal,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

object Fonts {
    val Sora = FontFamily(listOf(300, 400, 600, 700).map { variable(R.font.sora, it) })
    val Hanken = FontFamily(
        listOf(400, 500, 600, 700).map { variable(R.font.hanken, it) } + listOf(500, 600).map { variable(R.font.hanken_italic, it, italic = true) },
    )
    val Devanagari = FontFamily(listOf(400, 600, 700).map { variable(R.font.noto_devanagari, it) })
}

/** Text style helper: Hanken body by default; Sora for display. Devanagari falls back per glyph via the system. */
fun body(size: Int, weight: Int = 400, color: Color = Satya.Ink, lineHeight: Float = 1.45f, italic: Boolean = false, tracking: TextUnit = TextUnit.Unspecified) =
    TextStyle(fontFamily = Fonts.Hanken, fontSize = size.sp, fontWeight = FontWeight(weight), color = color, lineHeight = (size * lineHeight).sp,
        fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal, letterSpacing = tracking)

fun bodyF(size: Float, weight: Int = 400, color: Color = Satya.Ink, lineHeight: Float = 1.45f) =
    TextStyle(fontFamily = Fonts.Hanken, fontSize = size.sp, fontWeight = FontWeight(weight), color = color, lineHeight = (size * lineHeight).sp)

fun display(size: Int, weight: Int = 700, color: Color = Satya.Blue, lineHeight: Float = 1.05f, tracking: Float = -.025f) =
    TextStyle(fontFamily = Fonts.Sora, fontSize = size.sp, fontWeight = FontWeight(weight), color = color, lineHeight = (size * lineHeight).sp, letterSpacing = tracking.em)

/** The 11sp uppercase micro-label: weight 700, tracking .12em. */
fun micro(color: Color = Satya.Muted, size: Float = 11f, tracking: Float = .12f) =
    TextStyle(fontFamily = Fonts.Hanken, fontSize = size.sp, fontWeight = FontWeight.Bold, color = color, letterSpacing = tracking.em)

fun hindi(size: Int, weight: Int = 600, color: Color = Satya.Ink, lineHeight: Float = 1.5f) =
    TextStyle(fontFamily = Fonts.Devanagari, fontSize = size.sp, fontWeight = FontWeight(weight), color = color, lineHeight = (size * lineHeight).sp)

@Composable
fun SatyaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Satya.Blue, onPrimary = Satya.Paper, secondary = Satya.Yellow, onSecondary = Satya.Ink,
            background = Satya.Paper, onBackground = Satya.Ink, surface = Color.White, onSurface = Satya.Ink,
        ),
    ) {
        CompositionLocalProvider(
            LocalContentColor provides Satya.Ink,
            LocalTextSelectionColors provides TextSelectionColors(Satya.Blue, Satya.Blue.copy(alpha = .3f)),
            content = content,
        )
    }
}
