package app.satya.ui.screens

import android.Manifest
import android.app.StatusBarManager
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.view.HapticFeedbackConstants
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import app.satya.R
import app.satya.config.Config
import app.satya.drishti.CheckTileService
import app.satya.drishti.PhoneStateReceiver
import app.satya.drishti.SatyaA11yService
import app.satya.ui.Nav
import app.satya.ui.Route
import app.satya.ui.Toaster
import app.satya.ui.components.BlueSurface
import app.satya.ui.components.Dots
import app.satya.ui.components.Ic
import app.satya.ui.components.SealAnimated
import app.satya.ui.components.SealSolid
import app.satya.ui.components.SealState
import app.satya.ui.components.Toggle
import app.satya.ui.components.YellowButton
import app.satya.ui.components.drawSeal
import app.satya.ui.components.glass
import app.satya.ui.components.Lattice
import app.satya.ui.components.press
import app.satya.ui.theme.Motion
import app.satya.ui.theme.Satya
import app.satya.ui.theme.body
import app.satya.ui.theme.display
import app.satya.ui.theme.micro
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ---------------------------------------------------------------- shield health

data class ShieldHealth(val a11y: Boolean, val sms: Boolean, val calls: Boolean, val notif: Boolean, val battery: Boolean) {
    val allOn: Boolean get() = a11y && sms && calls && notif
    val missing: List<String> get() = buildList {
        if (!a11y) add("screen check"); if (!sms) add("SMS"); if (!calls) add("calls"); if (!notif) add("notifications")
    }
}

fun shieldHealth(ctx: Context): ShieldHealth {
    val enabled = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty()
    val a11y = SatyaA11yService.instance != null || enabled.contains("${ctx.packageName}/")
    fun has(p: String) = ctx.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED
    val rm = ctx.getSystemService(RoleManager::class.java)
    val role = runCatching { rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING) && rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING) }.getOrDefault(false)
    val fallback = PhoneStateReceiver.isEnabled(ctx) && has(Manifest.permission.READ_PHONE_STATE) && has(Manifest.permission.READ_CALL_LOG)
    val battery = ctx.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(ctx.packageName)
    return ShieldHealth(a11y, has(Manifest.permission.RECEIVE_SMS), role || fallback, has(Manifest.permission.POST_NOTIFICATIONS), battery)
}

/** Recomputed every time the screen resumes (the user comes back from Settings). */
@Composable
fun rememberShieldHealth(): ShieldHealth {
    val ctx = LocalContext.current
    var h by remember { mutableStateOf(shieldHealth(ctx)) }
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) h = shieldHealth(ctx) }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    return h
}

// ---------------------------------------------------------------- 00 Onboarding

@Composable
fun OnboardingScreen(nav: Nav) {
    var page by remember { mutableIntStateOf(0) }
    val ctx = LocalContext.current
    var notifOn by remember { mutableStateOf(ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) }
    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { notifOn = it }
    BlueSurface(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(start = 24.dp, end = 24.dp, top = 12.dp, bottom = 28.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SealSolid(Modifier.size(30.dp))
                Text("SATYA", style = display(16, 600, Satya.Yellow, 1f, .1f), modifier = Modifier.padding(start = 10.dp).weight(1f))
                Text("Skip", style = body(15, 600, Satya.Paper), modifier = Modifier.press { nav.reset(Route.Setup) }.padding(8.dp))
            }
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
                AnimatedContent(page, transitionSpec = { (slideInVertically(tween(400, easing = Motion.Ease)) { 30 } + fadeIn(tween(400))) togetherWith fadeOut(tween(150)) }, label = "onb") { p ->
                    when (p) {
                        0 -> Column(verticalArrangement = Arrangement.spacedBy(26.dp)) {
                            SealAnimated(Modifier.size(164.dp))
                            Text("Check before\nyou pay.", style = display(44, 700, Satya.Yellow, 1f, -.03f))
                            Text("SATYA checks a payment request on your screen against your bank’s own promises.", style = body(19, 400, Satya.Paper, 1.5f))
                        }
                        1 -> Column(verticalArrangement = Arrangement.spacedBy(22.dp)) {
                            Text("Two ways to check any screen", style = display(34, 700, Satya.Yellow, 1.05f))
                            Box(Modifier.align(Alignment.CenterHorizontally)) { QsGif() }
                            listOf("Triple-tap the thin yellow strip on the ${if (Config.isSamsung) "left" else "right"} edge", "Or pull down twice and tap the Check screen tile", "Circle the message. SATYA does the rest").forEachIndexed { i, s ->
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Box(Modifier.size(26.dp).clip(CircleShape).background(Satya.Yellow), contentAlignment = Alignment.Center) { Text("${i + 1}", style = display(13, 600, Satya.Ink, 1f, 0f)) }
                                    Text(s, style = body(15, 600, Satya.Paper, 1.35f))
                                }
                            }
                        }
                        else -> Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
                            Text("Why SATYA asks for permissions", style = display(34, 700, Satya.Yellow, 1.05f))
                            PermRow("bell", "Notifications", if (notifOn) "Allowed" else "Not yet", "So SATYA can tell you when a bank confirms a fake or a UPI ID gets blocked.", notifOn) {
                                if (!notifOn) notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                            }
                            PermRow("app", "App list", "Allowed at install", "So the Apps page can check which finance apps are real. The list stays on this phone.", true) {}
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(horizontal = 4.dp)) {
                                Text("No signup. No login. No account.", style = display(18, 600, Satya.Yellow, 1.2f, 0f))
                                Text("SATYA reads a screen only when you triple-tap the strip or tap the tile. In the background it checks only new SMS and WhatsApp messages, on this phone.", style = body(14, 400, Satya.Paper, 1.45f))
                            }
                        }
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Dots(3, page)
                Box(Modifier.weight(1f))
                if (page < 2) {
                    Box(
                        Modifier.size(68.dp).press(.92f) { page++ }.shadow(12.dp, CircleShape).clip(CircleShape).background(Satya.Yellow),
                        contentAlignment = Alignment.Center,
                    ) { Ic("arrow", Satya.Ink, 22.dp, 2.4f) }
                } else YellowButton("Set up SATYA", { nav.reset(Route.Setup) })
            }
        }
    }
}

