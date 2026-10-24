package app.satya.doot

import android.content.Context
import android.graphics.Bitmap
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import app.satya.AppGraph
import app.satya.BuildConfig
import app.satya.config.Config
import app.satya.core.Hash
import app.satya.crypto.Sodium
import app.satya.data.Receipt
import app.satya.kavach.Kavach
import app.satya.kavach.KavachClient
import app.satya.sakshi.ReportEntity
import app.satya.sakshi.SakshiDb
import app.satya.vachan.RegistryStore
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/** The 5-step timeline shown in Reports (design STAGES). */
object ReportStages {
    val LABELS = listOf("Sealed", "Delivered", "Bank opened", "Confirmed fake", "Blocked for everyone")
    fun index(status: String): Int = when (status) {
        "queued", "sealed" -> 0
        "delivered" -> 1
        "opened" -> 2
        "blocked" -> 4
        else -> 0
    }
}

/**
 * DOOT on the phone (Section 8.5): builds the sealed payload (9.4), seals it to the bank's box key
 * from its verified certificate, and queues delivery. The cloud stores a box it cannot open.
 */
class Doot(private val ctx: Context, private val db: SakshiDb, private val registry: RegistryStore) {
    private val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
    private val hourFmt = SimpleDateFormat("yyyy-MM-dd'T'HH", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
    private val RULE_ID = Regex("^[A-Z0-9_]{3,64}$")

    fun canSend(bankId: String?): Boolean = bankId != null && registry.now?.boxKeys?.containsKey(bankId) == true

    /** Plaintext inside the box. The scammer's values are raw (the bank needs them); the user's are masked. */
    fun payload(r: Receipt, screenshot: Bitmap?, callbackNumber: String?): String = buildJsonObject {
        put("v", 1)
        put("created_at", iso.format(Date()))
        put("source_app", r.sourcePkg ?: r.source)
        put("channel", r.channel)
        put("claimed_bank", r.claimedBank)
        put("sender", r.sender)
        put("masked_text", r.maskedText)
        put("raw_indicators", buildJsonArray { r.indicators.forEach { add(buildJsonObject { put("t", it.t); put("value", it.value) }) } })
        put("rule_hits", buildJsonArray {
            r.hits.forEach { h -> add(buildJsonObject { put("id", h.id); put("severity", h.severity); put("promise", h.promise); put("issuer", h.issuer); put("source", h.source); put("ai_assisted", h.aiAssisted) }) }
        })
        put("scores", buildJsonObject { put("face", r.deepfake?.face); put("voice", r.deepfake?.voice) })
        put("herd", buildJsonObject { put("seen_7d", r.herd?.seen7d ?: 0); put("reports", r.herd?.reports ?: 0) })
        put("timeline", buildJsonArray {
            add(buildJsonObject { put("t", iso.format(Date(r.ts))); put("event", "${r.source}: ${r.captured.ifBlank { "checked by the user" }}") })
            add(buildJsonObject { put("t", iso.format(Date())); put("event", "Report sealed on the phone") })
        })
        put("screenshot_jpeg_b64", screenshot?.let { Sodium.b64(jpeg(it)) })
        put("callback_number", callbackNumber)
        put("kill_chain_stage", r.killChainStage)
        put("verdict", r.verdict)
    }.toString()

    private fun jpeg(b: Bitmap): ByteArray {
        val w = minOf(1080, b.width)
        val scaled = if (b.width > w) Bitmap.createScaledBitmap(b, w, (b.height * w.toFloat() / b.width).toInt(), true) else b
        return ByteArrayOutputStream().use { scaled.compress(Bitmap.CompressFormat.JPEG, 70, it); it.toByteArray() }
    }

    /** Seal, store and queue. Returns the local report id. */
    suspend fun sealAndQueue(r: Receipt, screenshot: Bitmap? = null, callbackNumber: String? = null): Long {
        val bank = r.claimedBank ?: error("no bank to send to")
        val boxPk = registry.now?.boxKeys?.get(bank) ?: error("$bank has no box key in its certificate")
        val plaintext = payload(r, screenshot, callbackNumber).toByteArray(Charsets.UTF_8)
        val sealed = Sodium.seal(plaintext, boxPk)
        val sealedHash = Hash.sha256Hex(sealed)
        val ticket = Sodium.randomHex(32)
        val envelope = buildJsonObject {
            put("v", 1)
            put("bank_id", bank)
            put("channel", r.channel)
            put("rules", JsonArray(r.hits.map { it.id }.filter { RULE_ID.matches(it) }.distinct().take(20).map { JsonPrimitive(it) }))
            put("severity", r.overall)
            put("indicators", JsonArray(r.indicators.take(20).map { buildJsonObject { put("t", it.t); put("h", it.h) } }))
            put("hour", hourFmt.format(Date(r.ts)))
            put("sealed", Sodium.b64(sealed))
            put("ticket_hash", Hash.ticketHash(ticket))
        }.toString()
        val now = System.currentTimeMillis()
        val no ="SR-" + SimpleDateFormat("ddMM", Locale.US).format(Date()) + "-" + (now % 10000).toString().padStart(4, '0')
        val id = db.reports().put(
            ReportEntity(
                checkId = r.checkId, ticket = ticket, bankId = bank, status = "queued", sealedHash = sealedHash, sealedBytes = sealed.size,
                envelopeJson = envelope, callback = callbackNumber != null, payee = r.indicators.firstOrNull()?.value ?: r.sender,
                createdAt = now, updatedAt = now, timesJson = """{"sealed":$now}""", number = no,
            ),
        )
        ReportSendWorker.enqueue(ctx, id)
        return id
    }

    companion object {
        fun times(json: String): Map<String, Long> = runCatching {
            (kotlinx.serialization.json.Json.parseToJsonElement(json) as JsonObject).mapValues { it.value.jsonPrimitive.contentOrNull?.toLongOrNull() ?: 0L }
        }.getOrDefault(emptyMap())
        fun withTime(json: String, key: String, t: Long): String {
            val m = times(json).toMutableMap()
            if (key !in m) m[key] = t
            return buildJsonObject { m.forEach { (k, v) -> put(k, v) } }.toString()
        }
    }
}

/** Delivers queued reports with exponential backoff ("Queued" while offline). */
class ReportSendWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val g = AppGraph.get(applicationContext)
        val id = inputData.getLong("id", -1)
        val rep = g.db.reports().get(id) ?: return Result.failure()
        if (rep.status != "queued") return Result.success()
        val env = rep.envelopeJson ?: return Result.failure()
        val bankName = g.registry.now?.book?.bank(rep.bankId)?.name ?: rep.bankId
        val res = g.client.send(Kavach.report(env, bankName, rep.sealedBytes, rep.checkId))
        if (!res.ok) return if (res.code in 400..499 && res.code != 408 && res.code != 429) {
            g.db.reports().update(rep.copy(status = "failed", updatedAt = System.currentTimeMillis())); Result.failure()
        } else Result.retry()
        val o = g.client.json(res.body) as? JsonObject ?: return Result.retry()
        val reportId = o["report_id"]?.jsonPrimitive?.contentOrNull ?: return Result.retry()
        val receivedAt = o["received_at"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val sealedHash = o["sealed_hash"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val sig = o["receipt_sig"]?.jsonPrimitive?.contentOrNull.orEmpty()
        // The receipt must be for exactly the box we sent, signed by SATYA's pinned Receipt key.
        val valid = sealedHash == rep.sealedHash && Sodium.verify(Sodium.receiptMessage(reportId, sealedHash, receivedAt), sig, BuildConfig.RECEIPT_PK)
        val now = System.currentTimeMillis()
        g.db.reports().update(
            rep.copy(reportId = reportId, receiptSig = if (valid) sig else null, status = if (valid) "delivered" else "failed",
                updatedAt = now, timesJson = Doot.withTime(rep.timesJson, "delivered", now)),
        )
        if (valid) g.notifier.reportUpdate(rep.copy(reportId = reportId, status = "delivered"), "Report delivered", "$bankName’s fraud desk received your sealed report.")
        return Result.success()
    }

    companion object {
        fun enqueue(ctx: Context, id: Long) {
            val req = OneTimeWorkRequestBuilder<ReportSendWorker>()
                .setInputData(workDataOf("id" to id))
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(ctx).enqueueUniqueWork("report-$id", ExistingWorkPolicy.KEEP, req)
        }
    }
}

/** Status polling on app open and with every sync (ticket in a header, never the URL). */
class StatusPoller(private val db: SakshiDb, private val client: KavachClient, private val registry: RegistryStore, private val onChange: suspend (ReportEntity, String, String) -> Unit) {
    suspend fun pollAll() {
        for (rep in db.reports().open()) {
            val rid = rep.reportId ?: continue
            val res = client.send(Kavach.statusCheck(rid, rep.ticket, rep.number, rep.checkId))
            if (!res.ok) continue
            val status = (client.json(res.body) as? JsonObject)?.get("status")?.jsonPrimitive?.contentOrNull ?: continue
            if (status == rep.status) continue
            val now = System.currentTimeMillis()
            var times = Doot.withTime(rep.timesJson, status, now)
            if (status == "blocked") { times = Doot.withTime(times, "opened", now); times = Doot.withTime(times, "confirmed", now) }
            db.reports().update(rep.copy(status = status, updatedAt = now, timesJson = times))
            val bank = registry.now?.book?.bank(rep.bankId)?.name ?: rep.bankId
            when (status) {
                "opened" -> onChange(rep, "$bank opened your report", "Only $bank could. Nobody else can read it.")
                "blocked" -> onChange(rep, "${rep.bankId} confirmed fake", "${rep.payee.ifBlank { "The sender" }} is now blocked for every SATYA user.")
                "dismissed" -> onChange(rep, "$bank closed your report", "The bank reviewed it and closed it.")
            }
        }
    }
}
