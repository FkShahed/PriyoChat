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
import androidx.core.app.Person
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

        // Caller hung up / cancelled while this phone was ringing: remove the native call
        // notification (this also stops the looping ringtone).
        if (type == "call_cancel") {
            val cancelCallId = dataMap["callId"]
            if (!cancelCallId.isNullOrEmpty()) {
                try {
                    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    nm.cancel(cancelCallId.hashCode())
                } catch (e: Exception) {
                    // ignore
                }
            }
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
        val notificationId = callId.hashCode()
        val baseUri = "priyochat://call?callId=$callId&callerName=$encodedCallerName&callType=$callType&from=$fromId"

        // Builds an Intent that opens MainActivity with the call deep link.
        // callAction: "" (open the incoming-call screen), "accept" or "decline".
        fun buildCallIntent(callAction: String): Intent {
            val uri = if (callAction.isEmpty()) baseUri else "$baseUri&action=$callAction"
            return Intent(this as Context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                setData(Uri.parse(uri))
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
                // Read by MainActivity to cancel the notification instantly (stops the ringtone)
                putExtra("callAction", callAction)
                putExtra("notifId", notificationId)
            }
        }

        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

        // Tapping the notification body / full-screen intent: original behaviour (incoming call screen)
        val pendingIntent = PendingIntent.getActivity(
            this as Context, notificationId, buildCallIntent(""), pendingFlags
        )
        // Answer button
        val answerIntent = PendingIntent.getActivity(
            this as Context, notificationId + 1, buildCallIntent("accept"), pendingFlags
        )
        // Decline button: rejects the call in the background (no app UI) via DeclineCallReceiver.
        // Falls back to opening the app only if the server did not send a decline token.
        val declineToken = data["declineToken"]
        val declineUrl = data["declineUrl"]
        val declineIntent = if (!declineToken.isNullOrEmpty() && !declineUrl.isNullOrEmpty()) {
            val declineBroadcast = Intent(this as Context, DeclineCallReceiver::class.java).apply {
                putExtra("notifId", notificationId)
                putExtra("declineToken", declineToken)
                putExtra("declineUrl", declineUrl)
                putExtra("callType", callType)
            }
            PendingIntent.getBroadcast(this as Context, notificationId + 2, declineBroadcast, pendingFlags)
        } else {
            PendingIntent.getActivity(
                this as Context, notificationId + 2, buildCallIntent("decline"), pendingFlags
            )
        }

        val subtitle = if (callType == "video") "PriyoChat video call" else "PriyoChat audio call"

        val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val caller = Person.Builder()
            .setName(callerName)
            .setImportant(true)
            .build()

        val notificationBuilder = NotificationCompat.Builder(this as Context, channelId)
            .setSmallIcon(R.drawable.notification_icon)
            .setColor(0xFF0084FF.toInt())
            .setContentTitle(callerName)
            .setContentText(subtitle)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setOngoing(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true) // WAKES UP SCREEN & SHOWS FULL CALL ACTIVITY
            .setSound(ringtoneUri)
            .setVibrate(longArrayOf(0, 1000, 1000, 1000, 1000))
            .setTimeoutAfter(45000) // auto-clear if the call is never answered
            // Professional call layout with green Answer / red Decline buttons. Android 12+ renders
            // it natively; older versions fall back to two standard action buttons.
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declineIntent, answerIntent))

        // Loop the ringtone until user answers or rejects
        val notification = notificationBuilder.build()
        notification.flags = notification.flags or Notification.FLAG_INSISTENT

        notificationManager.notify(notificationId, notification)
    }
}
