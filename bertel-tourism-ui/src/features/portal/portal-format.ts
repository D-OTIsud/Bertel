/**
 * Les dates telles qu'un partenaire les lit : « 2 septembre », jamais « 2026-09-02T08:11:00Z ».
 *
 * Rendue vide plutôt qu'approximative si l'horodatage est illisible : « Invalid Date » à
 * l'écran vaut moins que rien du tout.
 */
export function formatPortalDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(date);
}

/** « 3 rubriques sur 6 renseignées » — le TEXTE porte la valeur, la barre n'est que décor. */
export function portalProgressLabel(done: number, total: number): string {
  return `${done} rubrique${done > 1 ? 's' : ''} sur ${total} renseignée${done > 1 ? 's' : ''}`;
}
