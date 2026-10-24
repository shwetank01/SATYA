package app.satya.ui.overlay

import android.graphics.Bitmap
import android.graphics.Rect
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.satya.core.KillChain
import app.satya.data.Receipt
import app.satya.ui.components.Ic
import app.satya.ui.components.InkButton
import app.satya.ui.components.GhostButton
import app.satya.ui.components.SealAnimated
import app.satya.ui.components.SealSolid
import app.satya.ui.components.Stamp
import app.satya.ui.components.glass
import app.satya.ui.components.grain
import app.satya.ui.components.lattice
import app.satya.ui.components.press
import app.satya.ui.theme.Motion
import app.satya.ui.theme.Satya
import app.satya.ui.theme.body
import app.satya.ui.theme.display
import app.satya.ui.theme.micro
import kotlinx.coroutines.delay

/** The words for a receipt's verdict, English or Hindi. */
fun verdictWord(r: Receipt, hi: Boolean = false): String = when (r.verdict) {
    "breaks" -> if (hi) "वादा तोड़ता है" else "Breaks promise"
    "keeps" -> if (hi) "वादा निभाता है" else "Keeps promise"
    else -> if (hi) "अज्ञात" else "Unknown"
}

/** 14 Checking: frozen screen scaled to .965, dim, ribbons, glass chip, pill, step text. */
@Composable
fun CheckingOverlay(shot: Bitmap?, chip: String, step: String, absorbing: Boolean, flash: Boolean, onAbsorbed: () -> Unit = {}) {
    Box(Modifier.fillMaxSize().background(Satya.Night)) {
        if (shot != null) {
            Image(
                shot.asImageBitmap(), null, contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().scale(.965f).clip(RoundedCornerShape(30.dp)),
            )
        }
        Box(Modifier.fillMaxSize().background(Color(0x94040918)))
        RibbonLayer(if (absorbing) "absorb" else "check", onAbsorbed = onAbsorbed)
        // Glass chip at the top.
        Row(
            Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 16.dp).height(38.dp).glass(RoundedCornerShape(19.dp)).padding(start = 10.dp, end = 15.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Ic("check", Satya.Paper, 15.dp, 2.8f)
            Text(chip, style = body(13, 600, Satya.Paper), maxLines = 1)
        }
        CheckingPill(Modifier.align(Alignment.Center))
        Text(
            step, style = body(15, 600, Satya.Paper).copy(textAlign = TextAlign.Center),
            modifier = Modifier.align(Alignment.Center).offset(y = 66.dp).padding(horizontal = 24.dp),
        )
        if (flash) {
            val a = remember { Animatable(.95f) }
            LaunchedEffect(Unit) { a.animateTo(0f, tween(340)) }
            Box(Modifier.fillMaxSize().alpha(a.value).background(Color.White))
        }
    }
}

