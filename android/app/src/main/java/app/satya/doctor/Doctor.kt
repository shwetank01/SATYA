package app.satya.doctor

import android.Manifest
import android.app.role.RoleManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import androidx.work.WorkInfo
import androidx.work.WorkManager
import app.satya.AppGraph
import app.satya.BuildConfig
import app.satya.core.Channel
import app.satya.core.Hash
import app.satya.core.Mask
import app.satya.core.Normalize
import app.satya.core.Rules
import app.satya.crypto.Sodium
import app.satya.drishti.Ocr
import app.satya.drishti.PhoneStateReceiver
import app.satya.drishti.SatyaA11yService
import app.satya.kavach.Kavach
import app.satya.kavach.KavachClient
import app.satya.sakshi.CheckEntity
import app.satya.vachan.SyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.sin

data class DoctorResult(val ok: Boolean, val detail: String, val ms: Long = 0, val thumb: Bitmap? = null)

class DoctorCheck(val id: String, val name: String, val network: Boolean, val run: suspend () -> DoctorResult)

/** Reliability over N runs: the per-feature success rate the Samsung test phone is judged on. */
data class Reliability(val id: String, val name: String, val runs: Int, val passes: Int, val medianMs: Long, val lastDetail: String) {
    val rate: Int get() = if (runs == 0) 0 else passes * 100 / runs
}

/** On-device Doctor (Section 17.2): D1-D19. */
class Doctor(private val ctx: Context) {
    private val g = AppGraph.get(ctx)
    private var lastSeal: Triple<String, String, String>? = null // (sha, sig, ok)
    private var thumb: Bitmap? = null

    private fun asset(name: String) = ctx.assets.open(name).bufferedReader().use { it.readText() }
    private fun has(p: String) = ctx.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED
    private fun ok(d: String) = DoctorResult(true, d)
    private fun fail(d: String) = DoctorResult(false, d)

