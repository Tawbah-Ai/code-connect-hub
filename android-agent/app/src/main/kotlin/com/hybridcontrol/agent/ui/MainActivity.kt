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
                "بعض الصلاحيات مرفوضة. قد تعمل بعض الميزات بشكل محدود.",
                Toast.LENGTH_LONG
            ).show()
        }
        checkSpecialPermissions()
    }

    private val overlayPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "إذن الظهور فوق التطبيقات غير ممنوح.", Toast.LENGTH_SHORT).show()
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
            if (!isGranted(Manifest.permission.READ_MEDIA_AUDIO))
                permissionsToRequest.add(Manifest.permission.READ_MEDIA_AUDIO)
        } else {
            if (!isGranted(Manifest.permission.READ_EXTERNAL_STORAGE))
                permissionsToRequest.add(Manifest.permission.READ_EXTERNAL_STORAGE)
            if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q) {
                if (!isGranted(Manifest.permission.WRITE_EXTERNAL_STORAGE))
                    permissionsToRequest.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }
        }

        if (!isGranted(Manifest.permission.CAMERA))
            permissionsToRequest.add(Manifest.permission.CAMERA)

        if (!isGranted(Manifest.permission.RECORD_AUDIO))
            permissionsToRequest.add(Manifest.permission.RECORD_AUDIO)

        if (permissionsToRequest.isNotEmpty()) {
            showPermissionRationale(permissionsToRequest)
        } else {
            checkSpecialPermissions()
        }
    }

    private fun showPermissionRationale(permissions: List<String>) {
        AlertDialog.Builder(this)
            .setTitle("الصلاحيات المطلوبة")
            .setMessage(
                "يحتاج التطبيق إلى الصلاحيات التالية للعمل بشكل صحيح:\n\n" +
                "• الكاميرا: للتحكم في الكاميرا عن بُعد\n" +
                "• الميكروفون: لتسجيل الصوت عن بُعد\n" +
                "• الملفات والوسائط: للوصول إلى الملفات عن بُعد\n" +
                "• الإشعارات: لإبقاء الخدمة نشطة\n\n" +
                "لن تعمل هذه الميزات بدون منح الصلاحيات."
            )
            .setPositiveButton("منح الصلاحيات") { _, _ ->
                multiplePermissionsLauncher.launch(permissions.toTypedArray())
            }
            .setNegativeButton("تخطي", null)
            .show()
    }

    private fun checkSpecialPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(this)) {
                AlertDialog.Builder(this)
                    .setTitle("إذن الظهور فوق التطبيقات")
                    .setMessage("يحتاج التطبيق إلى إذن الظهور فوق التطبيقات الأخرى لتوفير وظائف التحكم بالشاشة.")
                    .setPositiveButton("فتح الإعدادات") { _, _ ->
                        val intent = Intent(
                            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:$packageName")
                        )
                        overlayPermissionLauncher.launch(intent)
                    }
                    .setNegativeButton("تخطي", null)
                    .show()
            } else {
                checkBatteryOptimization()
            }
        } else {
            checkBatteryOptimization()
        }
    }

    private fun checkBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                AlertDialog.Builder(this)
                    .setTitle("تحسين استهلاك البطارية")
                    .setMessage("لضمان استمرار التطبيق في العمل بالخلفية، من المستحسن إيقاف تحسين البطارية لهذا التطبيق.")
                    .setPositiveButton("الإعدادات") { _, _ ->
                        val intent = Intent(
                            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                            Uri.parse("package:$packageName")
                        )
                        startActivity(intent)
                    }
                    .setNegativeButton("تخطي", null)
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
            .setTitle("Start remote control client?")
            .setMessage("Only continue if this is your device or you have explicit permission. While active, the dashboard can request device information, screenshots, screen streaming, and touch gestures. A persistent notification will stay visible.")
            .setPositiveButton("Start") { _, _ -> requestNotificationPermissionAndStart() }
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
