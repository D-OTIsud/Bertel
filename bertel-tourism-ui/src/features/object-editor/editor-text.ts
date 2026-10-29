export function hasText(value: string | null | undefined): boolean {
  return String(value ?? '').trim().length > 0;
}
