'use client';

// ChannelFrame — habillage du canal de diffusion autour de l'aperçu (OtiTemplate) :
//   email → entête client mail (sujet / expéditeur / destinataire / date)
//   pdf   → feuille A4 blanche + pied « document généré »
//   web   → barre de navigateur (pastilles + URL + copier le lien)
// Porté du design 019e20ac (lists-compose.jsx ChannelFrame). Chrome en Tailwind ; le contenu
// (children) est l'OtiTemplate rendu par l'appelant, déjà en mode étroit pour l'email.
import type { ReactNode } from 'react';
import { Copy, Globe } from 'lucide-react';

type Channel = 'email' | 'pdf' | 'web';

interface Props {
  channel: Channel;
  name: string;
  recipient: string | null;
  lang: 'fr' | 'en';
  shareUrl: string | null;
  senderEmail?: string;
  children: ReactNode;
}

const t = (fr: string, en: string, lang: 'fr' | 'en') => (lang === 'en' ? en : fr);

export default function ChannelFrame({ channel, name, recipient, lang, shareUrl, senderEmail = 'sejour@oti-sud.re', children }: Props) {
  if (channel === 'email') {
    return (
      <div className="overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-b bg-[#f7f4ee] px-5 py-4">
          <div className="text-[15.5px] font-extrabold tracking-tight text-ink">
            {t('Votre sélection pour le Sud : ', 'Your handpicked South selection: ', lang)}
            {name}
          </div>
          <div className="mt-2.5 flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#006883] text-[13px] font-bold text-white">OS</span>
            <div className="min-w-0 text-[12.5px]">
              <div className="font-bold text-ink">
                OTI du Sud <span className="font-medium text-ink/55">&lt;{senderEmail}&gt;</span>
              </div>
              <div className="text-ink/55">
                {t('À', 'To', lang)} : {recipient || t('un visiteur', 'a visitor', lang)}
              </div>
            </div>
            <span className="ml-auto self-start whitespace-nowrap text-[11.5px] text-ink/40">
              {t('Aujourd’hui', 'Today', lang)} · 09:42
            </span>
          </div>
        </div>
        <div>{children}</div>
      </div>
    );
  }

  if (channel === 'web') {
    return (
      <div className="overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center gap-3 border-b bg-[#f2efe8] px-3.5 py-2.5">
          <div className="flex gap-1.5">
            <i className="h-2.5 w-2.5 rounded-full bg-black/15" />
            <i className="h-2.5 w-2.5 rounded-full bg-black/15" />
            <i className="h-2.5 w-2.5 rounded-full bg-black/15" />
          </div>
          <div className="flex h-7 flex-1 items-center gap-2 rounded-full border bg-white px-3 text-[12px] text-ink/70">
            <Globe className="h-3 w-3 text-emerald-600" />
            <span className="truncate">{shareUrl ?? 'sud.reunion.fr/s/…'}</span>
          </div>
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#006883] px-3 text-[12px] font-semibold text-white">
            <Copy className="h-3 w-3" /> {t('Copier le lien', 'Copy link', lang)}
          </span>
        </div>
        <div>{children}</div>
      </div>
    );
  }

  // pdf — feuille A4
  const generatedOn = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR');
  return (
    <div className="bg-white shadow-xl">
      <div>{children}</div>
      <div className="flex items-center justify-between border-t px-8 py-3 text-[11px] text-ink/45">
        <span>
          <b className="text-ink/70">OTI du Sud de la Réunion</b> · {name}
        </span>
        <span>sud.reunion.fr · {t('document généré le', 'generated on', lang)} {generatedOn}</span>
      </div>
    </div>
  );
}