/** The white glass pill "Checking…" with a shimmer sweep and the animated seal (pillIn). */
@Composable
fun CheckingPill(modifier: Modifier = Modifier) {
    val pop = remember { Animatable(0f) }
    LaunchedEffect(Unit) { pop.animateTo(1f, tween(500, easing = Motion.Pop)) }
    val shimmer = rememberInfiniteTransition(label = "shimmer")
    val x by shimmer.animateFloat(-1.4f, 3.2f, infiniteRepeatable(tween(1300, easing = androidx.compose.animation.core.CubicBezierEasing(.4f, 0f, .2f, 1f)), RepeatMode.Restart), label = "x")
    Box(
        modifier.size(236.dp, 66.dp).graphicsLayer {
            val s = .55f + .45f * pop.value
            scaleX = s; scaleY = s; alpha = pop.value.coerceIn(0f, 1f)
        }
            .shadow(26.dp, RoundedCornerShape(33.dp), ambientColor = Color(0x6182AAFF), spotColor = Color(0x80FFFFFF))
            .clip(RoundedCornerShape(33.dp))
            .background(Brush.radialGradient(0f to Color.White, .42f to Color(0xFFEDF0F8), 1f to Color(0xFFC3CCE3), center = Offset(330f, 50f), radius = 600f))
            .border(1.dp, Color.White.copy(alpha = .7f), RoundedCornerShape(33.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width * .36f
            val left = size.width * x / 3.2f * 1.0f
            drawRect(Brush.horizontalGradient(listOf(Color.White.copy(alpha = 0f), Color.White.copy(alpha = .95f), Color.White.copy(alpha = 0f)), startX = left, endX = left + w), topLeft = Offset(left, 0f), size = androidx.compose.ui.geometry.Size(w, size.height))
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SealAnimated(Modifier.size(34.dp))
            Text("Checking…", style = body(22, 500, Color(0xFF18223D), italic = true))
        }
    }
}

/** 15 Verdict sheet over the app the user was in. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun VerdictSheet(
    r: Receipt,
    canReport: Boolean,
    onClose: () -> Unit,
    onOpenReceipt: () -> Unit,
    onReport: () -> Unit,
    needsBank: Boolean = false,
    onPickBank: (String) -> Unit = {},
) {
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { shown = true }
    Box(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().background(Color(0x73050912)).clickable(remember { MutableInteractionSource() }, null, onClick = onClose))
        AnimatedVisibility(
            shown, modifier = Modifier.align(Alignment.BottomCenter),
            enter = slideInVertically(tween(440, easing = Motion.Ease)) { it } + fadeIn(tween(200)),
        ) {
            Column(
                Modifier.fillMaxWidth().shadow(40.dp, RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp))
                    .clip(RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp)).background(Satya.Paper)
                    .navigationBarsPadding().verticalScroll(rememberScrollState())
                    .padding(start = 18.dp, end = 18.dp, top = 10.dp, bottom = 22.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Box(Modifier.align(Alignment.CenterHorizontally).size(38.dp, 5.dp).clip(RoundedCornerShape(3.dp)).background(Satya.Ink.copy(alpha = .18f)))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SealSolid(Modifier.size(32.dp))
                    Text("SATYA", style = display(14, 600, Satya.Blue, 1f, .1f), modifier = Modifier.weight(1f))
                    Box(Modifier.size(40.dp).press(.9f, onClick = onClose).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) { Ic("close", Satya.Ink, 18.dp, 2.2f) }
                }
                if (needsBank) {
                    BankPicker(onPickBank)
                    return@Column
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("VERDICT", style = micro())
                        Text(r.bankName, style = body(15, 600, Satya.Body2))
                    }
                    StampIn { Stamp(verdictWord(r), big = true) }
                }
                if (r.hits.isNotEmpty()) {
                    Text(
                        r.hits.joinToString(" · ") { (it.severity.replaceFirstChar { c -> c.uppercase() }) + (if (it.aiAssisted) " (AI-assisted)" else "") } +
                            " · ${r.hits.size} broken promise" + (if (r.hits.size > 1) "s" else ""),
                        style = body(13, 700, Satya.Ink),
                    )
                }
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("WHAT WAS ASKED", style = micro())
                    Text(r.askExcerpt.ifBlank { r.askedFor }, style = body(19, 600, Satya.Ink, 1.35f), maxLines = 4, overflow = TextOverflow.Ellipsis)
                }
                val promise = r.hits.firstOrNull()
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White).border(1.dp, Satya.CardBorder, RoundedCornerShape(18.dp)).padding(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("“", style = display(34, 700, Satya.Blue, .85f))
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            promise?.promise ?: if (r.verdict == "keeps") "Matches ${r.bankName}’s Promise Card. This does not prove it is safe."
                            else "No broken promise found. This does not prove it is safe.",
                            style = body(15, 500, Satya.Ink, 1.5f, italic = true),
                        )
                        Text(r.cardRef, style = body(12, 600, Satya.Muted))
                    }
                }
                SignalsLine(r)
                if (r.killChainStage > 0) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("${r.killChainStage} / 4", style = display(30, 300, Satya.Ink, 1f, -.03f))
                        Column {
                            Text("KILL CHAIN", style = micro())
                            Text(KillChain.next(r.killChainStage).replaceFirstChar { it.uppercase() }, style = body(15, 600))
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    GhostButton("Open receipt", onOpenReceipt, Modifier.weight(1f))
                    if (r.verdict == "breaks" && canReport) InkButton("Report to ${r.claimedBank ?: "bank"}", onReport, Modifier.weight(1.2f), height = 56.dp, radius = 28.dp)
                    else InkButton("Done", onClose, Modifier.weight(1.2f), height = 56.dp, radius = 28.dp)
                }
            }
        }
    }
}

/** Herd / reality / deepfake signals in one quiet line block. */
@Composable
fun SignalsLine(r: Receipt) {
    val lines = buildList {
        r.herd?.let { h ->
            if (h.confirmedBy != null) add("Confirmed fake by ${h.confirmedBy}" + (h.label?.let { " · $it" } ?: ""))
            else if (h.checked && (h.seen7d > 0 || h.reports > 0)) add("Seen ${h.seen7d} times by SATYA users this week · ${h.reports} reports")
            else if (!h.checked) add("Herd count unavailable offline")
        }
        r.reality?.takeIf { it.status != "skipped" }?.let { add(it.message) }
        r.deepfake?.let { d ->
            d.face?.let { add("Video Call Snap: ${pct(it)} synthetic-face score (threshold ${pct(d.threshold)}). ${d.note}") }
            d.voice?.let { add("Voice: ${pct(it)} synthetic-voice score (threshold ${pct(d.threshold)}). ${d.note}") }
            if (d.face == null && d.voice == null && d.note.isNotBlank()) add(d.note)
        }
        if (r.ai?.source == "fallback" && r.hits.isEmpty()) add("AI label unavailable. Rules checked on this phone.")
    }
    if (lines.isEmpty()) return
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Satya.Blue.copy(alpha = .06f)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) { lines.forEach { Text(it, style = body(13, 600, Satya.Body2, 1.4f)) } }
}

