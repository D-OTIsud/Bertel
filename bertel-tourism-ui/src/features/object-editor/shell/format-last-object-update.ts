/** Human-readable last persisted update for the editor top bar (fr-FR). */
export function formatLastObjectUpdate(iso: string | null | undefined): string {
  if (!iso) {
    return 'Dernière mise à jour · —';
  }
  const then = new Date(iso);
  const thenMs = then.getTime();
  if (Number.isNaN(thenMs)) {
    return 'Dernière mise à jour · —';
  }

  const diffSec = Math.floor((Date.now() - thenMs) / 1000);
  if (diffSec < 60) {
    return 'Dernière mise à jour · à l\'instant';
  }
  if (diffSec < 3600) {
    return `Dernière mise à jour · il y a ${Math.floor(diffSec / 60)} min`;
  }
  if (diffSec < 86400) {
    return `Dernière mise à jour · il y a ${Math.floor(diffSec / 3600)} h`;
  }
  if (diffSec < 604800) {
    return `Dernière mise à jour · il y a ${Math.floor(diffSec / 86400)} j`;
  }

  const datePart = then.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const hasClock = /T\d|:\d{2}/.test(iso);
  if (hasClock) {
    const timePart = then.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `Dernière mise à jour · ${datePart} à ${timePart}`;
  }
  return `Dernière mise à jour · ${datePart}`;
}

export function buildEditTopSaveLabel(options: {
  statusMessage: string | null;
  dirtyCount: number;
  lastSavedAt?: string | null;
}): string {
  if (options.statusMessage) {
    return options.statusMessage;
  }

  const lastUpdate = formatLastObjectUpdate(options.lastSavedAt);
  if (options.dirtyCount > 0) {
    const dirtyHint = `${options.dirtyCount} modif. locale${options.dirtyCount > 1 ? 's' : ''} · Publier pour enregistrer`;
    return `${lastUpdate} · ${dirtyHint}`;
  }
  return lastUpdate;
}
