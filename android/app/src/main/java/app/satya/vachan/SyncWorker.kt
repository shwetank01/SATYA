package app.satya.vachan

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.satya.AppGraph
import java.util.concurrent.TimeUnit

/** U8: registry + blocklist every 15 min (Android's minimum), report statuses, missed installs. */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val g = AppGraph.get(applicationContext)
        g.registry.sync()
        runCatching { g.statusPoller.pollAll() }
        runCatching { g.knowYourApp.scanChangedPackages { g.notifier.suspectApp(it) } }
        return Result.success()
    }

    companion object {
        const val NAME = "satya-sync"
        fun schedule(ctx: Context) {
            val c = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                NAME, ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).setConstraints(c).build(),
            )
        }
        fun now(ctx: Context) {
            val c = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            WorkManager.getInstance(ctx).enqueueUniqueWork("$NAME-now", ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(c).build())
        }
    }
}
