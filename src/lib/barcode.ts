/**
 * Распознавание QR-кодов и штрихкодов.
 *
 * Приоритет отдан нативному `BarcodeDetector` — он уже встроен в Chromium
 * (и в WebView на Android), поэтому не требует загрузки стороннего кода.
 * Если он недоступен, лениво подгружается резервный движок на `jsqr`
 * (≈40 КБ вместо ≈490 КБ у прежнего `html5-qrcode`).
 */

/** Прямоугольник в пикселях исходного изображения. */
export interface ScanBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Результат распознавания одного кода. */
export interface DetectedCode {
  /** Распознанный текст. */
  text: string;
  /** Имя формата, напр. «QR_CODE» или «EAN_13». */
  format?: string;
  /** Область кода на изображении (если декодер её вернул). */
  box?: ScanBox;
}

/** Источник кадра: видео, canvas, картинка или ImageBitmap. */
export type DecodeSource = CanvasImageSource;

/** Дополнительные параметры распознавания. */
export interface DecodeOptions {
  /** Тщательный режим: пробует и инвертированные коды (медленнее). */
  thorough?: boolean;
}

/**
 * Декодер кодов — единый интерфейс для нативного API и резервного движка,
 * чтобы вызывающий код не зависел от конкретной реализации.
 */
export interface BarcodeDecoder {
  /** Какой движок используется. */
  readonly kind: "native" | "jsqr";
  /** Распознаёт код на источнике или возвращает null. */
  decode(
    source: DecodeSource,
    options?: DecodeOptions,
  ): Promise<DetectedCode | null>;
}

interface DetectedBarcodeLike {
  rawValue: string;
  format?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcodeLike[]>;
}

/** Конструктор нативного BarcodeDetector. */
export interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
}

/**
 * Возвращает нативный конструктор `BarcodeDetector`, если он есть
 * в текущем окружении.
 */
export function getNativeBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
  return typeof ctor === "function" ? (ctor as BarcodeDetectorCtor) : null;
}

/** Преобразует найденный прямоугольник в наш формат (или undefined). */
function toBox(
  rect?: { x: number; y: number; width: number; height: number },
): ScanBox | undefined {
  if (!rect || !Number.isFinite(rect.width) || rect.width <= 0) return undefined;
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/**
 * Пробует создать декодер на нативном `BarcodeDetector`.
 * Возвращает null, если API нет или сервис распознавания недоступен
 * (в некоторых сборках WebView конструктор есть, но `detect()` падает
 * без сервисов Google Play).
 */
async function createNativeDecoder(): Promise<BarcodeDecoder | null> {
  const Ctor = getNativeBarcodeDetectorCtor();
  if (!Ctor) return null;

  let detector: BarcodeDetectorLike;
  try {
    detector = new Ctor();
    const probe = document.createElement("canvas");
    probe.width = 8;
    probe.height = 8;
    await detector.detect(probe);
  } catch {
    return null;
  }

  return {
    kind: "native",
    async decode(source) {
      try {
        const found = await detector.detect(source);
        const first = found[0];
        if (!first?.rawValue) return null;
        return {
          text: first.rawValue,
          format: first.format,
          box: toBox(first.boundingBox),
        };
      } catch {
        // Кадр не распознан — для сканирования в реальном времени это норма.
        return null;
      }
    },
  };
}

/**
 * Создаёт декодер: сначала пробует нативный `BarcodeDetector`, при неудаче
 * лениво подгружает резервный движок на `jsqr`.
 */
export async function createBarcodeDecoder(): Promise<BarcodeDecoder> {
  const native = await createNativeDecoder();
  if (native) return native;

  // Динамический импорт: код jsqr попадает в отдельный чанк и скачивается
  // только тем устройствам, где нет нативного распознавания.
  const { createJsQrDecoder } = await import("./jsqrDecoder");
  return createJsQrDecoder();
}
