package app.satya.core

/** Indicator types shared with the cloud (Section 7.2). */
enum class IndicatorType(val wire: String) {
    UPI("upi"), TEL("tel"), HOST("host"), APP("app"), ACCT("acct");

    companion object {
        fun fromWire(s: String): IndicatorType = entries.first { it.wire == s }
    }
}

/** A normalised scam indicator: canonical string, its sha256 and the 5-char k-anonymity prefix. */
data class Indicator(val type: IndicatorType, val canonical: String) {
    val hash: String by lazy { Hash.sha256Hex(canonical) }
    val prefix: String get() = Hash.prefix(hash)
    /** The value after the `type:` tag, e.g. `sbi.kyc@ybl`. */
    val value: String get() = canonical.substringAfter(':')
}

/**
 * Section 7.2 canonical forms. Kill only matches across phones and banks if every
 * platform produces byte-identical canonical strings, so these follow the table exactly
 * and are tested against spec/hash_vectors.json.
 */
object Normalize {
    fun upi(raw: String): Indicator = Indicator(IndicatorType.UPI, "upi:" + raw.trim().lowercase())

    fun telDigits(raw: String): String {
        var d = raw.filter { it in '0'..'9' }
        if (d.length == 12 && d.startsWith("91")) d = d.substring(2)
        else if (d.length == 11 && d.startsWith("0")) d = d.substring(1)
        return d
    }

    fun tel(raw: String): Indicator = Indicator(IndicatorType.TEL, "tel:" + telDigits(raw))

    /** Hostname only: no scheme, userinfo, port, path, query or fragment (paths can carry the user's tokens). */
    fun hostName(raw: String): String {
        var s = raw.trim().lowercase()
        s = s.replace(Regex("^[a-z][a-z0-9+.-]*://"), "")
        val cut = s.indexOfFirst { it == '/' || it == '?' || it == '#' }
        if (cut >= 0) s = s.substring(0, cut)
        s = s.substringAfterLast('@')
        s = s.replace(Regex(":\\d*$"), "")
        s = s.trimEnd('.')
        if (s.startsWith("www.")) s = s.substring(4)
        return s
    }

    fun host(raw: String): Indicator = Indicator(IndicatorType.HOST, "host:" + hostName(raw))

    fun app(certSha256Hex: String): Indicator = Indicator(IndicatorType.APP, "app:" + certSha256Hex.trim().lowercase())

    fun acct(account: String, ifsc: String): Indicator =
        Indicator(IndicatorType.ACCT, "acct:" + account.filter { it in '0'..'9' } + ":" + ifsc.trim().uppercase())

    /** For values typed as "account / ifsc" (test vectors) or "account:ifsc". */
    fun acctCombined(raw: String): Indicator {
        val parts = raw.split('/', ':').map { it.trim() }.filter { it.isNotEmpty() }
        require(parts.size == 2) { "acct needs account and IFSC" }
        return acct(parts[0], parts[1])
    }

    fun of(type: IndicatorType, raw: String): Indicator = when (type) {
        IndicatorType.UPI -> upi(raw)
        IndicatorType.TEL -> tel(raw)
        IndicatorType.HOST -> host(raw)
        IndicatorType.APP -> app(raw)
        IndicatorType.ACCT -> acctCombined(raw)
    }
}
