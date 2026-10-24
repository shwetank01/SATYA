package app.satya.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.satya.AppGraph
import app.satya.doot.Doot
import app.satya.doot.ReportStages
import app.satya.sakshi.ReportEntity
import app.satya.ui.BackRow
import app.satya.ui.Fmt
import app.satya.ui.Nav
import app.satya.ui.Page
import app.satya.ui.PageTitle
import app.satya.ui.Route
import app.satya.ui.components.BlueSurface
import app.satya.ui.components.Ic
import app.satya.ui.components.IconTile
import app.satya.ui.components.PulseDot
import app.satya.ui.components.SealSolid
import app.satya.ui.components.Stamp
import app.satya.ui.components.card
import app.satya.ui.components.glass
import app.satya.ui.components.grain
import app.satya.ui.components.lattice
import app.satya.ui.components.press
import app.satya.ui.theme.Satya
import app.satya.ui.theme.body
import app.satya.ui.theme.display
import app.satya.ui.theme.micro

private fun stageOf(r: ReportEntity) = ReportStages.index(r.status)
private fun statusWord(r: ReportEntity) = when (r.status) {
    "queued" -> "Queued · sends when online"
    "failed" -> "Not delivered"
    "dismissed" -> "Closed by the bank"
    else -> ReportStages.LABELS[stageOf(r)]
}

// ---------------------------------------------------------------- 04 Reports

