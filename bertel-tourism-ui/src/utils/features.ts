export function isDemoOnlyModule(path: string): boolean {
  return ['/moderation', '/audits', '/publications'].includes(path);
}
