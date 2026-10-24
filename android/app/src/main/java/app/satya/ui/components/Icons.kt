package app.satya.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** The prototype's single-line icon set (24x24, round caps and joins), ported path for path. */
object SatyaIcons {
    private val SRC: Map<String, List<String>> = mapOf(
        "eye" to listOf("M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"),
        "search" to listOf("M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z", "M16.2 16.2 20.5 20.5"),
        "sms" to listOf("M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8.5L6 21v-3.5H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z", "M7.5 9.5h9", "M7.5 13h6"),
        "call" to listOf("M6.5 3.5h3l1.8 4.6-2.3 1.4a11 11 0 0 0 5.5 5.5l1.4-2.3 4.6 1.8v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"),
        "upi" to listOf("M7 5h10", "M7 9h10", "M9.5 5c3.5 0 5.5 1.6 5.5 4s-2 4-5.5 4H8l7 6.5"),
        "link" to listOf("M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"),
        "image" to listOf("M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M3.5 16l5-5 4 4 2.5-2.5L20.5 18", "M15.5 9.2v.1"),
        "app" to listOf("M5 4h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z", "M14 4h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z", "M5 13h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z", "M16.5 13v7", "M13 16.5h7"),
        "back" to listOf("M14.5 5 7.5 12l7 7"),
        "close" to listOf("M6.5 6.5l11 11", "M17.5 6.5l-11 11"),
        "chev" to listOf("M9.5 5.5 16 12l-6.5 6.5"),
        "chevDown" to listOf("M6 9.5l6 6 6-6"),
        "check" to listOf("M5 12.5 9.5 17 19 7.5"),
        "share" to listOf("M12 14.5V3.5", "M7.5 8 12 3.5 16.5 8", "M5 13v6a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6"),
        "arrow" to listOf("M5 12h14", "M13 6l6 6-6 6"),
        "arrowUR" to listOf("M7 17 17 7", "M8.5 7H17v8.5"),
        "lock" to listOf("M8 10.5V8a4 4 0 0 1 8 0v2.5", "M6.5 10.5h11a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1z"),
        "mic" to listOf("M12 3.5a3 3 0 0 1 3 3V12a3 3 0 0 1-6 0V6.5a3 3 0 0 1 3-3z", "M6 11.5a6 6 0 0 0 12 0", "M12 17.5V20.5"),
        "plus" to listOf("M12 5v14", "M5 12h14"),
        "gear" to listOf("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"),
        "trash" to listOf("M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12", "M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"),
        "sync" to listOf("M20 11a8 8 0 0 0-14.3-4.9L4 8", "M4 4v4h4", "M4 13a8 8 0 0 0 14.3 4.9L20 16", "M20 20v-4h-4"),
        "receipt" to listOf("M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z", "M9 8h6", "M9 11.5h6", "M9 15h3.5"),
        "speaker" to listOf("M4 9.5h3.5L12 5.5v13l-4.5-4H4z", "M15.5 9a4 4 0 0 1 0 6", "M18 6.5a7.5 7.5 0 0 1 0 11"),
        "screen" to listOf("M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M8.5 20.5h7", "M12 17v3.5"),
        "bell" to listOf("M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z", "M10 20.5a2 2 0 0 0 4 0"),
        "cloud" to listOf("M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.5 9.6 4.5 4.5 0 0 0 7 18.5z"),
        "download" to listOf("M12 4v11", "M7.5 10.5 12 15l4.5-4.5", "M5 19.5h14"),
        "copy" to listOf("M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z", "M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"),
        "video" to listOf("M4 6.5h11a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z", "M16 10.5l5-3v9l-5-3"),
        "shield" to listOf("M12 3 19 6v5.5c0 4.6-3 7.9-7 9.5-4-1.6-7-4.9-7-9.5V6z"),
        "pencil" to listOf("M15.5 4.5l4 4L8 20H4v-4z", "M13 7l4 4"),
        "phoneOff" to listOf("M6.5 3.5h3l1.8 4.6-2.3 1.4a11 11 0 0 0 5.5 5.5l1.4-2.3 4.6 1.8v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z", "M4 20 20 4"),
        "doctor" to listOf("M12 4v16", "M4 12h16"),
        "wave" to listOf("M3 12h2", "M7 8v8", "M11 5v14", "M15 8v8", "M19 10v4"),
    )
    private val cache = HashMap<String, List<Path>>()
    fun paths(name: String): List<Path> = cache.getOrPut(name) { SRC[name].orEmpty().map { PathParser().parsePathString(it).toPath() } }
}

@Composable
fun Ic(name: String, color: Color, size: Dp = 20.dp, stroke: Float = 2f, modifier: Modifier = Modifier) {
    val paths = SatyaIcons.paths(name)
    Canvas(modifier.size(size)) {
        val s = this.size.minDimension / 24f
        scale(s, s, pivot = androidx.compose.ui.geometry.Offset.Zero) {
            paths.forEach { drawPath(it, color, style = Stroke(width = stroke, cap = StrokeCap.Round, join = StrokeJoin.Round)) }
        }
    }
}

/** Source app -> icon, as in the design's SRC_IC. */
fun iconForSource(src: String): String = when (src) {
    "WhatsApp", "Messages", "SMS" -> "sms"
    "UPI app" -> "upi"
    "Instagram", "Gallery", "Screenshot" -> "image"
    "Chrome", "Browser" -> "link"
    "Phone call", "Call" -> "call"
    "Voice note" -> "mic"
    "Video call" -> "video"
    "App" -> "app"
    else -> "screen"
}
