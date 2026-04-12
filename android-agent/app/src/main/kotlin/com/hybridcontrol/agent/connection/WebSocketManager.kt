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
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Polls the Supabase commands table for PENDING commands and executes them.
 * Updates device status via Supabase REST API.
 * Automatically refreshes the Supabase JWT token when it is close to expiry.
 */
class WebSocketManager(
    private val context: Context,
    private val commandEngine: CommandEngine,
    private val touchEngine: TouchEngine
) {

    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private var isConnected = false
    private var shouldReconnect = true
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var heartbeatJob: Job? = null
    private var commandPollJob: Job? = null
    private var reconnectJob: Job? = null
    private var controlMode = ControlMode.HYBRID
    private val processingCommandIds = java.util.Collections.synchronizedSet(mutableSetOf<String>())
    private var consecutivePollFailures = 0
    private var consecutiveHeartbeatFailures = 0

    private val connectionListeners = java.util.concurrent.CopyOnWriteArrayList<ConnectionListener>()

    interface ConnectionListener {
        fun onConnected()
        fun onDisconnected()
        fun onCommandReceived(command: RemoteCommand)
        fun onCommandResult(result: CommandResult)
        fun onError(error: String)
    }

    fun addConnectionListener(listener: ConnectionListener) = connectionListeners.add(listener)
    fun removeConnectionListener(listener: ConnectionListener) = connectionListeners.remove(listener)

    fun connect(token: String) {
        shouldReconnect = true
        scope.launch {
            try {
                val authManager = HybridControlApp.instance.authManager

                // Ensure device UUID is available before starting
                authManager.ensureDeviceUuid(token)

                val validToken = authManager.getValidToken() ?: token
                updateDeviceStatus("ONLINE", validToken)
                isConnected = true
                connectionListeners.forEach { it.onConnected() }
                startCommandPolling()
                startHeartbeat()
                Log.d(TAG, "Connected to Supabase. DeviceUUID=${authManager.getDeviceUuid()}")
            } catch (e: Exception) {
                Log.e(TAG, "Connection failed: ${e.message}")
                connectionListeners.forEach { it.onError(e.message ?: "Connection failed") }
                handleDisconnect()
            }
        }
    }

    private suspend fun getAuthHeader(): String {
        val authManager = HybridControlApp.instance.authManager
        val token = authManager.getValidToken()
            ?: authManager.getAccessToken()
            ?: throw IllegalStateException("No access token available")
        return "Bearer $token"
    }

    private fun updateDeviceStatus(status: String, token: String) {
        val authManager = HybridControlApp.instance.authManager
        val deviceId = authManager.getDeviceId()
        val userId = authManager.getUserId() ?: return

        val updateData = gson.toJson(mapOf(
            "status" to status,
            "last_seen" to java.time.Instant.now().toString()
        ))

        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/devices?device_id=eq.$deviceId&user_id=eq.$userId")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $token")
            .addHeader("Content-Type", "application/json")
            .addHeader("Prefer", "return=minimal")
            .patch(updateData.toRequestBody("application/json".toMediaType()))
            .build()

        client.newCall(request).execute().use { }
    }

    private fun startCommandPolling() {
        commandPollJob?.cancel()
        commandPollJob = scope.launch {
            val authManager = HybridControlApp.instance.authManager

            while (isActive && isConnected) {
                try {
                    val deviceUuid = authManager.getDeviceUuid()
                    if (deviceUuid == null) {
                        // Try to recover UUID before giving up
                        val tok = authManager.getValidToken() ?: authManager.getAccessToken()
                        if (tok != null) authManager.ensureDeviceUuid(tok)
                        if (authManager.getDeviceUuid() == null) {
                            Log.e(TAG, "Device UUID not available, skipping poll cycle")
                            delay(5000)
                            continue
                        }
                    }

                    val authHeader = getAuthHeader()

                    val request = Request.Builder()
                        .url("${BuildConfig.SUPABASE_URL}/rest/v1/commands?device_id=eq.${authManager.getDeviceUuid()}&status=eq.PENDING&order=created_at.asc&limit=10")
                        .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                        .addHeader("Authorization", authHeader)
                        .build()

                    val response = client.newCall(request).execute()
                    val body = response.body?.string()

                    if (response.code == 401) {
                        // Token expired — force refresh
                        Log.w(TAG, "401 on poll, forcing token refresh")
                        val refreshToken = authManager.getRefreshToken()
                        if (refreshToken != null) {
                            try {
                                authManager.refreshAccessToken(refreshToken)
                            } catch (e: Exception) {
                                Log.e(TAG, "Forced refresh failed: ${e.message}")
                            }
                        }
                        delay(2000)
                        continue
                    }

                    if (response.isSuccessful && body != null) {
                        consecutivePollFailures = 0
                        val type = object : TypeToken<List<Map<String, Any>>>() {}.type
                        val commands: List<Map<String, Any>> = gson.fromJson(body, type)

                        for (cmdMap in commands) {
                            val cmdId = cmdMap["id"] as? String ?: continue
                            if (cmdId in processingCommandIds) continue
                            val cmdType = cmdMap["type"] as? String ?: continue
                            @Suppress("UNCHECKED_CAST")
                            val payload = cmdMap["payload"] as? Map<String, Any>

                            val command = RemoteCommand(
                                id = cmdId,
                                type = cmdType,
                                payload = payload,
                                fromDeviceId = cmdMap["user_id"] as? String
                            )

                            processingCommandIds.add(cmdId)
                            connectionListeners.forEach { it.onCommandReceived(command) }
                            executeCommand(command)
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Command poll error: ${e.message}")
                    consecutivePollFailures++
                    if (consecutivePollFailures >= MAX_CONSECUTIVE_FAILURES) {
                        Log.e(TAG, "Too many poll failures, reconnecting")
                        handleDisconnect()
                        return@launch
                    }
                }

                delay(2000)
            }
        }
    }

    private fun executeCommand(command: RemoteCommand) {
        scope.launch {
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
                updateCommandResult(command.id, result)
            } finally {
                processingCommandIds.remove(command.id)
            }
        }
    }

    private suspend fun updateCommandResult(commandId: String, result: CommandResult) {
        try {
            val authHeader = getAuthHeader()
            val authManager = HybridControlApp.instance.authManager

            val status = if (result.success) "EXECUTED" else "FAILED"
            val resultData = gson.toJson(mapOf(
                "success" to result.success,
                "data" to result.data,
                "error" to result.error
            ))

            val updateData = gson.toJson(mapOf(
                "status" to status,
                "result" to gson.fromJson(resultData, Map::class.java)
            ))

            val request = Request.Builder()
                .url("${BuildConfig.SUPABASE_URL}/rest/v1/commands?id=eq.$commandId")
                .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                .addHeader("Authorization", authHeader)
                .addHeader("Content-Type", "application/json")
                .addHeader("Prefer", "return=minimal")
                .patch(updateData.toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(request).execute().use { }

            // Log to logs table
            val deviceUuid = authManager.getDeviceUuid() ?: return
            val logData = gson.toJson(mapOf(
                "device_id" to deviceUuid,
                "user_id" to authManager.getUserId(),
                "message" to "Command ${result.type}: ${if (result.success) "SUCCESS" else "FAILED"}",
                "level" to if (result.success) "INFO" else "ERROR"
            ))

            val logRequest = Request.Builder()
                .url("${BuildConfig.SUPABASE_URL}/rest/v1/logs")
                .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                .addHeader("Authorization", authHeader)
                .addHeader("Content-Type", "application/json")
                .post(logData.toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(logRequest).execute().use { }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update command result: ${e.message}")
        }
    }

    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive && isConnected) {
                try {
                    val authHeader = getAuthHeader()
                    val authManager = HybridControlApp.instance.authManager
                    val deviceId = authManager.getDeviceId()
                    val userId = authManager.getUserId() ?: continue

                    val updateData = gson.toJson(mapOf(
                        "status" to "ONLINE",
                        "last_seen" to java.time.Instant.now().toString()
                    ))
                    val request = Request.Builder()
                        .url("${BuildConfig.SUPABASE_URL}/rest/v1/devices?device_id=eq.$deviceId&user_id=eq.$userId")
                        .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                        .addHeader("Authorization", authHeader)
                        .addHeader("Content-Type", "application/json")
                        .addHeader("Prefer", "return=minimal")
                        .patch(updateData.toRequestBody("application/json".toMediaType()))
                        .build()

                    client.newCall(request).execute().use { }
                    consecutiveHeartbeatFailures = 0
                } catch (e: Exception) {
                    Log.w(TAG, "Heartbeat failed: ${e.message}")
                    consecutiveHeartbeatFailures++
                    if (consecutiveHeartbeatFailures >= MAX_CONSECUTIVE_FAILURES) {
                        handleDisconnect()
                        return@launch
                    }
                }
                delay(15_000)
            }
        }
    }

    private fun handleDisconnect() {
        isConnected = false
        heartbeatJob?.cancel()
        commandPollJob?.cancel()
        connectionListeners.forEach { it.onDisconnected() }

        if (shouldReconnect && (reconnectJob == null || reconnectJob?.isActive != true)) {
            scheduleReconnect()
        }
    }

    private fun scheduleReconnect() {
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            var retryDelay = INITIAL_RECONNECT_DELAY
            while (shouldReconnect && !isConnected) {
                Log.d(TAG, "Reconnecting in ${retryDelay}ms...")
                delay(retryDelay)
                val authManager = HybridControlApp.instance.authManager
                val token = try {
                    authManager.getValidToken() ?: authManager.getAccessToken()
                } catch (e: Exception) {
                    authManager.getAccessToken()
                }

                if (token != null) {
                    try {
                        authManager.ensureDeviceUuid(token)
                        updateDeviceStatus("ONLINE", token)
                        isConnected = true
                        consecutivePollFailures = 0
                        consecutiveHeartbeatFailures = 0
                        connectionListeners.forEach { it.onConnected() }
                        startCommandPolling()
                        startHeartbeat()
                        Log.d(TAG, "Reconnected to Supabase")
                        return@launch
                    } catch (e: Exception) {
                        Log.e(TAG, "Reconnect failed: ${e.message}")
                        isConnected = false
                    }
                }
                retryDelay = (retryDelay * 2).coerceAtMost(MAX_RECONNECT_DELAY)
            }
        }
    }

    fun setControlMode(mode: ControlMode) { controlMode = mode }

    fun disconnect() {
        shouldReconnect = false
        reconnectJob?.cancel()
        heartbeatJob?.cancel()
        commandPollJob?.cancel()

        scope.launch {
            val token = try {
                HybridControlApp.instance.authManager.getValidToken()
                    ?: HybridControlApp.instance.authManager.getAccessToken()
            } catch (e: Exception) {
                HybridControlApp.instance.authManager.getAccessToken()
            }
            if (token != null) {
                try { updateDeviceStatus("OFFLINE", token) } catch (e: Exception) { }
            }
        }
        isConnected = false
    }

    fun isConnected(): Boolean = isConnected

    companion object {
        private const val TAG = "SupabaseRealtimeManager"
        private const val INITIAL_RECONNECT_DELAY = 1000L
        private const val MAX_RECONNECT_DELAY = 30000L
        private const val MAX_CONSECUTIVE_FAILURES = 3
    }
}
