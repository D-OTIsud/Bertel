/**
 * Le message à l'office — UNE chaîne, DEUX auteurs.
 *
 * `submit_actor_fiche` ne prend qu'un `p_note`. Or deux écrans y écrivent : la carte
 * « Vérifiez ces informations » (un signalement d'erreur, préfixé) et la fenêtre d'envoi
 * (un message libre). Sans une composition explicite, chacun écrasait l'autre — le
 * signalement effaçait le message de la fenêtre, et la fenêtre faisait disparaître le
 * signalement de la carte.
 *
 * FORME : le signalement d'abord, une ligne vide, puis le message libre. Un texte qui ne
 * commence pas par le préfixe est un message libre entier — c'est ce que la fenêtre
 * d'envoi produit, et elle reste maîtresse du texte complet.
 */
export const PORTAL_REPORT_PREFIX = 'Erreur signalée : ';

const SEPARATOR = '\n\n';

/** La part « signalement d'erreur » de la note, sans son préfixe. '' s'il n'y en a pas. */
export function readPortalReport(note: string): string {
  if (!note.startsWith(PORTAL_REPORT_PREFIX)) return '';
  const body = note.slice(PORTAL_REPORT_PREFIX.length);
  const cut = body.indexOf(SEPARATOR);
  return (cut === -1 ? body : body.slice(0, cut)).trim();
}

/** Tout le reste — le message libre écrit dans la fenêtre d'envoi. */
export function readPortalMessage(note: string): string {
  if (!note.startsWith(PORTAL_REPORT_PREFIX)) return note.trim();
  const cut = note.indexOf(SEPARATOR);
  return cut === -1 ? '' : note.slice(cut + SEPARATOR.length).trim();
}

/**
 * Recompose la note. Chaque écran ne remplace QUE sa part : vider le signalement ne laisse
 * pas le préfixe orphelin, et n'emporte pas le message libre.
 */
export function composePortalNote(report: string, message: string): string {
  const head = report.trim() ? `${PORTAL_REPORT_PREFIX}${report.trim()}` : '';
  const tail = message.trim();
  if (head && tail) return `${head}${SEPARATOR}${tail}`;
  return head || tail;
}