fun pct(f: Float) = "${(f * 100).toInt()}%"

@Composable
fun StampIn(content: @Composable () -> Unit) {
    val p = remember { Animatable(0f) }
    LaunchedEffect(Unit) { delay(150); p.animateTo(1f, tween(500, easing = Motion.Pop)) }
    Box(Modifier.graphicsLayer {
        val v = p.value
        val s = 1.9f - .9f * v
        scaleX = s; scaleY = s; rotationZ = -16f + 8f * v; alpha = (v * 1.6f).coerceIn(0f, 1f)
    }) { content() }
}

/** "Who do they say they are?" (Section 13.5 step 6). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BankPicker(onPick: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Who do they say they are?", style = display(24, 700, Satya.Blue))
        Text("The message asks for something but doesn’t name a bank. Pick the one it claims to be from and SATYA checks that bank’s promises.", style = body(15, 400, Satya.Body2, 1.5f))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("SBI" to "SBI", "HDFC" to "HDFC Bank", "ICICI" to "ICICI Bank", "AXIS" to "Axis Bank", "PNB" to "PNB", "NONE" to "No bank").forEach { (id, label) ->
                Box(
                    Modifier.height(44.dp).press(.94f) { onPick(id) }.clip(RoundedCornerShape(22.dp)).background(if (id == "NONE") Color.White else Satya.Blue)
                        .border(1.dp, Satya.Blue, RoundedCornerShape(22.dp)).padding(horizontal = 18.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(label, style = body(15, 600, if (id == "NONE") Satya.Blue else Satya.Paper)) }
            }
        }
    }
}

/** Circle to Check: frozen screen, draw a loop around what to check, or pick whole screen / video. */
@Composable
fun CircleOverlay(shot: Bitmap?, onRegion: (Rect?) -> Unit, onVideo: () -> Unit, onCancel: () -> Unit) {
    val points = remember { mutableStateListOf<Offset>() }
    var done by remember { mutableStateOf(false) }
    val dash = rememberInfiniteTransition(label = "lasso")
    val glow by dash.animateFloat(.6f, 1f, infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Reverse), label = "g")
    Box(Modifier.fillMaxSize().background(Satya.Night)) {
        if (shot != null) Image(shot.asImageBitmap(), null, contentScale = ContentScale.FillBounds, modifier = Modifier.fillMaxSize())
        Box(Modifier.fillMaxSize().background(Color(0x5C040918)))
        Canvas(
            Modifier.fillMaxSize().pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = { points.clear(); points.add(it); done = false },
                    onDrag = { change, _ -> points.add(change.position) },
                    onDragEnd = {
                        done = true
                        if (points.size > 6) {
                            val xs = points.map { it.x }; val ys = points.map { it.y }
                            onRegion(Rect(xs.min().toInt(), ys.min().toInt(), xs.max().toInt(), ys.max().toInt()))
                        }
                    },
                )
            },
        ) {
            if (points.size > 1) {
                val p = Path().apply { moveTo(points[0].x, points[0].y); points.drop(1).forEach { lineTo(it.x, it.y) }; if (done) close() }
                drawPath(p, Satya.Yellow.copy(alpha = .22f * glow))
                drawPath(p, Satya.Yellow.copy(alpha = glow), style = Stroke(5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
                drawPath(p, Color.White.copy(alpha = .9f), style = Stroke(1.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
        }
        Row(
            Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 16.dp).height(44.dp).glass(RoundedCornerShape(22.dp)).padding(start = 8.dp, end = 16.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SealAnimated(Modifier.size(30.dp))
            Text("Circle what you want checked", style = body(14, 600, Satya.Paper))
        }
        Row(
            Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(16.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            OverlayPill("Whole screen", "screen", Modifier.weight(1.25f)) { onRegion(null) }
            OverlayPill("Video call", "video", Modifier.weight(1.05f), onClick = onVideo)
            OverlayPill("Cancel", "close", Modifier.weight(.9f), dark = true, onClick = onCancel)
        }
    }
}

@Composable
fun OverlayPill(text: String, icon: String, modifier: Modifier, dark: Boolean = false, onClick: () -> Unit) {
    Row(
        modifier.height(52.dp).press(.95f, onClick = onClick).clip(RoundedCornerShape(26.dp))
            .background(if (dark) Satya.Ink.copy(alpha = .85f) else Satya.Yellow).padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
    ) {
        Ic(icon, if (dark) Satya.Paper else Satya.Ink, 18.dp, 2.2f)
        Spacer(Modifier.width(6.dp))
        Text(text, style = body(13, 700, if (dark) Satya.Paper else Satya.Ink), maxLines = 1, softWrap = false)
    }
}

/** U2/U3 banner: heads-up card at the top, auto-dismiss after 8 s, tap opens the receipt. */
@Composable
fun Banner(title: String, bodyText: String, onTap: () -> Unit, onDismiss: () -> Unit) {
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { shown = true; delay(8000); onDismiss() }
    AnimatedVisibility(shown, enter = slideInVertically(tween(400, easing = Motion.Ease)) { -it } + fadeIn()) {
        Row(
            Modifier.statusBarsPadding().padding(horizontal = 10.dp, vertical = 8.dp).fillMaxWidth()
                .shadow(14.dp, RoundedCornerShape(24.dp)).clip(RoundedCornerShape(24.dp)).background(Satya.Notif)
                .press(.98f, onClick = onTap).padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SealSolid(Modifier.size(34.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("SATYA · now", style = body(12, 400, Color(0xFF5B5F6B)))
                Text(title, style = body(15, 600, Color(0xFF1B1B1F), 1.3f))
                Text(bodyText, style = body(13, 400, Color(0xFF44474F), 1.4f), maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            Box(Modifier.size(32.dp).clickable(onClick = onDismiss), contentAlignment = Alignment.Center) { Ic("close", Color(0xFF44474F), 16.dp) }
        }
    }
}

/** Suspect Watch: full-screen block when a watched app shows a KYC / PIN screen. */
@Composable
fun SuspectBlock(appLabel: String, bankName: String?, onReport: () -> Unit, onUninstall: () -> Unit, onClose: () -> Unit) {
    Box(Modifier.fillMaxSize().background(Satya.Ink).lattice(Satya.Paper, .07f).grain(.4f)) {
        Column(
            Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp, Alignment.CenterVertically),
        ) {
            SealSolid(Modifier.size(96.dp))
            Text("Not from ${bankName ?: "your bank"}.", style = display(36, 700, Satya.Yellow, 1.05f))
            Text(
                "“$appLabel” is asking for KYC details, a PIN or an OTP, and it is not on ${if (bankName != null) "$bankName’s" else "any bank’s"} official app list. A real bank will never ask you to do this in an app sent over chat or a link.",
                style = body(17, 500, Satya.Paper, 1.5f),
            )
            Text("Don’t type anything here.", style = body(17, 700, Satya.Paper))
            Spacer(Modifier.height(8.dp))
            InkButton("Uninstall “$appLabel”", onUninstall, Modifier.fillMaxWidth().border(1.dp, Satya.Yellow, RoundedCornerShape(22.dp)))
            GhostButton("Report to ${bankName ?: "bank"}", onReport, Modifier.fillMaxWidth())
            Text("Close and go back", style = body(15, 600, Satya.Sub).copy(textAlign = TextAlign.Center), modifier = Modifier.fillMaxWidth().clickable(onClick = onClose).padding(12.dp))
        }
    }
}

/** Video mode progress (5 frames, ≥450 ms apart). */
@Composable
fun VideoSnapOverlay(taken: Int) {
    Box(Modifier.fillMaxSize()) {
        Row(
            Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 16.dp).height(40.dp).glass(RoundedCornerShape(20.dp)).padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Ic("video", Satya.Paper, 16.dp)
            Text("Video Call Snap · frame $taken of 5", style = body(13, 600, Satya.Paper))
        }
    }
}

@Composable
fun ToastOverlay(text: String) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        app.satya.ui.components.ToastView(text, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 40.dp).widthIn(max = 350.dp))
    }
}
