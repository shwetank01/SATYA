package app.satya.kavach

import app.satya.BuildConfig
import app.satya.config.Config
import app.satya.sakshi.EgressDao
import app.satya.sakshi.EgressEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.resume

data class KavachResponse(val code: Int, val body: String?, val error: String? = null) {
    val ok: Boolean get() = code in 200..299
}

/**
 * The one door (Law 2). The only OkHttpClient in the app; every send is logged to SAKSHI
 * in plain words before the response comes back.
 */
class KavachClient(private val egress: EgressDao) {
    companion object {
        /** Doctor D10 asserts this stays at exactly 1. */
        val instances = AtomicInteger(0)
        private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()
    }

    init { instances.incrementAndGet() }

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .callTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /**
     * Circuit breaker: after a connection failure, a host is skipped for 20 s so an unreachable
     * cloud costs nothing (rules on the phone still decide). Doctor packets always try for real.
     */
    private val downUntil = java.util.concurrent.ConcurrentHashMap<String, Long>()

    private fun gw(path: String) = Config.now.gatewayUrl.trimEnd('/') + path
    private fun vivek(path: String) = Config.now.vivekUrl.trimEnd('/') + path

    private fun build(p: KavachPacket): Request? {
        val b = Request.Builder().header("X-Satya-App", BuildConfig.APP_KEY).header("Accept", "application/json")
        return when (p) {
            is KavachPacket.SyncReq -> b.url(gw("/api/v1/registry")).get()
            is KavachPacket.HerdLookup -> b.url(gw("/api/v1/herd/${p.prefix}")).get()
            is KavachPacket.HerdSighting -> b.url(gw("/api/v1/herd/sighting")).post(
                buildJsonObject { put("h", p.h); put("t", p.t); put("day_token", p.dayToken) }.toString().toRequestBody(JSON_TYPE),
            )
            is KavachPacket.AskLabel -> if (Config.now.vivekUrl.isBlank()) null else b.url(vivek("/v1/ask")).post(
                buildJsonObject { put("text", p.maskedText); put("hint_bank", p.hintBank?.let { JsonPrimitive(it) } ?: JsonPrimitive(null as String?)) }.toString().toRequestBody(JSON_TYPE),
            )
            is KavachPacket.FaceFrames -> if (Config.now.vivekUrl.isBlank()) null else b.url(vivek("/v1/face")).post(
                buildJsonObject { put("frames", JsonArray(p.frames.map { JsonPrimitive(java.util.Base64.getEncoder().encodeToString(it)) })) }.toString().toRequestBody(JSON_TYPE),
            )
            is KavachPacket.VoiceNote -> if (Config.now.vivekUrl.isBlank()) null else b.url(vivek("/v1/voice")).post(p.bytes.toRequestBody(p.mime.toMediaType()))
            is KavachPacket.Report -> b.url(gw("/api/v1/reports")).post(p.envelopeJson.toRequestBody(JSON_TYPE))
            is KavachPacket.StatusCheck -> b.url(gw("/api/v1/reports/${p.reportId}/status")).header("X-Satya-Ticket", p.ticket).get()
            is KavachPacket.DoctorSeal -> b.url(gw("/api/v1/doctor/seal")).post(buildJsonObject { put("sealed", p.sealedB64) }.toString().toRequestBody(JSON_TYPE))
            is KavachPacket.Health -> if (p.target == "vivek") { if (Config.now.vivekUrl.isBlank()) null else b.url(vivek("/health")).get() } else b.url(gw("/api/v1/health")).get()
            is KavachPacket.EchoHeaders -> b.url(gw("/api/v1/doctor/echo-headers")).get()
        }?.build()
    }

    private fun bodyBytes(p: KavachPacket): Long = when (p) {
        is KavachPacket.AskLabel -> p.maskedText.toByteArray().size.toLong()
        is KavachPacket.FaceFrames -> p.frames.sumOf { it.size }.toLong()
        is KavachPacket.VoiceNote -> p.bytes.size.toLong()
        is KavachPacket.Report -> p.envelopeJson.length.toLong()
        is KavachPacket.HerdLookup -> 5
        is KavachPacket.HerdSighting -> 200
        is KavachPacket.DoctorSeal -> p.sealedB64.length.toLong()
        is KavachPacket.StatusCheck -> 64
        else -> 0
    }

    suspend fun send(p: KavachPacket): KavachResponse = withContext(Dispatchers.IO) {
        val req = build(p) ?: return@withContext KavachResponse(0, null, "not configured")
        val host = req.url.host
        if (p.category != "doctor" && (downUntil[host] ?: 0L) > System.currentTimeMillis()) {
            return@withContext KavachResponse(0, null, "offline (recent failure)")
        }
        val result = suspendCancellableCoroutine<KavachResponse> { cont ->
            val call = http.newCall(req)
            cont.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) { if (cont.isActive) cont.resume(KavachResponse(0, null, e.message ?: "network error")) }
                override fun onResponse(call: Call, response: Response) {
                    val body = response.use { it.body.string() }
                    if (cont.isActive) cont.resume(KavachResponse(response.code, body))
                }
            })
        }
        if (result.code == 0) downUntil[host] = System.currentTimeMillis() + 20_000 else downUntil.remove(host)
        runCatching {
            egress.put(
                EgressEntity(
                    ts = System.currentTimeMillis(), checkId = p.checkId, protocol = p.protocol, destination = req.url.host,
                    packetType = p.packetType, bytes = bodyBytes(p), summary = p.summary, payload = p.payloadPreview,
                    category = p.category, ok = result.ok,
                ),
            )
        }
        result
    }

    fun json(body: String?) = body?.let { runCatching { Json.parseToJsonElement(it) }.getOrNull() }
}
