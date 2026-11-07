/** Accept the common short forms people type; invalid input remains editable. */
export function formatScheduleTime(value: string): string | null {
  const text = value.trim();
  if (!text) return '';
  const expanded = /^\d{3,4}$/.test(text) ? `${text.slice(0, -2)}:${text.slice(-2)}` : text;
  const match = /^(\d{1,2})(?:[:h.](\d{0,2}))?$/i.exec(expanded);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