    val checks: List<DoctorCheck> = listOf(
        DoctorCheck("D1", "Accessibility service connected", false) {
            if (SatyaA11yService.instance != null) ok("Connected") else fail("Off: Setup → Screen check")
        },
        DoctorCheck("D2", "Edge strip visible", false) {
            val s = SatyaA11yService.instance ?: return@DoctorCheck fail("Needs D1")
            if (s.stripVisible) ok("On the ${app.satya.config.Config.now.resolvedEdgeSide} edge") else fail("Not attached (turned off in Settings?)")
        },
        DoctorCheck("D3", "Screenshot works", false) {
            val s = SatyaA11yService.instance ?: return@DoctorCheck fail("Needs D1")
            val b = s.engine.screenshot() ?: return@DoctorCheck fail("takeScreenshot failed")
            thumb = b
            DoctorResult(true, "${b.width}×${b.height}", thumb = Bitmap.createScaledBitmap(b, b.width / 6, b.height / 6, true))
        },
        DoctorCheck("D4", "OCR reads the thumbnail", false) {
            val b = thumb ?: return@DoctorCheck fail("Needs D3")
            val t = Ocr.read(b)
            if (t.count { it.isLetter() } >= 4) ok("${t.length} characters read") else fail("No text recognised")
        },
        DoctorCheck("D5", "SMS permissions", false) {
            val r = has(Manifest.permission.RECEIVE_SMS); val rd = has(Manifest.permission.READ_SMS)
            if (r && rd) ok("RECEIVE_SMS + READ_SMS") else fail("Missing: ${listOfNotNull(if (!r) "RECEIVE_SMS" else null, if (!rd) "READ_SMS" else null).joinToString()}")
        },
        DoctorCheck("D6", "Call check active", false) {
            val rm = ctx.getSystemService(RoleManager::class.java)
            val role = runCatching { rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING) }.getOrDefault(false)
            val fb = PhoneStateReceiver.isEnabled(ctx) && has(Manifest.permission.READ_CALL_LOG)
            when { role -> ok("Call screening role held"); fb -> ok("Phone-state backup on (role unavailable)"); else -> fail("Neither role nor backup") }
        },
        DoctorCheck("D7", "Registry verified (6 cards)", false) {
            val reg = g.registry.now ?: g.registry.loadLocal() ?: return@DoctorCheck fail("No registry")
            val age = app.satya.ui.Fmt.ago(app.satya.config.Config.now.lastSync)
            if (reg.verifiedCards >= 6 && reg.rejected.isEmpty()) ok("${reg.verifiedCards} cards · ${reg.source} · synced $age") else fail("${reg.verifiedCards} cards, rejected: ${reg.rejected}")
        },
        DoctorCheck("D8", "Rules self-test (Appendix A)", false) {
            val book = g.registry.now?.book ?: return@DoctorCheck fail("No registry")
            val cases = Json.parseToJsonElement(asset("spec/rule_cases.json")).jsonObject["cases"]!!.jsonArray
            val bad = cases.mapNotNull { c ->
                val o = c.jsonObject
                val r = Rules.evaluate(book, o.s("text"), Channel.fromWire(o.s("channel")), o.s("sender"))
                val exp = o["expected"]!!.jsonArray.map { it.jsonPrimitive.content }.sorted()
                val claims = (o["claims"] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content
                val sev = o["severity"]!!.jsonObject.mapValues { it.value.jsonPrimitive.content }
                val got = r.hits.associate { it.id to it.severity.wire }
                if (r.ids.sorted() == exp && r.claimedBank == claims && sev.all { (k, v) -> got[k] == v }) null else o.s("id")
            }
            if (bad.isEmpty()) ok("${cases.size}/${cases.size} PASS") else fail("FAIL: ${bad.joinToString()}")
        },
        DoctorCheck("D9", "KAVACH masking (Appendix B)", false) {
            val vs = Json.parseToJsonElement(asset("spec/mask_vectors.json")).jsonObject["vectors"]!!.jsonArray
            val bad = vs.count { v ->
                val o = v.jsonObject
                Mask.mask(o.s("in"), o["my_names"]!!.jsonArray.map { it.jsonPrimitive.content }, o["my_phones"]!!.jsonArray.map { it.jsonPrimitive.content }) != o.s("out")
            }
            if (bad == 0) ok("${vs.size}/${vs.size} PASS") else fail("$bad vectors failed")
        },
        DoctorCheck("D10", "One door out", false) {
            val n = KavachClient.instances.get()
            if (n == 1) ok("Exactly 1 KavachClient") else fail("$n KavachClient instances")
        },
        DoctorCheck("D11", "SANGH lookup round trip", true) {
            val ind = Normalize.upi("doctor.${Sodium.randomHex(4)}@satya")
            val r = g.client.send(Kavach.herdLookup(ind, "doctor"))
            if (r.ok) ok("Prefix ${ind.prefix} answered") else fail(r.error ?: "HTTP ${r.code}")
        },
        DoctorCheck("D12", "DOOT seal opened by the gateway", true) {
            val pk = BuildConfig.DOCTOR_BOX_PK
            if (pk.length != 64) return@DoctorCheck fail("DOCTOR_BOX_PK not set in this build")
            val sealed = Sodium.seal("satya-doctor".toByteArray(), pk)
            val r = g.client.send(Kavach.doctorSeal(Sodium.b64(sealed)))
            val o = g.client.json(r.body) as? JsonObject
            val sha = o?.get("plaintext_sha256")?.jsonPrimitive?.contentOrNull
            val sig = o?.get("sig")?.jsonPrimitive?.contentOrNull
            if (r.ok && sha == Hash.sha256Hex("satya-doctor")) { lastSeal = Triple(sha, sig.orEmpty(), "ok"); ok("Gateway opened it: sha matches") }
            else fail(r.error ?: "HTTP ${r.code} ${r.body?.take(80)}")
        },
        DoctorCheck("D13", "Receipt signature + App. D vector", false) {
            val cv = Json.parseToJsonElement(asset("spec/crypto_vectors.json")).jsonObject["ed25519"]!!.jsonObject
            val vecOk = Sodium.verify(cv.s("message_utf8"), cv.s("signature_hex"), cv.s("pk_hex"))
            val seal = lastSeal
            val sigOk = seal?.let { Sodium.verify(Sodium.doctorMessage(it.first), it.second, BuildConfig.RECEIPT_PK) }
            when {
                !vecOk -> fail("Appendix D vector does not verify")
                sigOk == null -> DoctorResult(true, "Vector OK · run D12 for the live receipt")
                sigOk -> ok("Vector OK · receipt signed by RECEIPT_PK")
                else -> fail("Live receipt signature invalid")
            }
        },
        DoctorCheck("D14", "SATYA cloud: store + AI", true) {
            val r = g.client.send(Kavach.health("gateway"))
            val o = g.client.json(r.body) as? JsonObject
            val ai = (o?.get("ai") as? JsonObject)?.get("chat")?.jsonPrimitive?.contentOrNull
            val store = o?.get("store")?.jsonPrimitive?.contentOrNull == "true"
            if (r.ok && store && ai != null) ok("store on · AI $ai") else fail(if (o == null) r.error ?: "HTTP ${r.code}" else "store $store · AI ${ai ?: "off"}")
        },
        DoctorCheck("D15", "SATYA AI labels T02 as share_secret", true) {
            val t02 = "Main HDFC Bank se bol raha hoon, aapke card pe fraud hua hai, jo OTP aaya hai woh bata dijiye"
            val r = g.client.send(Kavach.askLabel(t02, "HDFC", null, "call", ""))
            val o = g.client.json(r.body) as? JsonObject
            val at = o?.get("ask_type")?.jsonPrimitive?.contentOrNull
            if (at == "share_secret") ok("share_secret · ${o["risk"]?.jsonPrimitive?.contentOrNull} (${o["model"]?.jsonPrimitive?.contentOrNull})") else fail("Got ${at ?: r.error ?: "HTTP ${r.code}"}")
        },
        DoctorCheck("D16", "Face score (VIVEK, optional)", true) {
            val r = g.client.send(Kavach.faceFrames(listOf(sampleJpeg()), null))
            val o = g.client.json(r.body) as? JsonObject
            if (r.ok && o?.containsKey("synthetic_score") == true) ok("score ${o["synthetic_score"]} · ${o["model_id"]?.jsonPrimitive?.contentOrNull}") else fail(r.error ?: "HTTP ${r.code}")
        },
        DoctorCheck("D17", "Voice note speech-to-text (sample clip)", true) {
            val r = g.client.send(Kavach.voiceNote(sampleWav(), "audio/wav", null))
            val o = g.client.json(r.body) as? JsonObject
            if (r.ok && o?.containsKey("transcript") == true) ok("STT ${o["stt_model"]?.jsonPrimitive?.contentOrNull} · tone = \"${o["transcript"]?.jsonPrimitive?.contentOrNull.orEmpty().take(30)}\"") else fail(r.error ?: "HTTP ${r.code}")
        },
        DoctorCheck("D18", "SAKSHI database writable", false) {
            withContext(Dispatchers.IO) {
                val id = "doctor-" + Sodium.randomHex(4)
                g.db.checks().put(CheckEntity(id, 0, "doctor", "screen", null, null, "none", "", "unknown", "{}"))
                val back = g.db.checks().get(id) != null
                g.db.checks().delete(id)
                if (back) ok("Write, read, delete OK") else fail("Read-back failed")
            }
        },
        DoctorCheck("D19", "SyncWorker scheduled", false) {
            val infos = withContext(Dispatchers.IO) { WorkManager.getInstance(ctx).getWorkInfosForUniqueWork(SyncWorker.NAME).get() }
            val live = infos.any { it.state == WorkInfo.State.ENQUEUED || it.state == WorkInfo.State.RUNNING }
            if (live) ok("Every 15 min · ${infos.first().state}") else fail("Not scheduled")
        },
    )

