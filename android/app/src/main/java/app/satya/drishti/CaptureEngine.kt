package app.satya.drishti

import android.accessibilityservice.AccessibilityService
import android.graphics.Bitmap
import android.graphics.Rect
import android.view.Display
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import com.google.android.gms.tasks.Task
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.concurrent.Executors
import kotlin.coroutines.resume

data class TextBlock(val text: String, val bounds: Rect)

suspend fun <T> Task<T>.awaitOrNull(): T? = suspendCancellableCoroutine { c ->
    addOnSuccessListener { if (c.isActive) c.resume(it) }
    addOnFailureListener { if (c.isActive) c.resume(null) }
    addOnCanceledListener { if (c.isActive) c.resume(null) }
}

/** OCR shared by the accessibility path, the share sheet and the MediaProjection fallback. */
object Ocr {
    private val latin by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
    private val deva by lazy { TextRecognition.getClient(DevanagariTextRecognizerOptions.Builder().build()) }

    /** ML Kit needs a software ARGB_8888 bitmap (hardware buffers crash it). */
    suspend fun read(bitmap: Bitmap): String {
        val b = if (bitmap.config == Bitmap.Config.HARDWARE) bitmap.copy(Bitmap.Config.ARGB_8888, false) else bitmap
        val img = InputImage.fromBitmap(b, 0)
        val l = latin.process(img).awaitOrNull()?.text.orEmpty()
        // The Devanagari model also reads Latin; use it when the Latin pass looks thin or Hindi is present.
        val needDeva = l.length < 12 || l.any { it == '?' }
        val d = if (needDeva) deva.process(img).awaitOrNull()?.text.orEmpty() else ""
        return if (d.length > l.length) d else l
    }
}

/**
 * Screen capture for Circle to Check (Section 8.1). Screenshot FIRST, then overlays, because
 * overlays can appear in screenshots.
 */
class CaptureEngine(private val svc: AccessibilityService) {
    private val exec = Executors.newSingleThreadExecutor()
    private var lastShot = 0L

    suspend fun screenshot(): Bitmap? {
        repeat(4) { attempt ->
            val wait = 460 - (System.currentTimeMillis() - lastShot)
            if (wait > 0) delay(wait)
            val bmp = suspendCancellableCoroutine<Bitmap?> { c ->
                svc.takeScreenshot(Display.DEFAULT_DISPLAY, exec, object : AccessibilityService.TakeScreenshotCallback {
                    override fun onSuccess(result: AccessibilityService.ScreenshotResult) {
                        val hw = Bitmap.wrapHardwareBuffer(result.hardwareBuffer, result.colorSpace)
                        val sw = hw?.copy(Bitmap.Config.ARGB_8888, false)
                        result.hardwareBuffer.close()
                        if (c.isActive) c.resume(sw)
                    }
                    override fun onFailure(errorCode: Int) { if (c.isActive) c.resume(null) }
                })
            }
            lastShot = System.currentTimeMillis()
            if (bmp != null) return bmp
            delay(350L * (attempt + 1))
        }
        return null
    }

    /** Package of the app the user is looking at (not SATYA, not System UI). */
    fun foregroundPkg(): String? = runCatching {
        svc.windows.filter { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }
            .sortedByDescending { if (it.isActive) 2 else if (it.isFocused) 1 else 0 }
            .firstNotNullOfOrNull { w -> w.root?.packageName?.toString()?.takeIf { it != svc.packageName } }
    }.getOrNull()

    /** Text and bounds of every visible node in other apps' windows. */
    fun screenTexts(): List<TextBlock> {
        val out = ArrayList<TextBlock>()
        runCatching {
            for (w in svc.windows) {
                if (w.type == AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY) continue
                val root = w.root ?: continue
                if (root.packageName?.toString() == svc.packageName) continue
                walk(root, out, 0)
            }
        }
        return out
    }

    private fun walk(n: AccessibilityNodeInfo, out: MutableList<TextBlock>, depth: Int) {
        if (depth > 40 || out.size > 400) return
        val t = (n.text?.toString() ?: n.contentDescription?.toString())?.trim()
        if (!t.isNullOrEmpty() && n.isVisibleToUser) {
            val r = Rect(); n.getBoundsInScreen(r)
            out.add(TextBlock(t, r))
        }
        for (i in 0 until n.childCount) n.getChild(i)?.let { walk(it, out, depth + 1) }
    }

    /** Node text inside [region], top to bottom, de-duplicated; OCR of the crop when nodes are empty. */
    suspend fun textIn(region: Rect?, blocks: List<TextBlock>, shot: Bitmap?): String {
        val picked = blocks.filter { region == null || Rect.intersects(region, it.bounds) }
            .sortedWith(compareBy({ it.bounds.top }, { it.bounds.left }))
            .map { it.text }.distinct()
            .filter { s -> s.length > 1 }
        val joined = picked.joinToString("\n")
        if (joined.count { it.isLetterOrDigit() } >= 8) return joined
        if (shot == null) return joined
        val crop = region?.let {
            val r = Rect(it); r.intersect(0, 0, shot.width, shot.height)
            if (r.width() > 8 && r.height() > 8) Bitmap.createBitmap(shot, r.left, r.top, r.width(), r.height()) else shot
        } ?: shot
        return Ocr.read(crop).ifBlank { joined }
    }
}
