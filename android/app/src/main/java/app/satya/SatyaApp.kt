package app.satya

import android.app.Application
import androidx.work.Configuration
import app.satya.config.Config
import app.satya.crypto.Sodium
import app.satya.vachan.SyncWorker
import kotlinx.coroutines.runBlocking

class SatyaApp : Application(), Configuration.Provider {
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setMinimumLoggingLevel(android.util.Log.WARN).build()

    override fun onCreate() {
        super.onCreate()
        // Settings are tiny and services (SMS, calls) need them before the first await.
        runBlocking { Config.init(this@SatyaApp) }
        Sodium.init()
        val g = AppGraph.get(this)
        Config.watch(g.scope)
        g.notifier.createChannels()
        g.registry.loadLocal()
        SyncWorker.schedule(this)
    }
}
