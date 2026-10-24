package app.satya.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.satya.AppGraph
import app.satya.config.Config
import app.satya.data.Receipt
import app.satya.sakshi.CheckEntity
import app.satya.ui.Fmt
import app.satya.ui.Nav
import app.satya.ui.Page
import app.satya.ui.Route
import app.satya.ui.components.CircleButton
import app.satya.ui.components.Ic
import app.satya.ui.components.IconTile
import app.satya.ui.components.PulseDot
import app.satya.ui.components.SealSolid
import app.satya.ui.components.Stamp
import app.satya.ui.components.card
import app.satya.ui.components.glow
import app.satya.ui.components.grain
import app.satya.ui.components.iconForSource
import app.satya.ui.components.lattice
import app.satya.ui.components.press
import app.satya.ui.overlay.reportable
import app.satya.ui.overlay.verdictWord
import app.satya.ui.theme.Satya
import app.satya.ui.theme.body
import app.satya.ui.theme.display
import app.satya.ui.theme.micro
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

fun CheckEntity.receipt(): Receipt? = runCatching { Receipt.fromJson(receiptJson) }.getOrNull()

@Composable
fun HomeScreen(nav: Nav) {
    val ctx = LocalContext.current
    val g = remember { AppGraph.get(ctx) }
    val checks by g.db.checks().all().collectAsState(emptyList())
    val reports by g.db.reports().all().collectAsState(emptyList())
    val weekAgo = remember { System.currentTimeMillis() - 7L * 24 * 3600 * 1000 }
    val logCount by g.db.egress().countSince(weekAgo).collectAsState(0)
    val settings by Config.state.collectAsState()
    val reg by g.registry.state.collectAsState()
    val receipts = remember(checks) { checks.mapNotNull { it.receipt() } }
    var appsSummary by remember { mutableStateOf("Checking the apps on this phone…") }
    val health = rememberShieldHealth()
    LaunchedEffect(reg) {
        val apps = withContext(Dispatchers.Default) { g.knowYourApp.list() }
        val suspects = apps.count { it.suspect }
        appsSummary = "${apps.size} finance apps · " + if (suspects > 0) "$suspects suspect" else "no suspects"
    }

    Page {
        Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            SealSolid(Modifier.size(34.dp))
            Text("SATYA", style = display(17, 600, Satya.Blue, 1f, .1f), modifier = Modifier.padding(start = 10.dp).weight(1f))
            CircleButton("gear", { nav.go(Route.Settings) }, iconSize = 20.dp)
        }
        Column(Modifier.padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(Fmt.today(), style = body(14, 600, Satya.Muted))
            Text(if (health.allOn) "Shield on." else "Shield partly on.", style = display(44, 700, Satya.Blue, 1.02f, -.03f))
            Text("No account, no login.", style = display(44, 600, Satya.Muted2, 1.02f, -.03f))
        }
        // Shield card
        Column(
            Modifier.fillMaxWidth().shadow(18.dp, RoundedCornerShape(28.dp), spotColor = Satya.Blue.copy(alpha = .28f))
                .clip(RoundedCornerShape(28.dp)).background(Satya.Blue)
                .lattice(Satya.Paper, .15f, 520.dp, Offset(-30f, -10f))
                .glow(Offset(330f, 20f), 150f, Color(0xFFE2ECFF), .5f).grain(.5f)
                .padding(horizontal = 20.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(
                    Modifier.height(32.dp).clip(RoundedCornerShape(16.dp))
                        .background(Brush.linearGradient(listOf(Color.White.copy(alpha = .24f), Color.White.copy(alpha = .06f))))
                        .border(1.dp, Color.White.copy(alpha = .38f), RoundedCornerShape(16.dp))
                        .press(.96f) { if (!health.allOn) nav.go(Route.Setup) }
                        .padding(end = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PulseDot(8.dp)
                    Text(if (health.allOn) "Shield on" else "Finish setup", style = body(13, 600, Satya.Paper))
                }
                Box(Modifier.weight(1f))
                Text("PRAHARI", style = micro(Satya.Paper, 11f, .14f))
            }
            Row {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Last sync", style = body(13, 600, Satya.Paper))
                    Text(if (settings.lastSync > 0) Fmt.ago(settings.lastSync) else "Built in", style = display(28, 600, Satya.Paper, 1.1f, -.02f))
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Promise Cards", style = body(13, 600, Satya.Paper))
                    Text("${reg?.book?.banks?.size ?: 0} banks", style = display(28, 600, Satya.Paper, 1.1f, -.02f))
                }
            }
            Text(
                if (health.allOn) "Syncs in the background every 15 minutes. The app can stay closed."
                else "Off: ${health.missing.joinToString(", ")}. Tap Finish setup.",
                style = body(13, 400, Satya.Paper, 1.45f),
                modifier = Modifier.drawBehind { drawLine(Satya.Paper.copy(alpha = .28f), Offset(0f, -14.dp.toPx()), Offset(size.width, -14.dp.toPx()), 1.dp.toPx()) }.padding(top = 0.dp),
            )
        }
        // Counters
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Counter(receipts.size, "Checks done", Modifier.weight(1f)) { nav.go(Route.Checks()) }
            Counter(receipts.count { reportable(it) }, "Scams caught", Modifier.weight(1f)) { nav.go(Route.Checks("scams")) }
            Counter(reports.size, "Reports sent", Modifier.weight(1f)) { nav.go(Route.Reports) }
        }
        // Check now
        Row(
            Modifier.fillMaxWidth().height(78.dp).press(.97f) { nav.go(Route.CheckNow) }
                .shadow(14.dp, RoundedCornerShape(39.dp), spotColor = Satya.Ink.copy(alpha = .28f))
                .clip(RoundedCornerShape(39.dp)).background(Satya.Ink).grain(.5f).padding(horizontal = 13.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            SealSolid(Modifier.size(52.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("Check now", style = display(21, 600, Satya.Paper, 1.1f, -.01f))
                Text("Paste, pick a screenshot or try a sample", style = body(13, 400, Satya.Sub))
            }
            Box(Modifier.size(52.dp).clip(CircleShape).background(Satya.Yellow), contentAlignment = Alignment.Center) { Ic("arrow", Satya.Ink, 22.dp, 2.4f) }
        }
        // Last receipts
        Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 6.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.Bottom) {
                Text("Last receipts", style = display(21, 600, Satya.Blue, 1.1f, -.01f), modifier = Modifier.weight(1f))
                Text("All checks", style = body(14, 600, Satya.Blue), modifier = Modifier.press { nav.go(Route.Checks()) }.padding(vertical = 6.dp))
            }
            Column(Modifier.fillMaxWidth().card()) {
                if (receipts.isEmpty()) Text("No receipts yet. Tap Check now or triple-tap the edge strip.", style = body(15, 400, Satya.Muted, 1.5f), modifier = Modifier.padding(horizontal = 18.dp, vertical = 22.dp))
                receipts.take(3).forEachIndexed { i, r -> ReceiptRow(r, i > 0) { nav.go(Route.Receipt(r.checkId)) } }
            }
        }
        // Know your apps
        Row(
            Modifier.fillMaxWidth().press(.98f) { nav.go(Route.Apps) }.card().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            IconTile("app", Satya.Blue, 46.dp, iconSize = 22.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("Know your apps", style = display(17, 600, Satya.Ink, 1.2f, 0f))
                Text(appsSummary, style = body(13, 400, Satya.Muted))
            }
            Ic("chev", Satya.Ink.copy(alpha = .4f), 18.dp, 2.2f)
        }
        // Privacy Log
        Row(
            Modifier.fillMaxWidth().press(.98f) { nav.go(Route.Privacy) }.clip(RoundedCornerShape(26.dp)).background(Satya.Yellow)
                .lattice(Satya.Ink, .08f, 440.dp, Offset.Zero).padding(start = 22.dp, end = 20.dp, top = 20.dp, bottom = 20.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("$logCount", style = display(68, 300, Satya.Ink, .9f, -.05f))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("things left your phone this week.", style = display(18, 600, Satya.Ink, 1.2f, 0f))
                Text("See them.", style = body(15, 700, Satya.Ink).copy(textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline))
            }
        }
    }
}

@Composable
private fun Counter(n: Int, label: String, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier.press(.96f, onClick = onClick).card().padding(start = 14.dp, end = 12.dp, top = 12.dp, bottom = 14.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.align(Alignment.End).size(28.dp).clip(CircleShape).background(Satya.Paper), contentAlignment = Alignment.Center) { Ic("arrowUR", Satya.Ink, 14.dp, 2.2f) }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("$n", style = display(40, 300, Satya.Ink, 1f, -.04f))
            Text(label, style = body(13, 600, Satya.Muted, 1.25f))
        }
    }
}

@Composable
fun ReceiptRow(r: Receipt, divider: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().press(.99f, onClick = onClick)
            .then(if (divider) Modifier.drawBehind { drawLine(Satya.Line, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) } else Modifier)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconTile(iconForSource(r.source), Satya.Blue, 42.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(r.askExcerpt.ifBlank { r.askedFor }, style = body(15, 600), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${r.claimedBank ?: "No bank"} · ${r.source} · ${if (Fmt.dayLabel(r.ts) == "Today") Fmt.time(r.ts) else Fmt.date(r.ts)}", style = body(13, 400, Satya.Muted), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Stamp(verdictWord(r))
    }
}
