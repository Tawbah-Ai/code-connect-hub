package com.hybridcontrol.agent.commands

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.DisplayMetrics
import android.util.Log
import java.io.ByteArrayOutputStream

/**
 * Transparent activity that requests MediaProjection permission.
 * Operates in two modes:
 *  - MODE_SCREENSHOT: captures one frame and returns it via callback
 *  - MODE_STREAM: passes the projection token to ScreenStreamService for live streaming
 */
class ScreenCaptureActivity : Activity() {

    private var mediaProjectionManager: MediaProjectionManager? = null
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var commandId: String? = null
    private var mode: String = MODE_SCREENSHOT

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        commandId = intent.getStringExtra(EXTRA_COMMAND_ID)
        mode = intent.getStringExtra(EXTRA_MODE) ?: MODE_SCREENSHOT
        mediaProjectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(mediaProjectionManager?.createScreenCaptureIntent(), REQUEST_CODE)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == REQUEST_CODE) {
            if (resultCode == RESULT_OK && data != null) {
                when (mode) {
                    MODE_STREAM -> startStream(resultCode, data)
                    else -> {
                        mediaProjection = mediaProjectionManager?.getMediaProjection(resultCode, data)
                        captureScreenshot()
                    }
                }
            } else {
                Log.e(TAG, "Screen capture permission denied")
                ScreenCaptureManager.captureCallback?.invoke(commandId ?: "", false, "Permission denied")
                ScreenCaptureManager.clearPending()
                finish()
            }
        }
    }

    private fun startStream(resultCode: Int, data: Intent) {
        val authManager = com.hybridcontrol.agent.HybridControlApp.instance.authManager
        val deviceId = authManager.getDeviceUuid() ?: ""
        val token = authManager.getAccessToken() ?: ""

        val serviceIntent = Intent(this, ScreenStreamService::class.java).apply {
            action = ScreenStreamService.ACTION_START
            putExtra(ScreenStreamService.EXTRA_RESULT_CODE, resultCode)
            putExtra(ScreenStreamService.EXTRA_PROJECTION_DATA, data)
            putExtra(ScreenStreamService.EXTRA_DEVICE_ID, deviceId)
            putExtra(ScreenStreamService.EXTRA_TOKEN, token)
        }
        startForegroundService(serviceIntent)
        ScreenCaptureManager.isStreaming = true
        ScreenCaptureManager.captureCallback?.invoke(commandId ?: "", true, "stream_started")
        ScreenCaptureManager.clearPending()
        finish()
    }

    private fun captureScreenshot() {
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getMetrics(metrics)
        val width = metrics.widthPixels
        val height = metrics.heightPixels
        val density = metrics.densityDpi

        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)

        virtualDisplay = mediaProjection?.createVirtualDisplay(
            "ScreenCapture",
            width, height, density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader!!.surface, null, null
        )

        Handler(Looper.getMainLooper()).postDelayed({
            val image: Image? = imageReader?.acquireLatestImage()
            if (image != null) {
                val planes = image.planes
                val buffer = planes[0].buffer
                val pixelStride = planes[0].pixelStride
                val rowStride = planes[0].rowStride
                val rowPadding = rowStride - pixelStride * width

                val bitmap = Bitmap.createBitmap(
                    width + rowPadding / pixelStride,
                    height,
                    Bitmap.Config.ARGB_8888
                )
                bitmap.copyPixelsFromBuffer(buffer)
                image.close()

                val croppedBitmap = Bitmap.createBitmap(bitmap, 0, 0, width, height)
                val stream = ByteArrayOutputStream()
                croppedBitmap.compress(Bitmap.CompressFormat.JPEG, 80, stream)
                val base64Image = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)

                ScreenCaptureManager.captureCallback?.invoke(commandId ?: "", true, base64Image)

                if (croppedBitmap !== bitmap) croppedBitmap.recycle()
                bitmap.recycle()
            } else {
                ScreenCaptureManager.captureCallback?.invoke(
                    commandId ?: "", false, "Failed to capture image"
                )
            }

            cleanup()
            finish()
        }, 500)
    }

    private fun cleanup() {
        virtualDisplay?.release()
        imageReader?.close()
        mediaProjection?.stop()
        ScreenCaptureManager.clearPending()
    }

    override fun onDestroy() {
        super.onDestroy()
        cleanup()
    }

    companion object {
        private const val TAG = "ScreenCaptureActivity"
        private const val REQUEST_CODE = 1001
        const val EXTRA_COMMAND_ID = "command_id"
        const val EXTRA_MODE = "mode"
        const val MODE_SCREENSHOT = "screenshot"
        const val MODE_STREAM = "stream"
    }
}
