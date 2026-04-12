package com.hybridcontrol.agent.model

data class DeviceInfo(
    val deviceId: String,
    val deviceName: String,
    val model: String,
    val osVersion: String,
    val sdkVersion: Int,
    val manufacturer: String
)

enum class DeviceRole {
    OWNER,
    CLIENT
}

data class RemoteCommand(
    val id: String,
    val type: String,
    val payload: Map<String, Any>? = null,
    val fromDeviceId: String? = null
)

data class CommandResult(
    val commandId: String,
    val type: String,
    val success: Boolean,
    val data: Any? = null,
    val error: String? = null
)

enum class ControlMode {
    COMMAND,
    TOUCH,
    HYBRID
}

data class FileInfo(
    val name: String,
    val path: String,
    val size: Long,
    val isDirectory: Boolean,
    val lastModified: Long
)
