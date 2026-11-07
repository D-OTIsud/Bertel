/** Diacritic-insensitive lowercase (Réunion names carry accents). Codepoint loop keeps
 *  the source ASCII-safe (no combining marks written literally in a regex). */
export function fold(value: string): string {
  let out = '';
  for (const ch of value.normalize('NFD')) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x300 && code <= 0x36f) continue; // U+0300–U+036F combining diacritical marks
    out += ch;
  }
  return out.toLowerCase();
}
