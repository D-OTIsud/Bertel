/**
 * Cellule « Dernière activité » du tableau d'équipe.
 *
 * La source est `rpc_list_org_members.last_seen_at` = GREATEST(dernière connexion,
 * dernier rafraîchissement de session). Sa granularité réelle est celle du refresh
 * du jeton (~1 h) : on affiche donc la date et l'heure exactes (ce qui est demandé)
 * ET l'écart relatif, qui reste le repère utile pour balayer une liste.
 */
export interface LastSeenLabel {
  /** « 29 juil. 2026 à 15:11 » */
  absolute: string;
  /** « il y a 5 min » */
  relative: string;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

function relativeLabel(diffSec: number): string {
  // Horloge client en avance sur le serveur : on ne rend jamais un « il y a -3 min ».
  if (diffSec < MINUTE) return "à l'instant";
  if (diffSec < HOUR) return `il y a ${Math.floor(diffSec / MINUTE)} min`;
  if (diffSec < DAY) return `il y a ${Math.floor(diffSec / HOUR)} h`;
  if (diffSec < WEEK) return `il y a ${Math.floor(diffSec / DAY)} j`;
  if (diffSec < MONTH) return `il y a ${Math.floor(diffSec / WEEK)} sem.`;
  return `il y a ${Math.floor(diffSec / MONTH)} mois`;
}

/** `null` quand aucune activité n'est connue (compte invité qui ne s'est jamais connecté). */
export function formatLastSeen(iso: string | null | undefined): LastSeenLabel | null {
  if (!iso) return null;
  const then = new Date(iso);
  const thenMs = then.getTime();
  if (Number.isNaN(thenMs)) return null;

  const datePart = then.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const timePart = then.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return {
    absolute: `${datePart} à ${timePart}`,
    relative: relativeLabel(Math.max(0, Math.floor((Date.now() - thenMs) / 1000))),
  };
}