@Composable
private fun PermRow(icon: String, title: String, state: String, bodyText: String, on: Boolean, onToggle: () -> Unit) {
    Column(Modifier.fillMaxWidth().glass(RoundedCornerShape(24.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(42.dp).clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = .16f)), contentAlignment = Alignment.Center) { Ic(icon, Satya.Paper, 22.dp) }
            Column(Modifier.weight(1f)) {
                Text(title, style = body(17, 700, Satya.Paper))
                Text(state, style = body(13, 600, Satya.Paper))
            }
            Toggle(on, onToggle, onBlue = true)
        }
        Text(bodyText, style = body(15, 400, Satya.Paper, 1.45f))
    }
}

/** Onboarding "add the tile" loop (design qsGif): the yellow tile is dragged into the grid. */
@Composable
fun QsGif() {
    val t = rememberInfiniteTransition(label = "qs")
    val p by t.animateFloat(0f, 1f, infiniteRepeatable(tween(3600, easing = LinearEasing), RepeatMode.Restart), label = "p")
    fun seg(a: Float, b: Float) = ((p - a) / (b - a)).coerceIn(0f, 1f)
    val move = Motion.Scan.transform(seg(.24f, .54f))
    val alpha = when { p < .08f -> p / .08f; p > .96f -> 0f; p > .88f -> 1f - (p - .88f) / .08f; else -> 1f }
    Box(Modifier.size(256.dp, 246.dp).shadow(20.dp, RoundedCornerShape(26.dp)).clip(RoundedCornerShape(26.dp)).background(Color(0xFF141922))) {
        Text("EDIT TILES", style = micro(Color(0xFFAEB6C6)), modifier = Modifier.offset(14.dp, 12.dp))
        QsTile(12, 34, "Internet", true); QsTile(132, 34, "Bluetooth", false); QsTile(12, 86, "Torch", false)
        Box(Modifier.offset(132.dp, 86.dp).size(112.dp, 44.dp).border(1.5.dp, Color(0xFF59627A), RoundedCornerShape(16.dp)))
        Box(Modifier.offset(12.dp, 148.dp).size(232.dp, 1.dp).background(Color(0xFF2A303C)))
        Text("Hold and drag to add tiles", style = body(11, 600, Color(0xFFAEB6C6)), modifier = Modifier.offset(14.dp, 158.dp))
        Row(
            Modifier.offset((12 + 120 * move).dp, (186 - 100 * move).dp).alpha(alpha).scale(if (p in .16f..(.54f)) 1.06f else 1f)
                .size(112.dp, 44.dp).shadow(8.dp, RoundedCornerShape(16.dp)).clip(RoundedCornerShape(16.dp)).background(Satya.Yellow).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            SealSolid(Modifier.size(26.dp))
            Text("Check screen", style = body(12, 700, Satya.Ink))
        }
        val fAlpha = when { p < .1f -> p / .1f; p < .62f -> 1f; p < .7f -> 1f - (p - .62f) / .08f; else -> 0f }
        Box(
            Modifier.offset((54 + 120 * move).dp, (194 - 100 * move).dp).alpha(fAlpha).scale(if (p in .16f..(.54f)) .85f else 1f)
                .size(28.dp).clip(CircleShape).background(Color.White.copy(alpha = .85f)),
        )
    }
}

