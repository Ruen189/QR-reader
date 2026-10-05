import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { Html5Qrcode } from "html5-qrcode";

/** html5-qrcode требует скрытый элемент-контейнер даже при сканировании файла */
const REGION_ID = "qr-file-region";

interface FileScannerProps {
  onResult: (text: string) => void;
  onError: (message: string) => void;
}

export default function FileScanner({ onResult, onError }: FileScannerProps) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const decodeFile = async (file: File) => {
    setBusy(true);
    let scanner: Html5Qrcode | null = null;
    try {
      scanner = new Html5Qrcode(REGION_ID, { verbose: false });
      // Пытаемся распознать и с перевёрнутым изображением тоже (false = без flip).
      const text = await scanner.scanFile(file, false);
      onResult(text);
    } catch {
      onError("На изображении не удалось распознать QR-код.");
    } finally {
      try {
        scanner?.clear();
      } catch {
        // Игнорируем: очищать уже нечего.
      }
      setBusy(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

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
        <span className="dropzone__title">
          Перетащите изображение сюда
        </span>
        <span className="dropzone__hint">или нажмите, чтобы выбрать файл</span>
      </label>

      {/* Служебный контейнер, который требует библиотека */}
      <div id={REGION_ID} style={{ display: "none" }} />
    </section>
  );
}