    suspend fun run(c: DoctorCheck): DoctorResult {
        val t0 = System.nanoTime()
        val r = runCatching { c.run() }.getOrElse { DoctorResult(false, it.message ?: it.javaClass.simpleName) }
        return r.copy(ms = (System.nanoTime() - t0) / 1_000_000)
    }

    /** Run each check [n] times; returns pass rate and median latency per feature. */
    suspend fun reliability(n: Int, onProgress: (String, Int) -> Unit): List<Reliability> = checks.map { c ->
        val times = ArrayList<Long>(); var passes = 0; var last = ""
        repeat(n) { i ->
            onProgress(c.id, i + 1)
            val r = run(c)
            times += r.ms; if (r.ok) passes++; last = r.detail
        }
        Reliability(c.id, c.name, n, passes, times.sorted()[times.size / 2], last)
    }

    private fun sampleJpeg(): ByteArray {
        val b = Bitmap.createBitmap(224, 224, Bitmap.Config.ARGB_8888)
        val cv = Canvas(b); cv.drawColor(Color.rgb(214, 196, 178))
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(196, 160, 140) }
        cv.drawOval(52f, 30f, 172f, 194f, p)
        p.color = Color.rgb(40, 30, 30); cv.drawCircle(88f, 100f, 8f, p); cv.drawCircle(136f, 100f, 8f, p); cv.drawRect(96f, 150f, 128f, 156f, p)
        return ByteArrayOutputStream().use { b.compress(Bitmap.CompressFormat.JPEG, 85, it); it.toByteArray() }
    }

    /** 1.5 s, 16 kHz mono, a 220 Hz tone: enough for VIVEK to decode and score. */
    private fun sampleWav(): ByteArray {
        val rate = 16000; val n = rate * 3 / 2
        val pcm = ByteBuffer.allocate(n * 2).order(ByteOrder.LITTLE_ENDIAN)
        for (i in 0 until n) pcm.putShort((sin(2 * PI * 220 * i / rate) * 8000).toInt().toShort())
        val h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        h.put("RIFF".toByteArray()); h.putInt(36 + n * 2); h.put("WAVE".toByteArray()); h.put("fmt ".toByteArray()); h.putInt(16)
        h.putShort(1); h.putShort(1); h.putInt(rate); h.putInt(rate * 2); h.putShort(2); h.putShort(16); h.put("data".toByteArray()); h.putInt(n * 2)
        return h.array() + pcm.array()
    }

    private fun JsonObject.s(k: String): String = (this[k] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content ?: ""
}