@Composable
private fun QsTile(x: Int, y: Int, label: String, on: Boolean) {
    Row(
        Modifier.offset(x.dp, y.dp).size(112.dp, 44.dp).clip(RoundedCornerShape(16.dp)).background(if (on) Color(0xFFD6E2FF) else Color(0xFF262C38)).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(14.dp).clip(CircleShape).background(if (on) Satya.Blue else Color(0xFF4A5263)))
        Text(label, style = body(12, 600, if (on) Satya.Ink else Color(0xFFE9ECF2)))
    }
}

// ---------------------------------------------------------------- Setup (Section 13.6)

@Composable
fun SetupScreen(nav: Nav) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val h = rememberShieldHealth()
    var name by remember { mutableStateOf(Config.now.myNames.joinToString(", ")) }
    var phone by remember { mutableStateOf(Config.now.myPhones.joinToString(", ")) }
    var tick by remember { mutableIntStateOf(0) }
    val sms = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { tick++ }
    val notif = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { tick++ }
    val role = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { tick++ }
    val phonePerms = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { res ->
        if (res.values.all { it }) PhoneStateReceiver.setEnabled(ctx, true)
        tick++
    }
    val rm = remember { ctx.getSystemService(RoleManager::class.java) }
    val roleAvailable = remember { runCatching { rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING) }.getOrDefault(false) }
    val health = remember(tick, h) { shieldHealth(ctx) }

    BlueSurface(Modifier.fillMaxSize(), latticeAlpha = .1f) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().padding(horizontal = 18.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SealSolid(Modifier.size(30.dp))
                Text("SATYA", style = display(16, 600, Satya.Yellow, 1f, .1f), modifier = Modifier.padding(start = 10.dp))
            }
            Text("Set up your shield", style = display(34, 700, Satya.Yellow, 1.05f))
            Text("Each step is one switch in Android. SATYA explains why before it asks.", style = body(15, 400, Satya.Paper, 1.5f))

            SetupCard("1", "Your name and number", "Masked on this phone before anything leaves it. Never sent.", name.isNotBlank() && phone.isNotBlank()) {
                SetupField(name, "Your name (e.g. Ramesh Kumar)") { name = it }
                SetupField(phone, "Your mobile number", KeyboardType.Phone) { phone = it }
                SetupAction("Save") {
                    scope.launch {
                        Config.update { p -> p.names(name.split(',', ' ').map { it.trim() }.toSet() + name.trim()); p.phones(phone.split(',').toSet()) }
                        Toaster.show("Saved on this phone only.")
                    }
                }
            }
            SetupCard("2", "Screen check (Accessibility)", "Lets the edge strip and the tile read the screen when you ask, and watch WhatsApp for broken promises.", health.a11y) {
                SetupAction("Open Accessibility settings") { ctx.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                Text(
                    "Find SATYA under Installed apps${if (Config.isSamsung) " (Samsung: Settings → Accessibility → Installed apps)" else ""}. If Android says the setting is restricted, open App info → ⋮ → Allow restricted settings, then try again.",
                    style = body(13, 400, Satya.Paper, 1.45f),
                )
                SetupAction("Open App info", secondary = true) {
                    ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            }
            SetupCard("3", "SMS check", "New SMS are checked on this phone the moment they arrive. Reality Check reads your bank’s debit SMS. Nothing is uploaded.", health.sms) {
                SetupAction("Allow SMS") { sms.launch(arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS)) }
            }
            SetupCard("4", "Call check", "SATYA sees the number as the phone rings and never blocks or delays a call.", health.calls) {
                if (roleAvailable) SetupAction("Set SATYA as call screening app") { role.launch(rm.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)) }
                if (!roleAvailable || Config.isSamsung) {
                    Text(if (roleAvailable) "If your dialer won’t hand over call screening, use the backup instead:" else "This phone has no call screening role. Use the backup:", style = body(13, 400, Satya.Paper, 1.45f))
                    SetupAction("Use phone-state backup", secondary = true) { phonePerms.launch(arrayOf(Manifest.permission.READ_PHONE_STATE, Manifest.permission.READ_CALL_LOG)) }
                }
            }
            SetupCard("5", "Notifications", "So SATYA can warn you while you are in another app.", health.notif) {
                SetupAction("Allow notifications") { notif.launch(Manifest.permission.POST_NOTIFICATIONS) }
            }
            SetupCard("6", if (Config.isSamsung) "Keep SATYA awake (One UI)" else "Keep SATYA awake", "Android puts quiet apps to sleep, which stops background checks. Let SATYA run.", health.battery) {
                SetupAction("Allow background running") {
                    runCatching {
                        ctx.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                }
                if (Config.isSamsung) Text("Also check Settings → Battery → Background usage limits: SATYA must not be in Sleeping or Deep sleeping apps.", style = body(13, 400, Satya.Paper, 1.45f))
            }
            SetupCard("7", "Check screen tile", "One tap from the Quick Settings, on any app.", null) {
                SetupAction("Add the tile") {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        ctx.getSystemService(StatusBarManager::class.java).requestAddTileService(
                            ComponentName(ctx, CheckTileService::class.java), "Check screen", Icon.createWithResource(ctx, R.drawable.ic_tile), ctx.mainExecutor,
                        ) { tick++ }
                    } else Toaster.show("Pull down twice, tap the pencil, drag Check screen into your tiles.")
                }
            }
            Spacer(Modifier.height(4.dp))
            YellowButton(if (health.allOn) "Turn on the shield" else "Turn on the shield anyway", {
                scope.launch {
                    Config.update { it.onboarded = true }
                    nav.reset(Route.Activation)
                }
            }, Modifier.fillMaxWidth())
            Text("You can finish any step later from Settings.", style = body(13, 400, Satya.Sub), modifier = Modifier.align(Alignment.CenterHorizontally))
        }
    }
}

