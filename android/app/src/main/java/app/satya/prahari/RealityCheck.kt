package app.satya.prahari

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Telephony
import app.satya.core.EntityExtractor
import app.satya.core.Rules
import app.satya.data.Reality
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Reality Check (Section 8.2): does a matching debit SMS from any bank header exist on this phone?
 * Soft wording, never "this claim is false". Nothing leaves the phone.
 */
class RealityCheck(private val ctx: Context) {
    private val DEBIT = Regex("(?i)\\b(debited|deducted|withdrawn|spent|paid|sent|dr\\.?|debit)\\b")

    fun check(amount: Long, now: Long = System.currentTimeMillis()): Reality {
        if (ctx.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            return Reality("skipped", "Allow SMS access in SATYA to compare this with your bank's own debit SMS.")
        }
        val since = now - 48L * 3600 * 1000
        val rupees = "₹" + NumberFormat.getIntegerInstance(Locale("en", "IN")).format(amount)
        runCatching {
            ctx.contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI, arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
                "${Telephony.Sms.DATE} > ?", arrayOf(since.toString()), "${Telephony.Sms.DATE} DESC",
            )?.use { c ->
                while (c.moveToNext()) {
                    val addr = c.getString(0) ?: continue
                    val body = c.getString(1) ?: continue
                    if (!Rules.isHeader(addr) || !DEBIT.containsMatchIn(body)) continue
                    if (EntityExtractor.extract(body).amounts.any { it == amount }) {
                        val t = SimpleDateFormat("d MMM, HH:mm", Locale.ENGLISH).format(Date(c.getLong(2)))
                        return Reality("found", "A matching debit SMS for $rupees exists from $addr at $t. Confirm with your bank's official helpline.")
                    }
                }
            }
        }.onFailure { return Reality("skipped", "SATYA could not read the SMS inbox on this phone.") }
        return Reality("not_found", "No debit SMS for $rupees found on this phone in the last 48 hours. Check your bank app before acting.")
    }
}
