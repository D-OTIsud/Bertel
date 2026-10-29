/** Preserve the Error-only message policy used by UI formatters. */
export function strictErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
