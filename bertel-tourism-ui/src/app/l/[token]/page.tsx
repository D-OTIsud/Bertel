'use client';

// Page PUBLIQUE d'une liste partagée (lien /l/{token}). Hors shell app, hors auth : lue en
// anon via api.get_public_list_by_token (objets publiés uniquement, sans PII destinataire).
// Rendu brandé OTI simple (hero + mot du conseiller + lieux). Les 3 templates éditoriaux
// (carnet/grille/itinéraire) + l'email arrivent dans une passe ultérieure.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Compass, Loader2, MapPin, Phone, Star } from 'lucide-react';
import { getPublicList, type ListAccent, type ObjectListItem, type PublicList } from '@/services/lists';

const ACCENT: Record<ListAccent, { ink: string; deep: string; soft: string }> = {
  teal: { ink: '#006883', deep: '#024053', soft: '#e0eef1' },
  green: { ink: '#4f9c72', deep: '#3f7d5c', soft: '#e7f2ec' },
  gold: { ink: '#c69a26', deep: '#a07c18', soft: '#f7efd4' },
  terra: { ink: '#b34b3d', deep: '#8f3a2e', soft: '#f6e3df' },
};

function pick(fr: string | null, en: string | null, lang: 'fr' | 'en'): string {
  return (lang === 'en' ? en || fr : fr) ?? '';
}

function readLoc(item: ObjectListItem): { lat?: number; lon?: number } {
  const loc = item.card?.raw?.location;
  if (loc && typeof loc === 'object' && !Array.isArray(loc)) {
    const l = loc as Record<string, unknown>;
    return {
      lat: typeof l.lat === 'number' ? l.lat : undefined,
      lon: typeof l.lon === 'number' ? l.lon : undefined,
    };
  }
  return {};
}

function ItemCard({ item, index, lang }: { item: ObjectListItem; index: number; lang: 'fr' | 'en' }) {
  const card = item.card;
  const note = lang === 'en' ? item.noteEn : item.noteFr;
  const loc = readLoc(item);
  const mapHref = loc.lat != null && loc.lon != null ? `https://maps.google.com/?q=${loc.lat},${loc.lon}` : null;
  return (
    <article className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
      <div
        className="relative h-48 bg-cover bg-center"
        style={{ backgroundImage: card?.image ? `url("${card.image}")` : undefined, backgroundColor: '#cfc6b6' }}
      >
        <span className="absolute left-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-[15px] font-extrabold text-ink shadow">
          {String(index + 1).padStart(2, '0')}
        </span>
        {card?.city && (
          <span className="absolute bottom-3 left-4 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-[12px] font-semibold text-white">
            <MapPin className="h-3.5 w-3.5" /> {card.city}
          </span>
        )}
      </div>
      <div className="p-5">
        {card?.type && (
          <span
            className="text-[11px] font-extrabold uppercase tracking-wide"
            style={{ color: 'var(--oti-ink)' }}
          >
            {card.type}
          </span>
        )}
        <h3 className="mt-1 text-[20px] font-extrabold leading-tight text-ink">{card?.name ?? item.objectId}</h3>
        {card?.description && <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink/60">{card.description}</p>}
        {note && (
          <div
            className="mt-3 rounded-xl p-3 text-[13.5px] leading-relaxed text-ink/80"
            style={{ background: 'var(--oti-soft)' }}
          >
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--oti-ink)' }}>
              <Star className="h-3.5 w-3.5" /> Le coup de cœur du conseiller
            </div>
            {note}
          </div>
        )}
        {mapHref && (
          <a
            href={mapHref}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold text-white"
            style={{ background: 'var(--oti-ink)' }}
          >
            <MapPin className="h-4 w-4" /> Voir sur la carte
          </a>
        )}
      </div>
    </article>
  );
}

export default function PublicListPage() {
  const params = useParams();
  const raw = params?.token;
  const token = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';

  const [state, setState] = useState<{ loading: boolean; list: PublicList | null; error: boolean }>({
    loading: true,
    list: null,
    error: false,
  });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, list: null, error: false });
    getPublicList(token)
      .then((list) => {
        if (alive) setState({ loading: false, list, error: false });
      })
      .catch(() => {
        if (alive) setState({ loading: false, list: null, error: true });
      });
    return () => {
      alive = false;
    };
  }, [token]);

  if (state.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf7f1] text-ink/50">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
      </div>
    );
  }

  if (!state.list) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#faf7f1] px-6 text-center">
        <Compass className="h-10 w-10 text-ink/30" />
        <h1 className="text-[20px] font-extrabold text-ink">Lien indisponible</h1>
        <p className="max-w-sm text-[14px] text-ink/60">
          Cette sélection n'existe plus, a expiré, ou le lien de partage a été désactivé.
        </p>
      </div>
    );
  }

  const list = state.list;
  const lang = list.lang;
  const name = pick(list.name, list.nameEn, lang);
  const intro = pick(list.introFr, list.introEn, lang);
  const acc = ACCENT[list.accent] ?? ACCENT.teal;

  return (
    <main
      className="min-h-screen bg-[#faf7f1] pb-16"
      style={
        {
          '--oti-ink': acc.ink,
          '--oti-deep': acc.deep,
          '--oti-soft': acc.soft,
        } as React.CSSProperties
      }
    >
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div
          className="h-64 bg-cover bg-center sm:h-80"
          style={{ backgroundImage: list.coverUrl ? `url("${list.coverUrl}")` : undefined, backgroundColor: acc.deep }}
        >
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(0,0,0,0.15), ${acc.deep}cc)` }} />
        </div>
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl px-6 pb-7 text-white">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[12px] font-semibold backdrop-blur">
            <Compass className="h-3.5 w-3.5" /> {lang === 'en' ? 'Handpicked for you' : 'Sélection personnalisée'}
          </div>
          <h1 className="text-[30px] font-extrabold leading-tight sm:text-[38px]">{name}</h1>
          <div className="mt-2 flex items-center gap-2 text-[13.5px] font-semibold text-white/85">
            <MapPin className="h-4 w-4" /> {list.items.length} {lang === 'en' ? 'handpicked spots' : 'lieux sélectionnés'}
            <span className="opacity-60">·</span> {lang === 'en' ? 'South of Réunion' : 'Sud de la Réunion'}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6">
        {/* Mot du conseiller */}
        {intro && (
          <section className="-mt-6 mb-8 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
            <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: acc.ink }}>
              {lang === 'en' ? 'A word from your advisor' : 'Un mot de votre conseiller'}
            </div>
            <p className="text-[14.5px] leading-relaxed text-ink/80">{intro}</p>
          </section>
        )}

        {/* Lieux */}
        <div className="grid gap-6">
          {list.items.map((it, i) => (
            <ItemCard key={it.objectId} item={it} index={i} lang={lang} />
          ))}
        </div>

        <footer className="mt-12 flex items-center gap-2 border-t border-black/10 pt-6 text-[12.5px] text-ink/50">
          <Phone className="h-4 w-4" />
          {lang === 'en'
            ? 'Selection prepared for you by the South Réunion Tourism Office.'
            : 'Sélection préparée pour vous par l’Office de Tourisme du Sud de la Réunion.'}
        </footer>
      </div>
    </main>
  );
}
