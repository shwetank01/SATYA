package app.satya.ui

import android.speech.tts.TextToSpeech
import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.satya.ui.components.CircleButton
import app.satya.ui.theme.Satya
import app.satya.ui.theme.body
import app.satya.ui.theme.display
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** App-wide toast (design: toast, 2.8 s). */
object Toaster {
    private val _text = MutableStateFlow<String?>(null)
    val text: StateFlow<String?> = _text
    private var job: Job? = null
    private val scope = CoroutineScope(Dispatchers.Main)
    fun show(msg: String) {
        job?.cancel()
        _text.value = msg
        job = scope.launch { delay(2800); _text.value = null }
    }
}

/** Standard scrolling page: 50dp top, 16dp sides, 18dp gaps (design padding:50px 16px 44px). */
@Composable
fun Page(modifier: Modifier = Modifier, gap: Dp = 18.dp, bottom: Dp = 44.dp, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding()
            .padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = bottom).navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(gap),
        content = content,
    )
}

@Composable
fun BackRow(onBack: () -> Unit, onBlue: Boolean = false, icon: String = "back", title: String? = null, titleColor: Color = Satya.Ink, trailing: @Composable () -> Unit = { Spacer(Modifier.width(46.dp)) }) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        CircleButton(icon, onBack, onBlue = onBlue, iconSize = if (icon == "close") 18.dp else 22.dp)
        if (title != null) Text(title, style = body(16, 600, titleColor))
        trailing()
    }
}

@Composable
fun PageTitle(title: String, count: Int? = null, sub: String? = null, color: Color = Satya.Blue, subColor: Color = Satya.Body2, countColor: Color = Satya.Muted2) {
    Column(Modifier.padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(title, style = display(36, 600, color))
            if (count != null) Text(" ($count)", style = display(36, 300, countColor))
        }
        if (sub != null) Text(sub, style = body(15, 400, subColor, 1.5f))
    }
}

object Fmt {
    private val time = SimpleDateFormat("HH:mm", Locale.ENGLISH)
    private val dayMon = SimpleDateFormat("d MMM", Locale.ENGLISH)
    private val full = SimpleDateFormat("EEEE, d MMMM", Locale.ENGLISH)
    fun time(ts: Long): String = time.format(Date(ts))
    fun date(ts: Long): String = dayMon.format(Date(ts))
    fun today(): String = full.format(Date())
    fun dayLabel(ts: Long): String {
        val c = Calendar.getInstance(); val d = Calendar.getInstance().apply { timeInMillis = ts }
        val sameDay = c.get(Calendar.YEAR) == d.get(Calendar.YEAR) && c.get(Calendar.DAY_OF_YEAR) == d.get(Calendar.DAY_OF_YEAR)
        c.add(Calendar.DAY_OF_YEAR, -1)
        val yesterday = c.get(Calendar.YEAR) == d.get(Calendar.YEAR) && c.get(Calendar.DAY_OF_YEAR) == d.get(Calendar.DAY_OF_YEAR)
        return if (sameDay) "Today" else if (yesterday) "Yesterday" else date(ts)
    }
    fun group(ts: Long): String = dayLabel(ts).let { if (it == "Today" || it == "Yesterday") it else "Earlier" }
    fun ago(ts: Long): String {
        if (ts <= 0) return "Not yet"
        val m = (System.currentTimeMillis() - ts) / 60000
        return when { m < 1 -> "Just now"; m < 60 -> "${m}m ago"; m < 60 * 24 -> "${m / 60}h ago"; else -> "${m / (60 * 24)}d ago" }
    }
}

/** Reads receipts aloud (Hindi when the receipt is switched to हिंदी). */
object Voice {
    private var tts: TextToSpeech? = null
    private var ready = false
    fun init(ctx: Context) {
        if (tts != null) return
        tts = TextToSpeech(ctx.applicationContext) { ready = it == TextToSpeech.SUCCESS }
    }
    fun speak(text: String, hindi: Boolean) {
        val t = tts ?: return
        if (!ready) return
        t.language = if (hindi) Locale("hi", "IN") else Locale("en", "IN")
        t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "satya")
    }
    fun stop() { tts?.stop() }
}

val NoPadding = PaddingValues(0.dp)
