package expo.modules.appicons

import android.content.ComponentName
import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Android has no alternate icons as such: each icon is an <activity-alias> of MainActivity with its
// own icon (added by plugins/withAppIcons.js, named .AppIcon_<id>, "default" being the normal one),
// and the launcher shows whichever alias is enabled.
class AppIconsModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)

  private fun aliases(): List<String> {
    val pm = context.packageManager
    val flags = PackageManager.GET_ACTIVITIES or PackageManager.MATCH_DISABLED_COMPONENTS
    val info = pm.getPackageInfo(context.packageName, flags)
    return info.activities.orEmpty().map { it.name }.filter { it.contains(".AppIcon_") }
  }

  private fun idOf(alias: String) = alias.substringAfterLast(".AppIcon_").replace('_', '-')

  private fun enabled(alias: String): Boolean {
    val pm = context.packageManager
    return when (pm.getComponentEnabledSetting(ComponentName(context.packageName, alias))) {
      PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
      PackageManager.COMPONENT_ENABLED_STATE_DISABLED -> false
      // Not changed yet: as the manifest says (only the default alias starts enabled).
      else -> idOf(alias) == "default"
    }
  }

  override fun definition() = ModuleDefinition {
    Name("AppIcons")

    Function("current") {
      aliases().firstOrNull { enabled(it) }?.let { idOf(it) } ?: "default"
    }

    AsyncFunction("set") { id: String ->
      val pm = context.packageManager
      val all = aliases()
      val target = all.firstOrNull { idOf(it) == id } ?: return@AsyncFunction false
      // The new one first, so the app always has a launcher entry.
      pm.setComponentEnabledSetting(ComponentName(context.packageName, target), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
      for (alias in all) if (alias != target) {
        pm.setComponentEnabledSetting(ComponentName(context.packageName, alias), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
      }
      true
    }
  }
}
