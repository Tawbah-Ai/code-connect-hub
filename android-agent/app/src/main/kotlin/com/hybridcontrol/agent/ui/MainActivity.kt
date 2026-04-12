package com.hybridcontrol.agent.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
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
    private var activityListener: WebSocketManager.ConnectionListener? = null

    private val multiplePermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val denied = permissions.filter { !it.value }.keys
        if (denied.isNotEmpty()) {
            Toast.makeText(
                this,
                "Some permissions were denied. Some features may be limited.",
                Toast.LENGTH_LONG
            ).show()
        }
        checkBatteryOptimization()
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
        requestAllPermissions()
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
                confirmRemoteControlConsent()
            }
        }

        binding.btnLogout.setOnClickListener {
            stopAgentService()
            lifecycleScope.launch {
                authManager.logout()
                startActivity(Intent(this@MainActivity, LoginActivity::class.java))
                finish()
            }
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
        activityListener = object : WebSocketManager.ConnectionListener {
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
        HybridControlApp.instance.webSocketManager.addConnectionListener(activityListener!!)
    }

    private fun requestAllPermissions() {
        val permissionsToRequest = mutableListOf<String>()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (!isGranted(Manifest.permission.POST_NOTIFICATIONS))
                permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS)
            if (!isGranted(Manifest.permission.READ_MEDIA_IMAGES))
                permissionsToRequest.add(Manifest.permission.READ_MEDIA_IMAGES)
            if (!isGranted(Manifest.permission.READ_MEDIA_VIDEO))
                permissionsToRequest.add(Manifest.permission.READ_MEDIA_VIDEO)
        } else {
            if (!isGranted(Manifest.permission.READ_EXTERNAL_STORAGE))
                permissionsToRequest.add(Manifest.permission.READ_EXTERNAL_STORAGE)
        }

        if (permissionsToRequest.isNotEmpty()) {
            showPermissionRationale(permissionsToRequest)
        } else {
            checkBatteryOptimization()
        }
    }

    private fun showPermissionRationale(permissions: List<String>) {
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.permission_rationale_title))
            .setMessage(getString(R.string.permission_rationale_message))
            .setPositiveButton("Grant Permissions") { _, _ ->
                multiplePermissionsLauncher.launch(permissions.toTypedArray())
            }
            .setNegativeButton("Skip", null)
            .show()
    }

    private fun checkBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                AlertDialog.Builder(this)
                    .setTitle("Background Sync")
                    .setMessage("To ensure DeviceSync Manager continues running reliably, it is recommended to disable battery optimization for this app.")
                    .setPositiveButton("Open Settings") { _, _ ->
                        val intent = Intent(
                            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                            Uri.parse("package:$packageName")
                        )
                        startActivity(intent)
                    }
                    .setNegativeButton("Skip", null)
                    .show()
            }
        }
    }

    private fun isGranted(permission: String): Boolean =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

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

    private fun requestNotificationPermissionAndStart() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            multiplePermissionsLauncher.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
        } else {
            startAgentService()
        }
    }

    private fun confirmRemoteControlConsent() {
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.consent_title))
            .setMessage(getString(R.string.consent_message))
            .setPositiveButton("Enable") { _, _ -> requestNotificationPermissionAndStart() }
            .setNegativeButton("Cancel", null)
            .show()
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

    override fun onDestroy() {
        super.onDestroy()
        activityListener?.let {
            HybridControlApp.instance.webSocketManager.removeConnectionListener(it)
        }
        activityListener = null
    }
}
