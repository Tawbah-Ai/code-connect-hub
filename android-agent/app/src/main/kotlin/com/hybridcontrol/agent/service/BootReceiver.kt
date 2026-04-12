package com.hybridcontrol.agent.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.hybridcontrol.agent.HybridControlApp

class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d(TAG, "Boot completed, checking if agent should start")

            val authManager = HybridControlApp.instance.authManager
            if (authManager.isLoggedIn) {
                val serviceIntent = Intent(context, AgentForegroundService::class.java).apply {
                    action = AgentForegroundService.ACTION_START
                }
                context.startForegroundService(serviceIntent)
            }
        }
    }

    companion object {
        private const val TAG = "BootReceiver"
    }
}
