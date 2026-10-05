// Генератор PNG-иконок для PWA без внешних зависимостей.
// Рисует градиентный значок с QR-узором и кодирует его в PNG (zlib из Node).
// Запуск: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "public", "icons");

// ---------- CRC32 и сборка PNG ----------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type "none"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- Рисование значка ----------
const GRID = 25; // количество модулей по стороне
const GRADIENT_A = [108, 140, 255]; // #6c8cff
const GRADIENT_B = [155, 108, 255]; // #9b6cff
const LIGHT = [255, 255, 255];

// Простой детерминированный генератор псевдослучайных чисел.
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

// Строим матрицу QR-подобного узора: три "глазка"-искателя + шум данных.
function buildMatrix() {
  const grid = Array.from({ length: GRID }, () => new Array(GRID).fill(false));
  const reserved = Array.from({ length: GRID }, () => new Array(GRID).fill(false));

  const markFinder = (c0, r0) => {
    for (let r = r0 - 1; r <= r0 + 7; r++) {
      for (let c = c0 - 1; c <= c0 + 7; c++) {
        if (r >= 0 && r < GRID && c >= 0 && c < GRID) reserved[r][c] = true;
      }
    }
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const border = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[r0 + r][c0 + c] = border || core;
      }
    }
  };

  markFinder(0, 0);
  markFinder(GRID - 7, 0);
  markFinder(0, GRID - 7);

  const rand = makeRandom(20240517);
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (reserved[r][c]) continue;
      grid[r][c] = rand() > 0.52;
    }
  }
  return grid;
}

function isInsideRoundedRect(x, y, size, radius) {
  const rx = Math.min(x, size - 1 - x);
  const ry = Math.min(y, size - 1 - y);
  if (rx >= radius || ry >= radius) return true;
  const dx = radius - rx;
  const dy = radius - ry;
  return dx * dx + dy * dy <= radius * radius;
}

function renderIcon(size, maskable, circle = false) {
  const rgba = Buffer.alloc(size * size * 4);
  const matrix = buildMatrix();
  const radius = maskable || circle ? 0 : Math.round(size * 0.22);
  const padding = maskable ? 0.3 : circle ? 0.24 : 0.14;
  const cell = (size * (1 - 2 * padding)) / GRID;
  const originX = (size - cell * GRID) / 2;
  const originY = (size - cell * GRID) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      const t = (x + y) / (2 * size);
      let r = Math.round(GRADIENT_A[0] + (GRADIENT_B[0] - GRADIENT_A[0]) * t);
      let g = Math.round(GRADIENT_A[1] + (GRADIENT_B[1] - GRADIENT_A[1]) * t);
      let b = Math.round(GRADIENT_A[2] + (GRADIENT_B[2] - GRADIENT_A[2]) * t);

      let bgAlpha = 255;
      if (radius > 0 || circle) {
        let hits = 0;
        for (let sy = 0; sy < 3; sy++) {
          for (let sx = 0; sx < 3; sx++) {
            const px = x + (sx + 0.5) / 3;
            const py = y + (sy + 0.5) / 3;
            if (circle) {
              const dx = px - size / 2;
              const dy = py - size / 2;
              if (dx * dx + dy * dy <= (size / 2) * (size / 2)) hits++;
            } else if (isInsideRoundedRect(px, py, size, radius)) {
              hits++;
            }
          }
        }
        bgAlpha = Math.round((hits / 9) * 255);
      }

      const col = Math.floor((x - originX) / cell);
      const row = Math.floor((y - originY) / cell);
      if (row >= 0 && row < GRID && col >= 0 && col < GRID && matrix[row][col]) {
        r = LIGHT[0];
        g = LIGHT[1];
        b = LIGHT[2];
      }

      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = bgAlpha;
    }
  }

  return encodePng(size, size, rgba);
}

const targets = [
  { name: "pwa-192x192.png", size: 192, maskable: false },
  { name: "pwa-512x512.png", size: 512, maskable: false },
  { name: "maskable-192x192.png", size: 192, maskable: true },
  { name: "maskable-512x512.png", size: 512, maskable: true },
  { name: "apple-touch-icon.png", size: 180, maskable: false },
  { name: "favicon-32.png", size: 32, maskable: false },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const { name, size, maskable } of targets) {
  const png = renderIcon(size, maskable);
  writeFileSync(resolve(OUT_DIR, name), png);
  console.log(`✓ ${name} (${size}x${size}, ${png.length} байт)`);
}

console.log(`Иконки записаны в ${OUT_DIR}`);

