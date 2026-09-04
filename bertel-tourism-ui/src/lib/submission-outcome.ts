/**
 * L'issue d'une vérification de fiche du portail acteur (18a) — le CHECK de
 * `fiche_submission` moins `pending` — et le MOT qui la dit au partenaire.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * SOURCE UNIQUE. Ce vocabulaire décrit UN SEUL événement, sur DEUX surfaces :
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *  - l'e-mail de résolution (`emails/SubmissionReviewedEmail.ts`, sujet + titre) ;
 *  - le tiroir de notifications (`components/layout/NotificationDrawer.tsx`, libellé).
 *
 * Il en existait TROIS copies sans lien (deux tables de mots et une liste de codes), plus
 * le type déclaré deux fois. Aucun test ne les comparait : un arbitrage PO sur « en partie
 * validées » appliqué à l'e-mail et pas au tiroir aurait fait diverger, en silence, deux
 * messages décrivant le même verdict. Une source, donc — la divergence devient impossible
 * plutôt que détectable.
 *
 * `partial` n'est ni une acceptation ni un refus : l'office a retenu une partie du travail
 * et refusé le reste. Toute table indexée par ce type est EXHAUSTIVE par construction —
 * ajouter une issue au SQL sans la rédiger ici ne compile pas.
 *
 * Module pur (aucun import) : lisible du client comme du serveur, de la route de drain
 * comme d'un composant.
 */
export type SubmissionOutcome = 'approved' | 'rejected' | 'partial';

/** Les trois issues, dans l'ordre où on les raisonne : tout, rien, entre les deux. */
export const SUBMISSION_OUTCOMES: readonly SubmissionOutcome[] = Object.freeze([
  'approved',
  'rejected',
  'partial',
] as const);

/**
 * Le mot de l'issue, au participe, tel qu'il se lit après « Vos modifications ont été … ».
 * Français courant : pas un code, pas un statut, pas un mot d'outil interne.
 */
export const SUBMISSION_OUTCOME_WORD: Readonly<Record<SubmissionOutcome, string>> = Object.freeze({
  approved: 'validées',
  rejected: 'refusées',
  partial: 'en partie validées',
});

/**
 * Garde de type. Une valeur hors des trois n'est JAMAIS repliée sur une issue par défaut :
 * un verdict ne se devine pas — ni côté relais e-mail (la ligne part en échec) ni côté
 * tiroir (le libellé retombe sur « vérifiées », neutre et vrai).
 */
export function isSubmissionOutcome(value: unknown): value is SubmissionOutcome {
  return typeof value === 'string' && (SUBMISSION_OUTCOMES as readonly string[]).includes(value);
}
