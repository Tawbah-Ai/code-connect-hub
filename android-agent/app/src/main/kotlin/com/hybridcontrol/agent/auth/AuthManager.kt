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
        get() = getAccessToken() != null

    val userEmail: String?
        get() = prefs.getString(KEY_EMAIL, null)

    val deviceRole: DeviceRole?
        get() = prefs.getString(KEY_ROLE, null)?.let { DeviceRole.valueOf(it) }

    fun getAccessToken(): String? = prefs.getString(KEY_ACCESS_TOKEN, null)

    fun getUserId(): String? = prefs.getString(KEY_USER_ID, null)

    fun getDeviceId(): String = DeviceUtils.getDeviceId(context)

    suspend fun login(email: String, password: String) = withContext(Dispatchers.IO) {
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
        registerDevice(accessToken, userId)
    }

    suspend fun register(email: String, password: String) = withContext(Dispatchers.IO) {
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
            registerDevice(accessToken, userId)
        } else {
            // Email confirmation may be required
            saveAuthData(email, "", userId)
            throw Exception("Check your email to confirm your account, then login")
        }
    }

    private suspend fun registerDevice(accessToken: String, userId: String) {
        val deviceInfo = DeviceUtils.getDeviceInfo(context)

        // Check existing devices to determine role
        val devicesReq = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/devices?user_id=eq.$userId&select=id")
            .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer $accessToken")
            .build()

        val devicesResp = client.newCall(devicesReq).execute()
        val devicesBody = devicesResp.body?.string() ?: "[]"
        val devicesList = try {
            val type = object : TypeToken<List<Map<String, Any>>>() {}.type
            gson.fromJson<List<Map<String, Any>>>(devicesBody, type)
        } catch (e: Exception) { emptyList() }

        val role = if (devicesList.isEmpty()) "OWNER" else "CLIENT"

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
            .addHeader("Prefer", "resolution=merge-duplicates")
            .post(deviceData.toRequestBody("application/json".toMediaType()))
            .build()

        val upsertResp = client.newCall(upsertReq).execute()
        if (!upsertResp.isSuccessful) {
            Log.w(TAG, "Device registration failed: ${upsertResp.body?.string()}")
        }

        prefs.edit()
            .putString(KEY_ROLE, role)
            .putString(KEY_DEVICE_ID, deviceInfo.deviceId)
            .apply()
    }

    private fun saveAuthData(email: String, accessToken: String, userId: String) {
        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_USER_ID, userId)
            .putString(KEY_EMAIL, email)
            .apply()
    }

    fun logout() {
        val token = getAccessToken()
        if (token != null && token.isNotEmpty()) {
            try {
                val request = Request.Builder()
                    .url("${BuildConfig.SUPABASE_URL}/auth/v1/logout")
                    .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                    .addHeader("Authorization", "Bearer $token")
                    .post("".toRequestBody("application/json".toMediaType()))
                    .build()
                client.newCall(request).execute()
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
    }
}
