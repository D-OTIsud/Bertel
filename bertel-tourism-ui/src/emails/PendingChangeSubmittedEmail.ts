import { escapeHtml } from '@/lib/safe-output';

/** One alert per contributor and fiche, grouped by the database while review is open. */
export interface PendingChangeSubmittedEmailData {
  objectName: string;
  submitterName: string | null;
  recipientName: string | null;
  appUrl: string;
}

export function pendingChangeSubmittedEmailSubject(data: PendingChangeSubmittedEmailData): string {
  return `Modifications à modérer — ${data.objectName}`;
}

/** Only names and the authenticated moderation link leave the app; proposed content stays inside. */
export function renderPendingChangeSubmittedEmailHtml(data: PendingChangeSubmittedEmailData): string {
  const recipient = data.recipientName?.trim();
  const greeting = recipient ? `Bonjour ${escapeHtml(recipient)},` : 'Bonjour,';
  const submitter = data.submitterName?.trim() || 'Un contributeur';
  return `<!doctype html>
<html lang="fr"><body style="margin:0;padding:0;background:#f5f1e8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
  <tr><td style="padding:22px 26px 0;">
    <div style="font-size:14px;color:#2d2a2a;">${greeting}</div>
  </td></tr>
  <tr><td style="padding:14px 26px 8px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0e7a6f;">En attente de modération</div>
    <div style="font-size:20px;font-weight:800;color:#2d2a2a;margin-top:6px;">${escapeHtml(data.objectName)}</div>
  </td></tr>
  <tr><td style="padding:10px 26px 0;">
    <div style="font-size:14px;line-height:1.55;color:#5b5754;">${escapeHtml(submitter)} a proposé des modifications de cette fiche depuis l’éditeur contributeur.</div>
    <div style="font-size:14px;line-height:1.55;color:#5b5754;margin-top:6px;">Elles attendent votre validation. Ouvrez la modération pour comparer les changements et les approuver ou les refuser.</div>
  </td></tr>
  <tr><td style="padding:20px 26px 26px;">
    <a href="${escapeHtml(data.appUrl)}" style="display:inline-block;background:#0e7a6f;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;padding:11px 20px;">Examiner les modifications</a>
    <div style="font-size:12px;color:#5b5754;margin-top:12px;">Connectez-vous à Bertel pour les consulter. Si votre équipe les a déjà traitées, elles ne seront plus dans la file en attente.</div>
    <div style="font-size:11px;color:#8a857f;margin-top:14px;">Vous recevez cet e-mail parce que vous pouvez modérer les modifications de cette fiche.</div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
