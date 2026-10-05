# QR Scanner

Устанавливаемый веб-сканер QR-кодов (**PWA**) на **React + Vite + TypeScript**.
Распознаёт QR-коды:

- 📷 **с камеры** в реальном времени (с выбором камеры);
- 🖼️ **из изображения** (загрузка файла или drag & drop).

Распознавание кодов работает в два уровня — **нативный `BarcodeDetector`**
(встроен в Chromium/WebView, ничего не скачивается) и лёгкий резервный движок
[`jsqr`](https://github.com/cozmo/jsQR) для браузеров без этого API.

## Возможности

- Сканирование с камеры в реальном времени, переключение камер.
- Запуск/остановка потока, индикатор состояния.
- Загрузка изображения с QR-кодом (выбор файла или перетаскивание).
- Копирование результата в буфер обмена.
- Автооткрытие результата, если это ссылка (http/https).
- История последних 20 сканирований — сохраняется между запусками (localStorage).
- Длинные ссылки корректно переносятся и не ломают вёрстку.
- **PWA**: устанавливается на телефон/десктоп как обычное приложение,
  работает оффлайн, имеет свою иконку и запускается в полноэкранном режиме.

## Движок распознавания

| Уровень | Когда используется | Что скачивается |
| --- | --- | --- |
| Нативный `BarcodeDetector` | Везде, где API доступен (Chrome/WebView на Android) | ничего |
| `jsqr` (резервный) | Только если нативного API нет | отдельный чанк ≈48 КБ gzip, **лениво** |

Нативный движок распознаёт 13 форматов (`qr_code`, `ean_13`, `code_128`,
`data_matrix`, `pdf417`, `aztec`, `itf`, `codabar`, `upc_a`, `upc_e`, `code_39`,
`code_93`, `ean_8`); резервный `jsqr` — только QR-коды.

Сканеры (`CameraScanner`, `FileScanner`) и движок подгружаются лениво
(`React.lazy` + динамический `import()`), поэтому при старте скачивается только
небольшой основной бандл.


## Требования

- Node.js 18+ (проверено на Node 25).
- Браузер с поддержкой `getUserMedia`.

> ⚠️ Доступ к камере браузеры дают **только в «безопасном контексте»**:
> на `https://` или на `localhost`. Поэтому при работе с телефона по сети
> нужен HTTPS (см. ниже).

## Запуск на компьютере

```bash
npm install
npm run dev
```

Откройте http://localhost:5173 — камера работает сразу (localhost = безопасный
контекст).

## Запуск на телефоне 📱

Есть два способа. Рекомендуется первый — он даёт настоящий HTTPS и полноценную
установку приложения.

### Способ 1 (рекомендуется): задеплоить на хостинг

```bash
npm run build        # результат в папке dist/
```

Залейте содержимое `dist/` на любой статический хостинг с HTTPS, например:

- **Netlify Drop** — https://app.netlify.com/drop (просто перетащите папку `dist`);
- **Vercel** — `npx vercel deploy dist` либо через сайт;
- **GitHub Pages** — закоммитьте `dist/` в ветку `gh-pages`.

Откройте получившуюся **https-ссылку** на телефоне → браузер предложит
«Установить приложение» / «Добавить на главный экран». После установки камера
работает в полноэкранном режиме как в нативном приложении.

### Способ 2: локальная сеть с самоподписанным HTTPS

Телефон и компьютер должны быть в одной Wi-Fi сети.

```bash
npm run dev:https    # запускает dev-сервер по HTTPS
```

Vite выведет адрес вида `https://192.168.x.x:5173/`. На телефоне:

1. Откройте этот адрес.
2. Браузер предупредит о небезопасном сертификате — нажмите
   «Дополнительно» → «Перейти на сайт» (сертификат самоподписанный, это нормально).
3. Теперь доступ к камере разрешён, и приложение можно установить
   («Установить приложение» / «На экран Домой»).

> На iPhone для камеры надёжнее использовать Способ 1 (реальный HTTPS):
> Safari строго проверяет сертификаты, а само-подписанный может не дать
> доступ к камере.

## Нативная сборка под Android (APK/AAB) 📦

Приложение упаковано в нативный Android-проект через **Capacitor** (папка
`android/`). WebView работает по схеме `https://localhost`, поэтому доступ к
камере разрешён; разрешение `CAMERA` уже добавлено в `AndroidManifest.xml`,
иконки и splash-экран сгенерированы.

### Что нужно установить

- **JDK 17–21** (оптимально — JDK 21, встроенный в Android Studio).

  > ⚠️ **JDK 25 не подойдёт.** Groovy внутри Gradle 8.14 не умеет читать его
  > class-файлы, и сборка падает с `Unsupported class file major version 69`.
  > Если `JAVA_HOME` указывает на слишком новый JDK, укажите Gradle другой:
  > `$env:JAVA_HOME='C:\Users\<user>\.jdks\jbr-21.0.11'`
- **Android Studio** (включает Android SDK и эмулятор) либо отдельно
  Android SDK + переменная `ANDROID_HOME`.

### Быстрый путь через Android Studio

```bash
npm run build:android     # собрать веб-часть в dist/ (без PWA)
npx cap sync android      # скопировать dist/ в android/ и обновить плагины
npx cap open android      # открыть проект в Android Studio
```

Дальше в Android Studio: **Run ▶** — запуск на подключённом телефоне/эмуляторе,
либо **Build → Generate Signed App Bundle / APK** — для релизной сборки.