@Composable
private fun SetupCard(n: String, title: String, why: String, done: Boolean?, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().glass(RoundedCornerShape(24.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(28.dp).clip(CircleShape).background(if (done == true) Satya.Yellow else Color.White.copy(alpha = .18f)), contentAlignment = Alignment.Center) {
                if (done == true) Ic("check", Satya.Ink, 15.dp, 2.8f) else Text(n, style = display(13, 600, Satya.Paper, 1f, 0f))
            }
            Text(title, style = body(17, 700, Satya.Paper), modifier = Modifier.weight(1f))
            if (done != null) Text(if (done) "On" else "Off", style = micro(if (done) Satya.Yellow else Satya.Sub))
        }
        Text(why, style = body(14, 400, Satya.Paper, 1.45f))
        if (done != true) content()
    }
}

@Composable
private fun SetupAction(text: String, secondary: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier.fillMaxWidth().height(48.dp).press(.97f, onClick = onClick).clip(RoundedCornerShape(24.dp))
            .background(if (secondary) Color.Transparent else Satya.Yellow)
            .border(1.dp, if (secondary) Color.White.copy(alpha = .5f) else Satya.Yellow, RoundedCornerShape(24.dp)),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = body(15, 700, if (secondary) Satya.Paper else Satya.Ink)) }
}

@Composable
private fun SetupField(value: String, hint: String, type: KeyboardType = KeyboardType.Text, onChange: (String) -> Unit) {
    Box(Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = .14f)).border(1.dp, Color.White.copy(alpha = .3f), RoundedCornerShape(16.dp)).padding(horizontal = 14.dp), contentAlignment = Alignment.CenterStart) {
        if (value.isEmpty()) Text(hint, style = body(15, 400, Satya.Sub))
        BasicTextField(value, onChange, singleLine = true, textStyle = body(15, 600, Satya.Paper), cursorBrush = SolidColor(Satya.Yellow),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = type), modifier = Modifier.fillMaxWidth())
    }
}

// ---------------------------------------------------------------- Activation

/**
 * The activation sequence, built from the seal: it drops in, the 24 ticks draw clockwise, the ring
 * closes, the eye opens, the iris scans once, the lattice ripples outward from the seal, two yellow
 * pulses leave it, and "Shield on." resolves with what is protected. ~2.6 s, then Home.
 */
