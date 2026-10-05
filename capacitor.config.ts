import type { CapacitorConfig } from "@capacitor/cli";

// Конфигурация нативной сборки (Android/iOS) через Capacitor.
// Веб-приложение собирается в dist/ (см. "build:android") и пакуется в APK/AAB.
const config: CapacitorConfig = {
  appId: "com.qrscanner.app",
  appName: "QR Scanner",
  webDir: "dist",
  // Нативный WebView работает по схеме https://localhost — это "безопасный
  // контекст", поэтому доступ к камере (getUserMedia) разрешён.
  server: {
    androidScheme: "https",
  },
};

export default config;
