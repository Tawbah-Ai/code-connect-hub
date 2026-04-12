package com.hybridcontrol.agent

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.hybridcontrol.agent.auth.AuthManager
import com.hybridcontrol.agent.connection.WebSocketManager
import com.hybridcontrol.agent.commands.CommandEngine
import com.hybridcontrol.agent.touch.TouchEngine

class HybridControlApp : Application() {

    lateinit var authManager: AuthManager
        private set
    lateinit var webSocketManager: WebSocketManager
        private set
    lateinit var commandEngine: CommandEngine
        private set
    lateinit var touchEngine: TouchEngine
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this

        createNotificationChannel()

        authManager = AuthManager(this)
        commandEngine = CommandEngine(this)
        touchEngine = TouchEngine(this)
        webSocketManager = WebSocketManager(this, commandEngine, touchEngine)
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.notification_channel_description)
            setShowBadge(false)
        }

        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    companion object {
        const val NOTIFICATION_CHANNEL_ID = "hybrid_control_agent"
        const val NOTIFICATION_ID = 1001

        lateinit var instance: HybridControlApp
            private set
    }
}
