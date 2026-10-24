package app.satya.prahari

import app.satya.core.Capture
import app.satya.core.Channel
import app.satya.core.Normalize
import app.satya.core.Rules
import app.satya.core.Trigger
import app.satya.data.Herd
import app.satya.data.Receipt
import app.satya.vachan.RegistryStore

/** What U3 decided about a ringing number. */
data class CallVerdict(
    val number: String,
    /** alert | info | none */
    val kind: String,
    val title: String,
    val body: String,
    val receipt: Receipt? = null,
    val herd: Herd? = null,
)

/**
 * U3 Call Promise Check (Section 13.5), number only, at ring. The call is never blocked or delayed:
 * the screening service answers first and calls this afterwards.
 */
class CallCheck(private val runner: CheckRunner, private val registry: RegistryStore) {
    suspend fun onRing(number: String, simulated: Boolean = false): CallVerdict {
        val reg = registry.now ?: registry.loadLocal() ?: return CallVerdict(number, "none", "", "")
        val nat = Rules.national(number)
        val sim = if (simulated) " (simulated)" else ""
        val capture = Capture(Trigger.CALL, Channel.CALL, "", number, sourcePkg = "com.android.server.telecom")
        // Rules: incoming_caller_in across all banks (PNB toll-free numbers never call out).
        val receipt = runner.background(capture, captured = if (simulated) "Simulated ring from the Doctor" else "Incoming call, number only")
        if (receipt != null && receipt.hits.isNotEmpty()) {
            val h = receipt.hits.first()
            return CallVerdict(number, "alert", "${h.severity.replaceFirstChar { it.uppercase() }}: this call breaks a promise$sim", h.promise, receipt, receipt.herd)
        }
        val ind = Normalize.tel(number)
        val blocked = reg.blocklist[ind.hash]
        val herd = runner.herdFor(listOf(ind), reg, receipt?.checkId, "check")
        if (blocked != null || herd?.confirmedBy != null) {
            val by = blocked?.by ?: herd?.confirmedBy
            return CallVerdict(number, "alert", "Confirmed fake by $by$sim", "This number is on the SATYA blocklist. Do not share anything on this call.", receipt, herd)
        }
        if ((herd?.reports ?: 0) > 0 || (herd?.seen7d ?: 0) >= 3) {
            return CallVerdict(number, "alert", "Reported by other SATYA users$sim", "Seen ${herd?.seen7d ?: 0} times this week, ${herd?.reports ?: 0} reports. Hang up if they ask for an OTP or PIN.", receipt, herd)
        }
        return when {
            nat.startsWith("1600") || nat.startsWith("1601") -> CallVerdict(number, "info", "Registered bank service series$sim", "Numbers starting 1600 are given only to banks and regulated firms for service calls. They will still never ask for your OTP or PIN.")
            nat.startsWith("140") -> CallVerdict(number, "info", "Promotional series$sim", "140 numbers are for marketing calls. A bank will not ask for any secret on one.")
            else -> CallVerdict(number, "none", "", "", herd = herd)
        }
    }
}
