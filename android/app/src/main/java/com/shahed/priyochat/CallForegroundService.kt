package com.shahed.priyochat

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Keeps the app's process importance at "foreground" level for the whole duration of an active
 * call, so Android does not suspend microphone (and camera, for video calls) capture when the
 * screen turns off via the hardware power button.
 *
 * This is the standard, Google-documented fix for "the other person stops hearing me after I
 * press the power button during a call": on modern Android, continuous mic/camera access while
 * the Activity is not visible requires a foreground service declaring the matching
 * foregroundServiceType ("microphone" / "camera"). Without it, the OS is allowed to mute capture
 * once the screen is off, even though the call itself (WebRTC/ICE) stays connected — exactly what
 * was observed.
 *
 * Purely additive: does not touch WebRTC, signaling, or audio-routing (InCallManager) code. If
 * this service fails to start for any reason, calling behaves exactly as before (best-effort).
 */
class CallForegroundService : Service() {

    companion object {
        const val EXTRA_IS_VIDEO = "isVideo"
        private const val CHANNEL_ID = "call_fg_service_v1"
        private const val NOTIFICATION_ID = 7711

        /** True while the service is running in the foreground (start is idempotent). */
        @Volatile
        @JvmStatic
        var isRunning: Boolean = false
            private set

        /** Set when stop() arrives before the service finished starting (very short calls). */
        @Volatile
        @JvmStatic
        var stopRequested: Boolean = false

        /** Set by CallForegroundServiceModule: tells JS to hang up (call_end) before we exit. */
        @Volatile
        @JvmStatic
        var onTaskRemovedListener: (() -> Unit)? = null

        private const val TASK_REMOVED_EXIT_DELAY_MS = 1500L
    }

    /**
     * User swiped the app away from Recents during a call.
     *
     * Without this, the foreground service keeps the process alive with the Activity gone: the
     * call keeps running "headless" and leaves stale WebRTC/socket/store state behind, which then
     * breaks the next incoming calls (stuck "Connecting", missing/late call notifications,
     * "Unknown" caller). Before this service existed, swiping the app away simply killed the
     * process, so we restore exactly that behaviour, but cleanly: JS first sends call_end to the
     * other side, then the process exits so the next call starts from a fresh state.
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        try { onTaskRemovedListener?.invoke() } catch (e: Exception) {}
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            try { stopSelf() } catch (e: Exception) {}
            android.os.Process.killProcess(android.os.Process.myPid())
        }, TASK_REMOVED_EXIT_DELAY_MS)
        super.onTaskRemoved(rootIntent)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Already protecting this call: never re-run startForeground (it could be refused if the
        // screen is off right now, and a failure must never stop the protection already active).
        if (isRunning) return START_NOT_STICKY

        val isVideo = intent?.getBooleanExtra(EXTRA_IS_VIDEO, false) ?: false
        try {
            // Always call startForeground first (Android requires it after startForegroundService)
            startAsForeground(isVideo)
            isRunning = true
            // The call already ended while we were starting: stop right away
            if (stopRequested) {
                stopRequested = false
                stopSelf()
            }
        } catch (e: Exception) {
            // Best-effort only: if the OS refuses foreground start (e.g. rare OEM restriction),
            // the call still works exactly as before this feature existed.
            try { stopSelf() } catch (ignored: Exception) {}
        }
        return START_NOT_STICKY
    }

    private fun ensureChannel(nm: NotificationManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Ongoing Call (keep-alive)",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the call connected while the screen is off"
                setSound(null, null)
                enableVibration(false)
                enableLights(false)
            }
            nm.createNotificationChannel(channel)
        }
    }

    private fun startAsForeground(isVideo: Boolean) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        ensureChannel(nm)

        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.notification_icon)
            .setContentTitle("PriyoChat call in progress")
            .setContentText("Tap to return to the call")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setContentIntent(pendingIntent)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Android 14+: must explicitly pass the foreground service type(s) actually used now.
            var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            if (isVideo) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
            androidx.core.app.ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            if (isVideo) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
            startForeground(NOTIFICATION_ID, notification, type)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onDestroy() {
        isRunning = false
        super.onDestroy()
        try {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } catch (e: Exception) {
            // ignore
        }
    }
}
