package app.satya

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.satya.data.Receipt
import app.satya.prahari.CallVerdict
import app.satya.prahari.FinanceApp
import app.satya.sakshi.ReportEntity

/** Heads-up alerts and report updates. Words, never colours. */
class Notifier(private val ctx: Context) {
    companion object {
        const val CH_ALERTS = "alerts"
        const val CH_REPORTS = "reports"
        const val CH_SERVICE = "service"
        const val EXTRA_OPEN = "open"
    }

    fun createChannels() {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH_ALERTS, ctx.getString(R.string.channel_alerts), NotificationManager.IMPORTANCE_HIGH).apply {
            description = ctx.getString(R.string.channel_alerts_desc); enableVibration(true)
        })
        nm.createNotificationChannel(NotificationChannel(CH_REPORTS, ctx.getString(R.string.channel_reports), NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = ctx.getString(R.string.channel_reports_desc)
        })
        nm.createNotificationChannel(NotificationChannel(CH_SERVICE, ctx.getString(R.string.channel_service), NotificationManager.IMPORTANCE_LOW))
    }

    fun openIntent(target: String, req: Int): PendingIntent = PendingIntent.getActivity(
        ctx, req,
        Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra(EXTRA_OPEN, target),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun canPost() = ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun post(id: Int, b: NotificationCompat.Builder) {
        if (!canPost()) return
        runCatching { NotificationManagerCompat.from(ctx).notify(id, b.build()) }
    }

    private fun base(channel: String) = NotificationCompat.Builder(ctx, channel)
        .setSmallIcon(R.drawable.ic_notify)
        .setColor(0xFF1F5FC4.toInt())
        .setAutoCancel(true)

    /** U2: a background message broke a promise. */
    fun alert(r: Receipt) {
        val top = r.hits.firstOrNull()
        val sev = top?.severity?.replaceFirstChar { it.uppercase() } ?: "Warning"
        val title = "$sev: ${r.source} message breaks ${if (r.claimedBank != null) r.bankName + "’s" else "a bank’s"} promise"
        val body = top?.promise ?: (r.herd?.confirmedBy?.let { "Confirmed fake by $it." } ?: r.askedFor)
        post(r.checkId.hashCode(), base(CH_ALERTS).setContentTitle(title).setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText("$body\n\nAsked: ${r.askedFor}"))
            .setPriority(NotificationCompat.PRIORITY_HIGH).setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(openIntent("receipt:${r.checkId}", r.checkId.hashCode())))
    }

    /** U3: at ring. */
    fun call(v: CallVerdict) {
        if (v.kind == "none") return
        val b = base(CH_ALERTS).setContentTitle(v.title).setContentText(v.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(v.body))
            .setPriority(if (v.kind == "alert") NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_CALL)
        v.receipt?.let { b.setContentIntent(openIntent("receipt:${it.checkId}", it.checkId.hashCode())) }
        post(v.number.hashCode(), b)
    }

    /** U4: a suspect app was installed. */
    fun suspectApp(a: FinanceApp) {
        post(a.pkg.hashCode(), base(CH_ALERTS).setContentTitle("“${a.label}” is not on any bank’s official list")
            .setContentText("Don’t enter KYC details, PIN or OTP in it. SATYA is watching it.")
            .setPriority(NotificationCompat.PRIORITY_HIGH).setContentIntent(openIntent("app:${a.pkg}", a.pkg.hashCode())))
    }

    fun reportUpdate(rep: ReportEntity, title: String, body: String) {
        post((rep.localId + 7000).toInt(), base(CH_REPORTS).setContentTitle(title).setContentText(body)
            .setContentIntent(openIntent("report:${rep.localId}", (rep.localId + 7000).toInt())))
    }

    fun serviceNotification(text: String) = base(CH_SERVICE).setContentTitle("SATYA").setContentText(text).setOngoing(true).build()
}