@Composable
fun ActivationScreen(nav: Nav) {
    val ctx = LocalContext.current
    val view = LocalView.current
    val health = remember { shieldHealth(ctx) }
    val drop = remember { Animatable(0f) }
    val ticks = remember { Animatable(0f) }
    val ring = remember { Animatable(0f) }
    val eye = remember { Animatable(0f) }
    val pupil = remember { Animatable(0f) }
    val ripple = remember { Animatable(0f) }
    val pulse = remember { Animatable(0f) }
    val words = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        launch { drop.animateTo(1f, tween(700, easing = Motion.Pop)); view.performHapticFeedback(HapticFeedbackConstants.CONFIRM) }
        launch { delay(300); ticks.animateTo(1f, tween(800, easing = LinearEasing)) }
        launch { delay(500); ring.animateTo(1f, tween(650, easing = Motion.Ease)) }
        launch { delay(950); eye.animateTo(1f, tween(450, easing = Motion.Pop)) }
        launch {
            delay(1300)
            pupil.animateTo(0f, keyframes { durationMillis = 1000; -18f at 200 using Motion.Scan; 18f at 650 using Motion.Scan; 0f at 1000 })
        }
        launch { delay(1000); ripple.animateTo(1f, tween(1500, easing = Motion.Ease)) }
        launch { delay(1500); pulse.animateTo(1f, tween(1400, easing = LinearEasing)) }
        launch { delay(1800); words.animateTo(1f, tween(500, easing = Motion.Ease)) }
        Config.update { it.activated = true }
    }
    val latticeBrush = remember {
        androidx.compose.ui.graphics.ShaderBrush(
            androidx.compose.ui.graphics.ImageShader(Lattice.bitmap(Satya.Paper, 1100), androidx.compose.ui.graphics.TileMode.Repeated, androidx.compose.ui.graphics.TileMode.Repeated),
        )
    }
    Box(Modifier.fillMaxSize().background(Satya.Blue)) {
        // Lattice revealed through a circle growing from the seal.
        Canvas(Modifier.fillMaxSize()) {
            val c = Offset(size.width / 2, size.height * .36f)
            val r = size.maxDimension * 1.1f * ripple.value
            if (r > 0f) drawCircle(latticeBrush, r, c, alpha = .16f)
            if (ripple.value in .01f..(.99f)) drawCircle(Satya.Paper.copy(alpha = .35f * (1 - ripple.value)), r, c, style = Stroke(2.dp.toPx()))
            for (k in 0..1) {
                val pv = (pulse.value * 1.4f - k * .4f).coerceIn(0f, 1f)
                if (pv > 0f && pv < 1f) drawCircle(Satya.Yellow.copy(alpha = .75f * (1 - pv)), 80.dp.toPx() + 120.dp.toPx() * pv, c, style = Stroke(3.dp.toPx() * (1 - pv) + 1f))
            }
            drawCircle(Brush.radialGradient(listOf(Color(0xFFE2ECFF).copy(alpha = .4f * ripple.value), Color.Transparent), c, 260.dp.toPx()), 260.dp.toPx(), c)
        }
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Spacer(Modifier.weight(.22f))
            Canvas(
                Modifier.size(170.dp).graphicsLayer {
                    val d = drop.value
                    val s = 2.2f - 1.2f * d
                    scaleX = s; scaleY = s; alpha = (d * 1.8f).coerceIn(0f, 1f)
                },
            ) { drawSeal(SealState(pupil = pupil.value, eyeOpen = eye.value, ticks = ticks.value, ring = ring.value)) }
            Spacer(Modifier.height(36.dp))
            Column(Modifier.graphicsLayer { alpha = words.value; translationY = (1 - words.value) * 24.dp.toPx() }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("Shield on.", style = display(48, 700, Satya.Yellow, 1f, -.03f))
                Text("SATYA is watching for broken promises. The app can stay closed.", style = body(17, 400, Satya.Paper, 1.5f).copy(textAlign = androidx.compose.ui.text.style.TextAlign.Center))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                    ActivationRow("Screen check", health.a11y); ActivationRow("SMS", health.sms); ActivationRow("Calls", health.calls); ActivationRow("Alerts", health.notif)
                }
            }
            Spacer(Modifier.weight(.3f))
            Box(Modifier.graphicsLayer { alpha = words.value }) { YellowButton("Go to SATYA", { nav.reset(Route.Home) }) }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun ActivationRow(label: String, on: Boolean) {
    Row(Modifier.width(240.dp).height(40.dp).glass(RoundedCornerShape(20.dp)).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(20.dp).clip(CircleShape).background(if (on) Satya.Yellow else Color.White.copy(alpha = .2f)), contentAlignment = Alignment.Center) {
            if (on) Ic("check", Satya.Ink, 12.dp, 3f) else Ic("close", Satya.Paper, 10.dp, 3f)
        }
        Text(label, style = body(14, 600, Satya.Paper), modifier = Modifier.weight(1f))
        Text(if (on) "On" else "Off", style = micro(if (on) Satya.Yellow else Satya.Sub))
    }
}
