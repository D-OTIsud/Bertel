export const SANDBOX_MODE_KEY = 'bertel-test-mode';
export const SANDBOX_AUTH_KEY = 'bertel-test-auth';

/** Par onglet : le mode découverte ne remplace jamais la session de travail. */
export function isSandboxMode(): boolean {
  return typeof window !== 'undefined' && window.sessionStorage.getItem(SANDBOX_MODE_KEY) === 'true';
}
