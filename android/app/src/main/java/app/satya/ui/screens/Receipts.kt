package app.satya.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.satya.AppGraph
import app.satya.config.Config
import app.satya.core.KillChain
import app.satya.data.Receipt
import app.satya.ui.BackRow
import app.satya.ui.Fmt
import app.satya.ui.Nav
import app.satya.ui.Page
import app.satya.ui.PageTitle
import app.satya.ui.Route
import app.satya.ui.Toaster
import app.satya.ui.Voice
import app.satya.ui.components.BlueSurface
import app.satya.ui.components.Chip
import app.satya.ui.components.Ic
import app.satya.ui.components.IconTile
import app.satya.ui.components.InkButton
import app.satya.ui.components.KeyValue
import app.satya.ui.components.SealSolid
import app.satya.ui.components.SectionLabel
import app.satya.ui.components.Stamp
import app.satya.ui.components.Toggle
import app.satya.ui.components.card
import app.satya.ui.components.iconForSource
import app.satya.ui.components.lattice
import app.satya.ui.components.press
import app.satya.ui.overlay.AiReading
import app.satya.ui.overlay.SignalsLine
import app.satya.ui.overlay.reportable
import app.satya.ui.overlay.verdictWord
import app.satya.ui.theme.Motion
import app.satya.ui.theme.Satya
import app.satya.ui.theme.body
import app.satya.ui.theme.display
import app.satya.ui.theme.hindi
import app.satya.ui.theme.micro
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ---------------------------------------------------------------- 02 Checks

