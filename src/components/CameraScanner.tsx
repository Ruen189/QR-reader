import { useCallback, useEffect, useRef, useState } from "react";
import { createBarcodeDecoder } from "../lib/barcode";
import type { BarcodeDecoder, DetectedCode, ScanBox } from "../lib/barcode";
import type { ScanDetails } from "../types";

interface CameraScannerProps {
  /** Вызывается при успешном распознавании кода */
  onResult: (text: string, details?: ScanDetails) => void;
}

interface CameraOption {
  id: string;
  label: string;
}

/** Как часто анализируем кадр камеры (мс). */
const SCAN_INTERVAL_MS = 150;

/** Окно, в течение которого один и тот же код не добавляется повторно. */
const DUPLICATE_WINDOW_MS = 2000;

/** Максимальная сторона сохраняемого снимка кадра (px). */
const SNAPSHOT_MAX_SIDE = 960;

/** Рисует рамку-подсветку области найденного кода на кадре. */
function drawHighlight(
  ctx: CanvasRenderingContext2D,
  frameWidth: number,
  frameHeight: number,
  box: ScanBox,
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
 * Делает снимок текущего кадра камеры и подсвечивает на нём область
 * найденного кода. Декодер анализирует тот же кадр видео, поэтому его
 * координаты совпадают с пикселями снимка (с поправкой на масштаб).
 */
function captureFrame(video: HTMLVideoElement, code: DetectedCode): ScanDetails {
  const details: ScanDetails = { format: code.format };
  try {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) return details;

    const scale = Math.min(
      1,
      SNAPSHOT_MAX_SIDE / Math.max(sourceWidth, sourceHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sourceWidth * scale);
    canvas.height = Math.round(sourceHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return details;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (code.box) {
      drawHighlight(ctx, canvas.width, canvas.height, {
        x: code.box.x * scale,
        y: code.box.y * scale,
        width: code.box.width * scale,
        height: code.box.height * scale,
      });
    }

    details.imageUrl = canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    // Снимок кадра — необязательное улучшение: ошибки съёмки игнорируем.
  }
  return details;
}

export default function CameraScanner({ onResult }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<Promise<BarcodeDecoder> | null>(null);
  const loopRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastResultRef = useRef<{ text: string; at: number } | null>(null);

  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [cameraId, setCameraId] = useState<string>("");

  /**
   * Обновляет список камер. Названия устройств браузер отдаёт только после
   * того, как пользователь разрешил доступ к камере.
   */
  const refreshCameras = useCallback(async () => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) return;
    try {
      const devices = await mediaDevices.enumerateDevices();
      const list = devices
        .filter((device) => device.kind === "videoinput")
        .map((device, index) => ({
          id: device.deviceId,
          label: device.label || `Камера ${index + 1}`,
        }));
      setCameras(list);
      // По умолчанию берём последнюю — на телефоне это обычно задняя камера.
      setCameraId((prev) => prev || list[list.length - 1]?.id || "");
    } catch {
      // Список камер не критичен: сработает камера по умолчанию.
    }
  }, []);

  useEffect(() => {
    void refreshCameras();
  }, [refreshCameras]);

  const stopLoop = useCallback(() => {
    if (loopRef.current !== null) {
      window.clearInterval(loopRef.current);
      loopRef.current = null;
    }
  }, []);

  /** Полностью освобождает камеру и останавливает анализ кадров. */
  const stop = useCallback(() => {
    stopLoop();
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    busyRef.current = false;
    setScanning(false);
  }, [stopLoop]);

  const handleDecoded = useCallback(
    (code: DetectedCode, video: HTMLVideoElement) => {
      const now = Date.now();
      const last = lastResultRef.current;
      if (last && last.text === code.text && now - last.at < DUPLICATE_WINDOW_MS) {
        return;
      }
      lastResultRef.current = { text: code.text, at: now };

      const details = captureFrame(video, code);
      onResult(code.text, details);

      // Автоматически останавливаем камеру после первого найденного кода,
      // чтобы сразу можно было посмотреть результат и перейти по ссылке.
      window.setTimeout(() => stop(), 0);
    },
    [onResult, stop],
  );

  const decodeFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || busyRef.current || !decoderRef.current) return;

    const decoder = await decoderRef.current;
    // readyState < 2 — у видео ещё нет готового кадра.
    if (video.readyState < 2 || !video.videoWidth) return;

    busyRef.current = true;
    try {
      const code = await decoder.decode(video);
      if (code) handleDecoded(code, video);
    } catch {
      // Ошибка на отдельном кадре — это норма, просто пропускаем кадр.
    } finally {
      busyRef.current = false;
    }
  }, [handleDecoded]);

  const start = useCallback(
    async (deviceId?: string) => {
      setError(null);
      setStarting(true);
      stopLoop();

      try {
        const mediaDevices = navigator.mediaDevices;
        if (!mediaDevices?.getUserMedia) {
          throw new Error(
            "Браузер не даёт доступ к камере. Нужен https или localhost.",
          );
        }

        const target = deviceId ?? cameraId;
        const video: MediaStreamConstraints["video"] = target
          ? {
              deviceId: { exact: target },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            };

        const stream = await mediaDevices.getUserMedia({ audio: false, video });
        streamRef.current = stream;

        const element = videoRef.current;
        if (!element) {
          throw new Error("Область сканирования ещё не готова. Попробуйте ещё раз.");
        }
        element.srcObject = stream;
        await element.play();

        // После разрешения в списке появляются названия камер.
        void refreshCameras();

        // Движок распознавания создаётся лениво: при наличии нативного
        // BarcodeDetector сторонний код не загружается вообще.
        if (!decoderRef.current) {
          decoderRef.current = createBarcodeDecoder();
        }
        const pending = decoderRef.current;
        try {
          await pending;
        } catch {
          // Разрешаем повторную попытку при следующем запуске.
          decoderRef.current = null;
          throw new Error(
            "Не удалось загрузить модуль распознавания. Проверьте соединение и попробуйте снова.",
          );
        }

        setScanning(true);
        loopRef.current = window.setInterval(() => {
          void decodeFrame();
        }, SCAN_INTERVAL_MS);
      } catch (err) {
        stop();
        setError(
          err instanceof Error
            ? err.message
            : "Не удалось запустить камеру. Проверьте разрешения (нужен https).",
        );
      } finally {
        setStarting(false);
      }
    },
    [cameraId, decodeFrame, refreshCameras, stop, stopLoop],
  );

  // При смене камеры во время сканирования — перезапускаем поток.
  const handleCameraChange = (id: string) => {
    setCameraId(id);
    if (scanning) {
      stop();
      void start(id);
    }
  };

  // Останавливаем камеру при размонтировании компонента.
  useEffect(() => {
    return () => {
      if (loopRef.current !== null) {
        window.clearInterval(loopRef.current);
        loopRef.current = null;
      }
      const stream = streamRef.current;
      streamRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
      }
    };
  }, []);

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Камера</h2>
        <span className={`badge ${scanning ? "badge--live" : "badge--idle"}`}>
          {scanning ? "● Идёт сканирование" : "○ Остановлено"}
        </span>
      </div>

      <div className="cameras">
        <select
          id="camera-select"
          value={cameraId}
          onChange={(e) => handleCameraChange(e.target.value)}
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
        <div
          className={`viewport__region ${scanning ? "viewport__region--live" : ""}`}
        >
          <video
            ref={videoRef}
            className="viewport__video"
            playsInline
            muted
            autoPlay
          />
        </div>
      </div>

      {error && <p className="alert">{error}</p>}

      <div className="controls">
        {!scanning ? (
          <button
            className="btn btn--primary"
            onClick={() => void start()}
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
