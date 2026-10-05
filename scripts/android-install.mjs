// Сборка Android-APK и установка его на подключённое устройство БЕЗ удаления
// приложения (`adb install -r`). Данные приложения (история сканов в WebView
// localStorage) сохраняются, потому что package id и ключ подписи не меняются.
//
// Скрипт сам решает две типичные проблемы:
//   1) `adb` не в PATH — ищем его в ANDROID_SDK_ROOT/ANDROID_HOME и в
//      %LOCALAPPDATA%\Android\Sdk\platform-tools;
//   2) подключено несколько устройств — нужно выбрать одно через --target,
//      иначе покажем список и подскажем, как выбрать.
//
// Запуск:
//   node scripts/android-install.mjs                 # собрать release и поставить
//   node scripts/android-install.mjs --apk-only      # только собрать APK
//   node scripts/android-install.mjs --target 711ef096
//   node scripts/android-install.mjs --debug         # собрать/поставить debug
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ANDROID_DIR = resolve(ROOT, "android");
const IS_WINDOWS = process.platform === "win32";

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
const getOpt = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : undefined;
};

const APK_ONLY = hasFlag("--apk-only");
const DEBUG = hasFlag("--debug");
const VARIANT = DEBUG ? "Debug" : "Release";
const VARIANT_LOWER = VARIANT.toLowerCase();
let target = getOpt("--target") ?? process.env.ANDROID_SERIAL;

function log(message) {
  console.log(`\n[android-install] ${message}`);
}

function fail(message) {
  console.error(`\n[android-install] ОШИБКА: ${message}`);
  process.exit(1);
}

// appId берём из capacitor.config.ts, чтобы не дублировать строку.
function readAppId() {
  try {
    const config = readFileSync(resolve(ROOT, "capacitor.config.ts"), "utf8");
    const match = config.match(/appId:\s*["']([^"']+)["']/);
    if (match) return match[1];
  } catch {
    // ignore — используем значение по умолчанию
  }
  return "com.qrscanner.app";
}

// Ищем adb: сначала в переменных окружения SDK, потом в стандартных путях.
function findAdb() {
  const exe = IS_WINDOWS ? "adb.exe" : "adb";
  const candidates = [];
  for (const envVar of ["ANDROID_SDK_ROOT", "ANDROID_HOME"]) {
    const sdk = process.env[envVar];
    if (sdk) candidates.push(join(sdk, "platform-tools", exe));
  }
  if (IS_WINDOWS) {
    if (process.env.LOCALAPPDATA) {
      candidates.push(join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", exe));
    }
    candidates.push("C:\\Program Files (x86)\\Android\\android-sdk\\platform-tools\\adb.exe");
  }
  const found = candidates.find((candidate) => existsSync(candidate));
  return found ?? "adb"; // последняя надежда — adb из PATH
}

// Gradle 8.14 не работает на JDK 25 ("class file major version 69"). Если
// текущий JAVA_HOME не 21, пробуем найти 21-ю JDK в ~/.jdks (её ставит JB/IDEA).
// Внимание: рядом лежат папки-заглушки вида ".jbr-21.x.intellij" без bin/java —
// их пропускаем.
function isValidJdk(dir) {
  return existsSync(join(dir, "bin", IS_WINDOWS ? "java.exe" : "java"));
}

function findJavaHome() {
  const current = process.env.JAVA_HOME;
  if (current && /21/.test(current) && isValidJdk(current)) return current;
  const jdksDir = join(homedir(), ".jdks");
  if (existsSync(jdksDir)) {
    const match = readdirSync(jdksDir)
      .filter((name) => !name.startsWith(".") && /(jbr|jdk)-?21/.test(name))
      .sort()
      .reverse()
      .map((name) => join(jdksDir, name))
      .find(isValidJdk);
    if (match) return match;
  }
  return current; // пусть Gradle использует то, что есть в окружении
}

// Список устройств в состоянии "device" (то есть реально готовых к работе).
function listDevices(adb) {
  const result = spawnSync(adb, ["devices"], { encoding: "utf8" });
  if (result.error) fail(`не удалось запустить adb (${adb}): ${result.error.message}`);
  return (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("List of devices") && !line.startsWith("*"))
    .map((line) => {
      const [serial, state] = line.split(/\s+/);
      return { serial, state };
    })
    .filter((device) => device.state === "device");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) fail(`не удалось запустить «${command}»: ${result.error.message}`);
  return result.status ?? 1;
}

function build() {
  const javaHome = findJavaHome();
  log(`Сборка assemble${VARIANT}${javaHome ? ` (JAVA_HOME=${javaHome})` : ""}`);
  const env = { ...process.env };
  if (javaHome) env.JAVA_HOME = javaHome;
  // .bat на Windows запускаем через cmd.exe (без shell:true — иначе Node ругается
  // на непроэкранированные аргументы).
  const command = IS_WINDOWS ? "cmd.exe" : "./gradlew";
  const args = IS_WINDOWS ? ["/c", "gradlew.bat", `assemble${VARIANT}`] : [`assemble${VARIANT}`];
  const status = run(command, args, { cwd: ANDROID_DIR, env });
  if (status !== 0) fail(`Gradle завершился с кодом ${status}`);
}


function main() {
  const adb = findAdb();
  const appId = readAppId();
  const apkPath = resolve(
    ANDROID_DIR,
    "app",
    "build",
    "outputs",
    "apk",
    VARIANT_LOWER,
    `app-${VARIANT_LOWER}.apk`,
  );

  build();

  if (!existsSync(apkPath)) fail(`APK не найден: ${apkPath}`);
  log(`APK готов: ${apkPath}`);

  if (APK_ONLY) return;

  const devices = listDevices(adb);
  if (devices.length === 0) {
    fail("не найдено ни одного подключённого устройства (adb devices пуст). Включите USB-отладку или эмулятор.");
  }

  if (!target) {
    if (devices.length > 1) {
      const list = devices.map((d) => `  --target ${d.serial}`).join("\n");
      fail(`подключено несколько устройств — укажите нужное:\n${list}`);
    }
    target = devices[0].serial;
  } else if (!devices.some((d) => d.serial === target)) {
    const list = devices.map((d) => `  ${d.serial}`).join("\n");
    fail(`устройство «${target}» не найдено. Доступные:\n${list}`);
  }

  const deviceArgs = ["-s", target];
  log(`Установка на ${target} (поверх существующей версии, без удаления)`);
  const installStatus = run(adb, [...deviceArgs, "install", "-r", apkPath]);
  if (installStatus !== 0) {
    fail(
      "adb install не удался. Если ошибка INSTALL_FAILED_UPDATE_INCOMPATIBLE — на устройстве " +
        "стоит сборка, подписанная ДРУГИМ ключом (например, из Play Store). Тогда один раз нужно " +
        "удалить приложение вручную, дальше обновления пойдут без удаления.",
    );
  }

  log(`Запуск ${appId}/.MainActivity`);
  run(adb, [...deviceArgs, "shell", "am", "start", "-n", `${appId}/.MainActivity`]);

  log("Готово: приложение обновлено и запущено.");
}

main();

