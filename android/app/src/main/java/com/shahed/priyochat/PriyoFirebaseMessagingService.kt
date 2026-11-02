package com.shahed.priyochat

import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.delegates.FirebaseMessagingDelegate

class PriyoFirebaseMessagingService : FirebaseMessagingService() {

    private val expoDelegate by lazy {
        FirebaseMessagingDelegate(this as Context)
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        expoDelegate.onNewToken(token)
    }

    override fun onDeletedMessages() {
        super.onDeletedMessages()
        expoDelegate.onDeletedMessages()
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val dataMap: Map<String, String> = remoteMessage.data
        val type = dataMap["type"]

        // If incoming call, launch native full-screen incoming call notification with continuous ringtone!
        if (type == "call") {
            if (isAppInForeground()) {
                // User is actively in the app! In-app IncomingCallScreen handles ringing & answering.
                // Avoid starting a duplicate native insistent ringtone over the in-app sound.
                return
            }
            handleIncomingCall(dataMap)
            return
        }

        // For regular messages and other notifications, delegate to expo-notifications as usual
        try {
            expoDelegate.onMessageReceived(remoteMessage)
        } catch (e: Exception) {
            // Ignore delegate error
        }
    }

    private fun isAppInForeground(): Boolean {
        try {
            val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return false
            val appProcesses = activityManager.runningAppProcesses ?: return false
            val pkgName = packageName
            for (appProcess in appProcesses) {
                if (appProcess.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND &&
                    appProcess.processName == pkgName) {
                    return true
                }
            }
        } catch (e: Exception) {
            // Default to false on any exception
        }
        return false
    }

    private fun handleIncomingCall(data: Map<String, String>) {
        var fromId = data["from"] ?: data["callerId"] ?: data["senderId"] ?: ""
        var callerName = data["callerName"]
        if (callerName.isNullOrEmpty() || fromId.isEmpty()) {
            val callerRaw = data["caller"]
            if (!callerRaw.isNullOrEmpty()) {
                try {
                    val jsonObj = org.json.JSONObject(callerRaw)
                    if (callerName.isNullOrEmpty()) {
                        callerName = jsonObj.optString("name", "PriyoChat User")
                    }
                    if (fromId.isEmpty()) {
                        fromId = jsonObj.optString("_id", jsonObj.optString("id", ""))
                    }
                } catch (e: Exception) {
                    if (callerName.isNullOrEmpty()) callerName = "PriyoChat User"
                }
            } else {
                if (callerName.isNullOrEmpty()) callerName = "PriyoChat User"
            }
        }
        val callType = data["callType"] ?: "audio"
        val callId = data["callId"] ?: ("call_" + System.currentTimeMillis())

        val channelId = "priyo_incoming_calls_v8"
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Create high-priority call notification channel with system ringtone if Android 8.0+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val defaultRingtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .build()

            val channel = NotificationChannel(
                channelId,
                "Incoming Calls",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "High priority full screen incoming call alerts"
                setSound(defaultRingtoneUri, audioAttributes)
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 1000, 1000, 1000, 1000)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)
            }
            notificationManager.createNotificationChannel(channel)
        }

        // Wake lock to wake up the screen immediately
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            val wakeLock = powerManager.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "PriyoChat:IncomingCallWakeLock"
            )
            wakeLock.acquire(10000) // 10 seconds
        } catch (e: Exception) {
            // Ignore if wakelock fails
        }

        val encodedCallerName = try {
            java.net.URLEncoder.encode(callerName, "UTF-8")
        } catch (e: Exception) {
            "PriyoChat+User"
        }
        val uriString = "priyochat://call?callId=$callId&callerName=$encodedCallerName&callType=$callType&from=$fromId"

        // Intent to launch MainActivity in full screen
        val fullScreenIntent = Intent(this as Context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            setData(Uri.parse(uriString))
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("type", "call")
            putExtra("callId", callId)
            putExtra("callerName", callerName)
            putExtra("callType", callType)
            putExtra("from", fromId)
            for (entry in data.entries) {
                putExtra(entry.key, entry.value)
            }
        }

        val pendingIntent = PendingIntent.getActivity(
            this as Context,
            callId.hashCode(),
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val title = if (callType == "video") "📹 Incoming Video Call" else "📞 Incoming Call"
        val body = "$callerName is calling you..."

        val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val notificationBuilder = NotificationCompat.Builder(this as Context, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setOngoing(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true) // 👈 WAKES UP SCREEN & SHOWS FULL CALL ACTIVITY!
            .setSound(ringtoneUri)
            .setVibrate(longArrayOf(0, 1000, 1000, 1000, 1000))

        // Loop the ringtone until user answers or rejects
        val notification = notificationBuilder.build()
        notification.flags = notification.flags or Notification.FLAG_INSISTENT

        notificationManager.notify(callId.hashCode(), notification)
    }
}
