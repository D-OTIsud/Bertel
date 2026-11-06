import { escapeHtml } from '@/lib/safe-output';
import { coerceThemeSettings, type ThemeSettings } from '@/lib/theme';

export interface PartnerInvitationEmailData {
  officeName: string;
  officeLogoUrl: string | null;
  recipientName: string | null;
  ficheNames: string[];
  invitationUrl: string;
  theme?: Partial<ThemeSettings>;
}

function httpsUrl(value: string | null): string {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' ? escapeHtml(url.href) : ''; }
  catch { return ''; }
}

export function partnerInvitationEmailSubject(data: PartnerInvitationEmailData): string {
  const subject = data.ficheNames.length === 1
    ? `${data.ficheNames[0]} : mettez à jour votre fiche vous-même`
    : 'Mettez à jour vos fiches depuis votre espace partenaire';
  return subject.replace(/[\r\n\u0000]+/g, ' ');
}

/** Les couleurs proviennent des mêmes jetons que l'application, résolus avant de
 * produire les styles inline nécessaires aux clients de messagerie. */
export function renderPartnerInvitationEmailHtml(data: PartnerInvitationEmailData): string {
  const theme = coerceThemeSettings(data.theme ?? {});
  const text = theme.textColor;
  const office = escapeHtml(data.officeName);
  const name = (data.recipientName ?? '').trim();
  const logo = httpsUrl(data.officeLogoUrl);
  const link = httpsUrl(data.invitationUrl);
  const fiches = data.ficheNames.map(escapeHtml).join(', ');
  return `<!doctype html><html lang="fr"><body style="margin:0;background:${theme.backgroundColor};color:${text};font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:${theme.surfaceColor};border-radius:14px;">
<tr><td style="padding:28px;">${logo ? `<img src="${logo}" alt="" width="48" style="display:block;margin-bottom:12px;">` : ''}
<strong>${office}</strong><p style="color:${theme.primaryColor};font-size:12px;font-weight:bold;">ESPACE PARTENAIRE</p>
<p>${name ? `Bonjour ${escapeHtml(name)},` : 'Bonjour,'}</p>
<p>Vous pouvez désormais mettre à jour vous-même ${data.ficheNames.length === 1 ? 'la fiche de' : 'vos fiches'}${fiches ? ` <strong>${fiches}</strong>` : ''} sur le site de l’office.</p>
<h2 style="font-size:18px;">Ce que vous pouvez changer</h2>
<ul><li>Horaires et fermetures</li><li>Téléphone, e-mail et site internet</li><li>Tarifs</li><li>Présentation</li></ul>
<p>Vous pouvez réordonner et retirer vos photos. L’office vérifie les nouvelles photos avant publication.</p>
<h2 style="font-size:18px;">Comment ça se passe</h2>
<p><strong>1. Vous modifiez</strong><br>Une rubrique à la fois, depuis votre téléphone ou un ordinateur.</p>
<p><strong>2. Vous envoyez à l’office</strong><br>Un seul bouton. Votre fiche publiée ne change pas encore.</p>
<p><strong>3. Nous relisons et publions</strong><br>En général sous une semaine. Vous êtes prévenu par e-mail.</p>
${link ? `<p style="margin:28px 0;"><a href="${link}" style="display:inline-block;padding:14px 20px;border-radius:10px;background:${theme.primaryColor};color:${theme.surfaceColor};font-weight:bold;text-decoration:none;">Ouvrir mon espace partenaire</a></p>` : ''}
<p style="font-size:13px;">À la première visite, vous choisirez votre mot de passe. Ce lien est personnel.</p>
<p><strong>Une question ?</strong><br>Répondez simplement à cet e-mail : il arrive directement à l’office.</p>
<p style="font-size:12px;">Vous recevez ce message car votre établissement est référencé par ${office}. Vous préférez ne pas utiliser l’espace partenaire ? Ignorez ce message : l’office continue de gérer votre fiche.</p>
<p style="font-size:12px;">${office} · Envoyé avec Bertel</p></td></tr></table></td></tr></table></body></html>`;
}
