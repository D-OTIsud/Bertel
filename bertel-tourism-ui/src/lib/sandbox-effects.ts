/** Use only with the user returned by server-side Auth.getUser, never a decoded client payload. */
export function isSandboxDiscoveryUser(user: { app_metadata?: Record<string, unknown> }): boolean {
  return user.app_metadata?.sandbox_discovery === true;
}

export const SANDBOX_EXTERNAL_EFFECTS_ERROR = 'sandbox_external_effects_disabled';
export const SANDBOX_EMAIL_DETAIL = 'Les e-mails réels sont désactivés dans l’espace de découverte.';
export const SANDBOX_AI_DETAIL = 'Les appels IA sont désactivés dans l’espace de découverte.';
