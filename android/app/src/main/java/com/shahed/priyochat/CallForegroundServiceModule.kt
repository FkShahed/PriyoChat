package com.shahed.priyochat

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Bridges the call-keep-alive foreground service (see CallForegroundService) to JS.
 * Called from useWebRTCCall.js right after the local mic/camera stream is obtained, and stopped
 * from the same hook's cleanup() — exactly mirroring InCallManager.start()/stop() lifecycle, so it
 * can never outlive a call or linger after cleanup.
 */
class CallForegroundServiceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        // App swiped away from Recents mid-call -> ask JS to send call_end before the process exits
        CallForegroundService.onTaskRemovedListener = {
            try {
                reactContext
                    .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("PriyoCallTaskRemoved", null)
            } catch (e: Exception) {}
        }
    }

    override fun getName(): String = "CallForegroundServiceModule"

    // Required by NativeEventEmitter on the JS side (no-ops)
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    @ReactMethod
    fun start(isVideo: Boolean) {
        // Already running for this call: do nothing (avoids startForegroundService() without a
        // matching startForeground(), which Android can punish with a crash).
        if (CallForegroundService.isRunning) return
        CallForegroundService.stopRequested = false
        try {
            val ctx = reactApplicationContext
            val intent = Intent(ctx, CallForegroundService::class.java).apply {
                putExtra(CallForegroundService.EXTRA_IS_VIDEO, isVideo)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent)
            } else {
                ctx.startService(intent)
            }
        } catch (e: Exception) {
            // Best-effort: calling still works without this, just without the screen-off protection.
        }
    }

    @ReactMethod
    fun stop() {
        if (!CallForegroundService.isRunning) {
            // Not started yet (or never): if a start is in flight, the service stops itself right
            // after calling startForeground. Never call stopService before that (crash risk).
            CallForegroundService.stopRequested = true
            return
        }
        try {
            val ctx = reactApplicationContext
            ctx.stopService(Intent(ctx, CallForegroundService::class.java))
        } catch (e: Exception) {
            // ignore
        }
    }
}
