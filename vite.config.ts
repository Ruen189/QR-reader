import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
// Запуск:
//   npm run dev        — обычный http dev-сервер (камера работает только на localhost)
//   npm run dev:https  — https dev-сервер; камеру можно открыть с телефона в локальной сети
export default defineConfig(({ mode }) => {
  const useHttps = mode === "https";
  // При сборке под Android (Capacitor) service worker не нужен и может мешать:
  // нативный WebView и так отдаёт файлы локально.
  const isCapacitor = mode === "capacitor";

  return {
    plugins: [
      react(),
      // Самоподписанный сертификат — нужен, чтобы браузер считал страницу
      // "безопасным контекстом" и разрешил доступ к камере по сети.
      ...(useHttps ? [basicSsl()] : []),
      ...(isCapacitor
        ? []
        : [
            VitePWA({
              registerType: "autoUpdate",
        includeAssets: ["icons/favicon-32.png", "icons/apple-touch-icon.png"],
        manifest: {
          name: "QR Scanner",
          short_name: "QR Scanner",
          description: "Сканирование QR-кодов камерой и из изображений",
          lang: "ru",
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "portrait",
          theme_color: "#0f1220",
          background_color: "#0f1220",
          icons: [
            {
              src: "icons/pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "icons/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "icons/maskable-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "icons/maskable-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg,ico,webmanifest}"],
          cleanupOutdatedCaches: true,
        },
        devOptions: {
          // Включаем service worker и в dev, чтобы приложение можно было
          // установить на телефон прямо с dev-сервера (dev:https).
          enabled: true,
          suppressWarnings: true,
        },
            }),
          ]),
    ],
    server: {
      // host: true позволяет открыть приложение с телефона в локальной сети.
      host: true,
      port: 5173,
    },
    preview: {
      host: true,
      port: 4173,
    },
    // Юнит-тесты запускаются в Node: тестируем чистую логику без DOM.
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  };
});

