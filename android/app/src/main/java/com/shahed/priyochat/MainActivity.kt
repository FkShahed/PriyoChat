package com.shahed.priyochat

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }
    window.addFlags(
      android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
      android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
      android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
      android.view.WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
    )

    super.onCreate(null)
    cancelCallNotificationIfNeeded(intent)
  }

  /**
   * When the user taps Answer / Decline on the native incoming-call notification, remove that
   * notification right away so the looping ringtone stops instantly (JS handles the rest).
   */
  private fun cancelCallNotificationIfNeeded(intent: android.content.Intent?) {
    try {
      val callAction = intent?.getStringExtra("callAction")
      if (callAction == "accept" || callAction == "decline") {
        val notifId = intent?.getIntExtra("notifId", 0) ?: 0
        if (notifId != 0) {
          val nm = getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
          nm.cancel(notifId)
        }
      }
    } catch (e: Exception) {
      // ignore
    }
  }

  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    cancelCallNotificationIfNeeded(intent)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
