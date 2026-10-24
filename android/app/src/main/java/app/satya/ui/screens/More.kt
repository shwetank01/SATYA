package app.satya.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.satya.AppGraph
import app.satya.BuildConfig
import app.satya.config.Config
import app.satya.core.Normalize
import app.satya.drishti.PhoneStateReceiver
import app.satya.drishti.SatyaA11yService
import app.satya.kavach.Kavach
import app.satya.prahari.FinanceApp
import app.satya.ui.BackRow
import app.satya.ui.Fmt
import app.satya.ui.Nav
import app.satya.ui.Page
import app.satya.ui.PageTitle
import app.satya.ui.Route
import app.satya.ui.Toaster
import app.satya.ui.components.Chip
import app.satya.ui.components.Ic
import app.satya.ui.components.IconTile
import app.satya.ui.components.InkButton
import app.satya.ui.components.KeyValue
import app.satya.ui.components.SectionLabel
import app.satya.ui.components.Stamp
import app.satya.ui.components.Toggle
import app.satya.ui.components.card
import app.satya.ui.components.lattice
import app.satya.ui.components.press
import app.satya.ui.theme.Satya
import app.satya.ui.theme.body
import app.satya.ui.theme.display
import app.satya.ui.theme.micro
import app.satya.vachan.SyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.contentOrNull

// ---------------------------------------------------------------- 07 Apps

