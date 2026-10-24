package app.satya.ui.components

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.satya.ui.theme.Motion
import app.satya.ui.theme.Satya
import app.satya.ui.theme.body
import app.satya.ui.theme.display
import app.satya.ui.theme.micro

/** style-active="transform:scale(.96)": every tappable surface presses in. */
@Composable
fun Modifier.press(scale: Float = .96f, enabled: Boolean = true, role: Role = Role.Button, onClick: () -> Unit): Modifier {
    val src = remember { MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    val s by animateFloatAsState(if (pressed) scale else 1f, tween(140), label = "press")
    return this.scale(s).clickable(interactionSource = src, indication = null, enabled = enabled, role = role, onClick = onClick)
}

/** Ink double-border stamp: the verdict word (design: border 3px double #0E2348). */
@Composable
fun Stamp(word: String, modifier: Modifier = Modifier, big: Boolean = false, color: Color = Satya.Ink, background: Color = Color.Transparent) {
    val bw = if (big) 5.dp else 3.dp
    val radius = if (big) 10.dp else 7.dp
    Box(
        modifier
            .height(if (big) 46.dp else 26.dp)
            .clip(RoundedCornerShape(radius))
            .background(background)
            .drawBehind {
                val w = bw.toPx()
                val line = w / 3f
                val r = radius.toPx()
                drawRoundRect(color, cornerRadius = CornerRadius(r), style = Stroke(line), topLeft = Offset(line / 2, line / 2), size = Size(size.width - line, size.height - line))
                val inset = w - line / 2
                drawRoundRect(color, cornerRadius = CornerRadius((r - w + line).coerceAtLeast(1f)), style = Stroke(line), topLeft = Offset(inset, inset), size = Size(size.width - inset * 2, size.height - inset * 2))
            }
            .padding(horizontal = if (big) 14.dp else 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            word.uppercase(),
            style = if (big) display(17, 700, color, 1f, .06f) else micro(color, 10f, .09f),
            maxLines = 1,
        )
    }
}

/** 46dp round icon button with hairline border (back, close, settings). */
@Composable
fun CircleButton(icon: String, onClick: () -> Unit, modifier: Modifier = Modifier, size: Dp = 46.dp, onBlue: Boolean = false, iconSize: Dp = 22.dp, label: String? = null) {
    Box(
        modifier
            .size(size)
            .press(.9f, onClick = onClick)
            .clip(CircleShape)
            .background(if (onBlue) Color.White.copy(alpha = .14f) else Color.White)
            .border(1.dp, if (onBlue) Color.White.copy(alpha = .38f) else Satya.ButtonBorder, CircleShape),
        contentAlignment = Alignment.Center,
    ) { Ic(icon, if (onBlue) Satya.Paper else Satya.Ink, iconSize, 2.2f) }
}

/** Dark pill (ink + grain), the primary action in the design. */
@Composable
fun InkButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, height: Dp = 60.dp, radius: Dp = 22.dp, enabled: Boolean = true, leading: (@Composable () -> Unit)? = null) {
    Row(
        modifier
            .height(height)
            .press(.96f, enabled = enabled, onClick = onClick)
            .shadow(14.dp, RoundedCornerShape(radius), ambientColor = Satya.Ink.copy(alpha = .22f), spotColor = Satya.Ink.copy(alpha = .26f))
            .clip(RoundedCornerShape(radius))
            .background(if (enabled) Satya.Ink else Satya.Ink.copy(alpha = .45f))
            .grain(.5f)
            .padding(horizontal = 18.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leading?.let { it(); Spacer(Modifier.width(10.dp)) }
        Text(text, style = body(16, 600, Satya.Paper), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** White outline pill. */
@Composable
fun GhostButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, height: Dp = 56.dp, radius: Dp = 28.dp, leading: (@Composable () -> Unit)? = null) {
    Row(
        modifier
            .height(height)
            .press(.96f, onClick = onClick)
            .clip(RoundedCornerShape(radius))
            .background(Color.White)
            .border(1.dp, Satya.Ink.copy(alpha = .14f), RoundedCornerShape(radius))
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leading?.let { it(); Spacer(Modifier.width(8.dp)) }
        Text(text, style = body(16, 600, Satya.Ink), maxLines = 1)
    }
}

/** Yellow pill (onboarding finish). */
@Composable
fun YellowButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier.height(64.dp).press(.95f, onClick = onClick)
            .shadow(12.dp, RoundedCornerShape(32.dp), spotColor = Color(0x4D06163C))
            .clip(RoundedCornerShape(32.dp)).background(Satya.Yellow).padding(horizontal = 28.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = body(17, 700, Satya.Ink)) }
}

/** 52x32 switch; on-blue variant uses the yellow track (design swP). */
@Composable
fun Toggle(on: Boolean, onToggle: () -> Unit, onBlue: Boolean = false) {
    val x by animateDpAsState(if (on) 24.dp else 4.dp, tween(220, easing = Motion.Knob), label = "knob")
    val track = when {
        onBlue && on -> Satya.Yellow
        onBlue -> Color.White.copy(alpha = .2f)
        on -> Satya.Blue
        else -> Satya.Ink.copy(alpha = .18f)
    }
    Box(
        Modifier.size(52.dp, 32.dp).clip(RoundedCornerShape(16.dp)).background(track)
            .then(if (onBlue) Modifier.border(1.dp, Color.White.copy(alpha = .45f), RoundedCornerShape(16.dp)) else Modifier)
            .clickable(role = Role.Switch, onClick = onToggle),
    ) {
        Box(Modifier.offset(x = x, y = 4.dp).size(24.dp).shadow(3.dp, CircleShape).clip(CircleShape).background(Color.White))
    }
}

/** Filter chip (Checks, Privacy Log). */
@Composable
fun Chip(label: String, selected: Boolean, onClick: () -> Unit, count: Int? = null) {
    Row(
        Modifier.height(38.dp).press(.94f, onClick = onClick).clip(RoundedCornerShape(19.dp))
            .background(if (selected) Satya.Blue else Color.White)
            .border(1.dp, if (selected) Satya.Blue else Satya.Ink.copy(alpha = .12f), RoundedCornerShape(19.dp))
            .padding(horizontal = 15.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(label, style = body(14, 600, if (selected) Satya.Paper else Satya.Ink))
        if (count != null) Text("$count", style = body(12, 700, if (selected) Satya.Paper else Satya.Ink))
    }
}

/** Uppercase section label (design: 12px 700 .12em blue). */
@Composable
fun SectionLabel(text: String, color: Color = Satya.Blue, modifier: Modifier = Modifier) {
    Text(text.uppercase(), style = micro(color, 12f, .12f), modifier = modifier.padding(start = 4.dp, top = 4.dp))
}

/** Key / value row inside a white card. */
@Composable
fun KeyValue(k: String, v: String, divider: Boolean, kColor: Color = Satya.Muted, vColor: Color = Satya.Ink) {
    Column(
        Modifier.fillMaxWidth()
            .then(if (divider) Modifier.drawBehind { drawLine(Satya.Line, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) } else Modifier)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(k.uppercase(), style = micro(kColor))
        Text(v, style = body(15, 600, vColor, 1.4f))
    }
}

/** Icon tile used in list rows (42dp, 14dp radius, paper background). */
@Composable
fun IconTile(icon: String, tint: Color = Satya.Blue, size: Dp = 42.dp, bg: Color = Satya.Paper, iconSize: Dp = 20.dp) {
    Box(Modifier.size(size).clip(RoundedCornerShape(size * .34f)).background(bg), contentAlignment = Alignment.Center) { Ic(icon, tint, iconSize) }
}

/** Ink toast with a yellow tick (design: toast). */
@Composable
fun ToastView(text: String, modifier: Modifier = Modifier) {
    Row(
        modifier.shadow(14.dp, RoundedCornerShape(22.dp)).clip(RoundedCornerShape(22.dp)).background(Satya.Ink.copy(alpha = .92f))
            .border(1.dp, Color.White.copy(alpha = .18f), RoundedCornerShape(22.dp)).padding(start = 12.dp, end = 16.dp, top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(28.dp).clip(CircleShape).background(Satya.Yellow), contentAlignment = Alignment.Center) { Ic("check", Satya.Ink, 16.dp, 2.8f) }
        Text(text, style = body(14, 600, Satya.Paper, 1.35f))
    }
}

/** Pulsing yellow dot (design: pulse 1.6s). */
@Composable
fun PulseDot(size: Dp = 8.dp, color: Color = Satya.Yellow) {
    val t = androidx.compose.animation.core.rememberInfiniteTransition(label = "pulse")
    val p by t.animateFloat(0f, 1f, androidx.compose.animation.core.infiniteRepeatable(tween(1600)), label = "p")
    Canvas(Modifier.size(size + 18.dp)) {
        val c = Offset(this.size.width / 2, this.size.height / 2)
        val r = size.toPx() / 2
        drawCircle(color.copy(alpha = .75f * (1 - p)), r + 9.dp.toPx() * p, c)
        drawCircle(color, r, c)
    }
}

@Composable
fun Dots(count: Int, index: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        repeat(count) { i ->
            val w by animateDpAsState(if (i == index) 26.dp else 8.dp, tween(300), label = "dot")
            Box(Modifier.size(w, 8.dp).clip(RoundedCornerShape(4.dp)).background(if (i == index) Satya.Yellow else Satya.Paper.copy(alpha = .45f)))
        }
    }
}

@Composable
fun RowScope.Weight(content: @Composable () -> Unit) { Box(Modifier.weight(1f)) { content() } }

@Composable
fun Centered(text: String, color: Color = Satya.Muted) {
    Text(text, style = body(15, 400, color, 1.5f).copy(textAlign = TextAlign.Center), modifier = Modifier.fillMaxWidth().padding(vertical = 30.dp, horizontal = 20.dp))
}

val Int.ssp get() = this.sp
