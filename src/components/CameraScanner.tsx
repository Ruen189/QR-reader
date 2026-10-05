import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import type { Html5QrcodeResult } from "html5-qrcode";
import type { ScanDetails } from "../types";

/** id элемента, в который html5-qrcode вставляет видео */
const REGION_ID = "qr-camera-region";

interface CameraScannerProps {
  /** Вызывается при успешном распознавании кода */
  onResult: (text: string, details?: ScanDetails) => void;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Рисует рамку-подсветку области найденного кода на кадре. */
function drawHighlight(
  ctx: CanvasRenderingContext2D,
  frameWidth: number,
  frameHeight: number,
  box: Box,
): void {
  const pad = Math.max(6, frameWidth * 0.012);
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const width = Math.min(frameWidth - x, box.width + pad * 2);
  const height = Math.min(frameHeight - y, box.height + pad * 2);

  ctx.fillStyle = "rgba(125, 255, 168, 0.16)";
  ctx.fillRect(x, y, width, height);
  ctx.lineWidth = Math.max(4, frameWidth * 0.008);
  ctx.strokeStyle = "#7dffa8";
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 10;
  ctx.strokeRect(x, y, width, height);
  ctx.shadowBlur = 0;
}

/**
 * Делает снимок текущего кадра камеры и подсвечивает на нём область найденного
 * кода. Координаты bounds из html5-qrcode заданы в «клиентских» пикселях области
 * сканирования (qrbox), поэтому пересчитываем их в пиксели исходного кадра.
 */
function captureDetectedFrame(result: Html5QrcodeResult | undefined): ScanDetails {
  const format = result?.result?.format?.formatName;
  const details: ScanDetails = { format };
  try {
    const region = document.getElementById(REGION_ID);
    const video = region?.querySelector<HTMLVideoElement>("video") ?? null;
    if (!video || !video.videoWidth || !video.videoHeight) {
      return details;
    }

    const frame = document.createElement("canvas");
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    const ctx = frame.getContext("2d");
    if (!ctx) {
      return details;
    }
    ctx.drawImage(video, 0, 0, frame.width, frame.height);

    const bounds = result?.result?.bounds;
    const scanCanvas = region?.querySelector<HTMLCanvasElement>("canvas") ?? null;
    const clientWidth = video.clientWidth;
    const clientHeight = video.clientHeight;
    if (bounds && scanCanvas && clientWidth > 0 && clientHeight > 0) {
      // canvas.width/height — размер области сканирования в клиентских пикселях,
      // она всегда центрирована относительно видео (см. getShadedRegionBounds).
      const offsetX = (clientWidth - scanCanvas.width) / 2;
      const offsetY = (clientHeight - scanCanvas.height) / 2;
      const scaleX = frame.width / clientWidth;
      const scaleY = frame.height / clientHeight;
      drawHighlight(ctx, frame.width, frame.height, {
        x: (offsetX + bounds.x) * scaleX,
        y: (offsetY + bounds.y) * scaleY,
        width: bounds.width * scaleX,
        height: bounds.height * scaleY,
      });
    }

    details.imageUrl = frame.toDataURL("image/jpeg", 0.85);
  } catch {
    // Снимок кадра — необязательное улучшение: ошибки съёмки игнорируем.
  }
  return details;
}

export default function CameraScanner({ onResult }: CameraScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastResultRef = useRef<{ text: string; at: number } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [lastFrame, setLastFrame] = useState<string | null>(null);

  // Получаем список доступных камер (может потребовать разрешение).
  useEffect(() => {
    let cancelled = false;

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (cancelled) return;
        const list = devices.map((d, i) => ({
          id: d.id,
          label: d.label || `Камера ${i + 1}`,
        }));
        setCameras(list);
        // По умолчанию выбираем последнюю — обычно это задняя камера на телефоне.
        if (list.length > 0) {
          setCameraId(list[list.length - 1].id);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Не удалось получить список камер. Разрешите доступ к камере.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stop = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) {
      setScanning(false);
      return;
    }
    try {
      // stop() бросает синхронное исключение, если сканирование не запущено.
      await scanner.stop();
      scanner.clear();
    } catch {
      // Игнорируем: сканер мог быть уже остановлен.
    }
    setScanning(false);
  }, []);

  const handleSuccess = useCallback(
    (decodedText: string, result: Html5QrcodeResult) => {
      // Не даём одному и тому же коду спамить историю чаще раза в 2 секунды.
      const now = Date.now();
      const last = lastResultRef.current;
      if (last && last.text === decodedText && now - last.at < 2000) {
        return;
      }
      lastResultRef.current = { text: decodedText, at: now };

      const details = captureDetectedFrame(result);
      // Оставляем зафиксированный кадр с подсветкой на месте видео.
      if (details.imageUrl) {
        setLastFrame(details.imageUrl);
      }
      onResult(decodedText, details);

      // Автоматически останавливаем камеру после первого найденного кода,
      // чтобы сразу можно было посмотреть результат и перейти по ссылке.
      window.setTimeout(() => {
        void stop();
      }, 0);
    },
    [onResult, stop],
  );

  const start = useCallback(async () => {
    setError(null);
    setLastFrame(null);
    setStarting(true);
    try {
      if (!scannerRef.current) {
        if (!document.getElementById(REGION_ID)) {
          throw new Error("Область сканирования ещё не готова. Попробуйте ещё раз.");
        }
        scannerRef.current = new Html5Qrcode(REGION_ID, { verbose: false });
      }

      await scannerRef.current.start(
        cameraId ? { deviceId: { exact: cameraId } } : { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 260, height: 260 },
          aspectRatio: 1,
        },
        handleSuccess,
        () => {
          // Ошибки кадров без кода — это норма, просто игнорируем.
        },
      );
      setScanning(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось запустить камеру. Проверьте разрешения (нужен https или localhost).",
      );
    } finally {
      setStarting(false);
    }
  }, [cameraId, handleSuccess]);

