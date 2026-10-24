package app.satya.drishti

import android.app.Activity
import android.app.Notification
import android.app.Service
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.content.pm.ServiceInfo
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import app.satya.AppGraph
import app.satya.MainActivity
import app.satya.Notifier
import app.satya.core.Channel
import app.satya.core.Trigger
import app.satya.prahari.Extras
import app.satya.prahari.Sources
import app.satya.ui.components.GhostButton
import app.satya.ui.components.InkButton
import app.satya.ui.components.SealSolid
import app.satya.ui.overlay.CheckFlowState
import app.satya.ui.overlay.CheckFlowUi
import app.satya.ui.overlay.Phase
import app.satya.ui.theme.Satya
import app.satya.ui.theme.SatyaTheme
import app.satya.ui.theme.body
import app.satya.ui.theme.display
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Opens SATYA's own screens from a flow activity. */
private fun Activity.openInApp(target: String) {
    AppGraph.get(this).navigate.tryEmit(target)
    startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra(Notifier.EXTRA_OPEN, target))
}

/**
 * Share to SATYA (U1 backup trigger, U5 voice notes). A screenshot is read with OCR on the phone;
 * text and the masked result follow the same flow as the edge strip.
 */
class ShareActivity : ComponentActivity() {
    private val state = CheckFlowState(share = true)
    private var confirmVoice by mutableStateOf<Pair<Uri, String>?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val g = AppGraph.get(this)
        val from = referrer?.host
        val label = Sources.label(from, Channel.SCREEN).takeIf { from != null && it != "Screen" }
        state.chip = if (label != null) "Screenshot received from $label" else "Shared with SATYA"
        var text = intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
        @Suppress("DEPRECATION") val uri: Uri? = intent.getParcelableExtra(Intent.EXTRA_STREAM)
        val type = intent.type.orEmpty()
        val session = CheckSession(
            g, state, lifecycleScope, Trigger.SHARE, from, intent.getStringExtra("satya.sender").orEmpty(),
            textFor = { text },
            sourceLabel = label ?: if (type.startsWith("audio")) "Voice note" else "Shared",
            captured = if (type.startsWith("image")) "Shared screenshot" else if (type.startsWith("audio")) "Shared voice note" else "Shared text",
            finish = { finish() },
            openInApp = { openInApp(it) },
        )
        setContent {
            SatyaTheme {
                Box(Modifier.fillMaxSize()) {
                    CheckFlowUi(state, session)
                    confirmVoice?.let { (u, mime) ->
                        VoiceConsent(
                            onSend = {
                                confirmVoice = null
                                lifecycleScope.launch {
                                    val bytes = withContext(Dispatchers.IO) { contentResolver.openInputStream(u)?.use { it.readBytes() } }
                                    if (bytes == null || bytes.isEmpty() || bytes.size > 15 * 1024 * 1024) { finish(); return@launch }
                                    state.chip = "Voice note received"
                                    session.startDirect(Channel.VOICE, Extras(voice = bytes to mime))
                                }
                            },
                            onCancel = { finish() },
                        )
                    }
                }
            }
        }
        when {
            type.startsWith("audio") && uri != null -> confirmVoice = uri to type
            type.startsWith("image") && uri != null -> lifecycleScope.launch {
                state.phase = Phase.Checking(0, false, true)
                val bmp = withContext(Dispatchers.IO) {
                    runCatching { ImageDecoder.decodeBitmap(ImageDecoder.createSource(contentResolver, uri)) { d, _, _ -> d.allocator = ImageDecoder.ALLOCATOR_SOFTWARE } }.getOrNull()
                }
                state.shot = bmp
                text = bmp?.let { Ocr.read(it) }.orEmpty()
                session.startDirect()
            }
            text.isNotBlank() -> { state.chip = "Text received" + (label?.let { " from $it" } ?: ""); session.startDirect() }
            else -> finish()
        }
    }
}

