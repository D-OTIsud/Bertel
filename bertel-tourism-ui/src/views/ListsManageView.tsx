'use client';

// Module Listes — écran « Mes listes » (grille). Une liste = une sélection ou un jeu de
// filtres prêt à imprimer / envoyer / partager. Lecture via api.list_my_lists (DEFINER).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, ListChecks, Loader2, MapPin, Plus, Search, Users } from 'lucide-react';
import { ICON_BY_TYPE } from '@/features/lists/OtiTemplate';
import { HUE_BY_TYPE, LABEL_BY_TYPE, OTI_ACCENTS } from '@/features/lists/type-meta';
import { createListFromSelection, listMyLists, type ListStatus, type ObjectListCard } from '@/services/lists';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<ListStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  shared: 'Lien actif',
};
const STATUS_DOT: Record<ListStatus, string> = {
  draft: 'bg-ink/40',
  sent: 'bg-orange',
  shared: 'bg-emerald-500',
};

type Tab = 'all' | ListStatus;

/** « il y a … » compact pour le pied de carte (rendu uniquement côté client, après fetch). */
function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function TypeChip({ code, n }: { code: string; n: number }) {
  const hue = OTI_ACCENTS[HUE_BY_TYPE[code] ?? 'teal'];
  const Icon = ICON_BY_TYPE[code] ?? MapPin;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-bold"
      style={{ backgroundColor: hue.soft, color: hue.deep }}
    >
      <Icon className="h-3 w-3" />
      {LABEL_BY_TYPE[code]?.fr ?? code}
      {n > 1 ? ` ·${n}` : ''}
    </span>
  );
}

function ListCard({ list }: { list: ObjectListCard }) {
  const updated = timeAgo(list.updatedAt);
  return (
    <Link
      href={`/listes/${list.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div
        className="relative h-32 bg-cover bg-center"
        style={{ backgroundImage: list.coverUrl ? `url("${list.coverUrl}")` : undefined, backgroundColor: '#cfc6b6' }}
      >
        <span className="absolute inset-x-0 top-0 h-1" style={{ background: (OTI_ACCENTS[list.accent] ?? OTI_ACCENTS.teal).ink }} />
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-ink shadow-sm">
          <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[list.status])} />
          {STATUS_LABEL[list.status]}
        </span>
        <span className="absolute bottom-2 left-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-white drop-shadow">
          <MapPin className="h-3.5 w-3.5" /> {list.itemCount} {list.itemCount > 1 ? 'lieux' : 'lieu'}
        </span>
        <span className="absolute left-3 top-3 rounded-md bg-ink/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          {list.kind === 'dynamic' ? 'Dynamique' : 'Statique'}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[16px] font-bold leading-tight text-ink">{list.name}</h3>
        {list.recipientLabel && (
          <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink/60">
            <Users className="h-3.5 w-3.5" /> Pour {list.recipientLabel}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {list.typeBreakdown.slice(0, 4).map((t) => (
            <TypeChip key={t.code} code={t.code} n={t.n} />
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between border-t pt-3 text-[12px] text-ink/50">
          <span className="flex items-center gap-2">
            <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-bold uppercase">{list.lang}</span>
            {updated && (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3 w-3" /> {updated}
              </span>
            )}
          </span>
          <span className="font-semibold text-orange group-hover:underline">Ouvrir →</span>
        </div>
      </div>
    </Link>
  );
}

export default function ListsManageView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');

  const listsQuery = useQuery({ queryKey: ['my-lists'], queryFn: listMyLists, staleTime: 30_000 });
  const lists = listsQuery.data ?? [];

  const createBlank = useMutation({
    mutationFn: () => createListFromSelection('Nouvelle liste', []),
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: ['my-lists'] });
      router.push(`/listes/${id}`);
    },
  });

  const counts = useMemo(
    () => ({
      all: lists.length,
      draft: lists.filter((l) => l.status === 'draft').length,
      sent: lists.filter((l) => l.status === 'sent').length,
      shared: lists.filter((l) => l.status === 'shared').length,
    }),
    [lists],
  );
  const q = query.trim().toLowerCase();
  const shown = (tab === 'all' ? lists : lists.filter((l) => l.status === tab)).filter(
    (l) => !q || `${l.name} ${l.recipientLabel ?? ''}`.toLowerCase().includes(q),
  );
  const tabs: Array<{ k: Tab; label: string }> = [
    { k: 'all', label: 'Toutes' },
    { k: 'draft', label: 'Brouillons' },
    { k: 'sent', label: 'Envoyées' },
    { k: 'shared', label: 'Liens actifs' },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] font-extrabold text-ink">
            <ListChecks className="h-5 w-5 text-orange" /> Mes listes
          </h1>
          <p className="text-[12.5px] text-ink/60">Sélections prêtes à imprimer, envoyer ou partager</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-56 items-center gap-2 rounded-full border bg-white px-3 focus-within:border-orange">
            <Search className="h-3.5 w-3.5 shrink-0 text-ink/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une liste…"
              className="w-full bg-transparent text-[12.5px] outline-none"
            />
          </div>
          <div className="flex gap-1 rounded-full bg-ink/5 p-1">
            {tabs.map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => setTab(t.k)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition',
                  tab === t.k ? 'bg-white text-orange shadow-sm' : 'text-ink/60 hover:text-ink',
                )}
              >
                {t.label}
                <span className="text-[11px] tabular-nums text-ink/40">{counts[t.k]}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={createBlank.isPending}
            onClick={() => createBlank.mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange px-3 py-2 text-[12.5px] font-bold text-white transition hover:bg-orange/90 disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" /> Nouvelle liste
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {listsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-ink/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement des listes…
          </div>
        ) : listsQuery.isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">
            Impossible de charger les listes. {(listsQuery.error as Error)?.message}
          </div>
        ) : shown.length === 0 ? (
          <div className="mx-auto max-w-md rounded-2xl border-2 border-dashed p-10 text-center">
            <ListChecks className="mx-auto h-10 w-10 text-ink/30" />
            <p className="mt-3 font-bold text-ink">{q ? 'Aucune liste ne correspond' : "Aucune liste pour l'instant"}</p>
            <p className="mt-1 text-[13px] text-ink/60">
              {q
                ? 'Essayez un autre nom de liste ou de destinataire.'
                : 'Partez d’une sélection dans l’explorateur (bouton « Créer une liste »), ou créez une liste vierge.'}
            </p>
          </div>
        ) : (
          <div className="mx-auto grid max-w-6xl grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
            {shown.map((l) => (
              <ListCard key={l.id} list={l} />
            ))}
            <button
              type="button"
              disabled={createBlank.isPending}
              onClick={() => createBlank.mutate()}
              className="flex min-h-[230px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-ink/50 transition hover:border-orange hover:text-orange disabled:opacity-60"
            >
              <span className="grid h-11 w-11 place-items-center rounded-full bg-ink/5">
                <Plus className="h-5 w-5" />
              </span>
              <span className="text-[14px] font-bold">Nouvelle liste</span>
              <span className="max-w-[220px] text-center text-[12px] text-ink/45">
                Partez d'une sélection de l'explorateur ou d'une liste vierge
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