// ---------- Android (Capacitor) ----------
// Передний слой adaptive-иконки: прозрачный фон + узор в "безопасной зоне".
function renderForeground(size) {
  const rgba = Buffer.alloc(size * size * 4); // полностью прозрачный
  const matrix = buildMatrix();
  const padding = 0.32;
  const cell = (size * (1 - 2 * padding)) / GRID;
  const originX = (size - cell * GRID) / 2;
  const originY = (size - cell * GRID) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const col = Math.floor((x - originX) / cell);
      const row = Math.floor((y - originY) / cell);
      if (row < 0 || row >= GRID || col < 0 || col >= GRID) continue;
      if (!matrix[row][col]) continue;
      const i = (y * size + x) * 4;
      rgba[i] = 255;
      rgba[i + 1] = 255;
      rgba[i + 2] = 255;
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

const ANDROID_RES = resolve(__dirname, "..", "android", "app", "src", "main", "res");

// Splash-экран: градиент на весь экран + по центру QR-знак.
function renderSplash(width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  const matrix = buildMatrix();
  const markSize = Math.round(Math.min(width, height) * 0.4);
  const cell = markSize / GRID;
  const originX = (width - markSize) / 2;
  const originY = (height - markSize) / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const t = (x + y) / (width + height);
      let r = Math.round(GRADIENT_A[0] + (GRADIENT_B[0] - GRADIENT_A[0]) * t);
      let g = Math.round(GRADIENT_A[1] + (GRADIENT_B[1] - GRADIENT_A[1]) * t);
      let b = Math.round(GRADIENT_A[2] + (GRADIENT_B[2] - GRADIENT_A[2]) * t);

      const col = Math.floor((x - originX) / cell);
      const row = Math.floor((y - originY) / cell);
      if (row >= 0 && row < GRID && col >= 0 && col < GRID && matrix[row][col]) {
        r = LIGHT[0];
        g = LIGHT[1];
        b = LIGHT[2];
      }

      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
  return encodePng(width, height, rgba);
}

const SPLASH_TARGETS = [
  { path: "drawable/splash.png", w: 480, h: 320 },
  { path: "drawable-land-mdpi/splash.png", w: 480, h: 320 },
  { path: "drawable-land-hdpi/splash.png", w: 800, h: 480 },
  { path: "drawable-land-xhdpi/splash.png", w: 1280, h: 720 },
  { path: "drawable-land-xxhdpi/splash.png", w: 1600, h: 960 },
  { path: "drawable-land-xxxhdpi/splash.png", w: 1920, h: 1280 },
  { path: "drawable-port-mdpi/splash.png", w: 320, h: 480 },
  { path: "drawable-port-hdpi/splash.png", w: 480, h: 800 },
  { path: "drawable-port-xhdpi/splash.png", w: 720, h: 1280 },
  { path: "drawable-port-xxhdpi/splash.png", w: 960, h: 1600 },
  { path: "drawable-port-xxxhdpi/splash.png", w: 1280, h: 1920 },
];


const ANDROID_DENSITIES = [
  { dir: "mipmap-mdpi", legacy: 48, foreground: 108 },
  { dir: "mipmap-hdpi", legacy: 72, foreground: 162 },
  { dir: "mipmap-xhdpi", legacy: 96, foreground: 216 },
  { dir: "mipmap-xxhdpi", legacy: 144, foreground: 324 },
  { dir: "mipmap-xxxhdpi", legacy: 192, foreground: 432 },
];

const GRADIENT_BACKGROUND_XML = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient
                android:startX="0"
                android:startY="0"
                android:endX="108"
                android:endY="108"
                android:type="linear">
                <item android:offset="0" android:color="#FF6C8CFF" />
                <item android:offset="1" android:color="#FF9B6CFF" />
            </gradient>
        </aapt:attr>
    </path>
</vector>
`;

const ADAPTIVE_ICON_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;

const FALLBACK_COLOR_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#6C8CFF</color>
</resources>
`;

if (existsSync(ANDROID_RES)) {
  for (const { dir, legacy, foreground } of ANDROID_DENSITIES) {
    const target = resolve(ANDROID_RES, dir);
    mkdirSync(target, { recursive: true });
    writeFileSync(resolve(target, "ic_launcher.png"), renderIcon(legacy, false, false));
    writeFileSync(resolve(target, "ic_launcher_round.png"), renderIcon(legacy, false, true));
    writeFileSync(resolve(target, "ic_launcher_foreground.png"), renderForeground(foreground));
  }

  const writeRes = (relative, content) => {
    const file = resolve(ANDROID_RES, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  // Важно: пути должны быть относительными строками, а не resolve(...) —
  // иначе они считаются от cwd и файлы улетают в корень проекта.
  writeRes("drawable/ic_launcher_background.xml", GRADIENT_BACKGROUND_XML);
  writeRes("values/ic_launcher_background.xml", FALLBACK_COLOR_XML);
  writeRes("mipmap-anydpi-v26/ic_launcher.xml", ADAPTIVE_ICON_XML);
  writeRes("mipmap-anydpi-v26/ic_launcher_round.xml", ADAPTIVE_ICON_XML);

  for (const { path: rel, w, h } of SPLASH_TARGETS) {
    writeRes(rel, renderSplash(w, h));
  }

  console.log(`Иконки Android записаны в ${ANDROID_RES}`);
} else {
  console.log("Папка android/ не найдена — иконки Android пропущены (сначала `npx cap add android`).");
}

