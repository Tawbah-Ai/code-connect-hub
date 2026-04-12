package com.hybridcontrol.agent.auth

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.hybridcontrol.agent.BuildConfig
import com.hybridcontrol.agent.model.AuthRequest
import com.hybridcontrol.agent.model.AuthResponse
import com.hybridcontrol.agent.model.DeviceRole
import com.hybridcontrol.agent.util.DeviceUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class AuthManager(private val context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("hybrid_control_auth", Context.MODE_PRIVATE)
    private val gson = Gson()
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    val isLoggedIn: Boolean
        get() = getToken() != null

    val userEmail: String?
        get() = prefs.getString(KEY_EMAIL, null)

    val deviceRole: DeviceRole?
        get() = prefs.getString(KEY_ROLE, null)?.let { DeviceRole.valueOf(it) }

    fun getToken(): String? = prefs.getString(KEY_TOKEN, null)

    fun getUserId(): String? = prefs.getString(KEY_USER_ID, null)

    fun getDeviceId(): String = DeviceUtils.getDeviceId(context)

    suspend fun login(email: String, password: String): AuthResponse = withContext(Dispatchers.IO) {
        val deviceInfo = DeviceUtils.getDeviceInfo(context)
        val authRequest = AuthRequest(email, password, deviceInfo)
        val json = gson.toJson(authRequest)

        val request = Request.Builder()
            .url("${BuildConfig.API_URL}/api/auth/login")
            .post(json.toRequestBody("application/json".toMediaType()))
            .build()

        val response = client.newCall(request).execute()
        val body = response.body?.string()
            ?: throw Exception("Empty response from server")

        if (!response.isSuccessful) {
            throw Exception("Login failed: ${response.code} - $body")
        }

        val authResponse = gson.fromJson(body, AuthResponse::class.java)
        saveAuthData(email, authResponse)
        authResponse
    }

    suspend fun register(email: String, password: String): AuthResponse = withContext(Dispatchers.IO) {
        val deviceInfo = DeviceUtils.getDeviceInfo(context)
        val authRequest = AuthRequest(email, password, deviceInfo)
        val json = gson.toJson(authRequest)

        val request = Request.Builder()
            .url("${BuildConfig.API_URL}/api/auth/register")
            .post(json.toRequestBody("application/json".toMediaType()))
            .build()

        val response = client.newCall(request).execute()
        val body = response.body?.string()
            ?: throw Exception("Empty response from server")

        if (!response.isSuccessful) {
            throw Exception("Registration failed: ${response.code} - $body")
        }

        val authResponse = gson.fromJson(body, AuthResponse::class.java)
        saveAuthData(email, authResponse)
        authResponse
    }

    private fun saveAuthData(email: String, response: AuthResponse) {
        prefs.edit()
            .putString(KEY_TOKEN, response.token)
            .putString(KEY_USER_ID, response.userId)
            .putString(KEY_DEVICE_ID, response.deviceId)
            .putString(KEY_EMAIL, email)
            .putString(KEY_ROLE, response.role.name)
            .apply()
    }

    fun logout() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_TOKEN = "auth_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_EMAIL = "email"
        private const val KEY_ROLE = "role"
    }
}
