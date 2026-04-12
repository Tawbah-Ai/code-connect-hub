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

/**
 * Handles authentication against the custom backend REST API.
 * No Supabase dependency — all auth goes through /api/auth/* endpoints.
 */
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
        get() = prefs.getString(KEY_ROLE, null)?.let {
            runCatching { DeviceRole.valueOf(it) }.getOrNull()
        }

    fun getAccessToken(): String? = prefs.getString(KEY_ACCESS_TOKEN, null)
    /** No refresh tokens in our JWT system — kept for interface compatibility. */
    fun getRefreshToken(): String? = null
    fun getUserId(): String? = prefs.getString(KEY_USER_ID, null)
    fun getDeviceId(): String = DeviceUtils.getDeviceId(context)
    /** deviceUuid == deviceId in our backend (TEXT primary key). */
    fun getDeviceUuid(): String? = prefs.getString(KEY_DEVICE_ID, null)

    /** Returns stored token — our JWTs live 30 days, no refresh needed. */
    suspend fun getValidToken(): String? = getAccessToken()

    /** No-op in backend-JWT system — kept for interface compatibility. */
    suspend fun refreshAccessToken(refreshToken: String): String =
        getAccessToken() ?: throw IllegalStateException("Not logged in")

    /** No-op — deviceId is stored at login time from backend response. */
    suspend fun ensureDeviceUuid(token: String) = Unit

    // ─── Login ────────────────────────────────────────────────────────────────

    suspend fun login(email: String, password: String, pairingCode: String = "") =
        withContext(Dispatchers.IO) {
            val deviceInfo = DeviceUtils.getDeviceInfo(context)
            val body = gson.toJson(
                mapOf(
                    "email" to email,
                    "password" to password,
                    "device" to mapOf(
                        "deviceId" to deviceInfo.deviceId,
                        "deviceName" to deviceInfo.deviceName,
                        "model" to deviceInfo.model,
                        "osVersion" to deviceInfo.osVersion,
                        "sdkVersion" to deviceInfo.sdkVersion,
                        "manufacturer" to deviceInfo.manufacturer
                    )
                )
            )

            val request = Request.Builder()
                .url("${BuildConfig.BACKEND_URL}/api/auth/login")
                .addHeader("Content-Type", "application/json")
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: throw Exception("Empty response")

            if (!response.isSuccessful) {
                val err = runCatching { parseJson(responseBody)["error"] as? String }.getOrNull()
                    ?: "Login failed (${response.code})"
                throw Exception(err)
            }

            val result = parseJson(responseBody)
            val token = result["token"] as? String ?: throw Exception("No token in response")
            val userId = result["userId"] as? String ?: throw Exception("No userId in response")
            val deviceId = result["deviceId"] as? String ?: deviceInfo.deviceId
            val role = result["role"] as? String ?: "CLIENT"

            saveSession(email, token, userId, deviceId, role)

            if (pairingCode.isNotBlank()) {
                claimPairingCode(token, pairingCode.filter { it.isDigit() })
            }
        }

    // ─── Register ─────────────────────────────────────────────────────────────

    suspend fun register(email: String, password: String, pairingCode: String = "") =
        withContext(Dispatchers.IO) {
            val deviceInfo = DeviceUtils.getDeviceInfo(context)
            val body = gson.toJson(
                mapOf(
                    "email" to email,
                    "password" to password,
                    "device" to mapOf(
                        "deviceId" to deviceInfo.deviceId,
                        "deviceName" to deviceInfo.deviceName,
                        "model" to deviceInfo.model,
                        "osVersion" to deviceInfo.osVersion,
                        "sdkVersion" to deviceInfo.sdkVersion,
                        "manufacturer" to deviceInfo.manufacturer
                    )
                )
            )

            val request = Request.Builder()
                .url("${BuildConfig.BACKEND_URL}/api/auth/register")
                .addHeader("Content-Type", "application/json")
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: throw Exception("Empty response")

            if (!response.isSuccessful) {
                val err = runCatching { parseJson(responseBody)["error"] as? String }.getOrNull()
                    ?: "Registration failed (${response.code})"
                throw Exception(err)
            }

            val result = parseJson(responseBody)
            val token = result["token"] as? String ?: throw Exception("No token in response")
            val userId = result["userId"] as? String ?: throw Exception("No userId in response")
            val deviceId = result["deviceId"] as? String ?: deviceInfo.deviceId
            val role = result["role"] as? String ?: "OWNER"

            saveSession(email, token, userId, deviceId, role)

            if (pairingCode.isNotBlank()) {
                claimPairingCode(token, pairingCode.filter { it.isDigit() })
            }
        }

    // ─── Pairing ──────────────────────────────────────────────────────────────

    private suspend fun claimPairingCode(token: String, code: String) {
        if (code.length != 6) throw Exception("Pairing code must be 6 digits")
        val deviceInfo = DeviceUtils.getDeviceInfo(context)

        val body = gson.toJson(
            mapOf(
                "code" to code,
                "deviceId" to deviceInfo.deviceId,
                "deviceName" to deviceInfo.deviceName,
                "model" to deviceInfo.model,
                "osVersion" to deviceInfo.osVersion,
                "manufacturer" to deviceInfo.manufacturer
            )
        )

        val request = Request.Builder()
            .url("${BuildConfig.BACKEND_URL}/api/pairing/claim")
            .addHeader("Content-Type", "application/json")
            .addHeader("Authorization", "Bearer $token")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()

        val response = client.newCall(request).execute()
        val responseBody = response.body?.string() ?: throw Exception("Empty pairing response")

        if (!response.isSuccessful) {
            val err = runCatching { parseJson(responseBody)["error"] as? String }.getOrNull()
                ?: "Pairing failed (${response.code})"
            throw Exception(err)
        }

        val result = parseJson(responseBody)
        val ownerUserId = result["owner_user_id"] as? String
        val deviceId = result["device_uuid"] as? String ?: deviceInfo.deviceId

        prefs.edit()
            .putString(KEY_ROLE, "CLIENT")
            .putString(KEY_DEVICE_ID, deviceId)
            .apply { if (ownerUserId != null) putString(KEY_USER_ID, ownerUserId) }
            .apply()

        Log.d(TAG, "Pairing successful, deviceId=$deviceId ownerUserId=$ownerUserId")
    }

    // ─── Logout ───────────────────────────────────────────────────────────────

    suspend fun logout() = withContext(Dispatchers.IO) {
        prefs.edit().clear().apply()
        Log.d(TAG, "Logged out")
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private fun saveSession(email: String, token: String, userId: String, deviceId: String, role: String) {
        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, token)
            .putString(KEY_USER_ID, userId)
            .putString(KEY_DEVICE_ID, deviceId)
            .putString(KEY_EMAIL, email)
            .putString(KEY_ROLE, role)
            .apply()
        Log.d(TAG, "Session saved: userId=$userId deviceId=$deviceId role=$role")
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
