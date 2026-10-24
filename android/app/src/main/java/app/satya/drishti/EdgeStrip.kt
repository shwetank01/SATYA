package app.satya.drishti

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RectF
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import kotlin.math.abs

/**
 * The edge strip (Section 8.1): 18dp wide, 35% of the screen tall. Three taps within 700 ms start
 * Circle to Check. Long-press and drag moves it. On Samsung it sits on the LEFT edge by default,
 * because One UI's Edge Panel handle lives on the right.
 */
@SuppressLint("ViewConstructor")
class EdgeStrip(ctx: Context, private val onTripleTap: () -> Unit, private val onMoved: (Float) -> Unit) : View(ctx) {
    private val density = resources.displayMetrics.density
    private val grip = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xD9F7C800.toInt() }
    private val outline = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x661F5FC4; style = Paint.Style.STROKE; strokeWidth = 1.2f * density }
    private val taps = ArrayDeque<Long>()
    private var downAt = 0L
    private var downX = 0f
    private var downY = 0f
    private var dragging = false
    private var startParamY = 0
    var side: String = "right"
    var params: WindowManager.LayoutParams? = null

    fun layoutParams(side: String, yFraction: Float): WindowManager.LayoutParams {
        this.side = side
        val dm = resources.displayMetrics
        val h = (dm.heightPixels * .35f).toInt()
        return WindowManager.LayoutParams(
            (18 * density).toInt(), h,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or (if (side == "left") Gravity.START else Gravity.END)
            y = ((dm.heightPixels * yFraction) - h / 2f).toInt().coerceAtLeast(0)
            fitInsetsTypes = 0
        }.also { params = it }
    }

    override fun onDraw(canvas: Canvas) {
        val w = 4.5f * density
        val inset = 3f * density
        val x = if (side == "left") inset else width - inset - w
        val r = RectF(x, height * .18f, x + w, height * .82f)
        canvas.drawRoundRect(r, w, w, grip)
        canvas.drawRoundRect(r, w, w, outline)
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downAt = e.eventTime; downX = e.rawX; downY = e.rawY; dragging = false
                startParamY = params?.y ?: 0
            }
            MotionEvent.ACTION_MOVE -> {
                val held = e.eventTime - downAt > ViewConfiguration.getLongPressTimeout()
                if (held && (dragging || abs(e.rawY - downY) > 6 * density)) {
                    if (!dragging) performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                    dragging = true
                    params?.let { p -> p.y = (startParamY + (e.rawY - downY)).toInt().coerceAtLeast(0); (context.getSystemService(WindowManager::class.java)).updateViewLayout(this, p) }
                }
            }
            MotionEvent.ACTION_UP -> {
                if (dragging) {
                    val dm = resources.displayMetrics
                    params?.let { onMoved((it.y + it.height / 2f) / dm.heightPixels) }
                    dragging = false
                    return true
                }
                val isTap = e.eventTime - downAt < 300 && abs(e.rawX - downX) < 24 * density && abs(e.rawY - downY) < 24 * density
                if (isTap) {
                    taps.addLast(e.eventTime)
                    while (taps.isNotEmpty() && e.eventTime - taps.first() > 700) taps.removeFirst()
                    performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
                    if (taps.size >= 3) {
                        taps.clear()
                        performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                        onTripleTap()
                    }
                }
            }
        }
        return true
    }
}
