package expo.modules.streamhubupdater

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/** Shares downloaded updates with the system installer (its own class, so it can't clash with another library's). */
class UpdateFileProvider : FileProvider()

// Installing an update the app downloaded (src/lib/updater.ts): Android's own installer opens on
// the APK and asks to update StreamHub. The APK is signed with the same key, so it installs over
// the app and keeps its data. Android first needs "Install unknown apps" allowed for StreamHub.
class StreamhubUpdaterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StreamhubUpdater")

    // Whether StreamHub may open the installer (Android 8+ asks the user once, in Settings).
    Function("canInstall") {
      val context = appContext.reactContext ?: return@Function false
      Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()
    }

    // Opens StreamHub's "Install unknown apps" switch in Settings.
    Function("openInstallSettings") {
      val context = appContext.reactContext ?: return@Function false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function false
      val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      true
    }

    // Opens the system installer on a downloaded APK (a file:// URI or path in the cache's updates/).
    Function("install") { path: String ->
      val context = appContext.reactContext ?: return@Function false
      val file = File(Uri.parse(path).path ?: path)
      if (!file.exists()) return@Function false
      val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", file)
      val intent = Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, "application/vnd.android.package-archive")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      true
    }
  }
}
