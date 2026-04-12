package com.hybridcontrol.agent.auth

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.hybridcontrol.agent.BuildConfig
import com.hybridcontrol.agent.model.DeviceRole
import com.hybridcontrol.agent.util.DeviceUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class AuthManager(private val context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("hybrid_control_auth", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    val isLoggedIn: Boolean
        get() = getAccessToken()?.isNotEmpty() == true

    val userEmail: String?
        get() = prefs.getString(KEY_EMAIL, null)

    val deviceRole: DeviceRole?
        get() = prefs.getString(KEY_ROLE, null)?.let { DeviceRole.valueOf(it) }

    fun getAccessToken(): String? = prefs.getString(KEY_ACCESS_TOKEN, null)

    fun getUserId(): String? = prefs.getString(KEY_USER_ID, null)

    fun getDeviceId(): String = DeviceUtils.getDeviceId(context)

    fun getDeviceUuid(): String? = prefs.getString(KEY_DEVICE_UUID, null)

    suspend fun login(email: String, password: String, pairingCode: String = "") = withContext(Dispatchers.IO) {
        val json = gson.toJson(mapOf("email" to email, "password" to password))

        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/auth/v1/token?grant_type=password")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Content-Type", "application/json")
            .post(json.toRequestBody("application/json".toMediaType()))
            .build()

        val response = client.newCall(request).execute()
        val body = response.body?.string()
            ?: throw Exception("Empty response from server")

        if (!response.isSuccessful) {
            val errorMap = parseJson(body)
            val errorMsg = errorMap["error_description"] as? String
                ?: errorMap["msg"] as? String
                ?: "Login failed"
            throw Exception(errorMsg)
        }

        val result = parseJson(body)
        val accessToken = result["access_token"] as? String
            ?: throw Exception("No access token in response")
        val userId = (result["user"] as? Map<*, *>)?.get("id") as? String
            ?: throw Exception("No user ID in response")

        saveAuthData(email, accessToken, userId)
        if (pairingCode.isNotBlank()) {
            claimPairingCode(accessToken, pairingCode.filter { it.isDigit() })
        } else {
            registerDevice(accessToken, userId)
        }
    }

    suspend fun register(email: String, password: String, pairingCode: String = "") = withContext(Dispatchers.IO) {
        val json = gson.toJson(mapOf("email" to email, "password" to password))

        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/auth/v1/signup")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Content-Type", "application/json")
            .post(json.toRequestBody("application/json".toMediaType()))
            .build()

        val response = client.newCall(request).execute()
        val body = response.body?.string()
            ?: throw Exception("Empty response from server")

        if (!response.isSuccessful) {
            val errorMap = parseJson(body)
            val errorMsg = errorMap["error_description"] as? String
                ?: errorMap["msg"] as? String
                ?: "Registration failed"
            throw Exception(errorMsg)
        }

        val result = parseJson(body)
        val accessToken = result["access_token"] as? String
        val userId = (result["user"] as? Map<*, *>)?.get("id") as? String
            ?: result["id"] as? String
            ?: throw Exception("No user ID in response")

        if (accessToken != null) {
            saveAuthData(email, accessToken, userId)
            if (pairingCode.isNotBlank()) {
                claimPairingCode(accessToken, pairingCode.filter { it.isDigit() })
            } else {
                registerDevice(accessToken, userId)
            }
        } else {
            // Email confirmation may be required — do NOT save empty token
            throw Exception("Check your email to confirm your account, then login")
        }
    }

    private suspend fun registerDevice(accessToken: String, userId: String) {
        val deviceInfo = DeviceUtils.getDeviceInfo(context)

        // Check existing devices (excluding current device) to determine role
        val devicesReq = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/devices?user_id=eq.$userId&device_id=neq.${deviceInfo.deviceId}&select=id")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .build()

        val devicesResp = client.newCall(devicesReq).execute()
        val devicesBody = devicesResp.body?.string() ?: "[]"
        devicesResp.close()
        val devicesList = try {
            val type = object : TypeToken<List<Map<String, Any>>>() {}.type
            gson.fromJson<List<Map<String, Any>>>(devicesBody, type)
        } catch (e: Exception) { emptyList() }

        // Check if current device already exists and has a role
        val existingDeviceReq = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/devices?user_id=eq.$userId&device_id=eq.${deviceInfo.deviceId}&select=id,role")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .build()

        val existingResp = client.newCall(existingDeviceReq).execute()
        val existingBody = existingResp.body?.string() ?: "[]"
        existingResp.close()
        val existingDevice = try {
            val type = object : TypeToken<List<Map<String, Any>>>() {}.type
            gson.fromJson<List<Map<String, Any>>>(existingBody, type).firstOrNull()
        } catch (e: Exception) { null }

        // Preserve existing role on re-login; only assign role for new devices
        val role = existingDevice?.get("role") as? String
            ?: if (devicesList.isEmpty()) "OWNER" else "CLIENT"

        // Upsert device
        val deviceData = gson.toJson(mapOf(
            "user_id" to userId,
            "device_id" to deviceInfo.deviceId,
            "device_name" to deviceInfo.deviceName,
            "model" to deviceInfo.model,
            "os_version" to deviceInfo.osVersion,
            "manufacturer" to deviceInfo.manufacturer,
            "role" to role,
            "status" to "ONLINE",
            "last_seen" to java.time.Instant.now().toString()
        ))

        val upsertReq = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/devices")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("Content-Type", "application/json")
            .addHeader("Prefer", "resolution=merge-duplicates,return=representation")
            .post(deviceData.toRequestBody("application/json".toMediaType()))
            .build()

        val upsertResp = client.newCall(upsertReq).execute()
        val upsertBody = upsertResp.body?.string()
        if (!upsertResp.isSuccessful) {
            Log.w(TAG, "Device registration failed: $upsertBody")
        }

        // Try to get the device's UUID primary key from the response
        var deviceUuid: String? = null
        if (upsertBody != null) {
            try {
                // Response may be a single object or array
                val parsed = if (upsertBody.trimStart().startsWith("[")) {
                    val type = object : TypeToken<List<Map<String, Any>>>() {}.type
                    val list = gson.fromJson<List<Map<String, Any>>>(upsertBody, type)
                    list.firstOrNull()
                } else {
                    parseJson(upsertBody)
                }
                deviceUuid = parsed?.get("id") as? String
            } catch (e: Exception) {
                Log.w(TAG, "Failed to parse device UUID from response: ${e.message}")
            }
        }

        // If upsert didn't return UUID, query for it
        if (deviceUuid == null) {
            try {
                val queryReq = Request.Builder()
                    .url("${BuildConfig.SUPABASE_URL}/rest/v1/devices?device_id=eq.${deviceInfo.deviceId}&user_id=eq.$userId&select=id")
                    .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                    .addHeader("Authorization", "Bearer $accessToken")
                    .build()
                val queryResp = client.newCall(queryReq).execute()
                val queryBody = queryResp.body?.string()
                if (queryResp.isSuccessful && queryBody != null) {
                    val type = object : TypeToken<List<Map<String, Any>>>() {}.type
                    val list = gson.fromJson<List<Map<String, Any>>>(queryBody, type)
                    deviceUuid = list.firstOrNull()?.get("id") as? String
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to query device UUID: ${e.message}")
            }
        }

        prefs.edit()
            .putString(KEY_ROLE, role)
            .putString(KEY_DEVICE_ID, deviceInfo.deviceId)
            .apply { deviceUuid?.let { putString(KEY_DEVICE_UUID, it) } }
            .apply()
    }

    private suspend fun claimPairingCode(accessToken: String, pairingCode: String) {
        if (pairingCode.length != 6) {
            throw Exception("Pairing code must be 6 digits")
        }

        val deviceInfo = DeviceUtils.getDeviceInfo(context)

        // Try the backend API first, fall back to Supabase RPC
        val backendUrl = BuildConfig.BACKEND_URL
        if (backendUrl.isNotBlank()) {
            claimViaBackend(pairingCode, deviceInfo)
        } else {
            claimViaSupabase(accessToken, pairingCode, deviceInfo)
        }
    }

    private suspend fun claimViaBackend(pairingCode: String, deviceInfo: com.hybridcontrol.agent.model.DeviceInfo) {
        val payload = gson.toJson(mapOf(
            "code" to pairingCode,
            "deviceId" to deviceInfo.deviceId,
            "deviceName" to deviceInfo.deviceName,
            "model" to deviceInfo.model,
            "osVersion" to deviceInfo.osVersion,
            "manufacturer" to deviceInfo.manufacturer
        ))

        val request = Request.Builder()
            .url("${BuildConfig.BACKEND_URL}/api/pairing/claim")
            .addHeader("Content-Type", "application/json")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()

        val response = client.newCall(request).execute()
        val body = response.body?.string() ?: throw Exception("Empty pairing response")

        if (!response.isSuccessful) {
            val errorMap = runCatching { parseJson(body) }.getOrDefault(emptyMap())
            val errorMsg = errorMap["error"] as? String ?: "Pairing code failed"
            throw Exception(errorMsg)
        }

        val parsed = parseJson(body)
        val deviceUuid = parsed["device_uuid"] as? String
            ?: throw Exception("Pairing response missing device ID")
        val ownerUserId = parsed["owner_user_id"] as? String
            ?: throw Exception("Pairing response missing owner ID")

        prefs.edit()
            .putString(KEY_USER_ID, ownerUserId)
            .putString(KEY_ROLE, "CLIENT")
            .putString(KEY_DEVICE_ID, deviceInfo.deviceId)
            .putString(KEY_DEVICE_UUID, deviceUuid)
            .apply()
    }

    private suspend fun claimViaSupabase(accessToken: String, pairingCode: String, deviceInfo: com.hybridcontrol.agent.model.DeviceInfo) {
        val payload = gson.toJson(mapOf(
            "p_code" to pairingCode,
            "p_device_id" to deviceInfo.deviceId,
            "p_device_name" to deviceInfo.deviceName,
            "p_model" to deviceInfo.model,
            "p_os_version" to deviceInfo.osVersion,
            "p_manufacturer" to deviceInfo.manufacturer
        ))

        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/rpc/claim_device_pairing_code")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("Content-Type", "application/json")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()

        val response = client.newCall(request).execute()
        val body = response.body?.string() ?: throw Exception("Empty pairing response")

        if (!response.isSuccessful) {
            val errorMap = runCatching { parseJson(body) }.getOrDefault(emptyMap())
            val errorMsg = errorMap["message"] as? String
                ?: errorMap["msg"] as? String
                ?: "Pairing failed"
            throw Exception(errorMsg)
        }

        val parsed = if (body.trimStart().startsWith("[")) {
            val type = object : TypeToken<List<Map<String, Any>>>() {}.type
            gson.fromJson<List<Map<String, Any>>>(body, type).firstOrNull()
        } else {
            parseJson(body)
        } ?: throw Exception("Pairing response missing device data")

        val deviceUuid = parsed["device_uuid"] as? String
            ?: throw Exception("Pairing response missing device ID")
        val ownerUserId = parsed["owner_user_id"] as? String
            ?: throw Exception("Pairing response missing owner ID")

        prefs.edit()
            .putString(KEY_USER_ID, ownerUserId)
            .putString(KEY_ROLE, "CLIENT")
            .putString(KEY_DEVICE_ID, deviceInfo.deviceId)
            .putString(KEY_DEVICE_UUID, deviceUuid)
            .apply()
    }

    private fun saveAuthData(email: String, accessToken: String, userId: String) {
        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_USER_ID, userId)
            .putString(KEY_EMAIL, email)
            .apply()
    }

    suspend fun logout() = withContext(Dispatchers.IO) {
        val token = getAccessToken()
        if (token != null && token.isNotEmpty()) {
            try {
                val request = Request.Builder()
                    .url("${BuildConfig.SUPABASE_URL}/auth/v1/logout")
                    .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                    .addHeader("Authorization", "Bearer $token")
                    .post("".toRequestBody("application/json".toMediaType()))
                    .build()
                client.newCall(request).execute().use { /* close response */ }
            } catch (e: Exception) {
                Log.w(TAG, "Logout request failed: ${e.message}")
            }
        }
        prefs.edit().clear().apply()
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseJson(json: String): Map<String, Any> {
        val type = object : TypeToken<Map<String, Any>>() {}.type
        return gson.fromJson(json, type)
    }

    companion object {
        private const val TAG = "AuthManager"
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_EMAIL = "email"
        private const val KEY_ROLE = "role"
        private const val KEY_DEVICE_UUID = "device_uuid"
    }
}
