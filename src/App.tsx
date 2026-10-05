import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Capacitor } from "@capacitor/core";
import { usePwaInstall } from "./hooks/usePwaInstall";
import { addToHistory, loadHistory, saveHistory } from "./lib/scanHistory";
import { isLikelyUrl } from "./lib/url";
import type { ScanDetails } from "./types";

type Tab = "camera" | "file";

/**
 * Сканеры подгружаются лениво: тяжёлый движок распознавания попадает в
 * отдельный чанк и скачивается только при открытии соответствующей вкладки.
 */
const CameraScanner = lazy(() => import("./components/CameraScanner"));
const FileScanner = lazy(() => import("./components/FileScanner"));

/** Заглушка, пока лениво загружаемый сканер ещё не приехал. */
function ScannerFallback() {
  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Загрузка…</h2>
      </div>
      <p className="muted">Готовим сканер.</p>
    </section>
  );
}

/**
 * Открывает ссылку по распознанному коду. В нативном приложении (Capacitor)
 * открываем через системный браузер (target "_system"), иначе — в новой вкладке.
 */
function openExternalLink(url: string): void {
  if (Capacitor.isNativePlatform()) {
    window.open(url, "_system");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function App() {
  const [tab, setTab] = useState<Tab>("camera");
  const [result, setResult] = useState<string>("");
  const [resultImage, setResultImage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [copied, setCopied] = useState(false);
  const { canPrompt, installed, promptInstall } = usePwaInstall();

  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true);

  const isIos =
    typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  // Показываем баннер установки, пока приложение не установлено.
  const showInstallBanner = !installed && !isStandalone && (canPrompt || isIos);

  const clearResult = useCallback(() => {
    setResult("");
    setResultImage("");
  }, []);

  const handleResult = useCallback((text: string, details?: ScanDetails) => {
    setError("");
    setCopied(false);
    setResult(text);
    setResultImage(details?.imageUrl ?? "");
    setHistory((prev) => addToHistory(prev, text));
  }, []);

  // Сохраняем историю в localStorage, чтобы она не терялась при перезапуске.
  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const handleError = useCallback((message: string) => {
    setError(message);
  }, []);

  const resultIsUrl = useMemo(() => isLikelyUrl(result), [result]);

  const copyResult = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Не удалось скопировать в буфер обмена.");
    }
  };

  return (
    <div className="app">
      <header className="app__header">
        <div className="logo">▣</div>
        <h1>QR Scanner</h1>
      </header>

      {showInstallBanner && (
        <div className="install-banner">
          <div className="install-banner__text">
            <strong>Установите приложение</strong>
            <span>
              {canPrompt
                ? "Добавьте QR Scanner на главный экран телефона"
                : "Нажмите «Поделиться» → «На экран «Домой»»"}
            </span>
          </div>
          {canPrompt && (
            <button className="btn btn--primary btn--sm" onClick={promptInstall}>
              ⬇ Установить
            </button>
          )}
        </div>
      )}

      <nav className="tabs">
        <button
          className={`tab ${tab === "camera" ? "tab--active" : ""}`}
          onClick={() => setTab("camera")}
        >
          📷 Камера
        </button>
        <button
          className={`tab ${tab === "file" ? "tab--active" : ""}`}
          onClick={() => setTab("file")}
        >
          🖼️ Изображение
        </button>
      </nav>

      <main className="app__main">
        <Suspense fallback={<ScannerFallback />}>
          {tab === "camera" ? (
            <CameraScanner onResult={handleResult} />
          ) : (
            <FileScanner onResult={handleResult} onError={handleError} />
          )}
        </Suspense>

        <section className="panel">
          <div className="panel__head">
            <h2>Результат</h2>
          </div>

          {error && <p className="alert">{error}</p>}

          {result ? (
            <>
              {resultIsUrl ? (
                <a
                  className="result result--link"
                  href={result}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    event.preventDefault();
                    openExternalLink(result);
                  }}
                >
                  🔗 {result}
                </a>
              ) : (
                <pre className="result">{result}</pre>
              )}

              {resultImage && (
                <figure className="snapshot">
                  <img
                    className="snapshot__img"
                    src={resultImage}
                    alt="Кадр камеры с выделенной областью распознанного кода"
                  />
                </figure>
              )}

              <div className="controls">
                <button className="btn" onClick={copyResult}>
                  {copied ? "✓ Скопировано" : "📋 Копировать"}
                </button>
                {resultIsUrl && (
                  <a
                    className="btn btn--primary"
                    href={result}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => {
                      event.preventDefault();
                      openExternalLink(result);
                    }}
                  >
                    🔗 Открыть в браузере
                  </a>
                )}
                <button className="btn btn--ghost" onClick={clearResult}>
                  Очистить
                </button>
              </div>
            </>
          ) : (
            <p className="muted">
              Здесь появится распознанный текст после первого сканирования.
            </p>
          )}
        </section>

        {history.length > 0 && (
          <section className="panel">
            <div className="panel__head">
              <h2>История</h2>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setHistory([]);
                  clearResult();
                }}
              >
                Очистить историю
              </button>
            </div>
            <ul className="history">
              {history.map((item, index) => (
                <li key={`${index}-${item}`}>
                  <button
                    className="history__item"
                    onClick={() => handleResult(item)}
                    title="Показать"
                  >
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
