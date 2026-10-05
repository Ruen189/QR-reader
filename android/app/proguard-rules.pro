# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Важно: приложение на Capacitor — веб-код вызывает нативные методы через
# рефлексию (по строковым именам), поэтому R8 не должен вырезать и
# переименовывать соответствующие классы и методы, иначе релизная сборка
# падает с ClassNotFoundException / NoSuchMethodError.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep class com.qrscanner.app.** { *; }

# Мосты WebView <-> JavaScript: методы с @JavascriptInterface вызываются из JS.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface

# Сохраняем читаемые стектрейсы (нужно для разбора крашей из Google Play).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

