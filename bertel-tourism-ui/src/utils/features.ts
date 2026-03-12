export function isDemoOnlyModule(path: string): boolean {
  return ['/crm', '/moderation', '/audits', '/publications'].includes(path);
}