### Сборка из командной строки

```bash
npm run build:android
npx cap sync android
cd android
./gradlew assembleDebug        # Windows (PowerShell): .\gradlew.bat assembleDebug
# результат: android/app/build/outputs/apk/debug/app-debug.apk
```

Установка на подключённый по USB телефон:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

> Две первые команды объединены в скрипт: `npm run android:sync`.

### Релизная сборка (оптимизированная)

```bash
cd android
./gradlew assembleRelease      # Windows (PowerShell): .\gradlew.bat assembleRelease
# результат: android/app/build/outputs/apk/release/app-release.apk
```

Что включено для уменьшения размера:

- `minifyEnabled true` — R8 удаляет недостижимый код и обфусцирует классы;
- `shrinkResources true` — выбрасывает неиспользуемые ресурсы;
- `resourceConfigurations += ["en", "ru"]` — только нужные локали;
- `proguard-android-optimize.txt` + keep-правила для Capacitor в
  `android/app/proguard-rules.pro` (без них R8 вырежет методы, вызываемые
  из JS через рефлексию, и релиз упадёт);
- подпись из `android/keystore.properties`.

Результат: **4,29 МБ → 1,01 МБ** (≈ −76 %).

#### Подпись релиза

Параметры подписи читаются из `android/keystore.properties`
(файл **не** попадает в git, см. `.gitignore`):

```properties
storeFile=app/qr-scanner-release.jks
storePassword=...
keyAlias=...
keyPassword=...
```

Создать собственный keystore:

```bash
keytool -genkeypair -v -keystore android/app/qr-scanner-release.jks \
  -alias qrscanner -keyalg RSA -keysize 2048 -validity 10000
```

Если файла `keystore.properties` нет, релиз просто собирается **неподписанным** —
сборка у других разработчиков и в CI не ломается.

> ⚠️ Keystore создан локально и **не** попадает в git (`.gitignore`) — это
> тестовый ключ для локальных сборок. Для Google Play создайте свой и храните
> его в надёжном месте: потеря ключа делает невозможным обновление приложения.

### Публикация в Google Play

1. Создайте свой keystore и пропишите его в `android/keystore.properties`
   (см. «Подпись релиза»).
2. `cd android && ./gradlew bundleRelease` — соберёт подписанный `.aab`.
3. Загрузите `android/app/build/outputs/bundle/release/app-release.aab`
   в Google Play Console.

### После любых правок веб-кода

Повторите `npm run android:sync` (или `npm run android:copy`), чтобы обновить
файлы внутри нативного проекта.

## Скрипты

| Команда | Что делает |
| --- | --- |
| `npm run dev` | dev-сервер (http) |
| `npm run dev:https` | dev-сервер по HTTPS (для телефона в сети) |
| `npm run build` | веб-сборка в `dist/` (+ генерация иконок) |
| `npm run build:android` | сборка для Capacitor (без service worker) |
| `npm run preview` | предпросмотр собранной версии |
| `npm run icons` | перегенерировать иконки (web + Android + splash) |
| `npm run typecheck` | проверка типов TypeScript |
| `npm test` | юнит-тесты (Vitest), один прогон |
| `npm run test:watch` | юнит-тесты в режиме наблюдения |
| `npm run android:sync` | сборка + `cap sync android` |
| `npm run android:copy` | сборка + `cap copy android` |
| `npm run android:open` | открыть проект в Android Studio |
| `npm run android:run` | собрать и запустить на устройстве |

## Структура

```
├── index.html                  # HTML + мета для PWA/iOS
├── vite.config.ts              # Vite + PWA + HTTPS + режим capacitor + Vitest
├── capacitor.config.ts         # конфиг нативной сборки (Android/iOS)
├── scripts/
│   └── generate-icons.mjs      # генератор иконок web/Android + splash
├── public/
│   └── icons/                  # иконки PWA (генерируются)
├── android/                    # нативный Android-проект (Capacitor)
└── src/
    ├── App.tsx                 # экран: вкладки, результат, история, установка
    ├── main.tsx                # точка входа React
    ├── styles.css              # стили (тёмная тема)
    ├── hooks/
    │   └── usePwaInstall.ts    # логика кнопки «Установить приложение»
    ├── lib/
    │   ├── barcode.ts          # выбор движка: нативный BarcodeDetector
    │   ├── jsqrDecoder.ts      # резервный декодер (ленивый чанк)
    │   ├── scanHistory.ts      # история сканирований в localStorage
    │   └── url.ts              # проверка «это ссылка?»
    └── components/
        ├── CameraScanner.tsx   # сканирование с камеры
        └── FileScanner.tsx     # сканирование из изображения
```

## Тесты

```bash
npm test          # один прогон
npm run test:watch
```

Vitest (окружение Node) проверяет чистую логику: сохранение/загрузку истории
(`src/lib/scanHistory.test.ts`), определение ссылок (`src/lib/url.test.ts`) и
выбор движка распознавания (`src/lib/barcode.test.ts`). Тесты запускаются в CI.


## Как пользоваться

1. **Камера** — нажмите «Запустить камеру», наведите на QR-код.
   При необходимости выберите другую камеру из списка.
2. **Изображение** — перейдите на вкладку «Изображение» и выберите файл
   (или перетащите его в область).
3. Результат появится в блоке «Результат»; его можно скопировать или открыть
   как ссылку.