  // При смене камеры во время сканирования — перезапускаем поток.
  useEffect(() => {
    if (!scanning) return;
    let active = true;

    (async () => {
      const scanner = scannerRef.current;
      if (!scanner) return;
      try {
        await scanner.stop();
        if (!active) return;
        await scanner.start(
          { deviceId: { exact: cameraId } },
          { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
          handleSuccess,
          () => {},
        );
      } catch {
        // при переключении камеры возможны кратковременные ошибки — игнорируем
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId]);

  // Останавливаем камеру при размонтировании компонента.
  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (!scanner) return;
      // stop() бросает синхронное исключение («Cannot stop, scanner is not
      // running»), если сканирование не запущено. Раньше эта ошибка «вылетала»
      // из cleanup-функции, и React размонтировал всё приложение — экран
      // становился пустым (чаще всего при переходе на вкладку «Изображение»).
      try {
        const stopped = scanner.stop();
        Promise.resolve(stopped)
          .then(() => scanner.clear())
          .catch(() => {});
      } catch {
        try {
          scanner.clear();
        } catch {
          // Игнорируем: очищать уже нечего.
        }
      }
    };
  }, []);

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Сканирование с камеры</h2>
        <span
          className={`badge ${scanning ? "badge--live" : "badge--idle"}`}
        >
          {scanning ? "● Идёт сканирование" : "○ Остановлено"}
        </span>
      </div>

      <div className="cameras">
        <label htmlFor="camera-select">Камера</label>
        <select
          id="camera-select"
          value={cameraId}
          onChange={(e) => setCameraId(e.target.value)}
          disabled={cameras.length === 0}
        >
          {cameras.length === 0 && <option value="">Камеры не найдены</option>}
          {cameras.map((cam) => (
            <option key={cam.id} value={cam.id}>
              {cam.label}
            </option>
          ))}
        </select>
      </div>

      <div className="viewport">
        {/* Сюда html5-qrcode вставляет <video> */}
        <div id={REGION_ID} className="viewport__region" />
        {!scanning && lastFrame && (
          <img
            className="viewport__snapshot"
            src={lastFrame}
            alt="Кадр с выделенной областью найденного кода"
          />
        )}
      </div>

      {error && <p className="alert">{error}</p>}

      <div className="controls">
        {!scanning ? (
          <button
            className="btn btn--primary"
            onClick={start}
            disabled={starting}
          >
            {starting ? "Запуск…" : "▶ Запустить камеру"}
          </button>
        ) : (
          <button className="btn btn--danger" onClick={stop}>
            ⏸ Остановить
          </button>
        )}
      </div>
    </section>
  );
}
