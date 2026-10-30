/** Remove only the basic combining marks; preserve case, whitespace and other Unicode marks. */
export function stripCombiningMarks(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Remove Unicode diacritics, including marks outside the basic combining block. */
export function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
