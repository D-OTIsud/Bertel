/** Keep the exact request until confirmation, scoped to the account and fiche. */
export async function withPendingMenuRequest<T>(
  userId: string | undefined | null,
  objectId: string,
  payload: Record<string, unknown>,
  send: (value: Record<string, unknown>) => Promise<T>,
  confirm: (value: T) => void,
): Promise<T> {
  if (!userId || typeof window === 'undefined') {
    const result = await send(payload);
    confirm(result);
    return result;
  }
  const key = `workspace-menu-request:${userId}:${objectId}`;
  let pending: Record<string, unknown> | null;
  try {
    const saved = window.localStorage.getItem(key);
    pending = saved ? JSON.parse(saved) as Record<string, unknown> : null;
    if (pending && (typeof pending !== 'object' || Array.isArray(pending) || pending.write_contract !== 'menus-reconcile-v1')) {
      throw new Error();
    }
    if (!pending) window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    throw new Error('Impossible de conserver la demande de menus sur cet appareil. Votre saisie est conservée ; libérez le stockage avant de réessayer.');
  }
  const request = pending ?? payload;
  const serialized = JSON.stringify(request);
  // A second tab may already have confirmed this request and stored a newer one.
  const removeConfirmedRequest = () => {
    if (window.localStorage.getItem(key) === serialized) window.localStorage.removeItem(key);
  };
  try {
    const result = await send(request);
    confirm(result);
    removeConfirmedRequest();
    if (serialized !== JSON.stringify(payload)) {
      throw new Error('Le dernier enregistrement des menus est confirmé. Rechargez la fiche avant d’envoyer vos nouvelles modifications ; votre saisie est conservée.');
    }
    return result;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (['PT409', '22023', '23503', '23514', '42501', '22P02'].includes(code)) removeConfirmedRequest();
    throw error;
  }
}
