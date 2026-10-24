package app.satya.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** The same vectors the Python oracle passes (spec/). Kotlin must match byte for byte. */
class SpecVectorsTest {
    private val spec = File(System.getProperty("spec.dir") ?: "../../spec")
    private fun read(name: String) = Json.parseToJsonElement(File(spec, name).readText(Charsets.UTF_8)).jsonObject
    private val book by lazy { RuleBook.fromRegistryJson(File(spec, "satya_bank_promises.json").readText(Charsets.UTF_8)) }

    @Test
    fun ruleCases() {
        val cases = read("rule_cases.json")["cases"]!!.jsonArray
        assertTrue(cases.size >= 17, "expected at least 17 rule cases")
        val failures = mutableListOf<String>()
        for (c in cases) {
            val o = c.jsonObject
            val id = o.s("id")!!
            val r = Rules.evaluate(book, o.s("text") ?: "", Channel.fromWire(o.s("channel")!!), o.s("sender") ?: "")
            val expected = o["expected"]!!.jsonArray.map { it.jsonPrimitive.content }.sorted()
            val sev = o["severity"]!!.jsonObject.mapValues { it.value.jsonPrimitive.content }
            val claims = (o["claims"] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content
            val gotSev = r.hits.associate { it.id to it.severity.wire }
            val ok = r.ids.sorted() == expected && r.claimedBank == claims && sev.all { (k, v) -> gotSev[k] == v }
            if (!ok) failures += "$id: got bank=${r.claimedBank} hits=${r.hits.map { it.id to it.severity.wire }} expected bank=$claims $expected $sev"
        }
        assertTrue(failures.isEmpty(), failures.joinToString("\n"))
    }

    @Test
    fun maskVectors() {
        val vectors = read("mask_vectors.json")["vectors"]!!.jsonArray
        for (v in vectors) {
            val o = v.jsonObject
            val names = o["my_names"]!!.jsonArray.map { it.jsonPrimitive.content }
            val phones = o["my_phones"]!!.jsonArray.map { it.jsonPrimitive.content }
            assertEquals(o.s("out"), Mask.mask(o.s("in")!!, names, phones), "mask(${o.s("in")})")
        }
    }

    @Test
    fun hashVectors() {
        val root = read("hash_vectors.json")
        for (v in root["normalize_and_hash"]!!.jsonArray) {
            val o = v.jsonObject
            val ind = Normalize.of(IndicatorType.fromWire(o.s("type")!!), o.s("raw")!!)
            assertEquals(o.s("canonical"), ind.canonical, "canonical of ${o.s("raw")}")
            assertEquals(o.s("sha256"), ind.hash, "sha256 of ${ind.canonical}")
            assertEquals(o.s("prefix"), ind.prefix)
        }
        val d = root["day_token"]!!.jsonObject
        assertEquals(d.s("token"), Hash.dayToken(Hash.unhex(d.s("install_secret_hex")!!), d.s("day")!!, d.s("hash")!!))
        val t = root["ticket"]!!.jsonObject
        assertEquals(t.s("ticket_hash"), Hash.ticketHash(t.s("ticket")!!))
    }

    private fun JsonObject.s(k: String): String? = (this[k] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content
}
