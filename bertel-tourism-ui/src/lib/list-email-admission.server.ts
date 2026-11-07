import 'server-only';

/** Runtime admission for manual lists only; unknown or absent configuration stays closed. */
export function manualListEmailAdmissionEnabled(): boolean {
  return process.env.LIST_EMAIL_MODE === 'protocol-v1';
}
