// SubmissionReviewedEmail (18a §4.7) — « votre office a vérifié votre fiche ».
//
// Même facture que TaskAssignedEmail : HTML basé tableaux, styles inline, escapeHtml sur
// TOUTE donnée dérivée de la DB, salutation gardée par `trim()`. Drainé par la même route
// (/api/crm/notify-drain), depuis les MÊMES lignes d'outbox : tout le contenu vient de
// api.claim_unmailed_notifications, aucune donnée client n'entre ici.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// C'EST LE SEUL RETOUR QUE LE PARTENAIRE REÇOIT.
// ═══════════════════════════════════════════════════════════════════════════════════════
//
// Le lecteur est un partenaire — souvent peu à l'aise avec l'informatique, souvent sur un
// téléphone —, pas un agent d'office. D'où trois règles de rédaction, tenues par les tests :
//
//  1. AUCUN mot d'outil interne : ni « soumission », ni « modération », ni « module », ni
//     « section », ni « contributeur », ni « prestataire ». L'institution est « l'office »
//     ou « votre office de tourisme ». Vouvoiement, une idée par phrase, verbes d'abord.
//  2. LES TROIS ISSUES SE LISENT DIFFÉREMMENT. `partial` n'est ni `approved` ni `rejected` :
//     l'office a retenu une partie et refusé le reste. Une copie unique qui dirait
//     « vérifiées » aux trois laisserait sans réponse le partenaire dont le travail a été
//     refusé — et enverrait chercher un problème inexistant celui dont tout a été accepté.
//     Le libellé est donc une TABLE indexée par l'issue, jamais un ternaire à deux bras.
//  3. LE MOTIF NE PART PAS PAR E-MAIL. Un e-mail n'est pas authentifié et se transfère ;
//     le motif d'un refus peut nommer une personne ou un fait sensible. L'e-mail dit donc
//     qu'un motif EXISTE et où le lire (dans l'espace, authentifié) — il ne le recopie pas.
//
// RGPD : la notification écrite en base ne porte AUCUN nom (payload {submission_id,
// object_id, outcome}). Le nom de la fiche et celui du destinataire ci-dessous sont JOINTS
// à la lecture par le claim, au moment de composer — jamais gelés dans la notification.
import { escapeHtml } from '@/lib/safe-output';
import { SUBMISSION_OUTCOME_WORD, type SubmissionOutcome } from '@/lib/submission-outcome';

// Le type et le mot de chaque issue viennent de `lib/submission-outcome` — la MÊME source
// que le libellé du tiroir de notifications. Deux surfaces qui décrivent un seul verdict ne
// peuvent plus diverger sur un arbitrage de copie. Re-exporté pour la route de drain, qui
// compose depuis ce module.
export type { SubmissionOutcome };

export interface SubmissionReviewedEmailData {
  /** Nom de la fiche, joint à la lecture. */
  objectName: string;
  outcome: SubmissionOutcome;
  /**
   * Nom du DESTINATAIRE, joint à la lecture (jamais stocké : portée RGPD). `null` = inconnu
   * ⇒ salutation impersonnelle, JAMAIS « Bonjour , » ni « Bonjour null ».
   */
  recipientName: string | null;
  /** Lien ABSOLU vers l'espace du partenaire (`/espace`), jamais vers /crm. */
  appUrl: string;
  /**
   * Lien ABSOLU vers la page de connexion (`/login`), qui porte aussi « Mot de passe
   * oublié ? ». Le lecteur type a posé son mot de passe UNE fois, il y a des mois : sans
   * cette porte, celui qui ne se reconnecte pas ne saura jamais ce qui a été refusé — et
   * c'est lui qui téléphone à l'office, ce que ce portail existe pour éviter. Champ à part
   * plutôt que déduit d'`appUrl` : on ne fabrique pas une URL par découpage de chaîne.
   */
  loginUrl: string;
}

/** Le titre du message, dans le corps. Distinct du sujet : il porte la phrase, pas l'objet. */
const OUTCOME_HEADLINE: Record<SubmissionOutcome, string> = {
  approved: 'Vos modifications ont été validées',
  rejected: 'Vos modifications n’ont pas été retenues',
  partial: 'Une partie de vos modifications a été validée',
};

/**
 * Ce que le partenaire doit comprendre, et ce qu'il doit faire ensuite. Une idée par phrase.
 * `approved` ne parle JAMAIS de correction : appeler à corriger quelqu'un qui est en règle
 * lui fait chercher un problème qui n'existe pas.
 */