@androidx.compose.runtime.Composable
private fun VoiceConsent(onSend: () -> Unit, onCancel: () -> Unit) {
    Box(Modifier.fillMaxSize().background(Color(0x99050912))) {
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().clip(RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp)).background(Satya.Paper)
                .navigationBarsPadding().padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            SealSolid(Modifier.size(44.dp))
            Text("Check this voice note?", style = display(26, 700, Satya.Blue))
            Text("This voice note will be sent to SATYA for a synthetic-voice score and a transcript, then deleted. Nothing else leaves your phone.", style = body(15, 400, Satya.Body2, 1.5f))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GhostButton("Cancel", onCancel, Modifier.weight(1f))
                InkButton("Send for check", onSend, Modifier.weight(1.3f), height = 56.dp, radius = 28.dp)
            }
        }
    }
}

/**
 * v1.1 tile fallback with Accessibility off: the system asks for consent, one frame is captured,
 * capture stops, and the check runs exactly like the edge strip.
 */
class ProjectionActivity : ComponentActivity() {
    private val state = CheckFlowState(share = false)

    private val consent = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val data = res.data
        if (res.resultCode != RESULT_OK || data == null) { finish(); return@registerForActivityResult }
        ProjectionCaptureService.onFrame = { bmp -> runOnUiThread { onFrame(bmp) } }
        startForegroundService(Intent(this, ProjectionCaptureService::class.java).putExtra("code", res.resultCode).putExtra("data", data))
    }

    private lateinit var session: CheckSession
    private var text = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        session = CheckSession(
            AppGraph.get(this), state, lifecycleScope, Trigger.TILE, null, "",
            textFor = { text }, captured = "Check screen tile · 1 frame, then stopped",
            finish = { finish() }, openInApp = { openInApp(it) },
        )
        setContent { SatyaTheme { CheckFlowUi(state, session) } }
        consent.launch(getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent())
    }

    private fun onFrame(bmp: Bitmap?) {
        if (bmp == null) { finish(); return }
        state.shot = bmp
        state.phase = Phase.Checking(0, false, true)
        lifecycleScope.launch {
            text = Ocr.read(bmp)
            session.startDirect()
        }
    }
}

/** Foreground service required for MediaProjection (Android 14+). Captures exactly one frame. */
class ProjectionCaptureService : Service() {
    companion object { @Volatile var onFrame: ((Bitmap?) -> Unit)? = null }

    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val n: Notification = AppGraph.get(this).notifier.serviceNotification("Capturing one frame of your screen")
        startForeground(41, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        val code = intent?.getIntExtra("code", 0) ?: 0
        @Suppress("DEPRECATION") val data: Intent? = intent?.getParcelableExtra("data")
        if (data == null) { deliver(null); return START_NOT_STICKY }
        val mpm = getSystemService(MediaProjectionManager::class.java)
        val mp = mpm.getMediaProjection(code, data) ?: run { deliver(null); return START_NOT_STICKY }
        projection = mp
        val handler = Handler(Looper.getMainLooper())
        mp.registerCallback(object : MediaProjection.Callback() { override fun onStop() { cleanup() } }, handler)
        val dm = resources.displayMetrics
        val r = ImageReader.newInstance(dm.widthPixels, dm.heightPixels, PixelFormat.RGBA_8888, 2)
        reader = r
        var done = false
        r.setOnImageAvailableListener({ ir ->
            if (done) return@setOnImageAvailableListener
            val img = ir.acquireLatestImage() ?: return@setOnImageAvailableListener
            done = true
            val plane = img.planes[0]
            val rowPad = plane.rowStride - plane.pixelStride * img.width
            val bmp = Bitmap.createBitmap(img.width + rowPad / plane.pixelStride, img.height, Bitmap.Config.ARGB_8888)
            bmp.copyPixelsFromBuffer(plane.buffer)
            img.close()
            deliver(Bitmap.createBitmap(bmp, 0, 0, img.width, img.height))
        }, handler)
        handler.postDelayed({
            display = mp.createVirtualDisplay("satya-one-frame", dm.widthPixels, dm.heightPixels, dm.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, handler)
        }, 250)
        handler.postDelayed({ if (!done) { done = true; deliver(null) } }, 4000)
        return START_NOT_STICKY
    }

    private fun deliver(b: Bitmap?) {
        onFrame?.invoke(b)
        onFrame = null
        cleanup()
    }

    private fun cleanup() {
        runCatching { display?.release() }; display = null
        runCatching { reader?.close() }; reader = null
        runCatching { projection?.stop() }; projection = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }
}
