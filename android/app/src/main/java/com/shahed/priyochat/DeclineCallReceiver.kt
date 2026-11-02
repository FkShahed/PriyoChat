package com.shahed.priyochat

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Handles the "Decline" button of the native incoming-call notification WITHOUT opening the app.
 *
 * 1. Removes the notification immediately (this also stops the looping ringtone).
 * 2. Tells the server to reject the call over HTTPS using the short-lived signed token that came
 *    with the call push, so the caller's call ends too. No login / JS runtime / socket needed.
 */
class DeclineCallReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val notifId = intent.getIntExtra("notifId", 0)
        val url = intent.getStringExtra("declineUrl")
        val token = intent.getStringExtra("declineToken")
        val callType = intent.getStringExtra("callType") ?: "audio"

        // Stop ringing right now
        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (notifId != 0) nm.cancel(notifId)
        } catch (e: Exception) {
            // ignore
        }

        if (url.isNullOrEmpty() || token.isNullOrEmpty()) return

        // Keep the receiver alive while the network request runs
        val pending = goAsync()
        Thread {
            try {
                var attempt = 0
                var done = false
                while (attempt < 3 && !done) {
                    attempt++
                    done = postDecline(url, token, callType)
                    if (!done && attempt < 3) {
                        try { Thread.sleep(800L) } catch (e: InterruptedException) {}
                    }
                }
            } finally {
                pending.finish()
            }
        }.start()
    }

    private fun postDecline(url: String, token: String, callType: String): Boolean {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 6000
                readTimeout = 6000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
            val body = JSONObject().put("token", token).put("callType", callType).toString()
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            code in 200..299
        } catch (e: Exception) {
            false
        } finally {
            try { conn?.disconnect() } catch (e: Exception) {}
        }
    }
}
