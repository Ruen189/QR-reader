/**
 * Проверяет, что распознанный текст — это ссылка http(s), которую можно
 * открыть в браузере.
 */
export function isLikelyUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