@Composable
fun AppsScreen(nav: Nav) {
    val ctx = LocalContext.current
    val g = remember { AppGraph.get(ctx) }
    var apps by remember { mutableStateOf<List<FinanceApp>?>(null) }
    val watch by g.db.watch().all().collectAsState(emptyList())
    LaunchedEffect(Unit) {
        apps = withContext(Dispatchers.Default) { g.knowYourApp.list() }
        if (withContext(Dispatchers.IO) { g.knowYourApp.pruneWatch() } > 0) SatyaA11yService.instance?.refreshSuspects()
    }
    Page {
        BackRow({ nav.back() })
        val list = apps.orEmpty()
        PageTitle("Know your apps", sub = if (apps == null) "Checking the finance apps on this phone…" else "${list.count { it.verified }} verified · ${list.count { it.suspect }} suspect · ${list.count { !it.verified && !it.suspect }} not confirmed. Only apps installed from outside an app store can be suspects. The app list stays on this phone.")
        Column(Modifier.fillMaxWidth().card()) {
            list.forEachIndexed { i, a ->
                Row(
                    Modifier.fillMaxWidth().press(.99f) { nav.go(Route.AppDetail(a.pkg)) }
                        .then(if (i > 0) Modifier.drawBehind { drawLine(Satya.Line, Offset.Zero, Offset(size.width, 0f), 1.dp.toPx()) } else Modifier).padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Monogram(a, 44)
                    Column(Modifier.weight(1f)) {
                        Text(a.label, style = body(15, 600), maxLines = 1)
                        Text(if (a.verified) a.owner else a.source, style = body(13, 400, Satya.Muted), maxLines = 1)
                    }
                    Stamp(if (a.verified) "Verified" else if (a.suspect) "Suspect" else "Not confirmed")
                }
            }
            if (apps != null && list.isEmpty()) Text("No finance apps found.", style = body(15, 400, Satya.Muted), modifier = Modifier.padding(20.dp))
        }
        if (watch.isNotEmpty()) {
            SectionLabel("Watch list")
            Column(Modifier.fillMaxWidth().card()) {
                watch.forEachIndexed { i, w ->
                    Row(Modifier.fillMaxWidth().then(if (i > 0) Modifier.drawBehind { drawLine(Satya.Line, Offset.Zero, Offset(size.width, 0f), 1.dp.toPx()) } else Modifier).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) { Text(w.label, style = body(15, 600)); Text(w.reason, style = body(13, 400, Satya.Muted, 1.4f)) }
                        Text("Remove", style = body(14, 600, Satya.Blue), modifier = Modifier.press {
                            g.scope.launch { g.db.watch().remove(w.pkg); SatyaA11yService.instance?.refreshSuspects() }
                        }.padding(8.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun Monogram(a: FinanceApp, size: Int) {
    val (bg, fg) = when {
        !a.verified -> Color.White to Satya.Ink
        a.bank == "SBI" -> Satya.Blue to Satya.Yellow
        a.bank == "HDFC" -> Satya.Ink to Satya.Paper
        a.bank == "ICICI" -> Color(0xFFDCE7FA) to Satya.Blue
        a.label.startsWith("Phone") -> Satya.Yellow to Satya.Ink
        else -> Color(0xFFE8EDF5) to Satya.Ink
    }
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape((size * .32f).dp)).background(bg)
            .then(if (!a.verified) Modifier.drawBehind {
                drawRoundRect(Satya.Ink.copy(alpha = .45f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(size * .32f * density), style = androidx.compose.ui.graphics.drawscope.Stroke(1.5f * density, pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 6f))))
            } else Modifier),
        contentAlignment = Alignment.Center,
    ) { Text(a.label.take(1).uppercase(), style = display((size * .43f).toInt(), 700, fg, 1f, 0f)) }
}

@Composable
fun AppDetailScreen(nav: Nav, pkg: String) {
    val ctx = LocalContext.current
    val g = remember { AppGraph.get(ctx) }
    val scope = rememberCoroutineScope()
    var app by remember { mutableStateOf<FinanceApp?>(null) }
    var checking by remember { mutableStateOf(false) }
    var checked by remember { mutableStateOf<String?>(null) }
    var asking by remember { mutableStateOf(false) }
    var aiSays by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(pkg) { app = withContext(Dispatchers.Default) { g.knowYourApp.assess(pkg) } }
    val a = app ?: run { Page { BackRow({ nav.back() }); Text("This app is not a finance app, or was uninstalled.", style = body(15, 400, Satya.Muted)) }; return }
    Page {
        BackRow({ nav.back() })
        Column(Modifier.padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Monogram(a, 84)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(a.label, style = display(32, 600, Satya.Blue, 1.05f, -.02f))
                Text(if (a.verified) "Genuine app" else if (a.suspect) "Treat as fake" else "Owner not confirmed", style = body(15, 600, Satya.Body2))
            }
            Stamp(if (a.verified) "Verified" else if (a.suspect) "Suspect" else "Not confirmed", big = true)
            if (a.why.isNotBlank()) Text(a.why, style = body(15, 500, Satya.Ink, 1.5f))
        }
        Column(Modifier.fillMaxWidth().card(shadow = false)) {
            KeyValue("Install source", a.source, false); KeyValue("Owner company", a.owner, true); KeyValue("Is KYC safe here?", a.kycSafe, true); KeyValue("Package", a.pkg, true)
        }
        Column(Modifier.fillMaxWidth().card(shadow = false).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("WHAT A CHECK SENDS", style = micro())
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                (a.fingerprintPrefix ?: "?????").forEach { ch ->
                    Box(Modifier.size(38.dp, 46.dp).clip(RoundedCornerShape(10.dp)).background(Satya.Paper).border(1.dp, Satya.Ink.copy(alpha = .1f), RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
                        Text("$ch", style = display(20, 600, Satya.Blue, 1f, 0f))
                    }
                }
            }
            Text("Only these 5 characters of the app’s fingerprint leave your phone. Never the app list.", style = body(14, 400, Satya.Body2, 1.5f))
            checked?.let { Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { Ic("check", Satya.Blue, 15.dp, 2.8f); Text(it, style = body(14, 600, Satya.Ink, 1.4f)) } }
        }
        InkButton(if (checking) "Checking the official list" else "Check against the official list", {
            if (checking || a.certSha256 == null) return@InkButton
            checking = true
            scope.launch {
                val reg = g.registry.now
                val herd = if (reg != null) g.runner.herdFor(listOf(Normalize.app(a.certSha256)), reg, null, "app") else null
                checking = false
                val listed = if (a.verified) "Still on the official list." else "Still not on any official list."
                val reported = herd?.let { h -> if (h.confirmedBy != null) " Confirmed fake by ${h.confirmedBy}." else if (h.reports > 0) " Reported ${h.reports} times by SATYA users." else "" }.orEmpty()
                checked = "Checked today at ${Fmt.time(System.currentTimeMillis())}. $listed$reported"
                Toaster.show(if (a.verified) "${a.label} is on the official list." else "${a.label} is not on any official list.")
            }
        }, Modifier.fillMaxWidth(), radius = 30.dp)
        if (!a.verified) {
            Column(Modifier.fillMaxWidth().card(shadow = false).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("SECOND OPINION", style = micro())
                Text(aiSays ?: "SATYA AI (Sarvam) can judge whether this app pretends to be a bank. Only its name, package id and install source are sent.", style = body(14, if (aiSays != null) 600 else 400, Satya.Body2, 1.5f))
                if (aiSays == null) InkButton(if (asking) "Asking SATYA AI…" else "Ask SATYA AI", {
                    if (asking) return@InkButton
                    asking = true
                    scope.launch {
                        val r = g.client.send(Kavach.appOpinion(a.label, a.pkg, a.installer, a.source))
                        val o = g.client.json(r.body) as? kotlinx.serialization.json.JsonObject
                        fun s(k: String) = o?.get(k)?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.contentOrNull }
                        asking = false
                        aiSays = if (!r.ok || o == null || s("source") != "ai") "SATYA AI is unavailable right now. Go by the install source above."
                        else "Risk ${s("risk")}" + (s("impersonates")?.let { " · pretends to be $it" } ?: "") + ". " + s("reason").orEmpty()
                    }
                }, Modifier.fillMaxWidth(), height = 50.dp, radius = 25.dp)
            }
            InkButton("Uninstall ${a.label}", { ctx.startActivity(Intent(Intent.ACTION_DELETE, Uri.parse("package:${a.pkg}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }, Modifier.fillMaxWidth(), radius = 30.dp)
        }
    }
}

// ---------------------------------------------------------------- 08 Privacy Log

@Composable
fun PrivacyScreen(nav: Nav) {
    val ctx = LocalContext.current
    val g = remember { AppGraph.get(ctx) }
    val logs by g.db.egress().all().collectAsState(emptyList())
    var filter by remember { mutableStateOf("all") }
    val shown = logs.filter { filter == "all" || it.category == filter }
    Page {
        BackRow({ nav.back() })
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(26.dp)).background(Satya.Yellow).lattice(Satya.Ink, .08f, 440.dp, Offset.Zero).padding(start = 22.dp, end = 20.dp, top = 20.dp, bottom = 20.dp),
            verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("${logs.size}", style = display(76, 300, Satya.Ink, .85f, -.05f))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Privacy Log", style = display(22, 600, Satya.Ink, 1.1f, 0f))
                Text("Everything that left this phone, word for word.", style = body(14, 600, Satya.Ink, 1.4f))
            }
        }
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("all" to "All", "check" to "Checks", "report" to "Reports", "app" to "App checks", "sync" to "Sync", "doctor" to "Doctor").forEach { (id, label) -> Chip(label, filter == id, { filter = id }) }
        }
        if (shown.isEmpty()) Text("Nothing has left this phone.", style = body(15, 400, Satya.Muted), modifier = Modifier.fillMaxWidth().padding(30.dp))
        shown.groupBy { Fmt.dayLabel(it.ts) }.forEach { (day, items) ->
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SectionLabel(day)
                Column(Modifier.fillMaxWidth().card()) {
                    items.forEachIndexed { i, e ->
                        Row(Modifier.fillMaxWidth().then(if (i > 0) Modifier.drawBehind { drawLine(Satya.Line, Offset.Zero, Offset(size.width, 0f), 1.dp.toPx()) } else Modifier).padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            IconTile(when (e.category) { "report" -> "lock"; "app" -> "app"; "sync" -> "download"; "doctor" -> "gear"; else -> "eye" }, Satya.Blue, 34.dp, iconSize = 17.dp)
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row { Text("${e.protocol} · ${e.destination}", style = body(12, 600, Satya.Muted), modifier = Modifier.weight(1f), maxLines = 1); Text(Fmt.time(e.ts), style = body(12, 600, Satya.Muted)) }
                                Text(e.summary + if (!e.ok) " (did not get through)" else "", style = body(15, 600, Satya.Ink, 1.4f))
                                Column(
                                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Satya.Paper).drawBehind {
                                        drawRoundRect(Satya.Ink.copy(alpha = .2f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(12.dp.toPx()), style = androidx.compose.ui.graphics.drawscope.Stroke(1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 6f))))
                                    }.padding(horizontal = 11.dp, vertical = 9.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Text(if (e.category == "report") "SEALED" else "SENT", style = micro(Satya.Blue, 10f))
                                    Text(e.payload.take(600), style = body(13, 400, Satya.Ink, 1.45f))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- 09 Settings

@Composable
fun SettingsScreen(nav: Nav) {
    val ctx = LocalContext.current
    val g = remember { AppGraph.get(ctx) }
    val scope = rememberCoroutineScope()
    val s by Config.state.collectAsState()
    val reg by g.registry.state.collectAsState()
    var syncing by remember { mutableStateOf(false) }
    var confirmClear by remember { mutableStateOf(false) }
    var showAll by remember { mutableStateOf(false) }
    Page {
        BackRow({ nav.back() })
        Text("Settings", style = display(36, 600, Satya.Blue), modifier = Modifier.padding(horizontal = 4.dp))
        Column(Modifier.fillMaxWidth().card(shadow = false)) {
            SettingRow("sync", "Promise Cards and blocklist", "Last sync ${if (s.lastSync > 0) Fmt.ago(s.lastSync) else "never (using the built-in cards)"}") {
                Box(Modifier.height(40.dp).press {
                    if (syncing) return@press
                    syncing = true
                    scope.launch {
                        val r = g.registry.sync()
                        syncing = false
                        Toaster.show(r.fold({ "Promise Cards up to date. ${it.book.banks.size} banks." }, { "Couldn’t sync: ${it.message}. Using the cards on this phone." }))
                    }
                }.clip(RoundedCornerShape(20.dp)).background(Satya.Blue.copy(alpha = .07f)).border(1.dp, Satya.Blue.copy(alpha = .25f), RoundedCornerShape(20.dp)).padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                    Text(if (syncing) "Syncing" else "Sync now", style = body(14, 600, Satya.Blue))
                }
            }
            SettingRow("speaker", "Read receipts aloud in Hindi", "When you switch a receipt to हिंदी", divider = true) {
                Toggle(s.hindiVoice, { scope.launch { Config.update { it.hindiVoice = !s.hindiVoice } } })
            }
            SettingRow("screen", "Edge strip", "Triple-tap to check. Long-press and drag to move it.", divider = true) {
                Toggle(s.edgeEnabled, { scope.launch { Config.update { it.edgeEnabled = !s.edgeEnabled } } })
            }
            Row(Modifier.fillMaxWidth().drawBehind { drawLine(Satya.Line, Offset.Zero, Offset(size.width, 0f), 1.dp.toPx()) }.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Strip side", style = body(15, 600), modifier = Modifier.weight(1f))
                listOf("auto" to (if (Config.isSamsung) "Auto (left)" else "Auto (right)"), "left" to "Left", "right" to "Right").forEach { (id, label) ->
                    Chip(label, s.edgeSide == id, { scope.launch { Config.update { it.edgeSide(id) } } })
                }
            }
        }
        SectionLabel("Promise Cards on this phone")
        Column(Modifier.fillMaxWidth().card(shadow = false)) {
            val banks = reg?.book?.banks.orEmpty()
            val rows = listOf("SATYA Global (RBI, TRAI, NPCI)" to "${reg?.book?.global?.size ?: 0} promises") + banks.map { it.name to "${it.promises.size + (reg?.book?.global?.size ?: 0)} promises · v2026.10" + if (it.hasBoxKey) " · reports on" else "" }
            (if (showAll) rows else rows.take(5)).forEachIndexed { i, (n, sub) ->
                Row(Modifier.fillMaxWidth().then(if (i > 0) Modifier.drawBehind { drawLine(Satya.Line, Offset.Zero, Offset(size.width, 0f), 1.dp.toPx()) } else Modifier).padding(horizontal = 16.dp, vertical = 13.dp)) {
                    Text(n, style = body(15, 600), modifier = Modifier.weight(1f)); Text(sub, style = body(13, 400, Satya.Muted))
                }
            }
            if (rows.size > 5) Box(Modifier.fillMaxWidth().height(48.dp).press { showAll = !showAll }.drawBehind { drawLine(Satya.Line, Offset.Zero, Offset(size.width, 0f), 1.dp.toPx()) }, contentAlignment = Alignment.Center) {
                Text(if (showAll) "Show fewer" else "Show all ${rows.size}", style = body(14, 600, Satya.Blue))
            }
            reg?.rejected?.takeIf { it.isNotEmpty() }?.let { Text("Rejected (signature check failed): ${it.joinToString()}", style = body(13, 600, Satya.Ink), modifier = Modifier.padding(16.dp)) }
        }
        SectionLabel("How SATYA works")
        Column(Modifier.fillMaxWidth().card(shadow = false)) {
            listOf(
                Triple("DRISHTI", "Sees", "Reads the screen only when you triple-tap or tap the tile, one frame, then stops. Also reads what you share."),
                Triple("PRAHARI", "Guards", "Judges on this phone: compares the request with the bank’s promises. Works offline."),
                Triple("KAVACH", "Shields", "Masks your name and number, and is the only door out of the phone. Every byte is in the Privacy Log."),
                Triple("VACHAN", "Promises", "Each bank’s signed list of things it will never ask you to do, checked against SATYA’s pinned key."),
                Triple("SANGH", "Counts", "How many SATYA phones saw the same UPI ID, number or site, using 5 characters of a fingerprint."),
                Triple("DOOT", "Delivers", "Seals your report so only the bank can open it, then tracks what the bank does."),
                Triple("VIVEK", "Labels", "Optional cloud help: an AI label for unclear messages and a deepfake score. Signal, never the verdict."),
            ).forEachIndexed { i, (n, role, line) ->
                Column(Modifier.fillMaxWidth().then(if (i > 0) Modifier.drawBehind { drawLine(Satya.Line, Offset.Zero, Offset(size.width, 0f), 1.dp.toPx()) } else Modifier).padding(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) { Text(n, style = display(14, 600, Satya.Blue, 1f, .12f)); Text(role, style = body(13, 600, Satya.Muted)) }
                    Text(line, style = body(14, 400, Satya.Ink, 1.5f))
                }
            }
        }
        Row(Modifier.fillMaxWidth().press(.99f) { nav.reset(Route.Setup) }.card(shadow = false).padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            IconTile("shield", Satya.Blue); Column(Modifier.weight(1f)) { Text("Shield setup", style = body(15, 600)); Text("Screen check, SMS, calls, notifications, tile", style = body(13, 400, Satya.Muted)) }; Ic("chev", Satya.Ink.copy(alpha = .4f), 18.dp, 2.2f)
        }
        Column(Modifier.fillMaxWidth().card(shadow = false)) {
            Row(Modifier.fillMaxWidth().press(.99f) { confirmClear = true }.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                IconTile("trash", Satya.Blue)
                Column { Text("Clear everything on this phone", style = body(15, 600)); Text("Checks, reports and the Privacy Log", style = body(13, 400, Satya.Muted)) }
            }
            if (confirmClear) Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("This can’t be undone. Reports already sealed still reach the bank.", style = body(14, 400, Satya.Body2, 1.5f))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.weight(1f).height(48.dp).press { confirmClear = false }.clip(RoundedCornerShape(24.dp)).border(1.dp, Satya.Ink.copy(alpha = .14f), RoundedCornerShape(24.dp)), contentAlignment = Alignment.Center) { Text("Cancel", style = body(15, 600)) }
                    Box(Modifier.weight(1f).height(48.dp).press {
                        scope.launch { g.db.checks().clear(); g.db.reports().clear(); g.db.egress().clear(); confirmClear = false; Toaster.show("Everything on this phone is cleared.") }
                    }.clip(RoundedCornerShape(24.dp)).background(Satya.Ink), contentAlignment = Alignment.Center) { Text("Clear all", style = body(15, 600, Satya.Paper)) }
                }
            }
        }
        Row(
            Modifier.padding(horizontal = 6.dp, vertical = 4.dp).combinedClickable(onClick = {}, onLongClick = { nav.go(Route.Doctor) }),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Ic("cloud", Satya.Blue, 20.dp)
            Text("No account, nothing to log in to. SATYA v${BuildConfig.VERSION_NAME} · Promise Cards v2026.10 · long-press for Doctor", style = body(13, 400, Satya.Muted, 1.45f))
        }
    }
}

@Composable
private fun SettingRow(icon: String, title: String, sub: String, divider: Boolean = false, trailing: @Composable () -> Unit) {
    Row(
        Modifier.fillMaxWidth().then(if (divider) Modifier.drawBehind { drawLine(Satya.Line, Offset.Zero, Offset(size.width, 0f), 1.dp.toPx()) } else Modifier).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        IconTile(icon, Satya.Blue)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) { Text(title, style = body(15, 600)); Text(sub, style = body(13, 400, Satya.Muted, 1.35f)) }
        trailing()
    }
}

// ---------------------------------------------------------------- Check now (in-app)

const val SAMPLE_SCAM = "Dear Ramesh, your YONO account will be blocked today because your KYC is pending. Pay ₹10 KYC fee to sbi.kyc@ybl to keep your account active. — SBI KYC Team"

@Composable
fun CheckNowScreen(nav: Nav) {
    val ctx = LocalContext.current
    var text by remember { mutableStateOf("") }
    var sender by remember { mutableStateOf("") }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) ctx.startActivity(Intent(ctx, app.satya.drishti.ShareActivity::class.java).setAction(Intent.ACTION_SEND).setType("image/*").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
    }
    fun run(t: String, from: String) {
        if (t.isBlank()) return
        ctx.startActivity(Intent(ctx, app.satya.drishti.ShareActivity::class.java).setAction(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, t).putExtra("satya.sender", from))
    }
    Page {
        BackRow({ nav.back() }, icon = "close", title = "Check now")
        Text("What do you want to check?", style = display(30, 700, Satya.Blue))
        Text("Anywhere else, triple-tap the yellow strip on the ${Config.now.resolvedEdgeSide} edge, or use the Check screen tile.", style = body(15, 400, Satya.Body2, 1.5f))
        Column(Modifier.fillMaxWidth().card(shadow = false).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("PASTE A MESSAGE", style = micro())
            Box(Modifier.fillMaxWidth().heightIn(min = 120.dp).clip(RoundedCornerShape(14.dp)).background(Satya.Paper).padding(12.dp)) {
                if (text.isEmpty()) Text("Paste the SMS, WhatsApp message or email here", style = body(15, 400, Satya.Muted))
                BasicTextField(text, { text = it }, textStyle = body(15, 500), cursorBrush = SolidColor(Satya.Blue), modifier = Modifier.fillMaxWidth())
            }
            InkButton("Check this message", { run(text, sender) }, Modifier.fillMaxWidth(), height = 54.dp, radius = 27.dp, enabled = text.isNotBlank())
        }
        Row(Modifier.fillMaxWidth().press(.98f) { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }.card(shadow = false).padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            IconTile("image", Satya.Blue); Column(Modifier.weight(1f)) { Text("Pick a screenshot", style = body(15, 600)); Text("Read on this phone with OCR", style = body(13, 400, Satya.Muted)) }; Ic("chev", Satya.Ink.copy(alpha = .4f), 18.dp, 2.2f)
        }
        Row(Modifier.fillMaxWidth().press(.98f) { run(SAMPLE_SCAM, "+91 70448 21319") }.clip(RoundedCornerShape(22.dp)).background(Satya.Yellow).padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            IconTile("sms", Satya.Ink, bg = Color.White.copy(alpha = .6f)); Column(Modifier.weight(1f)) { Text("Try a sample scam", style = body(15, 700)); Text("A fake SBI KYC-fee message", style = body(13, 500, Satya.Ink)) }; Ic("arrow", Satya.Ink, 20.dp, 2.4f)
        }
    }
}
