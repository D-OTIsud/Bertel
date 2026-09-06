'use client';

// Page PUBLIQUE d'une liste partagée (lien /l/{token}). Hors shell app, hors auth : lue en
// anon via api.get_public_list_by_token (objets publiés uniquement, sans PII destinataire).
// Rendu via OtiTemplate (Carnet/Grille/Itinéraire) — le même composant que l'aperçu de composition.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Compass, Loader2 } from 'lucide-react';
import OtiTemplate, { itemsToOtiPois } from '@/features/lists/OtiTemplate';
import { getPublicList, type PublicList } from '@/services/lists';

function pick(fr: string | null, en: string | null, lang: 'fr' | 'en'): string {
  return (lang === 'en' ? en || fr : fr) ?? '';
}

export default function PublicListPage() {
  const params = useParams();
  const raw = params?.token;
  const token = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';

  type Status =
    | { kind: 'loading' }
    | { kind: 'error' }
    | { kind: 'notFound' }
    | { kind: 'success'; list: PublicList };

  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    // Un changement de token/retry peut résoudre après démontage ou après une
    // requête plus récente : on ignore toute résolution qui n'est plus la dernière.
    let ignore = false;
    setStatus({ kind: 'loading' });
    getPublicList(token)
      .then((list) => {
        if (ignore) return;
        setStatus(list ? { kind: 'success', list } : { kind: 'notFound' });
      })
      .catch(() => {
        if (ignore) return;
        setStatus({ kind: 'error' });
      });
    return () => {
      ignore = true;
    };
  }, [token, retryKey]);

  if (status.kind === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fbf9f4] text-ink/50">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
      </div>
    );
  }

  if (status.kind === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#fbf9f4] px-6 text-center">
        <Compass className="h-10 w-10 text-ink/30" />
        <h1 className="text-[20px] font-extrabold text-ink">Une erreur est survenue · <span lang="en">Something went wrong</span></h1>
        <p className="max-w-sm text-[14px] text-ink/60">
          Impossible d'afficher cette sélection pour le moment. Merci de réessayer.
          <br />
          <span lang="en">We couldn't load this list right now. Please try again.</span>
        </p>
        <button
          type="button"
          onClick={() => setRetryKey((n) => n + 1)}
          className="rounded-full border border-ink/20 px-4 py-2 text-[14px] font-semibold text-ink hover:bg-ink/5"
        >
          Réessayer · <span lang="en">Retry</span>
        </button>
      </div>
    );
  }

  if (status.kind === 'notFound') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#fbf9f4] px-6 text-center">
        <Compass className="h-10 w-10 text-ink/30" />
        <h1 className="text-[20px] font-extrabold text-ink">Lien indisponible</h1>
        <p className="max-w-sm text-[14px] text-ink/60">
          Cette sélection n'existe plus, a expiré, ou le lien de partage a été désactivé.
        </p>
      </div>
    );
  }

  const list = status.list;
  const lang = list.lang;
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-[#fbf9f4] shadow-xl" lang={lang}>
      <OtiTemplate
        template={list.template}
        lang={lang}
        accent={list.accent}
        name={pick(list.name, list.nameEn, lang)}
        intro={pick(list.introFr, list.introEn, lang)}
        coverUrl={list.coverUrl}
        items={itemsToOtiPois(list.items, lang)}
        showMap={list.showMap}
      />
    </main>
  );
}
