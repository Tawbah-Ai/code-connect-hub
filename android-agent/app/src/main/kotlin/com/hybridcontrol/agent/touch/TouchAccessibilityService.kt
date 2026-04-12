package com.hybridcontrol.agent.touch

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

class TouchAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.d(TAG, "Accessibility service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Monitor user activity events
        event?.let {
            lastInteractionTime = System.currentTimeMillis()
        }
    }

    override fun onInterrupt() {
        Log.d(TAG, "Accessibility service interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        Log.d(TAG, "Accessibility service destroyed")
    }

    suspend fun performTap(x: Float, y: Float): Boolean {
        val path = Path().apply {
            moveTo(x, y)
        }

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 100))
            .build()

        return dispatchGestureAndWait(gesture)
    }

    suspend fun performSwipe(
        startX: Float, startY: Float,
        endX: Float, endY: Float,
        duration: Long
    ): Boolean {
        val path = Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, duration))
            .build()

        return dispatchGestureAndWait(gesture)
    }

    suspend fun performLongPress(x: Float, y: Float, duration: Long): Boolean {
        val path = Path().apply {
            moveTo(x, y)
        }

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, duration))
            .build()

        return dispatchGestureAndWait(gesture)
    }

    suspend fun performScroll(direction: String, amount: Int): Boolean {
        val displayMetrics = resources.displayMetrics
        val screenWidth = displayMetrics.widthPixels.toFloat()
        val screenHeight = displayMetrics.heightPixels.toFloat()
        val centerX = screenWidth / 2
        val centerY = screenHeight / 2

        val (startX, startY, endX, endY) = when (direction.lowercase()) {
            "up" -> listOf(centerX, centerY, centerX, centerY - amount)
            "down" -> listOf(centerX, centerY, centerX, centerY + amount)
            "left" -> listOf(centerX, centerY, centerX - amount, centerY)
            "right" -> listOf(centerX, centerY, centerX + amount, centerY)
            else -> return false
        }

        return performSwipe(startX, startY, endX, endY, 300)
    }

    fun performInputText(text: String): Boolean {
        val rootNode = rootInActiveWindow ?: return false
        val focusedNode = findFocusedNode(rootNode) ?: return false

        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        val result = focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        focusedNode.recycle()
        return result
    }

    private fun findFocusedNode(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (focused != null) return focused

        for (i in 0 until root.childCount) {
            val child = root.getChild(i) ?: continue
            val result = findFocusedNode(child)
            if (result != null) return result
            child.recycle()
        }
        return null
    }

    private suspend fun dispatchGestureAndWait(gesture: GestureDescription): Boolean {
        return suspendCancellableCoroutine { continuation ->
            val dispatched = dispatchGesture(gesture, object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    if (continuation.isActive) continuation.resume(true)
                }

                override fun onCancelled(gestureDescription: GestureDescription?) {
                    if (continuation.isActive) continuation.resume(false)
                }
            }, null)

            if (!dispatched && continuation.isActive) {
                continuation.resume(false)
            }
        }
    }

    fun isUserActive(): Boolean {
        return System.currentTimeMillis() - lastInteractionTime < USER_ACTIVE_THRESHOLD
    }

    companion object {
        private const val TAG = "TouchAccessibility"
        private const val USER_ACTIVE_THRESHOLD = 5000L

        var instance: TouchAccessibilityService? = null
            private set

        var lastInteractionTime: Long = 0
            private set
    }
}
