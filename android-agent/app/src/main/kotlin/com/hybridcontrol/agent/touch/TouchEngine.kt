package com.hybridcontrol.agent.touch

import android.content.Context
import android.util.Log
import com.hybridcontrol.agent.model.CommandResult
import com.hybridcontrol.agent.model.RemoteCommand
import com.hybridcontrol.agent.util.DeviceUtils
import kotlinx.coroutines.delay

class TouchEngine(private val context: Context) {

    private val supportedTouchCommands = setOf(
        "TAP",
        "SWIPE",
        "INPUT_TEXT",
        "LONG_PRESS",
        "SCROLL"
    )

    fun canHandle(commandType: String): Boolean {
        return commandType in supportedTouchCommands
    }

    fun isAccessibilityEnabled(): Boolean {
        return DeviceUtils.isAccessibilityServiceEnabled(
            context,
            TouchAccessibilityService::class.java
        )
    }

    suspend fun execute(command: RemoteCommand): CommandResult {
        if (!isAccessibilityEnabled()) {
            return CommandResult(
                commandId = command.id,
                type = command.type,
                success = false,
                error = "Accessibility service not enabled. Please enable it in Settings."
            )
        }

        val service = TouchAccessibilityService.instance
            ?: return CommandResult(
                commandId = command.id,
                type = command.type,
                success = false,
                error = "Accessibility service not running"
            )

        return try {
            when (command.type) {
                "TAP" -> executeTap(service, command)
                "SWIPE" -> executeSwipe(service, command)
                "INPUT_TEXT" -> executeInputText(service, command)
                "LONG_PRESS" -> executeLongPress(service, command)
                "SCROLL" -> executeScroll(service, command)
                else -> CommandResult(
                    commandId = command.id,
                    type = command.type,
                    success = false,
                    error = "Unsupported touch command: ${command.type}"
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Touch command failed: ${e.message}")
            CommandResult(
                commandId = command.id,
                type = command.type,
                success = false,
                error = e.message ?: "Touch execution failed"
            )
        }
    }

    private suspend fun executeTap(service: TouchAccessibilityService, command: RemoteCommand): CommandResult {
        val x = (command.payload?.get("x") as? Number)?.toFloat()
            ?: return CommandResult(command.id, command.type, false, error = "Missing x coordinate")
        val y = (command.payload?.get("y") as? Number)?.toFloat()
            ?: return CommandResult(command.id, command.type, false, error = "Missing y coordinate")

        val success = service.performTap(x, y)
        return CommandResult(
            commandId = command.id,
            type = command.type,
            success = success,
            data = if (success) mapOf("action" to "tap", "x" to x, "y" to y) else null,
            error = if (!success) "Tap failed" else null
        )
    }

    private suspend fun executeSwipe(service: TouchAccessibilityService, command: RemoteCommand): CommandResult {
        val startX = (command.payload?.get("startX") as? Number)?.toFloat()
            ?: return CommandResult(command.id, command.type, false, error = "Missing startX")
        val startY = (command.payload?.get("startY") as? Number)?.toFloat()
            ?: return CommandResult(command.id, command.type, false, error = "Missing startY")
        val endX = (command.payload?.get("endX") as? Number)?.toFloat()
            ?: return CommandResult(command.id, command.type, false, error = "Missing endX")
        val endY = (command.payload?.get("endY") as? Number)?.toFloat()
            ?: return CommandResult(command.id, command.type, false, error = "Missing endY")
        val duration = (command.payload?.get("duration") as? Number)?.toLong() ?: 300L

        val success = service.performSwipe(startX, startY, endX, endY, duration)
        return CommandResult(
            commandId = command.id,
            type = command.type,
            success = success,
            data = if (success) mapOf("action" to "swipe") else null,
            error = if (!success) "Swipe failed" else null
        )
    }

    private suspend fun executeInputText(service: TouchAccessibilityService, command: RemoteCommand): CommandResult {
        val text = command.payload?.get("text") as? String
            ?: return CommandResult(command.id, command.type, false, error = "Missing text")

        val success = service.performInputText(text)
        return CommandResult(
            commandId = command.id,
            type = command.type,
            success = success,
            data = if (success) mapOf("action" to "input_text", "length" to text.length) else null,
            error = if (!success) "Text input failed" else null
        )
    }

    private suspend fun executeLongPress(service: TouchAccessibilityService, command: RemoteCommand): CommandResult {
        val x = (command.payload?.get("x") as? Number)?.toFloat()
            ?: return CommandResult(command.id, command.type, false, error = "Missing x coordinate")
        val y = (command.payload?.get("y") as? Number)?.toFloat()
            ?: return CommandResult(command.id, command.type, false, error = "Missing y coordinate")
        val duration = (command.payload?.get("duration") as? Number)?.toLong() ?: 1000L

        val success = service.performLongPress(x, y, duration)
        return CommandResult(
            commandId = command.id,
            type = command.type,
            success = success,
            data = if (success) mapOf("action" to "long_press", "x" to x, "y" to y) else null,
            error = if (!success) "Long press failed" else null
        )
    }

    private suspend fun executeScroll(service: TouchAccessibilityService, command: RemoteCommand): CommandResult {
        val direction = command.payload?.get("direction") as? String ?: "down"
        val amount = (command.payload?.get("amount") as? Number)?.toInt() ?: 500

        val success = service.performScroll(direction, amount)
        return CommandResult(
            commandId = command.id,
            type = command.type,
            success = success,
            data = if (success) mapOf("action" to "scroll", "direction" to direction) else null,
            error = if (!success) "Scroll failed" else null
        )
    }

    companion object {
        private const val TAG = "TouchEngine"
    }
}
