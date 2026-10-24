package app.satya.config

import android.content.Context
import android.os.Build
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import app.satya.BuildConfig
import app.satya.core.Hash
import app.satya.crypto.Sodium
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

private val Context.store by preferencesDataStore("satya")

/** Everything the user set on this phone. Nothing here leaves the phone. */
data class Settings(
    val onboarded: Boolean = false,
    val activated: Boolean = false,
    val myNames: Set<String> = emptySet(),
    val myPhones: Set<String> = emptySet(),
    /** "left", "right" or "auto" (auto = left on Samsung because of the One UI Edge Panel handle). */
    val edgeSide: String = "auto",
    /** Vertical centre of the edge strip, 0..1 of screen height. */
    val edgeY: Float = .5f,
    val edgeEnabled: Boolean = true,
    val hindiVoice: Boolean = true,
    val gatewayUrl: String = BuildConfig.GATEWAY_URL,
    val vivekUrl: String = BuildConfig.VIVEK_URL,
    val installSecretHex: String = "",
    val lastSync: Long = 0L,
    val lastPkgSeq: Int = 0,
) {
    val resolvedEdgeSide: String get() = if (edgeSide == "auto") (if (Config.isSamsung) "left" else "right") else edgeSide
    val installSecret: ByteArray get() = Hash.unhex(installSecretHex)
}

object Config {
    val isSamsung: Boolean = Build.MANUFACTURER.equals("samsung", ignoreCase = true)

    private object K {
        val onboarded = booleanPreferencesKey("onboarded")
        val activated = booleanPreferencesKey("activated")
        val myNames = stringSetPreferencesKey("my_names")
        val myPhones = stringSetPreferencesKey("my_phones")
        val edgeSide = stringPreferencesKey("edge_side")
        val edgeY = floatPreferencesKey("edge_y")
        val edgeEnabled = booleanPreferencesKey("edge_enabled")
        val hindiVoice = booleanPreferencesKey("hindi_voice")
        val gatewayUrl = stringPreferencesKey("gateway_url")
        val vivekUrl = stringPreferencesKey("vivek_url")
        val installSecret = stringPreferencesKey("install_secret")
        val lastSync = longPreferencesKey("last_sync")
        val lastPkgSeq = stringPreferencesKey("last_pkg_seq")
    }

    private lateinit var app: Context
    private val _state = MutableStateFlow(Settings())
    val state: StateFlow<Settings> = _state
    val now: Settings get() = _state.value

    /** Loads settings synchronously enough for services: call from Application.onCreate. */
    suspend fun init(context: Context) {
        app = context.applicationContext
        val p = app.store.data.first()
        var s = read(p)
        if (s.installSecretHex.length != 64) {
            // A random per-install secret: day tokens (Section 7.2) can't be linked across phones.
            val secret = Sodium.randomHex(32)
            app.store.edit { it[K.installSecret] = secret }
            s = s.copy(installSecretHex = secret)
        }
        _state.value = s
    }

    fun watch(scope: CoroutineScope) {
        scope.launch { app.store.data.collect { _state.value = read(it) } }
    }

    private fun read(p: Preferences) = Settings(
        onboarded = p[K.onboarded] ?: false,
        activated = p[K.activated] ?: false,
        myNames = p[K.myNames] ?: emptySet(),
        myPhones = p[K.myPhones] ?: emptySet(),
        edgeSide = p[K.edgeSide] ?: "auto",
        edgeY = p[K.edgeY] ?: .5f,
        edgeEnabled = p[K.edgeEnabled] ?: true,
        hindiVoice = p[K.hindiVoice] ?: true,
        gatewayUrl = p[K.gatewayUrl]?.takeIf { it.isNotBlank() } ?: BuildConfig.GATEWAY_URL,
        vivekUrl = p[K.vivekUrl]?.takeIf { it.isNotBlank() } ?: BuildConfig.VIVEK_URL,
        installSecretHex = p[K.installSecret] ?: "",
        lastSync = p[K.lastSync] ?: 0L,
        lastPkgSeq = p[K.lastPkgSeq]?.toIntOrNull() ?: 0,
    )

    suspend fun update(block: (MutablePrefs) -> Unit) {
        app.store.edit { prefs -> block(MutablePrefs(prefs)) }
    }

    class MutablePrefs(private val p: androidx.datastore.preferences.core.MutablePreferences) {
        var onboarded: Boolean by bool(K.onboarded)
        var activated: Boolean by bool(K.activated)
        var edgeEnabled: Boolean by bool(K.edgeEnabled, true)
        var hindiVoice: Boolean by bool(K.hindiVoice, true)
        fun names(v: Set<String>) { p[K.myNames] = v.map { it.trim() }.filter { it.length >= 3 }.toSet() }
        fun phones(v: Set<String>) { p[K.myPhones] = v.map { it.filter(Char::isDigit).takeLast(10) }.filter { it.length == 10 }.toSet() }
        fun edgeSide(v: String) { p[K.edgeSide] = v }
        fun edgeY(v: Float) { p[K.edgeY] = v.coerceIn(.15f, .85f) }
        fun gateway(v: String) { p[K.gatewayUrl] = v.trim().trimEnd('/') }
        fun vivek(v: String) { p[K.vivekUrl] = v.trim().trimEnd('/') }
        fun lastSync(v: Long) { p[K.lastSync] = v }
        fun lastPkgSeq(v: Int) { p[K.lastPkgSeq] = v.toString() }

        private fun bool(key: Preferences.Key<Boolean>, default: Boolean = false) = object : kotlin.properties.ReadWriteProperty<Any?, Boolean> {
            override fun getValue(thisRef: Any?, property: kotlin.reflect.KProperty<*>) = p[key] ?: default
            override fun setValue(thisRef: Any?, property: kotlin.reflect.KProperty<*>, value: Boolean) { p[key] = value }
        }
    }
}
