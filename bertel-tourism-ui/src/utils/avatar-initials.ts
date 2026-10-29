/** Avatar fallback used by the shell; whitespace separates words and empty names use BT. */
export function shellAvatarInitials(value: string | null | undefined): string {
  const parts = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return 'BT';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

/** Session avatar policy: only literal spaces separate words; empty names use --. */
export function sessionAvatarInitials(name: string): string {
  const parts = name
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return '--';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}
