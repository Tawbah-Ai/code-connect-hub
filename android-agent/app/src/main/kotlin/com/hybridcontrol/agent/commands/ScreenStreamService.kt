package com.hybridcontrol.agent.commands

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.IBinder
import android.util.Base64
import android.util.DisplayMetrics
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.gson.Gson
import com.hybridcontrol.agent.BuildConfig
import com.hybridcontrol.agent.HybridControlApp
import com.hybridcontrol.agent.R
import com.hybridcontrol.agent.ui.MainActivity
import kotlinx.coroutines.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.util.concurrent.TimeUnit

/**
 * Persistent foreground service that streams live screen frames to the dashboard
 * via Supabase Realtime Broadcast API at ~10fps.
 */
class ScreenStreamService : Service() {

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var streamJob: Job? = null
    private val gson = Gson()

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .callTimeout(10, TimeUnit.SECONDS)
        .build()

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "ScreenStreamService created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, -1)
                val projectionData: Intent? = intent.getParcelableExtra(EXTRA_PROJECTION_DATA)
                val deviceId = intent.getStringExtra(EXTRA_DEVICE_ID) ?: ""
                val token = intent.getStringExtra(EXTRA_TOKEN) ?: ""

                if (projectionData != null && resultCode != -1) {
                    startForeground(NOTIFICATION_ID, createNotification())
                    initProjection(resultCode, projectionData)
                    startStreaming(deviceId, token)
                } else {
                    Log.e(TAG, "Missing projection data, stopping service")
                    stopSelf()
                }
            }
            ACTION_STOP -> {
                stopStreaming()
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    private fun initProjection(resultCode: Int, data: Intent) {
        val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        mediaProjection = projectionManager.getMediaProjection(resultCode, data)

        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getMetrics(metrics)

        // Scale down to max 720 width for bandwidth efficiency
        val scale = minOf(1.0f, MAX_WIDTH.toFloat() / metrics.widthPixels)
        val captureWidth = (metrics.widthPixels * scale).toInt()
        val captureHeight = (metrics.heightPixels * scale).toInt()
        val density = metrics.densityDpi

        imageReader = ImageReader.newInstance(captureWidth, captureHeight, PixelFormat.RGBA_8888, 3)

        virtualDisplay = mediaProjection?.createVirtualDisplay(
            "ScreenStream",
            captureWidth, captureHeight, density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader!!.surface, null, null
        )

        Log.d(TAG, "VirtualDisplay created: ${captureWidth}x${captureHeight}")
    }

    private fun startStreaming(deviceId: String, token: String) {
        streamJob?.cancel()
        streamJob = scope.launch {
            // Give the VirtualDisplay time to warm up
            delay(300)
            Log.d(TAG, "Starting frame broadcast loop for device: $deviceId")

            while (isActive) {
                val frameStart = System.currentTimeMillis()
                try {
                    val image = imageReader?.acquireLatestImage()
                    if (image != null) {
                        val planes = image.planes
                        val buffer = planes[0].buffer
                        val pixelStride = planes[0].pixelStride
                        val rowStride = planes[0].rowStride
                        val width = image.width
                        val height = image.height
                        val rowPadding = rowStride - pixelStride * width

                        val bitmap = Bitmap.createBitmap(
                            width + rowPadding / pixelStride,
                            height,
                            Bitmap.Config.ARGB_8888
                        )
                        bitmap.copyPixelsFromBuffer(buffer)
                        image.close()

                        val cropped = if (rowPadding > 0) {
                            Bitmap.createBitmap(bitmap, 0, 0, width, height)
                        } else {
                            bitmap
                        }

                        val stream = ByteArrayOutputStream()
                        cropped.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream)
                        val base64Frame = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)

                        if (cropped !== bitmap) cropped.recycle()
                        bitmap.recycle()

                        broadcastFrame(deviceId, token, base64Frame)
                    }
                } catch (e: CancellationException) {
                    break
                } catch (e: Exception) {
                    Log.w(TAG, "Frame error: ${e.message}")
                }

                // Target ~10fps: sleep remaining time in 100ms budget
                val elapsed = System.currentTimeMillis() - frameStart
                val sleep = (FRAME_INTERVAL_MS - elapsed).coerceAtLeast(10)
                delay(sleep)
            }

            Log.d(TAG, "Frame broadcast loop ended")
        }
    }

    private fun broadcastFrame(deviceId: String, token: String, base64Frame: String) {
        try {
            val body = gson.toJson(mapOf(
                "messages" to listOf(
                    mapOf(
                        "topic" to "realtime:screen-$deviceId",
                        "event" to "screen-frame",
                        "payload" to mapOf("frame" to base64Frame)
                    )
                )
            ))

            val request = Request.Builder()
                .url("${BuildConfig.SUPABASE_URL}/realtime/v1/api/broadcast")
                .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Content-Type", "application/json")
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w(TAG, "Broadcast failed: ${response.code} ${response.body?.string()}")
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Broadcast error: ${e.message}")
        }
    }

    private fun stopStreaming() {
        streamJob?.cancel()
        streamJob = null
        virtualDisplay?.release()
        virtualDisplay = null
        imageReader?.close()
        imageReader = null
        mediaProjection?.stop()
        mediaProjection = null
        ScreenCaptureManager.isStreaming = false
        Log.d(TAG, "Streaming stopped")
    }

    private fun createNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Stop action
        val stopIntent = Intent(this, ScreenStreamService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, HybridControlApp.NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Screen Streaming Active")
            .setContentText("Live screen is being shared with the dashboard")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentIntent(pendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop Stream", stopPendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        stopStreaming()
        scope.cancel()
        Log.d(TAG, "ScreenStreamService destroyed")
    }

    companion object {
        private const val TAG = "ScreenStreamService"
        const val ACTION_START = "com.hybridcontrol.agent.STREAM_START"
        const val ACTION_STOP = "com.hybridcontrol.agent.STREAM_STOP"
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_PROJECTION_DATA = "projection_data"
        const val EXTRA_DEVICE_ID = "device_id"
        const val EXTRA_TOKEN = "token"
        private const val NOTIFICATION_ID = 1002
        private const val FRAME_INTERVAL_MS = 100L  // 10fps
        private const val JPEG_QUALITY = 55          // balance quality vs size
        private const val MAX_WIDTH = 720            // max capture width in pixels
    }
}
