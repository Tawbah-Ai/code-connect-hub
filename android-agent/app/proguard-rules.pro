# Hybrid Control Agent ProGuard Rules
-keepattributes Signature
-keepattributes *Annotation*

# Gson
-keep class com.hybridcontrol.agent.model.** { *; }
-keepclassmembers class com.hybridcontrol.agent.model.** { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
