package app.satya.drishti

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.net.Uri
import android.view.View
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.core.content.ContextCompat
import app.satya.AppGraph
import app.satya.MainActivity
import app.satya.Notifier
import app.satya.config.Config
import app.satya.core.Capture
import app.satya.core.Channel
import app.satya.core.Hash
import app.satya.core.Trigger
import app.satya.ui.overlay.Banner
import app.satya.ui.overlay.CheckFlowState
import app.satya.ui.overlay.CheckFlowUi
import app.satya.ui.overlay.Phase
import app.satya.ui.overlay.SuspectBlock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * DRISHTI's eyes (Section 8.1). Reads the screen only when the user triple-taps the edge strip or
 * taps the tile; in the background it only watches WhatsApp and apps already flagged as suspect.
 */
class SatyaA11yService : AccessibilityService() {
    companion object {
        @Volatile var instance: SatyaA11yService? = null
            private set
        val BASE_WATCH = listOf("com.whatsapp", "com.whatsapp.w4b")
        private val KYC_SCREEN = Regex("(?i)aadhaa?r|\\bpan\\b|upi pin|\\botp\\b|\\bkyc\\b|debit card|\\bcvv\\b|आधार|केवाईसी|पिन")
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var graph: AppGraph
    private lateinit var host: OverlayHost
    lateinit var engine: CaptureEngine
        private set
    private var strip: EdgeStrip? = null
    private var flowView: View? = null
    private var bannerView: View? = null
    private var blockView: View? = null
    private var suspects: Set<String> = emptySet()
    private val seenMessages = object : LinkedHashMap<String, Boolean>(512, .75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Boolean>?) = size > 500
    }
    private var waJob: Job? = null
    private var suspectJob: Job? = null
    private val lastBlockAt = HashMap<String, Long>()
    private var pkgReceiver: BroadcastReceiver? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        graph = AppGraph.get(this)
        host = OverlayHost(this)
        engine = CaptureEngine(this)
        scope.launch {
            suspects = withContext(Dispatchers.IO) { graph.db.watch().list().map { it.pkg }.toSet() }
            updateScope()
        }
        updateScope()
        Config.state.map { Triple(it.edgeEnabled && it.onboarded, it.resolvedEdgeSide, it.edgeY) }.distinctUntilChanged().let { flow ->
            scope.launch { flow.collect { (on, side, y) -> placeStrip(on, side, y) } }
        }
        registerPackageWatcher()
    }

    /** Section 8.1 scoping: events only from WhatsApp and suspects. The strip and screenshots work everywhere. */
    fun updateScope() {
        val info = serviceInfo ?: return
        info.packageNames = (BASE_WATCH + suspects).toTypedArray()
        serviceInfo = info
    }

    private fun placeStrip(on: Boolean, side: String, y: Float) {
        host.remove(strip); strip = null
        if (!on) return
        val s = EdgeStrip(this, onTripleTap = { startCheck(Trigger.TAP) }, onMoved = { f -> scope.launch { Config.update { it.edgeY(f) } } })
        runCatching { host.addRaw(s, s.layoutParams(side, y)) }.onSuccess { strip = s }
    }

    val stripVisible: Boolean get() = strip?.isAttachedToWindow == true

    // ---------------- U1 Circle to Check ----------------

    fun startFromTile() {
        scope.launch {
            performGlobalAction(GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE)
            delay(480)
            startCheck(Trigger.TILE)
        }
    }

    fun startCheck(trigger: Trigger) {
        if (flowView != null) return
        scope.launch {
            val pkg = engine.foregroundPkg()
            // Screenshot FIRST, then the overlay (overlays can appear in screenshots).
            val shot = engine.screenshot()
            val blocks = withContext(Dispatchers.Default) { engine.screenTexts() }
            val state = CheckFlowState(share = false).apply { this.shot = shot }
            val h = resources.displayMetrics.heightPixels
            val session = CheckSession(
                graph, state, scope, trigger, pkg, SenderGuess.from(blocks, h),
                textFor = { r -> engine.textIn(r, blocks, shot) },
                onVideoMode = { videoSnap(state) },
                captured = if (trigger == Trigger.TILE) "Check screen tile · 1 frame, then stopped" else "Triple tap · 1 frame, then stopped",
                finish = { removeFlow() },
                openInApp = { openApp(it) },
            )
            flowView = host.show(host.fullScreenParams()) { CheckFlowUi(state, session) }
            session.startCircle()
        }
    }

    private suspend fun videoSnap(state: CheckFlowState): Pair<List<ByteArray>, Int>? {
        val v = flowView ?: return null
        v.alpha = 0f
        delay(300)
        val frames = ArrayList<Bitmap>()
        repeat(5) { i ->
            engine.screenshot()?.let { frames.add(it) }
            state.phase = Phase.Video(i + 1)
        }
        v.alpha = 1f
        if (frames.isEmpty()) return null
        state.shot = frames.last()
        val crops = withContext(Dispatchers.Default) { FaceCropper.crop(frames) }
        return if (crops.jpegs.isEmpty()) null else crops.jpegs to crops.facesFound
    }

    private fun removeFlow() { host.remove(flowView); flowView = null }

    fun openApp(target: String) {
        graph.navigate.tryEmit(target)
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra(Notifier.EXTRA_OPEN, target))
    }

    // ---------------- Banners (U2, U3) ----------------

    fun showBanner(title: String, body: String, target: String?) {
        scope.launch {
            host.remove(bannerView)
            bannerView = host.show(host.bannerParams()) {
                Banner(title, body, onTap = { dismissBanner(); target?.let { openApp(it) } }, onDismiss = { dismissBanner() })
            }
        }
    }

    private fun dismissBanner() { host.remove(bannerView); bannerView = null }

    // ---------------- Background watching ----------------

    override fun onAccessibilityEvent(e: AccessibilityEvent?) {
        val pkg = e?.packageName?.toString() ?: return
        when {
            pkg in BASE_WATCH -> {
                waJob?.cancel()
                waJob = scope.launch { delay(600); readWhatsApp(pkg) }
            }
            pkg in suspects -> {
                suspectJob?.cancel()
                suspectJob = scope.launch { delay(400); suspectWatch(pkg) }
            }
        }
    }

    /** U2 for WhatsApp: each visible message once (LRU of 500 hashes), rules only, on the phone. */
    private suspend fun readWhatsApp(pkg: String) {
        val root = rootInActiveWindow ?: return
        if (root.packageName?.toString() != pkg) return
        val title = root.findAccessibilityNodeInfosByViewId("$pkg:id/conversation_contact_name").firstOrNull()?.text?.toString().orEmpty()
        val messages = root.findAccessibilityNodeInfosByViewId("$pkg:id/message_text").mapNotNull { it.text?.toString() }.takeLast(6)
        for (text in messages) {
            val key = Hash.sha256Hex("$title|$text")
            if (seenMessages.put(key, true) != null) continue
            val r = withContext(Dispatchers.Default) {
                runCatching { graph.runner.background(Capture(Trigger.BACKGROUND, Channel.WHATSAPP, text, title, pkg), "WhatsApp message, read on screen") }.getOrNull()
            } ?: continue
            graph.notifier.alert(r)
            val top = r.hits.firstOrNull()
            showBanner(
                "${top?.severity?.replaceFirstChar { it.uppercase() } ?: "Warning"}: breaks ${if (r.claimedBank != null) r.bankName + "’s" else "a bank’s"} promise",
                top?.promise ?: r.askedFor, "receipt:${r.checkId}",
            )
        }
    }

    /** Suspect Watch: a flagged app shows a KYC / PIN / OTP screen -> full-screen block. */
    private suspend fun suspectWatch(pkg: String) {
        val now = System.currentTimeMillis()
        if (blockView != null || now - (lastBlockAt[pkg] ?: 0) < 30_000) return
        val root = rootInActiveWindow ?: return
        if (root.packageName?.toString() != pkg) return
        val text = StringBuilder()
        fun walk(n: AccessibilityNodeInfo, d: Int) {
            if (d > 30 || text.length > 4000) return
            n.text?.let { text.append(it).append(' ') }
            n.hintText?.let { text.append(it).append(' ') }
            for (i in 0 until n.childCount) n.getChild(i)?.let { walk(it, d + 1) }
        }
        walk(root, 0)
        if (!KYC_SCREEN.containsMatchIn(text)) return
        lastBlockAt[pkg] = now
        val w = withContext(Dispatchers.IO) { graph.db.watch().list().firstOrNull { it.pkg == pkg } }
        val bankName = w?.bank?.let { graph.registry.now?.book?.bank(it)?.name ?: it }
        blockView = host.show(host.fullScreenParams()) {
            SuspectBlock(
                w?.label ?: pkg, bankName,
                onReport = { closeBlock(); openApp("app:$pkg") },
                onUninstall = {
                    closeBlock()
                    startActivity(Intent(Intent.ACTION_DELETE, Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                },
                onClose = { closeBlock(); performGlobalAction(GLOBAL_ACTION_HOME) },
            )
        }
    }

    private fun closeBlock() { host.remove(blockView); blockView = null }

    /** Doctor / demo: show the block screen for a package without waiting for a KYC screen. */
    fun demoBlock(pkg: String) { lastBlockAt.remove(pkg); scope.launch { suspects = suspects + pkg; updateScope(); suspectWatch(pkg) } }

    /** PACKAGE_ADDED is only delivered to a dynamically registered receiver (Section 8.1). */
    private fun registerPackageWatcher() {
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context, i: Intent) {
                if (i.getBooleanExtra(Intent.EXTRA_REPLACING, false)) return
                val pkg = i.data?.schemeSpecificPart ?: return
                scope.launch(Dispatchers.IO) {
                    graph.knowYourApp.onInstalled(pkg) { app ->
                        graph.notifier.suspectApp(app)
                        scope.launch { suspects = suspects + app.pkg; updateScope() }
                    }
                }
            }
        }
        val f = IntentFilter(Intent.ACTION_PACKAGE_ADDED).apply { addDataScheme("package") }
        ContextCompat.registerReceiver(this, r, f, ContextCompat.RECEIVER_EXPORTED)
        pkgReceiver = r
    }

    fun refreshSuspects() { scope.launch { suspects = withContext(Dispatchers.IO) { graph.db.watch().list().map { it.pkg }.toSet() }; updateScope() } }

    override fun onInterrupt() {}

    override fun onDestroy() {
        instance = null
        pkgReceiver?.let { runCatching { unregisterReceiver(it) } }
        host.remove(strip); host.remove(flowView); host.remove(bannerView); host.remove(blockView)
        host.destroy()
        scope.cancel()
        super.onDestroy()
    }
}