@Composable
fun ReportsScreen(nav: Nav) {
    val ctx = LocalContext.current
    val g = remember { AppGraph.get(ctx) }
    val reports by g.db.reports().all().collectAsState(emptyList())
    BlueSurface(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 44.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            BackRow({ nav.back() }, onBlue = true)
            PageTitle("Reports", reports.size, "Sealed on this phone. Only the bank can open them.", Satya.Yellow, Satya.Paper, Satya.Paper)
            if (reports.isEmpty()) Text("No reports yet. When a check breaks a promise, you can report it to the bank from the receipt.", style = body(15, 400, Satya.Paper, 1.5f), modifier = Modifier.padding(vertical = 30.dp, horizontal = 8.dp))
            reports.forEach { p ->
                val st = stageOf(p)
                val bank = g.registry.now?.book?.bank(p.bankId)?.name ?: p.bankId
                Column(
                    Modifier.fillMaxWidth().press(.98f) { nav.go(Route.ReportStatus(p.localId)) }.glass(RoundedCornerShape(24.dp)).grain(.5f).padding(start = 18.dp, end = 16.dp, top = 16.dp, bottom = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(p.number, style = body(12, 700, Satya.Paper, tracking = androidx.compose.ui.unit.TextUnit.Unspecified), modifier = Modifier.weight(1f))
                        if (st < 4 && p.status != "failed" && p.status != "dismissed") Row(verticalAlignment = Alignment.CenterVertically) { PulseDot(7.dp); Text("Live", style = body(12, 700, Satya.Paper)) }
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(statusWord(p), style = display(22, 600, Satya.Paper, 1.15f, -.01f))
                        Text("$bank · about ${p.payee.ifBlank { "the sender" }}", style = body(14, 500, Satya.Paper))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        repeat(5) { i -> Box(Modifier.weight(1f).height(6.dp).clip(RoundedCornerShape(3.dp)).background(if (i <= st) Satya.Yellow else Color.White.copy(alpha = .15f)).border(1.dp, Color.White.copy(alpha = .4f), RoundedCornerShape(3.dp))) }
                    }
                    Row {
                        Text("Step ${st + 1} of 5", style = body(13, 600, Satya.Paper), modifier = Modifier.weight(1f))
                        Text("Sent ${Fmt.dayLabel(p.createdAt)} · updated ${Fmt.time(p.updatedAt)}", style = body(13, 600, Satya.Paper))
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- 05 Report status

@Composable
fun ReportStatusScreen(nav: Nav, localId: Long) {
    val ctx = LocalContext.current
    val g = remember { AppGraph.get(ctx) }
    val rep by g.db.reports().watch(localId).collectAsState(null)
    val p = rep ?: run { Page { BackRow({ nav.back() }) }; return }
    val bank = g.registry.now?.book?.bank(p.bankId)?.name ?: p.bankId
    val st = stageOf(p)
    val times = remember(p.timesJson) { Doot.times(p.timesJson) }
    val keys = listOf("sealed", "delivered", "opened", "confirmed", "blocked")
    var openStep by remember { mutableStateOf<Int?>(null) }
    val fill by animateFloatAsState(st / 4f, tween(600), label = "fill")
    Page(gap = 16.dp) {
        BackRow({ nav.back() }, title = p.number)
        Column(Modifier.padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("$bank · about ${p.payee.ifBlank { "the sender" }}", style = body(14, 600, Satya.Muted))
            Text(statusWord(p), style = display(36, 700, Satya.Blue))
        }
        Column(
            Modifier.fillMaxWidth().shadow(18.dp, RoundedCornerShape(28.dp), spotColor = Satya.Blue.copy(alpha = .26f)).clip(RoundedCornerShape(28.dp)).background(Satya.Blue)
                .lattice(Satya.Paper, .14f, 520.dp, Offset.Zero).grain(.5f).padding(start = 14.dp, end = 14.dp, top = 18.dp, bottom = 14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Column(Modifier.padding(start = 4.dp, end = 4.dp, bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row { Text("Step ${st + 1} of 5", style = body(13, 700, Satya.Paper), modifier = Modifier.weight(1f)); Text("Only ${p.bankId} can read it", style = body(13, 700, Satya.Paper)) }
                Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(Color.White.copy(alpha = .2f))) {
                    Box(Modifier.fillMaxWidth(fill).height(6.dp).clip(RoundedCornerShape(3.dp)).background(Satya.Yellow))
                }
            }
            ReportStages.LABELS.forEachIndexed { i, label ->
                val done = i <= st
                val t = times[keys[i]]
                val open = (openStep ?: st) == i
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                        .background(when { i == st -> Color.White.copy(alpha = .3f); done -> Color.White.copy(alpha = .15f); else -> Color.White.copy(alpha = .04f) })
                        .border(1.dp, Color.White.copy(alpha = if (done) .22f else .38f), RoundedCornerShape(18.dp))
                        .press(.99f) { openStep = if (open) -1 else i }.padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (i == st && st < 4) PulseDot(8.dp)
                        Text(label, style = body(16, 600, Satya.Paper), modifier = Modifier.weight(1f))
                        Text(if (done && t != null) "${Fmt.dayLabel(t)} · ${Fmt.time(t)}" else "— · Waiting", style = body(13, 600, Satya.Paper))
                        Ic("chevDown", Satya.Paper, 18.dp, 2.2f, Modifier.rotate(if (open) 180f else 0f))
                    }
                    if (open) Text(stageBody(i, bank, p.payee.ifBlank { "the sender" }), style = body(14, 400, Satya.Paper, 1.5f))
                }
            }
        }
        Row(Modifier.fillMaxWidth().card(shadow = false).padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            IconTile("call", Satya.Blue)
            Column { Text("Callback", style = body(15, 600)); Text(if (p.callback) "On. Your number is inside the sealed box." else "Off. The bank can’t see who you are.", style = body(13, 400, Satya.Muted, 1.4f)) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f).press(.97f) { nav.go(Route.Receipt(p.checkId)) }.card(shadow = false).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Ic("receipt", Satya.Blue, 24.dp)
                Column { Text("Proof receipt", style = body(15, 600)); Text("What SATYA found", style = body(13, 400, Satya.Muted)) }
            }
            Column(Modifier.weight(1f).press(.97f) { nav.go(Route.BankView(p.localId)) }.clip(RoundedCornerShape(22.dp)).background(Satya.Ink).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Ic("lock", Satya.Paper, 19.dp)
                Column { Text("What the bank sees", style = body(15, 600, Satya.Paper)); Text("The sealed report, opened", style = body(13, 400, Satya.Sub)) }
            }
        }
        if (p.receiptSig != null) Text("Delivery receipt signed by SATYA and verified on this phone.", style = body(12, 600, Satya.Muted), modifier = Modifier.padding(horizontal = 4.dp))
    }
}

private fun stageBody(i: Int, b: String, p: String) = listOf(
    "Encrypted on your phone with $b’s public key. SATYA’s relay only passed it on.",
    "$b’s fraud desk confirmed it received the sealed box.",
    "$b opened the report. Only $b could.",
    "$b confirmed $p is not theirs.",
    "$p is on the blocklist. Every SATYA phone gets it at the next sync.",
)[i]

// ---------------------------------------------------------------- 06 What the bank receives

@Composable
fun BankViewScreen(nav: Nav, localId: Long) {
    val ctx = LocalContext.current
    val g = remember { AppGraph.get(ctx) }
    val rep by g.db.reports().watch(localId).collectAsState(null)
    val p = rep ?: return
    val check by g.db.checks().watch(p.checkId).collectAsState(null)
    val r = check?.receipt()
    val bank = g.registry.now?.book?.bank(p.bankId)?.name ?: p.bankId
    val st = stageOf(p)
    Box(Modifier.fillMaxSize().background(Satya.Ink)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 44.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            BackRow({ nav.back() }, onBlue = true, icon = "close", title = "BANK VIEW · ${p.bankId}", titleColor = Satya.Paper)
            Column(Modifier.padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(if (st >= 2) "Opened by ${p.bankId}’s fraud desk" else "What ${p.bankId} sees once it opens this", style = display(28, 600, Satya.Yellow, 1.1f, -.02f))
                Text("The customer’s name, number and photo were masked on their phone. Only $bank’s private key opens this.", style = body(14, 400, Satya.Sub, 1.5f))
            }
            Box {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Satya.Paper).padding(18.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        SealSolid(Modifier.size(34.dp))
                        Column(Modifier.weight(1f)) { Text("SEALED REPORT", style = micro()); Text(p.number, style = body(14, 700)) }
                        Text("sha256 ${(p.sealedHash ?: "").take(10)}…", style = body(11, 600, Satya.Muted))
                    }
                    BankField("Request", r?.askExcerpt?.ifBlank { r.askedFor } ?: "—", big = true)
                    r?.hits?.firstOrNull()?.let { BankField("Promise broken", "“${it.promise}”", italic = true); Text(r.cardRef, style = body(12, 600, Satya.Muted)) }
                    if ((r?.killChainStage ?: 0) > 0) BankField("Kill chain", "Stage ${r!!.killChainStage} of 4")
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Satya.Evidence).padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("${r?.sender?.ifBlank { "Sender" } ?: "Sender"} · ${r?.source ?: ""}", style = body(12, 700, Color(0xFF1B1B1F)))
                        Text(r?.maskedText?.take(300) ?: "", style = body(13, 400, Color(0xFF1B1B1F), 1.45f), modifier = Modifier.clip(RoundedCornerShape(4.dp, 14.dp, 14.dp, 14.dp)).background(Color.White).padding(horizontal = 10.dp, vertical = 8.dp))
                    }
                    r?.indicators?.forEach { BankField(it.label, it.value) }
                    BankField("Sealed · Opened", "${Fmt.date(p.createdAt)}, ${Fmt.time(p.createdAt)} · ${if (st >= 2) "Opened" else "Not yet"}")
                    BankField("Callback", if (p.callback) "Customer asked for a callback (number inside the box)" else "Not shared. The customer chose to stay anonymous.")
                }
                if (st >= 3) Box(Modifier.align(Alignment.TopEnd).padding(top = 150.dp, end = 16.dp).rotate(-8f)) {
                    Column(Modifier.clip(RoundedCornerShape(10.dp)).background(Satya.Paper.copy(alpha = .86f)), horizontalAlignment = Alignment.CenterHorizontally) {
                        Stamp("Confirmed fake", big = true, color = Satya.Blue)
                        Text("${p.bankId} · ${Fmt.date(p.updatedAt)}", style = micro(Satya.Blue, 11f, .1f), modifier = Modifier.padding(4.dp))
                    }
                }
            }
            Text("${app.satya.kavach.KavachPacket.kb(p.sealedBytes)} · end-to-end encrypted · SATYA keeps no copy it can read", style = body(13, 400, Satya.Sub, 1.5f), modifier = Modifier.padding(horizontal = 4.dp))
        }
    }
}

@Composable
private fun BankField(k: String, v: String, big: Boolean = false, italic: Boolean = false) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(k.uppercase(), style = micro())
        Text(v, style = body(if (big) 18 else 14, if (italic) 500 else 600, Satya.Ink, 1.4f, italic = italic))
    }
}
