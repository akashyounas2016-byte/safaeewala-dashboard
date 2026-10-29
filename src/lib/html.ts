/**
 * Escape text before putting it into HTML built as a string (print windows, document.write).
 * Names, addresses and remarks can come from public web forms, so they must never be read as
 * HTML or script (SEC-07).
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string))
}
