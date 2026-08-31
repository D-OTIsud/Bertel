// TaskAssignedEmail — e-mail « une tâche vous a été confiée » (drainé par
// /api/crm/notify-drain). Même doctrine que ListEmail : HTML basé tableaux, styles
// inline, escapeHtml sur toute donnée dérivée de la DB. AUCUNE donnée client n'entre
// jamais ici : tout vient de api.claim_unmailed_notifications.
import { escapeHtml } from '@/lib/safe-output';

export interface TaskAssignedEmailData {
  taskTitle: string;
  objectName: string;
  dueAt: string | null; // ISO ; null = pas d'échéance
  assignerName: string | null; // null = assignateur inconnu
  /**
   * Nom du DESTINATAIRE, joint à la lecture par api.claim_unmailed_notifications (jamais
   * stocké : portée RGPD). `null` = inconnu ⇒ salutation impersonnelle, JAMAIS « Bonjour , »
   * ni « Bonjour null » — un e-mail qui écorche le nom de son lecteur est pire que celui qui
   * ne le nomme pas.
   */
  recipientName: string | null;
  appUrl: string; // lien absolu vers /crm
}

/** Sujet de l'e-mail (réutilisé par la route). */
export function taskAssignedEmailSubject(data: TaskAssignedEmailData): string {
  return `Nouvelle tâche : ${data.taskTitle} — ${data.objectName}`;
}

// Fuseau La Réunion assumé (pas celui du serveur) : une échéance affichée dans un
// autre fuseau mentirait à son lecteur, le projet ne servant que La Réunion.
function formatDueDate(iso: string | null): string {
  if (!iso) return 'Sans échéance';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Sans échéance';
  return date.toLocaleDateString('fr-FR', { timeZone: 'Indian/Reunion' });
}

/**
 * Salutation. Le nom du destinataire vient de la DB (`api.crm_user_label`) et peut être
 * absent — ou n'être que des espaces, `crm_user_label` retombant sur un libellé de repli qui
 * n'est pas garanti non vide. Le `trim()` est donc la garde, pas la simple nullité : sans
 * lui, « Bonjour   , » partirait à un lecteur réel. Repli impersonnel mais correct.
 */
function formatGreeting(name: string | null): string {
  const clean = (name ?? '').trim();
  return clean ? `Bonjour ${escapeHtml(clean)},` : 'Bonjour,';
}

export function renderTaskAssignedEmailHtml(data: TaskAssignedEmailData): string {
  const assigner = data.assignerName
    ? `Confiée par ${escapeHtml(data.assignerName)}`
    : 'Confiée par votre équipe';
  const greeting = formatGreeting(data.recipientName);
  return `<!doctype html>
<html lang="fr"><body style="margin:0;padding:0;background:#f5f1e8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
  <tr><td style="padding:22px 26px 0;">
    <div style="font-size:14px;color:#2d2a2a;">${greeting}</div>
  </td></tr>
  <tr><td style="padding:14px 26px 8px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0e7a6f;">Nouvelle tâche</div>
    <div style="font-size:20px;font-weight:800;color:#2d2a2a;margin-top:6px;">${escapeHtml(data.taskTitle)}</div>
    <div style="font-size:14px;color:#5b5754;margin-top:4px;">${escapeHtml(data.objectName)}</div>
  </td></tr>
  <tr><td style="padding:10px 26px 0;">
    <div style="font-size:13px;color:#5b5754;">Échéance : <strong style="color:#2d2a2a;">${escapeHtml(formatDueDate(data.dueAt))}</strong></div>
    <div style="font-size:13px;color:#5b5754;margin-top:4px;">${assigner}</div>
  </td></tr>
  <tr><td style="padding:20px 26px 26px;">
    <a href="${escapeHtml(data.appUrl)}" style="display:inline-block;background:#0e7a6f;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;padding:11px 20px;">Voir mes tâches</a>
    <div style="font-size:11px;color:#8a857f;margin-top:14px;">Vous recevez cet e-mail parce qu'une tâche vous a été attribuée dans le CRM.</div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
