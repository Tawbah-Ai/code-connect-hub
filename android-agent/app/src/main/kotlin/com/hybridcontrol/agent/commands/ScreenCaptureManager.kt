package com.hybridcontrol.agent.commands

import android.content.Context
import android.content.Intent

object ScreenCaptureManager {

    private var pendingCommandId: String? = null
    var captureCallback: ((String, Boolean, String?) -> Unit)? = null
    var isStreaming: Boolean = false

    fun requestCapture(context: Context, commandId: String) {
        pendingCommandId = commandId
        val intent = Intent(context, ScreenCaptureActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra(ScreenCaptureActivity.EXTRA_COMMAND_ID, commandId)
            putExtra(ScreenCaptureActivity.EXTRA_MODE, ScreenCaptureActivity.MODE_SCREENSHOT)
        }
        context.startActivity(intent)
    }

    fun requestStream(context: Context, commandId: String) {
        pendingCommandId = commandId
        val intent = Intent(context, ScreenCaptureActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra(ScreenCaptureActivity.EXTRA_COMMAND_ID, commandId)
            putExtra(ScreenCaptureActivity.EXTRA_MODE, ScreenCaptureActivity.MODE_STREAM)
        }
        context.startActivity(intent)
    }

    fun stopStream(context: Context) {
        val intent = Intent(context, ScreenStreamService::class.java).apply {
            action = ScreenStreamService.ACTION_STOP
        }
        context.startService(intent)
        isStreaming = false
    }

    fun getPendingCommandId(): String? = pendingCommandId

    fun clearPending() {
        pendingCommandId = null
        captureCallback = null
    }
}
