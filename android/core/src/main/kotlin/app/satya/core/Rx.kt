package app.satya.core

/**
 * Regex building blocks that behave the same as Python 3 `re` on `str`, which is what
 * the oracle (spec/reference/\*.py) uses. Java's `\b`, `\d`, `\s` are ASCII-only on the
 * desktop JVM but Unicode on Android (ICU), so we never use them: every class is spelled
 * out with Unicode properties so the laptop tests and the phone agree with the oracle.
 */
internal object Rx {
    /** Python `\w` on str: letters, all numbers, underscore. */
    const val W = """[\p{L}\p{N}_]"""
    /** Python `\d` on str: Unicode decimal digits. */
    const val D = """\p{Nd}"""
    /** Python `\D`. */
    const val ND = """[^\p{Nd}]"""
    /** Python `\s` on str (ASCII whitespace + Unicode spaces). */
    const val S = """[\s\u001C-\u001F\u0085   -     　]"""
    /** Python `[^\s]`. */
    const val NS = """[^\s\u001C-\u001F\u0085   -     　]"""
    /** `\b` placed before a pattern that starts with a word character. */
    const val B_START = """(?<![\p{L}\p{N}_])"""
    /** `\b` placed after a pattern that ends with a word character. */
    const val B_END = """(?![\p{L}\p{N}_])"""

    const val EMAIL = """[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+"""
    const val UPI = """[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$B_END"""
    /** Link with the host captured in group 1 (rules use the host, masking uses the whole match). */
    const val LINK = """(?i)$B_START(?:https?://)?(?:www\.)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})(?:/$NS*)?"""

    /** Python int(c) for a Unicode decimal digit. */
    fun digitValue(c: Char): Int = Character.digit(c, 10)
}
