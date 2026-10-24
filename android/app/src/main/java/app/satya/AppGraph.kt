package app.satya

import android.content.Context
import app.satya.doot.Doot
import app.satya.doot.StatusPoller
import app.satya.kavach.KavachClient
import app.satya.prahari.CallCheck
import app.satya.prahari.CheckRunner
import app.satya.prahari.KnowYourApp
import app.satya.prahari.RealityCheck
import app.satya.sakshi.SakshiDb
import app.satya.vachan.RegistryStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow

/** One instance per process: the whole app's wiring, no DI framework. */
class AppGraph private constructor(ctx: Context) {
    val app: Context = ctx.applicationContext
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val db: SakshiDb = SakshiDb.open(app)
    /** The one door. Created exactly once (Doctor D10). */
    val client = KavachClient(db.egress())
    val registry = RegistryStore(app, client)
    val reality = RealityCheck(app)
    val runner = CheckRunner(app, db, client, registry, reality, scope)
    val knowYourApp = KnowYourApp(app, registry, db)
    val callCheck = CallCheck(runner, registry)
    val doot = Doot(app, db, registry)
    val notifier = Notifier(app)
    val statusPoller = StatusPoller(db, client, registry) { rep, t, b -> notifier.reportUpdate(rep, t, b) }

    /** In-app navigation requests from services and notifications, e.g. "receipt:<id>". */
    val navigate = MutableSharedFlow<String>(extraBufferCapacity = 8)

    companion object {
        @Volatile private var instance: AppGraph? = null
        fun get(ctx: Context): AppGraph = instance ?: synchronized(this) { instance ?: AppGraph(ctx).also { instance = it } }
    }
}