const OUTCOME_BODY: Record<SubmissionOutcome, readonly string[]> = {
  approved: [
    'Votre office de tourisme a vérifié votre fiche.',
    'Tout ce que vous avez envoyé a été accepté.',
    'Vous n’avez rien à faire.',
  ],
  // Chaque phrase apporte un fait de PLUS que le titre. Une 2ᵉ phrase qui paraphrase le
  // titre (« a été validée » / « a été acceptée ») fait chercher deux faits là où il n'y en
  // a qu'un : elle dit donc ce que la décision CHANGE pour la fiche, ce que le titre ne dit
  // pas. Vrai dans les deux cas : rien de refusé n'a été appliqué.
  rejected: [
    'Votre office de tourisme a vérifié votre fiche.',
    'Votre fiche n’a pas changé : elle reste telle qu’elle était avant votre envoi.',
    'L’office a indiqué pourquoi. Ouvrez votre espace pour le lire, corriger et renvoyer.',
  ],
  partial: [
    'Votre office de tourisme a vérifié votre fiche.',
    'L’office n’a pas retenu le reste : votre fiche n’a pas changé sur ces points.',
    'L’office a indiqué pourquoi. Ouvrez votre espace pour le lire, corriger et renvoyer.',
  ],
};

/**
 * Sujet de l'e-mail (réutilisé par la route).
 *
 * Le nom de la fiche n'est PAS échappé ici : un sujet est un en-tête MIME, pas du HTML —
 * l'échapper y ferait lire « &lt;b&gt; » au lieu du nom. L'échappement porte sur le corps.
 */
export function submissionReviewedEmailSubject(data: SubmissionReviewedEmailData): string {
  return `Vos modifications ont été ${SUBMISSION_OUTCOME_WORD[data.outcome]} — ${data.objectName}`;
}

/**
 * Salutation. Même garde que TaskAssignedEmail, et pour la même raison : le nom vient de
 * `api.crm_user_label`, dont le repli n'est pas garanti non vide. Le `trim()` EST la garde —
 * sans lui, « Bonjour   , » partirait à un lecteur réel.
 */
function formatGreeting(name: string | null): string {
  const clean = (name ?? '').trim();
  return clean ? `Bonjour ${escapeHtml(clean)},` : 'Bonjour,';
}

export function renderSubmissionReviewedEmailHtml(data: SubmissionReviewedEmailData): string {
  const greeting = formatGreeting(data.recipientName);
  const sentences = OUTCOME_BODY[data.outcome]
    .map(
      (sentence) =>
        `<div style="font-size:14px;line-height:1.55;color:#5b5754;margin-top:6px;">${sentence}</div>`,
    )
    .join('');
  return `<!doctype html>
<html lang="fr"><body style="margin:0;padding:0;background:#f5f1e8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
  <tr><td style="padding:22px 26px 0;">
    <div style="font-size:14px;color:#2d2a2a;">${greeting}</div>
  </td></tr>
  <tr><td style="padding:14px 26px 8px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0e7a6f;">Fiche vérifiée</div>
    <div style="font-size:20px;font-weight:800;color:#2d2a2a;margin-top:6px;">${OUTCOME_HEADLINE[data.outcome]}</div>
    <div style="font-size:14px;color:#5b5754;margin-top:4px;">${escapeHtml(data.objectName)}</div>
  </td></tr>
  <tr><td style="padding:10px 26px 0;">${sentences}</td></tr>
  <tr><td style="padding:20px 26px 26px;">
    <a href="${escapeHtml(data.appUrl)}" style="display:inline-block;background:#0e7a6f;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;padding:11px 20px;">Ouvrir mon espace</a>
    <div style="font-size:12px;color:#5b5754;margin-top:12px;">Le détail se lit dans votre espace, fiche par fiche.</div>
    <div style="font-size:12px;color:#5b5754;margin-top:6px;">Vous devrez vous connecter avec votre adresse e-mail. Mot de passe oublié ? <a href="${escapeHtml(data.loginUrl)}" style="color:#0e7a6f;">Demandez-en un nouveau</a>.</div>
    <div style="font-size:11px;color:#8a857f;margin-top:14px;">Vous recevez cet e-mail parce que votre office de tourisme a vérifié une fiche que vous lui avez envoyée.</div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
