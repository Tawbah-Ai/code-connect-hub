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
import kotlinx.coroutines.*
import okhttp3.*
import okio.ByteString
import okio.ByteString.Companion.toByteString
import java.util.concurrent.TimeUnit

/**
 * Manages a persistent WebSocket connection to the Hybrid Control backend.
 * Receives commands as JSON, executes them via CommandEngine / TouchEngine,
 * and returns results over the same WebSocket.
 * Also relays raw binary JPEG frames from ScreenStreamService.
 */
class WebSocketManager(
    private val context: Context,
    private val commandEngine: CommandEngine,
    private val touchEngine: TouchEngine
) {
    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)   // no read timeout for WS
        .pingInterval(20, TimeUnit.SECONDS) // OkHttp-level ping
        .build()

    private var ws: WebSocket? = null
    private var isConnected = false
    private var shouldReconnect = true
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var reconnectJob: Job? = null
    private var heartbeatJob: Job? = null
    private var controlMode = ControlMode.HYBRID
    private val processingCommandIds = java.util.Collections.synchronizedSet(mutableSetOf<String>())

    private val connectionListeners =
        java.util.concurrent.CopyOnWriteArrayList<ConnectionListener>()

    interface ConnectionListener {
        fun onConnected()
        fun onDisconnected()
        fun onCommandReceived(command: RemoteCommand)
        fun onCommandResult(result: CommandResult)
        fun onError(error: String)
    }

    fun addConnectionListener(l: ConnectionListener) = connectionListeners.add(l)
    fun removeConnectionListener(l: ConnectionListener) = connectionListeners.remove(l)

    // ─── Public API ───────────────────────────────────────────────────────────

    fun connect(token: String) {
        shouldReconnect = true
        openWebSocket(token)
    }

    fun disconnect() {
        shouldReconnect = false
        reconnectJob?.cancel()
        heartbeatJob?.cancel()
        ws?.close(1000, "User logout")
        ws = null
        isConnected = false
    }

    fun isConnected(): Boolean = isConnected

    fun setControlMode(mode: ControlMode) { controlMode = mode }

    /** Send a raw JPEG frame to the dashboard (called from ScreenStreamService). */
    fun sendBinaryFrame(jpegBytes: ByteArray) {
        val socket = ws ?: return
        if (!isConnected) return
        try {
            socket.send(jpegBytes.toByteString())
        } catch (e: Exception) {
            Log.w(TAG, "sendBinaryFrame error: ${e.message}")
        }
    }

    // ─── WebSocket ────────────────────────────────────────────────────────────

    private fun openWebSocket(token: String) {
        val backendUrl = BuildConfig.BACKEND_URL.trimEnd('/')
        val wsUrl = backendUrl
            .replace("https://", "wss://")
            .replace("http://", "ws://")

        val request = Request.Builder()
            .url("$wsUrl/ws?token=${token}")
            .build()

        Log.d(TAG, "Connecting to $wsUrl/ws")

        ws = client.newWebSocket(request, object : WebSocketListener() {

            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "WebSocket connected")
                isConnected = true
                connectionListeners.forEach { it.onConnected() }
                startHeartbeat(token)

                // Announce this device to the server
                sendJson(mapOf(
                    "type" to "DEVICE_REGISTER",
                    "payload" to mapOf(
                        "deviceId" to HybridControlApp.instance.authManager.getDeviceId(),
                        "role" to (HybridControlApp.instance.authManager.deviceRole?.name ?: "CLIENT")
                    )
                ))
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleTextMessage(text)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                // Binary messages from backend (not expected, ignore)
                Log.d(TAG, "Received binary message (${bytes.size} bytes), ignoring")
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WS closing: $code $reason")
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WS closed: $code $reason")
                handleDisconnect(token)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WS failure: ${t.message}")
                connectionListeners.forEach { it.onError(t.message ?: "Connection error") }
                handleDisconnect(token)
            }
        })
    }

    // ─── Message handling ─────────────────────────────────────────────────────

    private fun handleTextMessage(text: String) {
        try {
            val type = object : TypeToken<Map<String, Any>>() {}.type
            val msg: Map<String, Any> = gson.fromJson(text, type)
            val msgType = msg["type"] as? String ?: return

            @Suppress("UNCHECKED_CAST")
            val payload = msg["payload"] as? Map<String, Any>

            when (msgType) {
                "COMMAND" -> {
                    if (payload == null) return
                    val cmdId = payload["id"] as? String ?: return
                    if (cmdId in processingCommandIds) return
                    val cmdType = payload["type"] as? String ?: return
                    @Suppress("UNCHECKED_CAST")
                    val cmdPayload = payload["payload"] as? Map<String, Any>
                    val fromDevice = payload["fromDeviceId"] as? String

                    val command = RemoteCommand(
                        id = cmdId,
                        type = cmdType,
                        payload = cmdPayload,
                        fromDeviceId = fromDevice
                    )
                    processingCommandIds.add(cmdId)
                    connectionListeners.forEach { it.onCommandReceived(command) }
                    scope.launch { executeCommand(command) }
                }

                "HEARTBEAT_ACK" -> {
                    Log.v(TAG, "Heartbeat ack received")
                }

                "REGISTERED" -> {
                    Log.d(TAG, "Device registration confirmed by server")
                }

                "ERROR" -> {
                    val errMsg = payload?.get("message") as? String ?: "Server error"
                    Log.e(TAG, "Server error: $errMsg")
                    connectionListeners.forEach { it.onError(errMsg) }
                }

                else -> Log.v(TAG, "Unknown message type: $msgType")
            }
        } catch (e: Exception) {
            Log.e(TAG, "handleTextMessage error: ${e.message}")
        }
    }

    // ─── Command execution ────────────────────────────────────────────────────

    private suspend fun executeCommand(command: RemoteCommand) {
        try {
            val result = when (controlMode) {
                ControlMode.COMMAND -> commandEngine.execute(command)
                ControlMode.TOUCH -> touchEngine.execute(command)
                ControlMode.HYBRID -> {
                    if (commandEngine.canHandle(command.type)) commandEngine.execute(command)
                    else touchEngine.execute(command)
                }
            }
            connectionListeners.forEach { it.onCommandResult(result) }
            sendCommandResult(result)
        } finally {
            processingCommandIds.remove(command.id)
        }
    }

    private fun sendCommandResult(result: CommandResult) {
        sendJson(mapOf(
            "type" to "COMMAND_RESULT",
            "payload" to mapOf(
                "commandId" to result.commandId,
                "type" to result.type,
                "success" to result.success,
                "data" to result.data,
                "error" to result.error,
                "fromDeviceId" to HybridControlApp.instance.authManager.getDeviceId()
            )
        ))
    }

    // ─── Heartbeat ────────────────────────────────────────────────────────────

    private fun startHeartbeat(token: String) {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive && isConnected) {
                delay(12_000)
                sendJson(mapOf(
                    "type" to "HEARTBEAT",
                    "payload" to mapOf("timestamp" to System.currentTimeMillis())
                ))
            }
        }
    }

    // ─── Reconnect ────────────────────────────────────────────────────────────

    private fun handleDisconnect(token: String) {
        if (isConnected) {
            isConnected = false
            heartbeatJob?.cancel()
            connectionListeners.forEach { it.onDisconnected() }
        }
        ws = null

        if (shouldReconnect) scheduleReconnect(token)
    }

    private fun scheduleReconnect(token: String) {
        if (reconnectJob?.isActive == true) return
        reconnectJob = scope.launch {
            var delay = INITIAL_RECONNECT_DELAY
            while (shouldReconnect && !isConnected) {
                Log.d(TAG, "Reconnecting in ${delay}ms...")
                delay(delay)
                if (!shouldReconnect) break
                val latestToken = try {
                    HybridControlApp.instance.authManager.getValidToken() ?: token
                } catch (e: Exception) { token }
                openWebSocket(latestToken)
                delay = (delay * 2).coerceAtMost(MAX_RECONNECT_DELAY)
                delay(2000) // give the socket time to connect before looping
            }
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private fun sendJson(data: Map<String, Any?>) {
        val socket = ws ?: return
        try {
            socket.send(gson.toJson(data))
        } catch (e: Exception) {
            Log.w(TAG, "sendJson error: ${e.message}")
        }
    }

    companion object {
        private const val TAG = "WebSocketManager"
        private const val INITIAL_RECONNECT_DELAY = 1_000L
        private const val MAX_RECONNECT_DELAY = 30_000L
    }
}
