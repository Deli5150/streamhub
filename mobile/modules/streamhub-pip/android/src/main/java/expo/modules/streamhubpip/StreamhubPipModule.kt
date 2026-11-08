package expo.modules.streamhubpip

import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Build
import android.util.Rational
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Android picture-in-picture for the whole app window. Android has no picture-in-picture for a
// single web page's video: the app's activity shrinks into the small window, and the app shows only
// the player while it's there (see src/ui/pip.ts). iPhones put the video itself into PiP instead.
class StreamhubPipModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StreamhubPip")

    Function("isSupported") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        appContext.reactContext?.packageManager?.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE) == true
    }

    Function("isActive") {
      appContext.currentActivity?.isInPictureInPictureMode == true
    }

    // Shrinks the app into the picture-in-picture window now. Resolves false if it couldn't.
    AsyncFunction("enter") { width: Int, height: Int ->
      val activity = appContext.currentActivity
      if (activity == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@AsyncFunction false
      try {
        activity.enterPictureInPictureMode(params(width, height, null))
      } catch (e: IllegalStateException) {
        false
      }
    }.runOnQueue(Queues.MAIN)

    // Android 12+: enter picture-in-picture by itself when the user leaves the app (home gesture)
    // while this is on. Resolves false where that isn't available.
    AsyncFunction("setAutoEnter") { enabled: Boolean, width: Int, height: Int ->
      val activity = appContext.currentActivity
      if (activity == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@AsyncFunction false
      try {
        activity.setPictureInPictureParams(params(width, height, enabled))
        true
      } catch (e: IllegalStateException) {
        false
      }
    }.runOnQueue(Queues.MAIN)
  }

  private fun params(width: Int, height: Int, autoEnter: Boolean?): PictureInPictureParams {
    val builder = PictureInPictureParams.Builder()
    // Android only accepts ratios between 1:2.39 and 2.39:1.
    if (width > 0 && height > 0) {
      val ratio = width.toDouble() / height
      if (ratio in 1 / 2.39..2.39) builder.setAspectRatio(Rational(width, height))
    }
    if (autoEnter != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setAutoEnterEnabled(autoEnter)
      builder.setSeamlessResizeEnabled(true)
    }
    return builder.build()
  }
}
