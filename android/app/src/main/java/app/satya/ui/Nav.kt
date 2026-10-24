package app.satya.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.ui.unit.IntOffset
import app.satya.ui.theme.Motion

/** Every screen in the app (design data-screen-labels 00-09 + Setup, Activation, Doctor). */
sealed interface Route {
    /** How the screen enters: scrIn (page), pushIn (detail), sheetUp (sheet). */
    val enter: String get() = "page"

    data object Onboarding : Route
    data object Setup : Route
    data object Activation : Route
    data object Home : Route
    data class Checks(val filter: String = "all") : Route
    data class Receipt(val id: String) : Route { override val enter = "push" }
    data class Compose(val checkId: String) : Route { override val enter = "sheet" }
    data object Reports : Route
    data class ReportStatus(val localId: Long) : Route { override val enter = "push" }
    data class BankView(val localId: Long) : Route { override val enter = "sheet" }
    data object Apps : Route
    data class AppDetail(val pkg: String) : Route { override val enter = "push" }
    data object Privacy : Route
    data object Settings : Route
    data object Doctor : Route { override val enter = "push" }
    data object CheckNow : Route { override val enter = "sheet" }

    /** A string that survives the Activity being recreated (rotation, theme, process death). */
    val key: String get() = when (this) {
        is Checks -> "checks:$filter"
        is Receipt -> "receipt:$id"
        is Compose -> "compose:$checkId"
        is ReportStatus -> "report:$localId"
        is BankView -> "bankview:$localId"
        is AppDetail -> "app:$pkg"
        else -> this::class.simpleName.orEmpty()
    }

    companion object {
        private val SIMPLE: List<Route> = listOf(Onboarding, Setup, Activation, Home, Reports, Apps, Privacy, Settings, Doctor, CheckNow)
        fun parse(key: String): Route? {
            val (kind, arg) = key.split(':', limit = 2).let { it[0] to it.getOrElse(1) { "" } }
            return when (kind) {
                "checks" -> Checks(arg.ifBlank { "all" })
                "receipt" -> Receipt(arg)
                "compose" -> Compose(arg)
                "report" -> arg.toLongOrNull()?.let { ReportStatus(it) }
                "bankview" -> arg.toLongOrNull()?.let { BankView(it) }
                "app" -> AppDetail(arg)
                else -> SIMPLE.firstOrNull { it::class.simpleName == kind }
            }
        }
    }
}

/** A tiny back stack. Pages replace the stack above Home; details and sheets push. */
class Nav(start: Route) {
    val stack = mutableStateListOf(start)
    val top: Route get() = stack.last()

    fun go(r: Route) {
        // A double tap or a repeated deep link must not stack the same screen twice (one Back would
        // then appear to do nothing).
        if (stack.lastOrNull() == r) return
        when (r.enter) {
            "page" -> { stack.clear(); if (r != Route.Home && r != Route.Onboarding && r != Route.Setup && r != Route.Activation) stack.add(Route.Home); stack.add(r) }
            else -> stack.add(r)
        }
    }

    fun replaceTop(r: Route) { if (stack.size > 1) stack.removeAt(stack.lastIndex); stack.add(r) }
    fun back(): Boolean = if (stack.size > 1) { stack.removeAt(stack.lastIndex); true } else false
    fun reset(r: Route) { stack.clear(); stack.add(r) }

    fun save(): ArrayList<String> = ArrayList(stack.map { it.key })
    fun restore(keys: List<String>?) {
        val routes = keys.orEmpty().mapNotNull { Route.parse(it) }
        if (routes.isNotEmpty()) { stack.clear(); stack.addAll(routes) }
    }

    /** Deep links from notifications and overlays: "receipt:<id>", "compose:<id>", "report:<id>", "app:<pkg>". */
    fun open(target: String) {
        val (kind, arg) = target.split(':', limit = 2).let { it[0] to it.getOrElse(1) { "" } }
        when (kind) {
            "receipt" -> { reset(Route.Home); go(Route.Checks()); go(Route.Receipt(arg)) }
            "compose" -> { reset(Route.Home); go(Route.Checks()); go(Route.Receipt(arg)); go(Route.Compose(arg)) }
            "report" -> arg.toLongOrNull()?.let { reset(Route.Home); go(Route.Reports); go(Route.ReportStatus(it)) }
            "app" -> { reset(Route.Home); go(Route.Apps); go(Route.AppDetail(arg)) }
            "apps" -> go(Route.Apps)
            "doctor" -> go(Route.Doctor)
        }
    }
}

@Composable
fun NavHost(nav: Nav, content: @Composable (Route) -> Unit) {
    AnimatedContent(
        targetState = nav.stack.toList(),
        contentKey = { it.last() },
        transitionSpec = {
            val forward = targetState.size >= initialState.size
            val r = if (forward) targetState.last() else initialState.last()
            transition(r.enter, forward)
        },
        label = "nav",
    ) { stack -> content(stack.last()) }
}

private fun transition(kind: String, forward: Boolean): ContentTransform {
    val e = tween<IntOffset>(if (kind == "sheet") 360 else 300, easing = Motion.Ease)
    return when {
        !forward -> fadeIn(tween(200)) togetherWith fadeOut(tween(180))
        kind == "push" -> (slideInHorizontally(e) { 40 * 3 } + fadeIn(tween(300))) togetherWith fadeOut(tween(200))
        kind == "sheet" -> slideInVertically(e) { it } togetherWith fadeOut(tween(300))
        else -> (slideInVertically(tween(280, easing = Motion.Ease)) { 30 } + fadeIn(tween(280))) togetherWith fadeOut(tween(160))
    }
}
