// ListEmail — rendu HTML e-mail SAFE d'une liste (envoi via /api/lists/send).
// Volontairement PAS l'OtiTemplate (client + CSS externe/grille/fonts Next = mauvais rendu email) :
// ici HTML basé sur des tableaux, styles 100 % inline, largeur ≤ 640px, images en URL absolue,
// nombre de fiches limité + bouton vers la liste publique complète. Cf. décision PO 2026-07-01.
import { escapeHtml } from '@/lib/safe-output';
import { webHref, webLabel } from '@/features/lists/type-meta';

export interface ListEmailItem {
  name: string;
  typeLabel: string;
  city: string | null;
  image: string | null;
  note: string | null;
  phone: string | null;
  web: string | null;
}

export interface ListEmailData {
  name: string;
  intro: string | null;
  advisorName: string | null;
  publicUrl: string;
  accentInk: string; // hex
  lang: 'fr' | 'en';
  coverUrl: string | null;
  items: ListEmailItem[];
  totalCount: number;
}

const t = (fr: string, en: string, lang: 'fr' | 'en') => (lang === 'en' ? en : fr);

/** Sujet de l'e-mail (réutilisé par la route). */
export function listEmailSubject(name: string, lang: 'fr' | 'en'): string {
  return `${t('Votre sélection pour le Sud : ', 'Your handpicked South selection: ', lang)}${name}`;
}

function itemRow(it: ListEmailItem, index: number, accent: string): string {
  const img = it.image
    ? `<img src="${escapeHtml(it.image)}" width="120" height="90" alt="" style="display:block;width:120px;height:90px;object-fit:cover;border-radius:10px;border:0;" />`
    : `<div style="width:120px;height:90px;border-radius:10px;background:#d9d2c6;"></div>`;
  const cityLine = it.city
    ? `<span style="color:#8a857f;"> · ${escapeHtml(it.city)}</span>`
    : '';
  const note = it.note
    ? `<div style="margin-top:6px;font-size:13px;line-height:1.5;color:#5b5754;background:#f5f1e8;border-left:3px solid ${accent};border-radius:0 8px 8px 0;padding:8px 10px;">${escapeHtml(it.note)}</div>`
    : '';
  const contactBits: string[] = [];
  if (it.phone) {
    contactBits.push(
      `<a href="tel:${escapeHtml(it.phone.replace(/\s/g, ''))}" style="color:#5b5754;text-decoration:none;">☎ ${escapeHtml(it.phone)}</a>`,
    );
  }
  if (it.web) {
    contactBits.push(
      `<a href="${escapeHtml(webHref(it.web))}" style="color:${accent};text-decoration:none;">${escapeHtml(webLabel(it.web))}</a>`,
    );
  }
  const contacts = contactBits.length
    ? `<div style="margin-top:5px;font-size:12px;color:#5b5754;">${contactBits.join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</div>`
    : '';
  return `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid #ece6db;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="120" valign="top" style="padding-right:14px;">${img}</td>
        <td valign="top">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${accent};">${escapeHtml(it.typeLabel)}${cityLine}</div>
          <div style="font-size:17px;font-weight:800;color:#2d2a2a;margin-top:2px;">${String(index + 1).padStart(2, '0')} · ${escapeHtml(it.name)}</div>
          ${note}
          ${contacts}
        </td>
      </tr></table>
    </td>
  </tr>`;
}

export function renderListEmailHtml(data: ListEmailData): string {
  const { name, intro, advisorName, publicUrl, accentInk, lang, coverUrl, items, totalCount } = data;
  const safeUrl = escapeHtml(publicUrl);
  const remaining = totalCount - items.length;
  const cover = coverUrl
    ? `<tr><td><img src="${escapeHtml(coverUrl)}" width="640" alt="" style="display:block;width:100%;max-width:640px;height:auto;border:0;" /></td></tr>`
    : '';
  const introBlock = intro
    ? `<tr><td style="padding:18px 28px 4px;">
         <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:15px;color:#5b5754;line-height:1.6;">${escapeHtml(intro)}</div>
         ${advisorName ? `<div style="margin-top:8px;font-size:12px;font-weight:700;color:#2d2a2a;">${escapeHtml(advisorName)}<span style="font-weight:400;color:#8a857f;"> · ${t('OTI du Sud', 'South Réunion Tourism Office', lang)}</span></div>` : ''}
       </td></tr>`
    : '';
  const rows = items.map((it, i) => itemRow(it, i, accentInk)).join('');
  const moreLine = remaining > 0
    ? `<div style="margin-top:8px;font-size:13px;color:#8a857f;">${t('+ ', '+ ', lang)}${remaining} ${t(remaining > 1 ? 'autres lieux dans la sélection complète' : 'autre lieu dans la sélection complète', remaining > 1 ? 'more spots in the full selection' : 'more spot in the full selection', lang)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(name)}</title></head>
<body style="margin:0;padding:0;background:#e8e2d6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e8e2d6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background:#fbf9f4;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
        <tr><td style="background:${accentInk};padding:22px 28px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.85);">${t('Sélection personnalisée', 'Handpicked for you', lang)}</div>
          <div style="font-size:26px;font-weight:800;color:#ffffff;line-height:1.15;margin-top:6px;">${escapeHtml(name)}</div>
        </td></tr>
        ${cover}
        ${introBlock}
        <tr><td style="padding:12px 28px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
          ${moreLine}
        </td></tr>
        <tr><td align="center" style="padding:20px 28px 26px;">
          <a href="${safeUrl}" style="display:inline-block;background:${accentInk};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 26px;border-radius:999px;">${t('Consulter la sélection complète', 'View the full selection', lang)}</a>
        </td></tr>
        <tr><td style="background:#2d2a2a;padding:18px 28px;">
          <div style="font-size:12px;color:rgba(255,255,255,0.55);line-height:1.6;">${t('Vous recevez ce message car un conseiller vous a préparé cette sélection.', 'You received this because an advisor prepared this selection for you.', lang)}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.8);font-weight:700;margin-top:6px;">OTI du Sud de la Réunion · sud.reunion.fr</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
