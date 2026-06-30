/**
 * Output-encoding helpers shared by every print/HTML and CSV export sink.
 *
 * SEC-1 / SEC-2 (docs/ux-review/14-security-verified.md): object fields are
 * operator-editable and surface on anon-visible objects, so:
 *  - any value interpolated into an HTML string (print window) MUST be escaped,
 *    or a name like `<img src=x onerror=...>` executes in the print window's origin;
 *  - any CSV cell starting with a formula leader (`= + - @`) MUST be neutralized,
 *    or it executes when the file is opened in Excel / LibreOffice / Sheets.
 *
 * One escaper per concern, reused by all sinks (selection print/CSV today; the
 * §05 drawer notes export should adopt `csvCell` too — SEC-8).
 */

/** HTML-escape a value for safe interpolation into an HTML string. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render one RFC-4180 CSV cell, first neutralizing spreadsheet formula injection:
 * a cell whose (trimmed) value starts with `= + - @` is prefixed with a single
 * quote so the spreadsheet treats it as a text literal, not a formula.
 */
export function csvCell(value: unknown): string {
  const normalized = (value == null ? '' : String(value)).replace(/\r?\n/g, ' ').trim();
  const guarded = /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${guarded.replace(/"/g, '""')}"`;
}
