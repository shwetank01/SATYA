package app.satya.drishti

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Telephony
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telephony.TelephonyManager
import app.satya.AppGraph
import app.satya.core.Capture
import app.satya.core.Channel
import app.satya.core.Trigger
import app.satya.data.Receipt
import app.satya.prahari.CallVerdict
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

/** U2 for SMS (Section 8.1): rules on the phone, banner + heads-up within ~2 s, no content leaves. */
object SmsPipeline {
    suspend fun handle(ctx: Context, sender: String, body: String, simulated: Boolean = false): Receipt? {
        val g = AppGraph.get(ctx)
        val r = g.runner.background(
            Capture(Trigger.BACKGROUND, Channel.SMS, body, sender, sourcePkg = null),
            if (simulated) "SMS injected from the Doctor" else "SMS received from $sender",
        ) ?: return null
        g.notifier.alert(r)
        val top = r.hits.firstOrNull()
        SatyaA11yService.instance?.showBanner(
            "${top?.severity?.replaceFirstChar { it.uppercase() } ?: "Warning"}: SMS breaks ${if (r.claimedBank != null) r.bankName + "’s" else "a bank’s"} promise",
            top?.promise ?: r.askedFor, "receipt:${r.checkId}",
        )
        return r
    }
}

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (parts.isEmpty()) return
        val sender = parts.first().originatingAddress.orEmpty()
        val body = parts.joinToString("") { it.messageBody.orEmpty() } // multipart SMS joined
        val pending = goAsync()
        AppGraph.get(ctx).scope.launch {
            try { SmsPipeline.handle(ctx, sender, body) } catch (_: Throwable) { } finally { pending.finish() }
        }
    }
}

/** U3 (Section 13.5): number only, at ring. Shared by call screening, the phone-state fallback and the Doctor. */
object CallPipeline {
    private val recent = ConcurrentHashMap<String, Long>()

    fun onRing(ctx: Context, number: String, simulated: Boolean = false, done: (CallVerdict) -> Unit = {}) {
        val now = System.currentTimeMillis()
        if (!simulated && now - (recent[number] ?: 0) < 30_000) return // screening + fallback can both fire
        recent[number] = now
        val g = AppGraph.get(ctx)
        g.scope.launch {
            val v = runCatching { g.callCheck.onRing(number, simulated) }.getOrNull() ?: return@launch
            if (v.kind != "none") {
                g.notifier.call(v)
                SatyaA11yService.instance?.showBanner(v.title, v.body, v.receipt?.let { "receipt:${it.checkId}" })
            }
            done(v)
        }
    }
}

/** Holds ROLE_CALL_SCREENING. Always lets the call ring immediately, then checks asynchronously. */
class SatyaCallScreeningService : CallScreeningService() {
    override fun onScreenCall(details: Call.Details) {
        respondToCall(details, CallResponse.Builder().build())
        if (details.callDirection != Call.Details.DIRECTION_INCOMING) return
        val number = details.handle?.schemeSpecificPart ?: return
        CallPipeline.onRing(this, number)
    }
}

/**
 * v1.1 Samsung fallback: when the call screening role cannot be held, the ringing number comes from
 * PHONE_STATE (needs READ_PHONE_STATE + READ_CALL_LOG). Disabled by default; Setup enables it.
 */
class PhoneStateReceiver : BroadcastReceiver() {
    @Suppress("DEPRECATION")
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.getStringExtra(TelephonyManager.EXTRA_STATE) != TelephonyManager.EXTRA_STATE_RINGING) return
        val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER) ?: return
        CallPipeline.onRing(ctx, number)
    }

    companion object {
        fun setEnabled(ctx: Context, on: Boolean) {
            ctx.packageManager.setComponentEnabledSetting(
                ComponentName(ctx, PhoneStateReceiver::class.java),
                if (on) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP,
            )
        }
        fun isEnabled(ctx: Context) = ctx.packageManager.getComponentEnabledSetting(ComponentName(ctx, PhoneStateReceiver::class.java)) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
    }
}
