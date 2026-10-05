import { describe, expect, it } from "vitest";
import { isLikelyUrl } from "./url";

describe("isLikelyUrl", () => {
  it("распознаёт http и https ссылки", () => {
    expect(isLikelyUrl("https://example.com/path?q=1")).toBe(true);
    expect(isLikelyUrl("http://example.com")).toBe(true);
  });

  it("распознаёт ссылку с очень длинным адресом", () => {
    const long = `https://example.com/${"segment/".repeat(60)}end`;
    expect(isLikelyUrl(long)).toBe(true);
  });

  it("отклоняет прочие схемы", () => {
    expect(isLikelyUrl("mailto:user@example.com")).toBe(false);
    expect(isLikelyUrl("tel:+1234567890")).toBe(false);
    expect(isLikelyUrl("javascript:alert(1)")).toBe(false);
  });

  it("отклоняет обычный текст и пустую строку", () => {
    expect(isLikelyUrl("просто текст")).toBe(false);
    expect(isLikelyUrl("")).toBe(false);
    expect(isLikelyUrl("example.com")).toBe(false);
  });
});
