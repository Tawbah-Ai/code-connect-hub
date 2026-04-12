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

class ScreenCaptureActivity : Activity() {

    private var mediaProjectionManager: MediaProjectionManager? = null
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var commandId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        commandId = intent.getStringExtra("command_id")
        mediaProjectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(mediaProjectionManager?.createScreenCaptureIntent(), REQUEST_CODE)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == REQUEST_CODE) {
            if (resultCode == RESULT_OK && data != null) {
                mediaProjection = mediaProjectionManager?.getMediaProjection(resultCode, data)
                captureScreen()
            } else {
                Log.e(TAG, "Screen capture permission denied")
                ScreenCaptureManager.captureCallback?.invoke(
                    commandId ?: "", false, "Permission denied"
                )
                ScreenCaptureManager.clearPending()
                finish()
            }
        }
    }

    private fun captureScreen() {
        val metrics = DisplayMetrics()
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
                croppedBitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
                val base64Image = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)

                ScreenCaptureManager.captureCallback?.invoke(commandId ?: "", true, base64Image)

                bitmap.recycle()
                croppedBitmap.recycle()
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
    }
}
