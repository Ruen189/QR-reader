/** Ключ, под которым история сканирований сохраняется в localStorage. */
export const HISTORY_STORAGE_KEY = "qr-scanner:history";

/** Максимальное число сохраняемых записей истории. */
export const HISTORY_LIMIT = 20;

/**
 * Минимальный интерфейс хранилища. Совпадает с `Storage`, но легко
 * подменяется заглушкой в тестах.
 */
export interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Возвращает localStorage, если он доступен в текущем окружении. */
export function defaultHistoryStorage(): HistoryStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // В некоторых браузерах обращение к localStorage бросает исключение.
    return null;
  }
}

/**
 * Загружает историю сканирований. Возвращает пустой массив, если хранилище
 * недоступно, данные повреждены или имеют неожиданный формат.
 */
export function loadHistory(
  storage: HistoryStorage | null = defaultHistoryStorage(),
): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

/** Сохраняет историю. Ошибки хранилища (приватный режим) игнорируются. */
export function saveHistory(
  history: string[],
  storage: HistoryStorage | null = defaultHistoryStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Хранилище может быть недоступно или переполнено — игнорируем.
  }
}

/**
 * Добавляет запись в начало истории: не дублирует последнюю запись
 * и не превышает лимит.
 */
export function addToHistory(history: string[], text: string): string[] {
  if (history[0] === text) return history;
  return [text, ...history].slice(0, HISTORY_LIMIT);
}
