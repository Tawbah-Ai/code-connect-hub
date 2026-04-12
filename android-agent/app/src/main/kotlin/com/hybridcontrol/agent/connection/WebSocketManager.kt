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
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Replaces WebSocket with Supabase Realtime subscriptions.
 * Polls the commands table for PENDING commands and executes them.
 * Updates device status via Supabase REST API.
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

        scope.launch {
            try {
                // Update device status to ONLINE
                updateDeviceStatus("ONLINE", token)

                isConnected = true
                connectionListener?.onConnected()

                // Start polling for commands
                startCommandPolling(token)

                // Start heartbeat (updates last_seen)
                startHeartbeat(token)

                Log.d(TAG, "Connected to Supabase")
            } catch (e: Exception) {
                Log.e(TAG, "Connection failed: ${e.message}")
                connectionListener?.onError(e.message ?: "Connection failed")
                handleDisconnect()
            }
        }
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

        try {
            client.newCall(request).execute()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to update device status: ${e.message}")
        }
    }

    private fun startCommandPolling(token: String) {
        commandPollJob?.cancel()
        commandPollJob = scope.launch {
            val authManager = HybridControlApp.instance.authManager
            val deviceUuid = authManager.getDeviceUuid()

            if (deviceUuid == null) {
                Log.e(TAG, "Device UUID not available, cannot poll for commands")
                return@launch
            }

            while (isActive && isConnected) {
                try {
                    // Query for PENDING commands targeting this device (using UUID PK)
                    val request = Request.Builder()
                        .url("${BuildConfig.SUPABASE_URL}/rest/v1/commands?device_id=eq.$deviceUuid&status=eq.PENDING&order=created_at.asc&limit=10")
                        .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                        .addHeader("Authorization", "Bearer $token")
                        .build()

                    val response = client.newCall(request).execute()
                    val body = response.body?.string()

                    if (response.isSuccessful && body != null) {
                        val type = object : TypeToken<List<Map<String, Any>>>() {}.type
                        val commands: List<Map<String, Any>> = gson.fromJson(body, type)

                        for (cmdMap in commands) {
                            val cmdId = cmdMap["id"] as? String ?: continue
                            val cmdType = cmdMap["type"] as? String ?: continue
                            @Suppress("UNCHECKED_CAST")
                            val payload = cmdMap["payload"] as? Map<String, Any>

                            val command = RemoteCommand(
                                id = cmdId,
                                type = cmdType,
                                payload = payload,
                                fromDeviceId = cmdMap["user_id"] as? String
                            )

                            connectionListener?.onCommandReceived(command)
                            executeCommand(command, token)
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Command poll error: ${e.message}")
                }

                delay(2000) // Poll every 2 seconds
            }
        }
    }

    private fun executeCommand(command: RemoteCommand, token: String) {
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
            updateCommandResult(command.id, result, token)
        }
    }

    private fun updateCommandResult(commandId: String, result: CommandResult, token: String) {
        try {
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
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Content-Type", "application/json")
                .addHeader("Prefer", "return=minimal")
                .patch(updateData.toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(request).execute()

            // Also write to logs table
            val authManager = HybridControlApp.instance.authManager
            val deviceUuid = authManager.getDeviceUuid()
            if (deviceUuid == null) {
                Log.w(TAG, "Device UUID not available, skipping log entry")
                return
            }
            val logData = gson.toJson(mapOf(
                "device_id" to deviceUuid,
                "user_id" to authManager.getUserId(),
                "message" to "Command ${result.type}: ${if (result.success) "SUCCESS" else "FAILED"}",
                "level" to if (result.success) "INFO" else "ERROR"
            ))

            val logRequest = Request.Builder()
                .url("${BuildConfig.SUPABASE_URL}/rest/v1/logs")
                .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Content-Type", "application/json")
                .post(logData.toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(logRequest).execute()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update command result: ${e.message}")
        }
    }

    private fun startHeartbeat(token: String) {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive && isConnected) {
                updateDeviceStatus("ONLINE", token)
                delay(15_000)
            }
        }
    }

    private fun handleDisconnect() {
        isConnected = false
        heartbeatJob?.cancel()
        commandPollJob?.cancel()
        connectionListener?.onDisconnected()

        if (shouldReconnect) {
            scheduleReconnect()
        }
    }

    private fun scheduleReconnect() {
        scope.launch {
            var delay = INITIAL_RECONNECT_DELAY
            while (shouldReconnect && !isConnected) {
                Log.d(TAG, "Reconnecting in ${delay}ms...")
                delay(delay)
                val token = HybridControlApp.instance.authManager.getAccessToken()
                if (token != null) {
                    connect(token)
                }
                delay = (delay * 2).coerceAtMost(MAX_RECONNECT_DELAY)
            }
        }
    }

    fun setControlMode(mode: ControlMode) {
        controlMode = mode
    }

    fun disconnect() {
        shouldReconnect = false
        heartbeatJob?.cancel()
        commandPollJob?.cancel()

        scope.launch {
            val token = HybridControlApp.instance.authManager.getAccessToken()
            if (token != null) {
                updateDeviceStatus("OFFLINE", token)
            }
        }

        isConnected = false
    }

    fun isConnected(): Boolean = isConnected

    companion object {
        private const val TAG = "SupabaseRealtimeManager"
        private const val INITIAL_RECONNECT_DELAY = 1000L
        private const val MAX_RECONNECT_DELAY = 30000L
    }
}
