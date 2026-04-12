package com.hybridcontrol.agent.commands

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.util.Log
import com.hybridcontrol.agent.model.CommandResult
import com.hybridcontrol.agent.model.FileInfo
import com.hybridcontrol.agent.model.RemoteCommand
import com.hybridcontrol.agent.util.DeviceUtils
import java.io.File

class CommandEngine(private val context: Context) {

    private val supportedCommands = setOf(
        "OPEN_APP",
        "GET_FILES",
        "DELETE_FILE",
        "TAKE_SCREENSHOT",
        "DEVICE_INFO",
        "LIST_APPS",
        "GET_BATTERY",
        "GET_STORAGE_INFO"
    )

    fun canHandle(commandType: String): Boolean {
        return commandType in supportedCommands
    }

    suspend fun execute(command: RemoteCommand): CommandResult {
        Log.d(TAG, "Executing command: ${command.type}")
        return try {
            when (command.type) {
                "OPEN_APP" -> openApp(command)
                "GET_FILES" -> getFiles(command)
                "DELETE_FILE" -> deleteFile(command)
                "TAKE_SCREENSHOT" -> takeScreenshot(command)
                "DEVICE_INFO" -> getDeviceInfo(command)
                "LIST_APPS" -> listApps(command)
                "GET_BATTERY" -> getBattery(command)
                "GET_STORAGE_INFO" -> getStorageInfo(command)
                else -> CommandResult(
                    commandId = command.id,
                    type = command.type,
                    success = false,
                    error = "Unsupported command: ${command.type}"
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Command execution failed: ${e.message}")
            CommandResult(
                commandId = command.id,
                type = command.type,
                success = false,
                error = e.message ?: "Unknown error"
            )
        }
    }

    private fun openApp(command: RemoteCommand): CommandResult {
        val packageName = command.payload?.get("packageName") as? String
            ?: return CommandResult(command.id, command.type, false, error = "Missing packageName")

        val intent = context.packageManager.getLaunchIntentForPackage(packageName)
            ?: return CommandResult(command.id, command.type, false, error = "App not found: $packageName")

        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)

        return CommandResult(
            commandId = command.id,
            type = command.type,
            success = true,
            data = mapOf("launched" to packageName)
        )
    }

    private fun getFiles(command: RemoteCommand): CommandResult {
        val path = command.payload?.get("path") as? String
            ?: Environment.getExternalStorageDirectory().absolutePath

        val directory = File(path)
        if (!directory.exists() || !directory.isDirectory) {
            return CommandResult(command.id, command.type, false, error = "Directory not found: $path")
        }

        val files = directory.listFiles()?.map { file ->
            FileInfo(
                name = file.name,
                path = file.absolutePath,
                size = file.length(),
                isDirectory = file.isDirectory,
                lastModified = file.lastModified()
            )
        } ?: emptyList()

        return CommandResult(
            commandId = command.id,
            type = command.type,
            success = true,
            data = mapOf("files" to files, "path" to path, "count" to files.size)
        )
    }

    private fun deleteFile(command: RemoteCommand): CommandResult {
        val path = command.payload?.get("path") as? String
            ?: return CommandResult(command.id, command.type, false, error = "Missing file path")

        val file = File(path)
        if (!file.exists()) {
            return CommandResult(command.id, command.type, false, error = "File not found: $path")
        }

        val deleted = if (file.isDirectory) file.deleteRecursively() else file.delete()

        return CommandResult(
            commandId = command.id,
            type = command.type,
            success = deleted,
            data = if (deleted) mapOf("deleted" to path) else null,
            error = if (!deleted) "Failed to delete: $path" else null
        )
    }

    private fun takeScreenshot(command: RemoteCommand): CommandResult {
        // MediaProjection requires an Activity context and user permission
        // The ScreenCaptureActivity handles this flow
        ScreenCaptureManager.requestCapture(context, command.id)

        return CommandResult(
            commandId = command.id,
            type = command.type,
            success = true,
            data = mapOf("status" to "capture_initiated", "message" to "Screenshot capture started")
        )
    }

    private fun getDeviceInfo(command: RemoteCommand): CommandResult {
        val deviceInfo = DeviceUtils.getDeviceInfo(context)
        val batteryLevel = DeviceUtils.getBatteryLevel(context)
        val isScreenOn = DeviceUtils.isScreenOn(context)

        return CommandResult(
            commandId = command.id,
            type = command.type,
            success = true,
            data = mapOf(
                "deviceId" to deviceInfo.deviceId,
                "deviceName" to deviceInfo.deviceName,
                "model" to deviceInfo.model,
                "manufacturer" to deviceInfo.manufacturer,
                "osVersion" to deviceInfo.osVersion,
                "sdkVersion" to deviceInfo.sdkVersion,
                "batteryLevel" to batteryLevel,
                "isScreenOn" to isScreenOn
            )
        )
    }

    private fun listApps(command: RemoteCommand): CommandResult {
        val pm = context.packageManager
        val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            .filter { pm.getLaunchIntentForPackage(it.packageName) != null }
            .map { appInfo ->
                mapOf(
                    "packageName" to appInfo.packageName,
                    "appName" to pm.getApplicationLabel(appInfo).toString()
                )
            }

        return CommandResult(
            commandId = command.id,
            type = command.type,
            success = true,
            data = mapOf("apps" to apps, "count" to apps.size)
        )
    }

    private fun getBattery(command: RemoteCommand): CommandResult {
        val level = DeviceUtils.getBatteryLevel(context)
        return CommandResult(
            commandId = command.id,
            type = command.type,
            success = true,
            data = mapOf("batteryLevel" to level)
        )
    }

    private fun getStorageInfo(command: RemoteCommand): CommandResult {
        val stat = StatFs(Environment.getExternalStorageDirectory().path)
        val totalBytes = stat.totalBytes
        val freeBytes = stat.freeBytes
        val usedBytes = totalBytes - freeBytes

        return CommandResult(
            commandId = command.id,
            type = command.type,
            success = true,
            data = mapOf(
                "totalBytes" to totalBytes,
                "freeBytes" to freeBytes,
                "usedBytes" to usedBytes,
                "totalGB" to String.format("%.2f", totalBytes / 1_073_741_824.0),
                "freeGB" to String.format("%.2f", freeBytes / 1_073_741_824.0),
                "usedGB" to String.format("%.2f", usedBytes / 1_073_741_824.0)
            )
        )
    }

    companion object {
        private const val TAG = "CommandEngine"
    }
}