@Composable
fun ChecksScreen(nav: Nav, initial: String) {
    val ctx = LocalContext.current
    val g = remember { AppGraph.get(ctx) }
    val checks by g.db.checks().all().collectAsState(emptyList())
    val receipts = remember(checks) { checks.mapNotNull { it.receipt() } }
    var filter by remember { mutableStateOf(initial) }
    fun matches(r: Receipt, f: String) = f == "all" || r.verdict == f || (f == "scams" && reportable(r))
    val shown = receipts.filter { matches(it, filter) }
    Page {
        BackRow({ nav.back() })
        PageTitle("Checks", receipts.size, "Every screen you checked. Kept only on this phone.")
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("all" to "All", "scams" to "Scams", "breaks" to "Breaks promise", "suspicious" to "Looks like a scam", "keeps" to "Keeps promise", "unknown" to "Unknown").forEach { (id, label) ->
                Chip(label, filter == id, { filter = id }, receipts.count { matches(it, id) })
            }
        }
        val groups = shown.groupBy { Fmt.group(it.ts) }
        if (shown.isEmpty()) Text("No checks here yet.", style = body(15, 400, Satya.Muted), modifier = Modifier.fillMaxWidth().padding(36.dp))
        groups.forEach { (label, items) ->
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SectionLabel(label)
                Column(Modifier.fillMaxWidth().card()) {
                    items.forEachIndexed { i, r ->
                        Row(
                            Modifier.fillMaxWidth().press(.99f) { nav.go(Route.Receipt(r.checkId)) }
                                .then(if (i > 0) Modifier.drawBehind { drawLine(Satya.Line, Offset.Zero, Offset(size.width, 0f), 1.dp.toPx()) } else Modifier)
                                .padding(16.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Row(Modifier.height(24.dp).clip(RoundedCornerShape(12.dp)).background(Satya.Paper).padding(start = 7.dp, end = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                        Ic(iconForSource(r.source), Satya.Muted, 13.dp, 2.2f); Text(r.source, style = body(12, 600, Satya.Body2))
                                    }
                                    Box(Modifier.height(24.dp).clip(RoundedCornerShape(12.dp)).background(Satya.Paper).padding(horizontal = 9.dp), contentAlignment = Alignment.Center) {
                                        Text(if (Fmt.dayLabel(r.ts) == "Today") Fmt.time(r.ts) else Fmt.date(r.ts), style = body(12, 600, Satya.Body2))
                                    }
                                }
                                Text(r.askExcerpt.ifBlank { r.askedFor }, style = body(17, 600, Satya.Ink, 1.3f), maxLines = 3)
                                Text(r.bankName + (r.hits.firstOrNull()?.let { " · " + it.severity.replaceFirstChar { c -> c.uppercase() } } ?: ""), style = body(13, 600, Satya.Muted))
                            }
                            Stamp(verdictWord(r))
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- 03 Proof receipt

@Composable
fun ReceiptScreen(nav: Nav, id: String) {
    val ctx = LocalContext.current
    val g = remember { AppGraph.get(ctx) }
    val scope = rememberCoroutineScope()
    val entity by g.db.checks().watch(id).collectAsState(null)
    val reports by g.db.reports().all().collectAsState(emptyList())
    val r = entity?.receipt()
    var hi by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { Voice.init(ctx) }
    if (r == null) { Page { BackRow({ nav.back() }); Text("This receipt was deleted.", style = body(15, 400, Satya.Muted)) }; return }
    val report = reports.firstOrNull { it.checkId == r.checkId }
    val canSend = g.doot.canSend(r.claimedBank)

    Box(Modifier.fillMaxSize().background(Satya.Paper)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 124.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            BackRow({ nav.back() }, title = if (hi) "प्रमाण रसीद" else "Proof receipt")
            ReceiptTicket(r, hi)
            if (r.hits.size > 1) {
                SectionLabel(if (hi) "सभी टूटे वादे" else "All broken promises")
                Column(Modifier.fillMaxWidth().card()) {
                    r.hits.forEachIndexed { i, h ->
                        Column(
                            Modifier.fillMaxWidth().then(if (i > 0) Modifier.drawBehind { drawLine(Satya.Line, Offset.Zero, Offset(size.width, 0f), 1.dp.toPx()) } else Modifier).padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Stamp(h.severity)
                                Text(h.id + if (h.aiAssisted) " · AI-assisted" else "", style = micro(Satya.Muted))
                            }
                            Text(if (hi) h.promiseHi ?: h.promise else h.promise, style = if (hi) hindi(15, 500) else body(15, 500, Satya.Ink, 1.5f, italic = true))
                            h.source?.let { src ->
                                Text("Source: ${Uri.parse(src).host ?: src}", style = body(12, 600, Satya.Blue), modifier = Modifier.press { runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(src)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } })
                            }
                        }
                    }
                }
            }
            AiReading(r, hi)
            SignalsLine(r)
            if (r.leftPhone.isNotEmpty()) {
                SectionLabel(if (hi) "फ़ोन से क्या गया" else "What left this phone")
                Column(Modifier.fillMaxWidth().card().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    r.leftPhone.forEach { Text("• $it", style = body(14, 500, Satya.Body2, 1.45f)) }
                }
            }
            if (reportable(r)) {
                SectionLabel(if (hi) "पैसे गए?" else "Lost money?")
                Row(Modifier.fillMaxWidth().card().padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    IconTile("call", Satya.Blue)
                    Column(Modifier.weight(1f)) {
                        Text(if (hi) "1930 पर तुरंत कॉल करें" else "Call 1930 now", style = body(15, 600))
                        Text(if (hi) "राष्ट्रीय साइबर अपराध हेल्पलाइन। पहले घंटे में कॉल करें।" else "National Cyber Crime Helpline. Call within the first hour; then report at cybercrime.gov.in.", style = body(13, 400, Satya.Muted, 1.4f))
                    }
                    Box(Modifier.height(40.dp).press { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:1930")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.clip(RoundedCornerShape(20.dp)).background(Satya.Ink).padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                        Text("1930", style = body(14, 700, Satya.Paper))
                    }
                }
            }
        }
        Row(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                .background(androidx.compose.ui.graphics.Brush.verticalGradient(0f to Satya.Paper.copy(alpha = 0f), .28f to Satya.Paper))
                .navigationBarsPadding().padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(Modifier.size(60.dp).press(.92f) {
                scope.launch { g.db.checks().delete(r.checkId); Toaster.show("Receipt deleted from this phone."); nav.back() }
            }.clip(RoundedCornerShape(22.dp)).background(Color.White).border(1.dp, Satya.ButtonBorder, RoundedCornerShape(22.dp)), contentAlignment = Alignment.Center) { Ic("trash", Satya.Ink, 21.dp) }
            Row(
                Modifier.height(60.dp).press(.95f) {
                    hi = !hi
                    if (hi && Config.now.hindiVoice) { Voice.speak(spoken(r, true), true); Toaster.show("Reading the receipt aloud in Hindi") } else Voice.stop()
                }.clip(RoundedCornerShape(22.dp)).background(Color.White).border(1.dp, Satya.ButtonBorder, RoundedCornerShape(22.dp)).padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) { Ic("speaker", Satya.Ink, 19.dp); Text(if (hi) "English" else "हिंदी", style = if (hi) body(15, 600) else hindi(15, 600)) }
            InkButton(
                when { report != null -> "View report"; reportable(r) -> "Report to ${r.claimedBank ?: "bank"}"; else -> "Done" },
                {
                    when {
                        report != null -> nav.go(Route.ReportStatus(report.localId))
                        reportable(r) -> nav.go(Route.Compose(r.checkId))
                        else -> nav.back()
                    }
                },
                Modifier.weight(1f),
            )
        }
    }
}

private fun spoken(r: Receipt, hi: Boolean): String {
    val h = r.hits.firstOrNull()
    return if (hi) "${verdictWord(r, true)}। ${r.bankNameHi}। ${r.askedForHi}। ${h?.promiseHi ?: h?.promise ?: ""}"
    else "${verdictWord(r)}. ${r.bankName}. ${r.askedFor}. ${h?.promise ?: ""}"
}

/** The ticket: header, verdict, punched divider, asked, promise, kill chain, evidence, meta. */
@Composable
fun ReceiptTicket(r: Receipt, hi: Boolean) {
    val top = r.hits.firstOrNull()
    Box(Modifier.fillMaxWidth().shadow(16.dp, RoundedCornerShape(24.dp), spotColor = Satya.Ink.copy(alpha = .08f)).clip(RoundedCornerShape(24.dp)).background(Color.White).lattice(Satya.Blue, .05f, 460.dp, Offset.Zero)) {
        Column {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SealSolid(Modifier.size(38.dp))
                    Column(Modifier.weight(1f)) {
                        Text("SATYA", style = display(15, 600, Satya.Blue, 1f, .1f))
                        Text(if (hi) "प्रमाण रसीद" else "PROOF RECEIPT", style = micro())
                    }
                    Column(horizontalAlignment = Alignment.End) { Text("NO.", style = micro()); Text(r.no, style = body(14, 700)) }
                }
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(if (hi) "फ़ैसला" else "VERDICT", style = micro())
                    Text(verdictWord(r, hi), style = if (hi) hindi(36, 700) else display(40, 700, Satya.Ink, 1.05f, -.03f))
                    Text(if (hi) r.bankNameHi else r.bankName, style = if (hi) hindi(16, 600, Satya.Body2) else body(16, 600, Satya.Body2))
                    if (!reportable(r)) Text(if (hi) "यह सुरक्षित होने का सबूत नहीं है।" else "This does not prove it is safe.", style = body(13, 600, Satya.Muted))
                }
            }
            // Punched, dashed divider.
            Box(Modifier.fillMaxWidth().height(2.dp).padding(horizontal = 18.dp).drawBehind {
                drawLine(Satya.Ink.copy(alpha = .16f), Offset(0f, 0f), Offset(size.width, 0f), 2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f)))
            })
            Column(Modifier.padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 22.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(if (hi) "क्या माँगा गया" else "WHAT WAS ASKED", style = micro())
                    Text(if (hi) r.askedForHi else r.askExcerpt.ifBlank { r.askedFor }, style = if (hi) hindi(19, 600) else body(20, 600, Satya.Ink, 1.35f))
                    if (!hi && r.askExcerpt.isNotBlank()) Text(r.askedFor, style = body(13, 600, Satya.Muted))
                }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        when (r.verdict) { "breaks" -> if (hi) "कौन-सा वादा टूटता है" else "PROMISE IT BREAKS"; "keeps" -> if (hi) "कौन-सा वादा निभता है" else "PROMISE IT KEEPS"; else -> if (hi) "वादा कार्ड" else "PROMISE CARD" },
                        style = micro(),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("“", style = display(40, 700, Satya.Blue, .85f, 0f))
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                top?.let { if (hi) it.promiseHi ?: it.promise else it.promise }
                                    ?: when (r.verdict) {
                                        "keeps" -> if (hi) "यह ${r.bankNameHi} के आधिकारिक चैनल से मेल खाता है।" else "It matches ${r.bankName}’s official channels on its Promise Card."
                                        "suspicious" -> if (hi) "किसी बैंक का वादा इस माँग पर सीधे लागू नहीं होता, पर SATYA AI को इसमें धोखे के निशान मिले।" else "No bank’s Promise Card covers this request exactly, but SATYA AI found the signs of a scam."
                                        else -> if (hi) "किसी बैंक का वादा इस माँग पर लागू नहीं होता, इसलिए SATYA इसे असली या नकली नहीं कह सकता।" else "No bank’s Promise Card covers this request, so SATYA can’t call it genuine or fake."
                                    },
                                style = if (hi) hindi(17, 500) else body(17, 500, Satya.Ink, 1.5f, italic = true),
                            )
                            Text(r.cardRef, style = body(12, 600, Satya.Muted))
                        }
                    }
                }
                if (r.verdict == "breaks" && r.killChainStage > 0) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(if (hi) "धोखे की कड़ी" else "KILL CHAIN", style = micro())
                        Text(if (hi) "चरण ${r.killChainStage}/4: ${KillChain.next(r.killChainStage, true)}" else "Stage ${r.killChainStage} of 4: ${KillChain.next(r.killChainStage)}", style = if (hi) hindi(17, 600) else body(17, 600, Satya.Ink, 1.35f))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            KillChain.STAGES.forEachIndexed { i, (en, h) ->
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(if (i < r.killChainStage) Satya.Ink else Color.Transparent).border(1.5.dp, Satya.Ink, RoundedCornerShape(4.dp)))
                                    Text(if (hi) h else en, style = body(12, 700, if (i < r.killChainStage) Satya.Ink else if (i == r.killChainStage) Satya.Blue else Satya.Muted2))
                                }
                            }
                        }
                    }
                }
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(if (hi) "सबूत" else "EVIDENCE", style = micro())
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Satya.Evidence).border(1.dp, Satya.CardBorder, RoundedCornerShape(18.dp)).padding(10.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(2.dp)) {
                            Box(Modifier.size(26.dp).clip(CircleShape).background(Satya.Ink))
                            Text(r.sender.ifBlank { "Sender not shown" }, style = body(13, 600, Color(0xFF1B1B1F)), modifier = Modifier.weight(1f), maxLines = 1)
                            Text(r.source.uppercase(), style = micro(Satya.Muted, 10f, .1f))
                        }
                        Box(Modifier.clip(RoundedCornerShape(4.dp, 14.dp, 14.dp, 14.dp)).background(Color.White).border(2.dp, Satya.Blue, RoundedCornerShape(4.dp, 14.dp, 14.dp, 14.dp)).padding(horizontal = 10.dp, vertical = 8.dp)) {
                            Text(r.maskedText.take(400).ifBlank { r.askedFor }, style = body(13, 600, Color(0xFF1B1B1F), 1.45f))
                        }
                    }
                    Text(
                        if (hi) "आपका नाम, नंबर और फ़ोटो भेजने से पहले इसी फ़ोन पर छिपा दिए गए।" else "Your name, number and photo were masked on this phone before anything was sent. Tokens like [UPI_1] stand in for values.",
                        style = if (hi) hindi(13, 400, Satya.Muted) else body(13, 400, Satya.Muted, 1.45f),
                    )
                }
                Column(Modifier.drawBehind {
                    drawLine(Satya.Ink.copy(alpha = .12f), Offset.Zero, Offset(size.width, 0f), 2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f)))
                }.padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    val meta = listOf(
                        (if (hi) "ऐप" else "SOURCE APP") to r.source,
                        (if (hi) "जाँचा गया" else "CHECKED") to "${Fmt.dayLabel(r.ts)}, ${Fmt.time(r.ts)}",
                        (if (hi) "कैप्चर" else "CAPTURED") to r.captured.ifBlank { "On this phone" },
                        (if (hi) "जवाब" else "ANSWERED BY") to if (r.ai?.source == "ai") "PRAHARI + SATYA AI" else "PRAHARI (on this phone)",
                    )
                    meta.chunked(2).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            row.forEach { (k, v) ->
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(k, style = micro(Satya.Muted, 11f, .1f)); Text(v, style = body(14, 600))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- 03b Report to bank

@Composable
fun ComposeScreen(nav: Nav, checkId: String) {
    val ctx = LocalContext.current
    val g = remember { AppGraph.get(ctx) }
    val scope = rememberCoroutineScope()
    val entity by g.db.checks().watch(checkId).collectAsState(null)
    val r = entity?.receipt() ?: run { Page { BackRow({ nav.back() }, icon = "close") }; return }
    var callback by remember { mutableStateOf(false) }
    var number by remember { mutableStateOf(Config.now.myPhones.firstOrNull().orEmpty()) }
    var sealing by remember { mutableStateOf(false) }
    // The message may not name a bank (e.g. a "Looks like a scam" verdict): the user picks who to tell.
    var bank by remember(r.checkId) { mutableStateOf(r.claimedBank) }
    val bankShort = bank ?: "bank"
    val bankName = bank?.let { g.registry.now?.book?.bank(it)?.name } ?: r.bankName
    val items = buildList {
        add("The request" to (r.askExcerpt.ifBlank { r.askedFor }))
        add("Promise broken" to (r.hits.firstOrNull()?.let { "${it.id} · ${it.severity}" } ?: if (r.verdict == "suspicious") "None matched · SATYA AI: looks like a scam" else "None"))
        r.ai?.takeIf { it.explained }?.let { add("SATYA AI" to it.summary) }
        if (r.killChainStage > 0) add("Kill chain" to "Stage ${r.killChainStage} of 4: ${KillChain.next(r.killChainStage)}")
        add("Their details" to r.indicators.joinToString(", ") { "${it.label}: ${it.value}" }.ifBlank { r.sender.ifBlank { "None found" } })
        add("Your details" to "Masked on your phone")
        add("Where and when" to "${r.source} · ${Fmt.dayLabel(r.ts)}, ${Fmt.time(r.ts)}")
        if (callback && number.isNotBlank()) add("Your number" to number)
    }
    Box(Modifier.fillMaxSize().background(Satya.Paper)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 124.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            BackRow({ nav.back() }, icon = "close", title = "Report to $bankShort")
            Column(Modifier.padding(start = 4.dp, end = 4.dp, top = 6.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(56.dp).clip(RoundedCornerShape(20.dp)).background(Satya.Blue), contentAlignment = Alignment.Center) { Ic("lock", Satya.Paper, 24.dp) }
                Text(if (bank == null) "Which bank should get this?" else "Sealed so only $bankName can open it.", style = display(32, 700, Satya.Blue))
                Text("SATYA’s relay carries the box but can’t read it. This is everything inside.", style = body(15, 400, Satya.Body2, 1.5f))
            }
            if (r.claimedBank == null) {
                Column(Modifier.fillMaxWidth().card(shadow = false).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("WHO DID THEY CLAIM TO BE? OR YOUR OWN BANK", style = micro())
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        (g.registry.now?.boxKeys?.keys?.sorted() ?: emptyList()).forEach { id -> Chip(id, bank == id, { bank = id }) }
                    }
                }
            }
            Column(Modifier.fillMaxWidth().card()) { items.forEachIndexed { i, (k, v) -> KeyValue(k, v, i > 0) } }
            Column(Modifier.fillMaxWidth().card(shadow = false).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    IconTile("call", Satya.Blue)
                    Column(Modifier.weight(1f)) {
                        Text("Ask the bank to call me", style = body(15, 600))
                        Text("Adds your number inside the sealed box. Off by default.", style = body(13, 400, Satya.Muted, 1.4f))
                    }
                    Toggle(callback, { callback = !callback })
                }
                if (callback) Box(Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(14.dp)).background(Satya.Paper).padding(horizontal = 14.dp), contentAlignment = Alignment.CenterStart) {
                    if (number.isEmpty()) Text("Your mobile number", style = body(15, 400, Satya.Muted))
                    BasicTextField(number, { number = it }, singleLine = true, textStyle = body(15, 600), cursorBrush = SolidColor(Satya.Blue),
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth())
                }
            }
        }
        Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(16.dp)) {
            InkButton(if (bank == null) "Pick a bank above" else "Seal and send to $bankShort", {
                if (sealing || bank == null) return@InkButton
                sealing = true
                scope.launch {
                    val id = runCatching { g.doot.sealAndQueue(r, null, if (callback) number.takeIf { it.isNotBlank() } else null, bank) }.getOrNull()
                    delay(1900)
                    sealing = false
                    if (id == null) { Toaster.show("Couldn’t seal: $bankShort has no report key on this phone."); return@launch }
                    nav.reset(Route.Home); nav.go(Route.Reports); nav.go(Route.ReportStatus(id))
                }
            }, Modifier.fillMaxWidth(), height = 62.dp, radius = 31.dp, enabled = bank != null, leading = { Ic("lock", Satya.Paper, 19.dp) })
        }
        if (sealing) SealingOverlay(bankName)
    }
}

@Composable
private fun SealingOverlay(bank: String) {
    val drop = remember { Animatable(0f) }
    val words = remember { Animatable(0f) }
    LaunchedEffect(Unit) { launch { drop.animateTo(1f, tween(700, easing = Motion.Pop)) }; delay(500); words.animateTo(1f, tween(300)) }
    BlueSurface(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            SealSolid(Modifier.size(150.dp).graphicsLayer { val s = 2.2f - 1.2f * drop.value; scaleX = s; scaleY = s; alpha = drop.value.coerceIn(0f, 1f) })
            Spacer(Modifier.height(40.dp))
            Column(Modifier.graphicsLayer { alpha = words.value }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Sealing your report", style = display(22, 600, Satya.Yellow, 1.2f, 0f))
                Text("Encrypted with $bank’s public key", style = body(15, 400, Satya.Paper))
            }
        }
    }
}
