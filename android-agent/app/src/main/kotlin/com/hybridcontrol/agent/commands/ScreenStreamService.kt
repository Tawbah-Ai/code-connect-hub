package com.hybridcontrol.agent.commands

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Build
import android.os.IBinder
import android.util.DisplayMetrics
import android.util.Log
import androidx.core.app.NotificationCompat
import com.hybridcontrol.agent.HybridControlApp
import com.hybridcontrol.agent.R
import com.hybridcontrol.agent.ui.MainActivity
import kotlinx.coroutines.*
import java.io.ByteArrayOutputStream

/**
 * Persistent foreground service that streams live screen frames to the dashboard
 * via the backend WebSocket as raw binary JPEG data at ~10fps.
 */
class ScreenStreamService : Service() {

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var streamJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "ScreenStreamService created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val projection = ScreenCaptureManager.consumeProjection()
                if (projection != null) {
                    val notification = createNotification()
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        startForeground(
                            NOTIFICATION_ID,
                            notification,
                            ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                        )
                    } else {
                        startForeground(NOTIFICATION_ID, notification)
                    }
                    initProjection(projection)
                    startStreaming()
                } else {
                    Log.e(TAG, "No MediaProjection available, stopping service")
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

    private fun initProjection(projection: MediaProjection) {
        mediaProjection = projection

        val metrics: DisplayMetrics = resources.displayMetrics
        val scale = minOf(1.0f, MAX_WIDTH.toFloat() / metrics.widthPixels)
        val captureWidth = (metrics.widthPixels * scale).toInt()
        val captureHeight = (metrics.heightPixels * scale).toInt()

        imageReader = ImageReader.newInstance(captureWidth, captureHeight, PixelFormat.RGBA_8888, 3)

        virtualDisplay = mediaProjection?.createVirtualDisplay(
            "ScreenStream",
            captureWidth, captureHeight, metrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader!!.surface, null, null
        )

        Log.d(TAG, "VirtualDisplay created: ${captureWidth}x${captureHeight}")
    }

    private fun startStreaming() {
        streamJob?.cancel()
        streamJob = scope.launch {
            delay(300) // let VirtualDisplay warm up
            Log.d(TAG, "Starting frame broadcast loop")
            ScreenCaptureManager.isStreaming = true

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

                        val cropped = if (rowPadding > 0)
                            Bitmap.createBitmap(bitmap, 0, 0, width, height)
                        else bitmap

                        val stream = ByteArrayOutputStream()
                        cropped.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream)
                        val jpegBytes = stream.toByteArray()

                        if (cropped !== bitmap) cropped.recycle()
                        bitmap.recycle()

                        // Send raw JPEG bytes over the WebSocket — backend relays to dashboard
                        HybridControlApp.instance.webSocketManager.sendBinaryFrame(jpegBytes)
                    }
                } catch (e: CancellationException) {
                    break
                } catch (e: Exception) {
                    Log.w(TAG, "Frame error: ${e.message}")
                }

                val elapsed = System.currentTimeMillis() - frameStart
                delay((FRAME_INTERVAL_MS - elapsed).coerceAtLeast(10))
            }

            Log.d(TAG, "Frame broadcast loop ended")
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
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Stop Stream",
                stopPendingIntent
            )
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
        private const val FRAME_INTERVAL_MS = 100L  // ~10 fps
        private const val JPEG_QUALITY = 55
        private const val MAX_WIDTH = 720
    }
}
