# Capacitor & WebView Bridge Keep Rules for Play Store R8 Release AAB
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}
-keep @com.getcapacitor.annotation.CapacitorPlugin class * {
    *;
}
-keep class com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**

# Preserve line numbers for Crashlytics / Play Console stack traces
-keepattributes SourceFile,LineNumberTable
