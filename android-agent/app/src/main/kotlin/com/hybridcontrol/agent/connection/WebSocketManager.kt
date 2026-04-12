package com.hybridcontrol.agent.connection

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.hybridcontrol.agent.BuildConfig
import com.hybridcontrol.agent.HybridControlApp
import com.hybridcontrol.agent.commands.CommandEngine
import com.hybridcontrol.agent.model.*
import com.hybridcontrol.agent.touch.TouchEngine
import com.hybridcontrol.agent.util.DeviceUtils
import kotlinx.coroutines.*
import okhttp3.*
import java.util.concurrent.TimeUnit

class WebSocketManager(
    private val context: Context,
    private val commandEngine: CommandEngine,
    private val touchEngine: TouchEngine
) {

    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(15, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private var isConnected = false
    private var shouldReconnect = true
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var heartbeatJob: Job? = null
    private var reconnectJob: Job? = null
    private var controlMode = ControlMode.HYBRID

    var connectionListener: ConnectionListener? = null

    interface ConnectionListener {
        fun onConnected()
        fun onDisconnected()
        fun onCommandReceived(command: RemoteCommand)
        fun onCommandResult(result: CommandResult)
        fun onError(error: String)
    }

    fun connect(token: String) {
        shouldReconnect = true

        val request = Request.Builder()
            .url("${BuildConfig.WS_URL}/ws")
            .addHeader("Authorization", "Bearer $token")
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "WebSocket connected")
                isConnected = true
                connectionListener?.onConnected()
                startHeartbeat()
                sendDeviceRegistration()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d(TAG, "Message received: $text")
                handleMessage(text)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closing: $code $reason")
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closed: $code $reason")
                handleDisconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket failure: ${t.message}")
                connectionListener?.onError(t.message ?: "Connection failed")
                handleDisconnect()
            }
        })
    }

    private fun sendDeviceRegistration() {
        val authManager = HybridControlApp.instance.authManager
        val deviceInfo = DeviceUtils.getDeviceInfo(context)
        val message = mapOf(
            "type" to "DEVICE_REGISTER",
            "payload" to mapOf(
                "token" to authManager.getToken(),
                "deviceId" to deviceInfo.deviceId,
                "deviceName" to deviceInfo.deviceName,
                "model" to deviceInfo.model,
                "osVersion" to deviceInfo.osVersion,
                "sdkVersion" to deviceInfo.sdkVersion,
                "manufacturer" to deviceInfo.manufacturer
            )
        )
        send(gson.toJson(message))
    }

    private fun handleMessage(text: String) {
        try {
            val type = object : TypeToken<Map<String, Any>>() {}.type
            val message: Map<String, Any> = gson.fromJson(text, type)
            val messageType = message["type"] as? String ?: return

            when (messageType) {
                "COMMAND" -> {
                    val payloadMap = message["payload"] as? Map<String, Any>
                    val command = RemoteCommand(
                        id = payloadMap?.get("id") as? String ?: "",
                        type = payloadMap?.get("type") as? String ?: "",
                        payload = payloadMap?.get("payload") as? Map<String, Any>,
                        fromDeviceId = payloadMap?.get("fromDeviceId") as? String
                    )
                    connectionListener?.onCommandReceived(command)
                    executeCommand(command)
                }
                "HEARTBEAT_ACK" -> {
                    Log.d(TAG, "Heartbeat acknowledged")
                }
                "ERROR" -> {
                    val error = (message["payload"] as? Map<String, Any>)?.get("message") as? String
                    connectionListener?.onError(error ?: "Unknown error")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling message: ${e.message}")
        }
    }

    private fun executeCommand(command: RemoteCommand) {
        scope.launch {
            val result = when (controlMode) {
                ControlMode.COMMAND -> commandEngine.execute(command)
                ControlMode.TOUCH -> touchEngine.execute(command)
                ControlMode.HYBRID -> {
                    if (commandEngine.canHandle(command.type)) {
                        commandEngine.execute(command)
                    } else {
                        touchEngine.execute(command)
                    }
                }
            }

            connectionListener?.onCommandResult(result)
            sendCommandResult(result)
        }
    }

    private fun sendCommandResult(result: CommandResult) {
        val message = mapOf(
            "type" to "COMMAND_RESULT",
            "payload" to mapOf(
                "commandId" to result.commandId,
                "type" to result.type,
                "success" to result.success,
                "data" to result.data,
                "error" to result.error
            )
        )
        send(gson.toJson(message))
    }

    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive && isConnected) {
                val heartbeat = HeartbeatPayload(
                    deviceId = DeviceUtils.getDeviceId(context),
                    timestamp = System.currentTimeMillis(),
                    batteryLevel = DeviceUtils.getBatteryLevel(context),
                    isScreenOn = DeviceUtils.isScreenOn(context),
                    isUserActive = DeviceUtils.isScreenOn(context)
                )
                val message = mapOf(
                    "type" to "HEARTBEAT",
                    "payload" to heartbeat
                )
                send(gson.toJson(message))
                delay(15_000)
            }
        }
    }

    private fun handleDisconnect() {
        isConnected = false
        heartbeatJob?.cancel()
        connectionListener?.onDisconnected()

        if (shouldReconnect) {
            scheduleReconnect()
        }
    }

    private fun scheduleReconnect() {
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            var delay = INITIAL_RECONNECT_DELAY
            while (shouldReconnect && !isConnected) {
                Log.d(TAG, "Reconnecting in ${delay}ms...")
                delay(delay)
                val token = HybridControlApp.instance.authManager.getToken()
                if (token != null) {
                    connect(token)
                }
                delay = (delay * 2).coerceAtMost(MAX_RECONNECT_DELAY)
            }
        }
    }

    fun send(message: String): Boolean {
        return webSocket?.send(message) ?: false
    }

    fun setControlMode(mode: ControlMode) {
        controlMode = mode
    }

    fun disconnect() {
        shouldReconnect = false
        heartbeatJob?.cancel()
        reconnectJob?.cancel()
        webSocket?.close(1000, "User disconnected")
        webSocket = null
        isConnected = false
    }

    fun isConnected(): Boolean = isConnected

    companion object {
        private const val TAG = "WebSocketManager"
        private const val INITIAL_RECONNECT_DELAY = 1000L
        private const val MAX_RECONNECT_DELAY = 30000L
    }
}
