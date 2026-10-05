import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { createBarcodeDecoder } from "../lib/barcode";
import type { BarcodeDecoder } from "../lib/barcode";

interface FileScannerProps {
  onResult: (text: string) => void;
  onError: (message: string) => void;
}

interface LoadedSource {
  source: CanvasImageSource;
  release: () => void;
}

/**
 * Готовит изображение к распознаванию. Предпочитаем `createImageBitmap`
 * (быстрее и не требует DOM), иначе откатываемся на <img> + object URL.
 */
async function loadSource(file: File): Promise<LoadedSource> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, release: () => bitmap.close() };
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Не удалось открыть изображение"));
      element.src = url;
    });
    return { source: image, release: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

export default function FileScanner({ onResult, onError }: FileScannerProps) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const decoderRef = useRef<Promise<BarcodeDecoder> | null>(null);

  const decodeFile = useCallback(
    async (file: File) => {
      setBusy(true);
      let loaded: LoadedSource | null = null;
      try {
        loaded = await loadSource(file);

        // Движок распознавания создаётся лениво и переиспользуется.
        if (!decoderRef.current) {
          decoderRef.current = createBarcodeDecoder();
        }
        const pending = decoderRef.current;
        let decoder: BarcodeDecoder;
        try {
          decoder = await pending;
        } catch {
          decoderRef.current = null;
          onError("Не удалось загрузить модуль распознавания. Проверьте соединение.");
          return;
        }

        // thorough: разбираем готовый файл — точность важнее скорости.
        const code = await decoder.decode(loaded.source, { thorough: true });
        if (code) {
          onResult(code.text);
        } else {
          onError("На изображении не удалось распознать QR-код.");
        }
      } catch {
        onError("Не удалось прочитать изображение. Попробуйте другой файл.");
      } finally {
        loaded?.release();
        setBusy(false);
        if (inputRef.current) {
          inputRef.current.value = "";
        }
      }
    },
    [onError, onResult],
  );

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void decodeFile(file);
    }
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void decodeFile(file);
    }
  };

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Сканирование из изображения</h2>
        {busy && <span className="badge badge--live">● Обработка…</span>}
      </div>

      <label
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleChange}
          hidden
        />
        <span className="dropzone__icon">🖼️</span>
        <span className="dropzone__title">Перетащите изображение сюда</span>
        <span className="dropzone__hint">или нажмите, чтобы выбрать файл</span>
      </label>
    </section>
  );
}
