package com.hybridcontrol.agent.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.hybridcontrol.agent.HybridControlApp
import com.hybridcontrol.agent.R
import com.hybridcontrol.agent.connection.WebSocketManager
import com.hybridcontrol.agent.model.CommandResult
import com.hybridcontrol.agent.model.RemoteCommand
import com.hybridcontrol.agent.ui.MainActivity

class AgentForegroundService : Service() {

    private lateinit var webSocketManager: WebSocketManager

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Agent service created")
        webSocketManager = HybridControlApp.instance.webSocketManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startAgent()
            ACTION_STOP -> stopAgent()
        }
        return START_STICKY
    }

    private fun startAgent() {
        val notification = createNotification("Connecting...")
        startForeground(HybridControlApp.NOTIFICATION_ID, notification)

        val token = HybridControlApp.instance.authManager.getAccessToken()
        if (token != null) {
            webSocketManager.connectionListener = object : WebSocketManager.ConnectionListener {
                override fun onConnected() {
                    Log.d(TAG, "Connected to server")
                    updateNotification("Connected - Monitoring")
                }

                override fun onDisconnected() {
                    Log.d(TAG, "Disconnected from server")
                    updateNotification("Disconnected - Reconnecting...")
                }

                override fun onCommandReceived(command: RemoteCommand) {
                    Log.d(TAG, "Command received: ${command.type}")
                }

                override fun onCommandResult(result: CommandResult) {
                    Log.d(TAG, "Command result: ${result.type} - ${result.success}")
                }

                override fun onError(error: String) {
                    Log.e(TAG, "Error: $error")
                }
            }
            webSocketManager.connect(token)
        } else {
            Log.e(TAG, "No auth token available")
            stopSelf()
        }
    }

    private fun stopAgent() {
        webSocketManager.disconnect()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun createNotification(status: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, HybridControlApp.NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Hybrid Control Agent")
            .setContentText(status)
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun updateNotification(status: String) {
        val notification = createNotification(status)
        val manager = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
        manager.notify(HybridControlApp.NOTIFICATION_ID, notification)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        webSocketManager.disconnect()
        Log.d(TAG, "Agent service destroyed")
    }

    companion object {
        private const val TAG = "AgentService"
        const val ACTION_START = "com.hybridcontrol.agent.START"
        const val ACTION_STOP = "com.hybridcontrol.agent.STOP"
    }
}
