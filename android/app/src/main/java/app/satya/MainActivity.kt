package app.satya

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import app.satya.config.Config
import app.satya.ui.Nav
import app.satya.ui.NavHost
import app.satya.ui.Route
import app.satya.ui.Toaster
import app.satya.ui.overlay.ToastOverlay
import app.satya.ui.screens.ActivationScreen
import app.satya.ui.screens.AppDetailScreen
import app.satya.ui.screens.AppsScreen
import app.satya.ui.screens.BankViewScreen
import app.satya.ui.screens.CheckNowScreen
import app.satya.ui.screens.ChecksScreen
import app.satya.ui.screens.ComposeScreen
import app.satya.ui.screens.DoctorScreen
import app.satya.ui.screens.HomeScreen
import app.satya.ui.screens.OnboardingScreen
import app.satya.ui.screens.PrivacyScreen
import app.satya.ui.screens.ReceiptScreen
import app.satya.ui.screens.ReportStatusScreen
import app.satya.ui.screens.ReportsScreen
import app.satya.ui.screens.SettingsScreen
import app.satya.ui.screens.SetupScreen
import app.satya.ui.theme.Satya
import app.satya.ui.theme.SatyaTheme
import app.satya.vachan.SyncWorker
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private companion object { const val STATE_STACK = "satya.nav.stack" }
    private var nav: Nav? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val g = AppGraph.get(this)
        val s = Config.now
        val start: Route = when {
            !s.onboarded -> Route.Onboarding
            else -> Route.Home
        }
        val n = Nav(start)
        nav = n
        if (savedInstanceState != null) n.restore(savedInstanceState.getStringArrayList(STATE_STACK))
        else intent?.getStringExtra(Notifier.EXTRA_OPEN)?.let { if (s.onboarded) n.open(it) }
        setContent {
            SatyaTheme {
                val toast by Toaster.text.collectAsState()
                val top = n.top
                LaunchedEffect(top) { applyBars(top) }
                BackHandler(enabled = n.stack.size > 1) { n.back() }
                Box(Modifier.fillMaxSize().background(Satya.Paper)) {
                    NavHost(n) { r ->
                        when (r) {
                            Route.Onboarding -> OnboardingScreen(n)
                            Route.Setup -> SetupScreen(n)
                            Route.Activation -> ActivationScreen(n)
                            Route.Home -> HomeScreen(n)
                            is Route.Checks -> ChecksScreen(n, r.filter)
                            is Route.Receipt -> ReceiptScreen(n, r.id)
                            is Route.Compose -> ComposeScreen(n, r.checkId)
                            Route.Reports -> ReportsScreen(n)
                            is Route.ReportStatus -> ReportStatusScreen(n, r.localId)
                            is Route.BankView -> BankViewScreen(n, r.localId)
                            Route.Apps -> AppsScreen(n)
                            is Route.AppDetail -> AppDetailScreen(n, r.pkg)
                            Route.Privacy -> PrivacyScreen(n)
                            Route.Settings -> SettingsScreen(n)
                            Route.Doctor -> DoctorScreen(n)
                            Route.CheckNow -> CheckNowScreen(n)
                        }
                    }
                    toast?.let { ToastOverlay(it) }
                }
            }
        }
        // U6 status polling and U8 sync on app open.
        lifecycleScope.launch {
            runCatching { g.statusPoller.pollAll() }
        }
        SyncWorker.now(this)
    }

    private fun applyBars(r: Route) {
        val dark = r is Route.Onboarding || r is Route.Activation || r is Route.Reports || r is Route.BankView
        enableEdgeToEdge(
            statusBarStyle = if (dark) SystemBarStyle.dark(android.graphics.Color.TRANSPARENT) else SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
            navigationBarStyle = if (dark) SystemBarStyle.dark(android.graphics.Color.TRANSPARENT) else SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
        )
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        nav?.let { outState.putStringArrayList(STATE_STACK, it.save()) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(Notifier.EXTRA_OPEN)?.let { t -> nav?.let { if (Config.now.onboarded) it.open(t) } }
    }
}
