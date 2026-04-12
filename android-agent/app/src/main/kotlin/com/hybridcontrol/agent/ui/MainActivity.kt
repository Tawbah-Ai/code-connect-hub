package com.hybridcontrol.agent.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.hybridcontrol.agent.HybridControlApp
import com.hybridcontrol.agent.connection.WebSocketManager
import com.hybridcontrol.agent.databinding.ActivityMainBinding
import com.hybridcontrol.agent.model.CommandResult
import com.hybridcontrol.agent.model.ControlMode
import com.hybridcontrol.agent.model.RemoteCommand
import com.hybridcontrol.agent.service.AgentForegroundService
import com.hybridcontrol.agent.touch.TouchAccessibilityService
import com.hybridcontrol.agent.util.DeviceUtils

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var isAgentRunning = false

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            startAgentService()
        } else {
            Toast.makeText(this, "Notification permission required", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val authManager = HybridControlApp.instance.authManager
        if (!authManager.isLoggedIn) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        setupUI()
        setupWebSocketListener()
        checkPermissions()
    }

    private fun setupUI() {
        val authManager = HybridControlApp.instance.authManager
        val deviceInfo = DeviceUtils.getDeviceInfo(this)

        binding.tvEmail.text = authManager.userEmail ?: "Unknown"
        binding.tvRole.text = authManager.deviceRole?.name ?: "Unknown"
        binding.tvDeviceName.text = deviceInfo.deviceName
        binding.tvDeviceId.text = deviceInfo.deviceId.take(8) + "..."

        binding.btnToggleAgent.setOnClickListener {
            if (isAgentRunning) {
                stopAgentService()
            } else {
                requestNotificationPermissionAndStart()
            }
        }

        binding.btnLogout.setOnClickListener {
            stopAgentService()
            authManager.logout()
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }

        binding.btnAccessibility.setOnClickListener {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            startActivity(intent)
        }

        binding.rgControlMode.setOnCheckedChangeListener { _, checkedId ->
            val mode = when (checkedId) {
                binding.rbCommand.id -> ControlMode.COMMAND
                binding.rbTouch.id -> ControlMode.TOUCH
                binding.rbHybrid.id -> ControlMode.HYBRID
                else -> ControlMode.HYBRID
            }
            HybridControlApp.instance.webSocketManager.setControlMode(mode)
        }

        binding.rbHybrid.isChecked = true

        updateAgentStatus(false)
        updateAccessibilityStatus()
    }

    private fun setupWebSocketListener() {
        HybridControlApp.instance.webSocketManager.connectionListener =
            object : WebSocketManager.ConnectionListener {
                override fun onConnected() {
                    runOnUiThread {
                        updateAgentStatus(true)
                        addLogEntry("Connected to server")
                    }
                }

                override fun onDisconnected() {
                    runOnUiThread {
                        updateAgentStatus(false)
                        addLogEntry("Disconnected from server")
                    }
                }

                override fun onCommandReceived(command: RemoteCommand) {
                    runOnUiThread {
                        addLogEntry("Command: ${command.type}")
                    }
                }

                override fun onCommandResult(result: CommandResult) {
                    runOnUiThread {
                        val status = if (result.success) "OK" else "FAIL"
                        addLogEntry("Result: ${result.type} [$status]")
                    }
                }

                override fun onError(error: String) {
                    runOnUiThread {
                        addLogEntry("Error: $error")
                    }
                }
            }
    }

    private fun updateAgentStatus(connected: Boolean) {
        isAgentRunning = connected
        binding.tvConnectionStatus.text = if (connected) "Connected" else "Disconnected"
        binding.tvConnectionStatus.setTextColor(
            ContextCompat.getColor(
                this,
                if (connected) android.R.color.holo_green_light else android.R.color.holo_red_light
            )
        )
        binding.btnToggleAgent.text = if (connected) "Stop Agent" else "Start Agent"
        binding.viewStatusIndicator.setBackgroundColor(
            ContextCompat.getColor(
                this,
                if (connected) android.R.color.holo_green_light else android.R.color.holo_red_light
            )
        )
    }

    private fun updateAccessibilityStatus() {
        val enabled = DeviceUtils.isAccessibilityServiceEnabled(
            this, TouchAccessibilityService::class.java
        )
        binding.tvAccessibilityStatus.text = if (enabled) "Enabled" else "Disabled"
        binding.tvAccessibilityStatus.setTextColor(
            ContextCompat.getColor(
                this,
                if (enabled) android.R.color.holo_green_light else android.R.color.holo_red_light
            )
        )
        binding.btnAccessibility.visibility = if (enabled) View.GONE else View.VISIBLE
    }

    private fun addLogEntry(message: String) {
        val currentLog = binding.tvLog.text.toString()
        val timestamp = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault())
            .format(java.util.Date())
        val newLog = "[$timestamp] $message\n$currentLog"
        binding.tvLog.text = newLog.lines().take(50).joinToString("\n")
    }

    private fun checkPermissions() {
        val permissions = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        if (permissions.isNotEmpty()) {
            requestPermissions(permissions.toTypedArray(), PERMISSION_REQUEST_CODE)
        }
    }

    private fun requestNotificationPermissionAndStart() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            startAgentService()
        }
    }

    private fun startAgentService() {
        val intent = Intent(this, AgentForegroundService::class.java).apply {
            action = AgentForegroundService.ACTION_START
        }
        startForegroundService(intent)
        addLogEntry("Agent starting...")
    }

    private fun stopAgentService() {
        val intent = Intent(this, AgentForegroundService::class.java).apply {
            action = AgentForegroundService.ACTION_STOP
        }
        startService(intent)
        updateAgentStatus(false)
        addLogEntry("Agent stopped")
    }

    override fun onResume() {
        super.onResume()
        updateAccessibilityStatus()
    }

    companion object {
        private const val PERMISSION_REQUEST_CODE = 100
    }
}
