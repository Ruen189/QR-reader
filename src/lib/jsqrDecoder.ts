import jsQR from "jsqr";
import type {
  BarcodeDecoder,
  DecodeSource,
  ScanBox,
} from "./barcode";

/**
 * Резервный декодер на `jsqr` — используется только там, где нет нативного
 * `BarcodeDetector`. Это чистый JS без воркеров и WASM, поэтому чанк
 * подгружается динамически и не весит ничего при старте приложения.
 */

/** Максимальная сторона кадра для анализа: меньше пикселей — быстрее. */
const MAX_SIDE = 640;

interface Size {
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

interface QrLocation {
  topLeftCorner?: Point;
  topRightCorner?: Point;
  bottomLeftCorner?: Point;
  bottomRightCorner?: Point;
}

/** Определяет размеры источника кадра в пикселях. */
function measure(source: DecodeSource): Size {
  if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height };
  }
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }
  return { width: 0, height: 0 };
}

/** Масштаб, уменьшающий кадр до MAX_SIDE (1 — если уменьшать не нужно). */
function fitScale(size: Size): number {
  const longest = Math.max(size.width, size.height);
  return longest > MAX_SIDE ? MAX_SIDE / longest : 1;
}

/** Строит ограничивающий прямоугольник по четырём углам найденного кода. */
function boxFromCorners(location: QrLocation, scale: number): ScanBox | undefined {
  const points = [
    location.topLeftCorner,
    location.topRightCorner,
    location.bottomRightCorner,
    location.bottomLeftCorner,
  ].filter((point): point is Point => Boolean(point));
  if (points.length === 0) return undefined;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = (Math.max(...xs) - minX) * scale;
  const height = (Math.max(...ys) - minY) * scale;
  if (width <= 0 || height <= 0) return undefined;

  return { x: minX * scale, y: minY * scale, width, height };
}

/** Создаёт резервный декодер на jsqr. */
export function createJsQrDecoder(): BarcodeDecoder {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;

  return {
    kind: "jsqr",
    async decode(source, options) {
      const size = measure(source);
      if (!size.width || !size.height) return null;

      if (!canvas) {
        canvas = document.createElement("canvas");
        // Подсказка браузеру: с canvas будем часто читать пиксели.
        // Приведение типа — свойство есть не во всех версиях lib.dom.
        const hint = { willReadFrequently: true } as unknown as CanvasRenderingContext2DSettings;
        ctx = canvas.getContext("2d", hint);
      }
      if (!ctx) return null;

      const scale = fitScale(size);
      const width = Math.max(1, Math.round(size.width * scale));
      const height = Math.max(1, Math.round(size.height * scale));

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(source, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);
      const found = jsQR(imageData.data, width, height, {
        // При сканировании в реальном времени перебор инверсии лишь замедляет,
        // а при разборе готового файла точность важнее скорости.
        inversionAttempts: options?.thorough ? "attemptBoth" : "dontInvert",
      });
      if (!found) return null;

      return {
        text: found.data,
        format: "QR_CODE",
        box: boxFromCorners(found.location, 1 / scale),
      };
    },
  };
}
