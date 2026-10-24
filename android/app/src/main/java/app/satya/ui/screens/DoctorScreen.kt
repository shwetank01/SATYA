package app.satya.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.satya.AppGraph
import app.satya.BuildConfig
import app.satya.config.Config
import app.satya.doctor.Doctor
import app.satya.doctor.DoctorResult
import app.satya.doctor.Reliability
import app.satya.drishti.CallPipeline
import app.satya.drishti.SatyaA11yService
import app.satya.drishti.SmsPipeline
import app.satya.ui.BackRow
import app.satya.ui.Nav
import app.satya.ui.Page
import app.satya.ui.Toaster
import app.satya.ui.components.InkButton
import app.satya.ui.components.SectionLabel
import app.satya.ui.components.Stamp
import app.satya.ui.components.card
import app.satya.ui.components.press
import app.satya.ui.theme.Satya
import app.satya.ui.theme.body
import app.satya.ui.theme.display
import app.satya.ui.theme.micro
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun DoctorScreen(nav: Nav) {
    val ctx = LocalContext.current
    val doctor = remember { Doctor(ctx) }
    val g = remember { AppGraph.get(ctx) }
    val scope = rememberCoroutineScope()
    val results = remember { mutableStateMapOf<String, DoctorResult>() }
    var running by remember { mutableStateOf<String?>(null) }
    var reliability by remember { mutableStateOf<List<Reliability>>(emptyList()) }
    var callNo by remember { mutableStateOf("18001800") }
    var smsFrom by remember { mutableStateOf("+91 98765 00021") }
    var smsText by remember { mutableStateOf("Dear SBI customer your YONO will be blocked today. Update PAN KYC: sbi-kyc-update.in/verify") }
    var gw by remember { mutableStateOf(Config.now.gatewayUrl) }
    var vv by remember { mutableStateOf(Config.now.vivekUrl) }
    var toolOut by remember { mutableStateOf("") }

    fun runAll() = scope.launch {
        for (c in doctor.checks) { running = c.id; results[c.id] = withContext(Dispatchers.Default) { doctor.run(c) } }
        running = null
    }

    Page(gap = 14.dp) {
        BackRow({ nav.back() }, title = "Doctor")
        Text("Protocol health", style = display(32, 700, Satya.Blue))
        Text("Build ${BuildConfig.VERSION_NAME} · ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL} · Android ${android.os.Build.VERSION.RELEASE}", style = body(13, 600, Satya.Muted))
        val passed = results.values.count { it.ok }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            InkButton(if (running != null) "Running ${running}…" else "Run all (D1–D19)", { if (running == null) runAll() }, Modifier.weight(1f), height = 52.dp, radius = 26.dp)
            InkButton("Reliability ×10", {
                if (running != null) return@InkButton
                scope.launch {
                    reliability = withContext(Dispatchers.Default) { doctor.reliability(10) { id, i -> scope.launch { running = "$id $i/10" } } }
                    running = null
                }
            }, Modifier.weight(1f), height = 52.dp, radius = 26.dp)
        }
        if (results.isNotEmpty()) Text("$passed of ${doctor.checks.size} PASS", style = display(20, 600, Satya.Ink, 1.2f, 0f))
        Column(Modifier.fillMaxWidth().card(shadow = false)) {
            doctor.checks.forEachIndexed { i, c ->
                val r = results[c.id]
                Column(
                    Modifier.fillMaxWidth().press(.99f) { scope.launch { running = c.id; results[c.id] = withContext(Dispatchers.Default) { doctor.run(c) }; running = null } }
                        .then(if (i > 0) Modifier.drawBehind { drawLine(Satya.Line, Offset.Zero, Offset(size.width, 0f), 1.dp.toPx()) } else Modifier)
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(c.id, style = display(13, 600, Satya.Blue, 1f, .08f), modifier = Modifier.width(34.dp))
                        Text(c.name, style = body(14, 600), modifier = Modifier.weight(1f))
                        when {
                            running == c.id -> Text("…", style = body(14, 700, Satya.Muted))
                            r != null -> Stamp(if (r.ok) "Pass" else "Fail")
                            else -> Text("—", style = body(14, 600, Satya.Muted))
                        }
                    }
                    r?.let { Text("${it.detail} · ${it.ms} ms", style = body(12, 500, Satya.Muted, 1.4f), modifier = Modifier.padding(start = 44.dp)) }
                    r?.thumb?.let { Image(it.asImageBitmap(), null, Modifier.padding(start = 44.dp).height(120.dp).clip(RoundedCornerShape(8.dp))) }
                }
            }
        }
        if (reliability.isNotEmpty()) {
            SectionLabel("Reliability on this phone (10 runs each)")
            val total = reliability.sumOf { it.runs }; val pass = reliability.sumOf { it.passes }
            Text("Overall ${pass * 100 / total.coerceAtLeast(1)}% ($pass/$total)", style = display(22, 600, Satya.Ink, 1.2f, 0f))
            Column(Modifier.fillMaxWidth().card(shadow = false)) {
                reliability.forEachIndexed { i, r ->
                    Row(Modifier.fillMaxWidth().then(if (i > 0) Modifier.drawBehind { drawLine(Satya.Line, Offset.Zero, Offset(size.width, 0f), 1.dp.toPx()) } else Modifier).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(r.id, style = display(13, 600, Satya.Blue, 1f, .08f), modifier = Modifier.width(40.dp))
                        Text(r.name, style = body(13, 600), modifier = Modifier.weight(1f))
                        Text("${r.passes}/${r.runs} · ${r.rate}% · ${r.medianMs} ms", style = body(13, 700, if (r.rate == 100) Satya.Ink else Satya.Blue))
                    }
                }
            }
            InkButton("Copy reliability report", {
                val report = buildString {
                    appendLine("SATYA reliability · ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL} · Android ${android.os.Build.VERSION.RELEASE} · build ${BuildConfig.VERSION_NAME}")
                    reliability.forEach { appendLine("${it.id}\t${it.name}\t${it.passes}/${it.runs}\t${it.rate}%\tmedian ${it.medianMs} ms\t${it.lastDetail}") }
                }
                copy(ctx, report); Toaster.show("Reliability report copied.")
            }, Modifier.fillMaxWidth(), height = 52.dp, radius = 26.dp)
        }

        SectionLabel("Tools")
        Tool("Simulate call", "Caller ID can’t be spoofed on stage, so this runs the same check as a real ring.") {
            Field(callNo) { callNo = it }
            InkButton("Ring", { CallPipeline.onRing(ctx, callNo, simulated = true) { v -> toolOut = "${v.kind.uppercase()}: ${v.title}\n${v.body}" } }, Modifier.fillMaxWidth(), height = 48.dp, radius = 24.dp)
        }
        Tool("Inject SMS", "Sends text into the live SMS pipeline (U2), as if it had just arrived.") {
            Field(smsFrom) { smsFrom = it }; Field(smsText, single = false) { smsText = it }
            InkButton("Inject", {
                scope.launch { val r = SmsPipeline.handle(ctx, smsFrom, smsText, simulated = true); toolOut = r?.let { "ALERT: ${it.hits.joinToString { h -> "${h.id} ${h.severity}" }}" } ?: "No broken promise: no alert (as designed)." }
            }, Modifier.fillMaxWidth(), height = 48.dp, radius = 24.dp)
        }
        Tool("Override URLs", "Point at a backup gateway or VIVEK without a rebuild.") {
            Field(gw) { gw = it }; Field(vv) { vv = it }
            InkButton("Save URLs", { scope.launch { Config.update { it.gateway(gw); it.vivek(vv) }; Toaster.show("URLs saved.") } }, Modifier.fillMaxWidth(), height = 48.dp, radius = 24.dp)
        }
        Tool("Finance app fingerprints", "Package + signing-certificate SHA-256 of every finance app, to fill official_apps in the registry.") {
            InkButton("Copy fingerprints", { scope.launch { val t = withContext(Dispatchers.Default) { g.knowYourApp.exportFingerprints() }; copy(ctx, t); toolOut = t.take(600) } }, Modifier.fillMaxWidth(), height = 48.dp, radius = 24.dp)
        }
        Tool("Suspect Watch demo", "Shows the block screen for the fake KYC demo app (com.demo.fakekyc).") {
            InkButton("Show block screen", { SatyaA11yService.instance?.demoBlock("com.demo.fakekyc") ?: Toaster.show("Turn on Screen check first.") }, Modifier.fillMaxWidth(), height = 48.dp, radius = 24.dp)
        }
        if (toolOut.isNotBlank()) Text(toolOut, style = body(13, 600, Satya.Ink, 1.45f), modifier = Modifier.fillMaxWidth().card(shadow = false).padding(14.dp))
    }
}

private fun copy(ctx: Context, s: String) {
    ctx.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("SATYA", s))
}

@Composable
private fun Tool(title: String, sub: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().card(shadow = false).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(title, style = body(16, 700)); Text(sub, style = body(13, 400, Satya.Muted, 1.4f)); content()
    }
}

@Composable
private fun Field(v: String, single: Boolean = true, onChange: (String) -> Unit) {
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Satya.Paper).border(1.dp, Satya.CardBorder, RoundedCornerShape(12.dp)).padding(12.dp)) {
        BasicTextField(v, onChange, singleLine = single, textStyle = body(14, 500), cursorBrush = SolidColor(Satya.Blue), modifier = Modifier.fillMaxWidth())
    }
}
