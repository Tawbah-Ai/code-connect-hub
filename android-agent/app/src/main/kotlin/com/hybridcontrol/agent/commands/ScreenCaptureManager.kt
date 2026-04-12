package com.hybridcontrol.agent.commands

import android.content.Context
import android.content.Intent
import android.util.Log

object ScreenCaptureManager {

    private var pendingCommandId: String? = null
    var captureCallback: ((String, Boolean, String?) -> Unit)? = null

    fun requestCapture(context: Context, commandId: String) {
        pendingCommandId = commandId
        val intent = Intent(context, ScreenCaptureActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra("command_id", commandId)
        }
        context.startActivity(intent)
    }

    fun getPendingCommandId(): String? = pendingCommandId

    fun clearPending() {
        pendingCommandId = null
    }
}
