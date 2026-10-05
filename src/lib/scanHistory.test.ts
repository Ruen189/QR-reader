import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  HISTORY_STORAGE_KEY,
  addToHistory,
  loadHistory,
  saveHistory,
} from "./scanHistory";
import type { HistoryStorage } from "./scanHistory";

/** Простое хранилище в памяти для тестов. */
function createStorage(initial?: string): HistoryStorage & { value: string | null } {
  const storage = {
    value: initial ?? null,
    getItem(): string | null {
      return storage.value;
    },
    setItem(_key: string, value: string): void {
      storage.value = value;
    },
  };
  return storage;
}

describe("loadHistory", () => {
  it("возвращает пустой массив без сохранённых данных", () => {
    expect(loadHistory(createStorage())).toEqual([]);
  });

  it("читает сохранённую историю", () => {
    const storage = createStorage(JSON.stringify(["first", "second"]));
    expect(loadHistory(storage)).toEqual(["first", "second"]);
  });

  it("переживает повреждённый JSON", () => {
    expect(loadHistory(createStorage("{not json"))).toEqual([]);
  });

  it("игнорирует данные неверного формата", () => {
    expect(loadHistory(createStorage(JSON.stringify({ a: 1 })))).toEqual([]);
  });

  it("отбрасывает не-строки и лишние записи", () => {
    const raw = JSON.stringify([
      "ok",
      42,
      null,
      { text: "нет" },
      ...Array.from({ length: HISTORY_LIMIT + 5 }, (_, i) => `item-${i}`),
    ]);
    const result = loadHistory(createStorage(raw));

    expect(result.every((item) => typeof item === "string")).toBe(true);
    expect(result).toHaveLength(HISTORY_LIMIT);
    expect(result[0]).toBe("ok");
  });

  it("не падает, если хранилище недоступно", () => {
    expect(loadHistory(null)).toEqual([]);
  });
});

describe("saveHistory", () => {
  it("пишет историю под нужным ключом", () => {
    const storage = createStorage();
    saveHistory(["a", "b"], storage);

    expect(storage.value).toBe(JSON.stringify(["a", "b"]));
    expect(HISTORY_STORAGE_KEY).toBe("qr-scanner:history");
  });

  it("молча игнорирует ошибки хранилища", () => {
    const broken: HistoryStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("приватный режим");
      },
    };
    expect(() => saveHistory(["a"], broken)).not.toThrow();
    expect(() => saveHistory(["a"], null)).not.toThrow();
  });
});

describe("addToHistory", () => {
  it("добавляет запись в начало", () => {
    expect(addToHistory(["old"], "new")).toEqual(["new", "old"]);
  });

  it("не дублирует последнюю запись", () => {
    const history = ["same", "old"];
    expect(addToHistory(history, "same")).toBe(history);
  });

  it("добавляет код повторно, если он не первый", () => {
    expect(addToHistory(["a", "b"], "b")).toEqual(["b", "a", "b"]);
  });

  it("обрезает историю до лимита", () => {
    const history = Array.from({ length: HISTORY_LIMIT }, (_, i) => `item-${i}`);
    const result = addToHistory(history, "fresh");

    expect(result).toHaveLength(HISTORY_LIMIT);
    expect(result[0]).toBe("fresh");
    expect(result).not.toContain(`item-${HISTORY_LIMIT - 1}`);
  });
});
