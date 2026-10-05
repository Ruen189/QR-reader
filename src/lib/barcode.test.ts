import { afterEach, describe, expect, it, vi } from "vitest";
import { getNativeBarcodeDetectorCtor } from "./barcode";

const globalWithBarcode = globalThis as { BarcodeDetector?: unknown };

afterEach(() => {
  delete globalWithBarcode.BarcodeDetector;
  vi.restoreAllMocks();
});

describe("getNativeBarcodeDetectorCtor", () => {
  it("возвращает null, если BarcodeDetector недоступен", () => {
    expect(getNativeBarcodeDetectorCtor()).toBeNull();
  });

  it("возвращает конструктор, если BarcodeDetector доступен", () => {
    class FakeBarcodeDetector {}
    globalWithBarcode.BarcodeDetector = FakeBarcodeDetector;

    expect(getNativeBarcodeDetectorCtor()).toBe(FakeBarcodeDetector);
  });

  it("игнорирует значение не-функцию", () => {
    globalWithBarcode.BarcodeDetector = "not a constructor";
    expect(getNativeBarcodeDetectorCtor()).toBeNull();
  });
});
