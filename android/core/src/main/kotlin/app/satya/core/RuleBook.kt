package app.satya.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

enum class Severity(val wire: String, val rank: Int, val label: String, val labelHi: String) {
    NONE("none", 0, "None", "कोई नहीं"),
    MEDIUM("medium", 1, "Medium", "मध्यम"),
    HIGH("high", 2, "High", "ऊँचा"),
    CRITICAL("critical", 3, "Critical", "गंभीर");

    companion object {
        fun fromWire(s: String): Severity = entries.firstOrNull { it.wire == s } ?: NONE
    }
}

/** The `check` object of a promise. Only the fields its type uses are filled. */
data class CheckSpec(
    val type: String,
    val values: List<String> = emptyList(),
    val valuesHi: List<String> = emptyList(),
    val allowedSuffixes: List<String> = emptyList(),
    val prefixes: List<String> = emptyList(),
    val ifPlainMobile: String? = null,
    val if1600Selling: String? = null,
)

data class Promise(
    val id: String,
    val issuer: String,
    val text: String,
    val textHi: String?,
    val check: CheckSpec,
    val ifBroken: String,
    val killChainStage: Int,
    val source: String?,
    val verified: Boolean,
)

data class OfficialApp(val name: String, val pkg: String?, val certSha256: String?)

/** Everything the phone knows about one bank, from its verified Promise Card. */
data class BankCard(
    val id: String,
    val name: String,
    val nameHi: String?,
    val webDomains: List<String>,
    val extraAllowedLinkHosts: List<String>,
    val emailDomains: List<String>,
    val smsHeaders: List<String>,
    val service1600: List<String>,
    val promo140: List<String>,
    val inboundHelplines: List<String>,
    val officialApps: List<OfficialApp>,
    val promises: List<Promise>,
    val version: Int = 1,
    val hasBoxKey: Boolean = false,
)

data class ReportChannel(val id: String, val name: String, val phone: String?, val url: String?, val whenText: String?)

/** The full set of promises the phone checks against: GLOBAL card + one card per bank. */
data class RuleBook(
    val global: List<Promise>,
    val banks: List<BankCard>,
    val upiApps: List<OfficialApp> = emptyList(),
    val reportChannels: List<ReportChannel> = emptyList(),
) {
    fun bank(id: String?): BankCard? = banks.firstOrNull { it.id == id }
    val promiseCount: Int get() = global.size + banks.sumOf { it.promises.size }

    companion object {
        private val json = Json { ignoreUnknownKeys = true }

        /** spec/satya_bank_promises.json (the registry source, used by tests and seed). */
        fun fromRegistryJson(text: String): RuleBook {
            val root = json.parseToJsonElement(text).jsonObject
            val global = root.arr("global_promises").map { promise(it.jsonObject, "GLOBAL") }
            val banks = root.arr("banks").map { b ->
                val o = b.jsonObject
                val id = o.str("id")!!
                BankCard(
                    id = id, name = o.str("name") ?: id, nameHi = o.str("name_hi"),
                    webDomains = o.vals("web_domains"), extraAllowedLinkHosts = o.vals("extra_allowed_link_hosts"),
                    emailDomains = o.vals("email_domains"), smsHeaders = o.vals("sms_headers"),
                    service1600 = o.vals("service_1600"), promo140 = o.vals("promo_140"),
                    inboundHelplines = o.vals("inbound_helplines"), officialApps = apps(o["official_apps"]),
                    promises = o.arr("extra_promises").map { promise(it.jsonObject, id) },
                )
            }
            return RuleBook(global, banks, apps(root["upi_apps"]), channels(root["report_channels_india"]))
        }

        /** Section 9.1 card_json strings (already signature-verified by the caller). */
        fun fromCards(globalCardJson: String, bankCards: List<Pair<String, Boolean>>, versions: Map<String, Int> = emptyMap()): RuleBook {
            val g = json.parseToJsonElement(globalCardJson).jsonObject
            val global = g.arr("promises").map { promise(it.jsonObject, "GLOBAL") }
            val banks = bankCards.map { (cardJson, hasBox) ->
                val o = json.parseToJsonElement(cardJson).jsonObject
                val id = o.str("bank_id")!!
                BankCard(
                    id = id, name = o.str("name") ?: id, nameHi = o.str("name_hi"),
                    webDomains = o.vals("web_domains"), extraAllowedLinkHosts = o.vals("extra_allowed_link_hosts"),
                    emailDomains = o.vals("email_domains"), smsHeaders = o.vals("sms_headers"),
                    service1600 = o.vals("service_1600"), promo140 = o.vals("promo_140"),
                    inboundHelplines = o.vals("inbound_helplines"), officialApps = apps(o["official_apps"]),
                    promises = o.arr("promises").map { promise(it.jsonObject, id) },
                    version = versions[id] ?: 1, hasBoxKey = hasBox,
                )
            }
            return RuleBook(global, banks, apps(g["upi_apps"]), channels(g["report_channels"]))
        }

        private fun promise(o: JsonObject, issuer: String): Promise {
            val c = o["check"]!!.jsonObject
            return Promise(
                id = o.str("id")!!, issuer = issuer, text = o.str("promise") ?: "", textHi = o.str("promise_hi"),
                check = CheckSpec(
                    type = c.str("type")!!, values = c.list("values"), valuesHi = c.list("values_hi"),
                    allowedSuffixes = c.list("allowed_suffixes"), prefixes = c.list("prefixes"),
                    ifPlainMobile = c.str("if_plain_10_digit_mobile"), if1600Selling = c.str("if_1600_used_for_selling"),
                ),
                ifBroken = o.str("if_broken") ?: "high",
                killChainStage = (o["kill_chain_stage"] as? JsonPrimitive)?.intOrNull ?: 1,
                source = o.str("source"),
                verified = (o["verified"] as? JsonPrimitive)?.booleanOrNull ?: false,
            )
        }

        private fun apps(e: JsonElement?): List<OfficialApp> = (e as? JsonArray)?.map {
            val o = it.jsonObject
            OfficialApp(o.str("name") ?: "", o.str("package"), o.str("cert_sha256"))
        } ?: emptyList()

        private fun channels(e: JsonElement?): List<ReportChannel> = (e as? JsonArray)?.map {
            val o = it.jsonObject
            ReportChannel(o.str("id") ?: "", o.str("name") ?: "", o.str("phone"), o.str("url"), o.str("when"))
        } ?: emptyList()

        private fun JsonObject.str(k: String): String? = (this[k] as? JsonPrimitive)?.takeIf { it !is JsonNull && it.isString }?.content
        private fun JsonObject.arr(k: String): JsonArray = (this[k] as? JsonArray) ?: JsonArray(emptyList())
        private fun JsonObject.list(k: String): List<String> = (this[k] as? JsonArray)?.map { it.jsonPrimitive.content } ?: emptyList()
        /** Registry fields are `{values: [...]}` objects; card fields are plain arrays. Accept both. */
        private fun JsonObject.vals(k: String): List<String> = when (val e = this[k]) {
            is JsonArray -> e.map { it.jsonPrimitive.content }
            is JsonObject -> (e["values"] as? JsonArray)?.map { it.jsonPrimitive.content } ?: emptyList()
            else -> emptyList()
        }
    }
}
