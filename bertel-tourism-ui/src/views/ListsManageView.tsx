'use client';

// Module Listes — écran « Mes listes » (grilles). Une liste = une sélection ou un jeu de
// filtres prêt à imprimer / envoyer / partager. Structure (cadrage 2026-09-07) : la une de
// l'organisation au-dessus, « Mes listes » par défaut, Archives et Propositions (admin) en
// onglets volontaires — jamais une grille générale des listes des collègues.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Clock3, ListChecks, Loader2, MapPin, Plus, RotateCw, Search, Star, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { CoverImage } from '@/features/lists/CoverImage';
import { ICON_BY_TYPE } from '@/features/lists/OtiTemplate';
import { HUE_BY_TYPE, LABEL_BY_TYPE, OTI_ACCENTS } from '@/features/lists/type-meta';
import {
  createListFromSelection,
  duplicateList,
  listFeaturedLists,
  listListProposals,
  listMyLists,
  listsQueryKeys,
  requestListFeature,
  restoreList,
  reviewListFeature,
  setListFeatured,
  type ListStatus,
  type ObjectListCard,
} from '@/services/lists';
import { useSessionStore } from '@/store/session-store';
import { canCreateLists, isListsAdmin } from '@/store/session-selectors';
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

type StatusTab = 'all' | ListStatus;
type SectionTab = 'mine' | 'archives' | 'proposals';

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

/**
 * Carte de liste. Le lien de navigation ne couvre QUE l'aperçu (image + titre + chips) : les
 * actions (proposer, dupliquer, restaurer…) sont des boutons SIBLINGS, jamais imbriqués dans le
 * `<Link>` — un bouton dans une ancre casse le clic et l'accessibilité.
 */
function ListCard({ list, actions, showCreator }: { list: ObjectListCard; actions?: ReactNode; showCreator?: boolean }) {
  const updated = timeAgo(list.updatedAt);
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/listes/${list.id}`} className="flex flex-1 flex-col">
        <div className="relative h-32 overflow-hidden">
          <CoverImage src={list.coverUrl} className="absolute inset-0 h-full w-full" />
          <span className="absolute inset-x-0 top-0 h-1" style={{ background: (OTI_ACCENTS[list.accent] ?? OTI_ACCENTS.teal).ink }} />
          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-ink shadow-sm">
            <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[list.status])} />
            {STATUS_LABEL[list.status]}
          </span>
          <span className="absolute bottom-2 left-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-white drop-shadow">
            <MapPin className="h-3.5 w-3.5" /> {list.itemCount} {list.itemCount > 1 ? 'lieux' : 'lieu'}
          </span>
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-ink/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {list.kind === 'dynamic' ? 'Dynamique' : 'Statique'}
            {list.isFeatured && (
              <span className="inline-flex items-center gap-0.5 normal-case tracking-normal text-amber-300">
                <Star className="h-2.5 w-2.5 fill-current" /> à la une
              </span>
            )}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <h3 className="text-[16px] font-bold leading-tight text-ink">{list.name}</h3>
          {showCreator && list.creatorName && (
            <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink/60">
              <Users className="h-3.5 w-3.5" /> Proposée par {list.creatorName}
            </div>
          )}
          {!showCreator && list.recipientLabel && (
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
      {actions && <div className="flex flex-wrap items-center gap-2 border-t p-3">{actions}</div>}
    </div>
  );
}

/**
 * Échec de chargement d'une grille : jamais confondu avec « aucune liste ». Un opérateur qui
 * voit « Aucune liste à la une » alors que la requête a simplement échoué croirait à tort que son
 * organisation n'a rien mis en avant — la relance est l'action correctrice immédiate.
 */
function ErrorRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" /> {message}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-100"
      >
        <RotateCw className="h-3.5 w-3.5" /> Réessayer
      </button>
    </div>
  );
}

/** Un refetch en échec garde les données précédentes en cache : les montrer (obsolètes mais
 *  réelles) vaut mieux que les remplacer par une erreur qui ferait croire à une section vide. */
function StaleWarning({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
      <span className="flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Actualisation impossible — ces données peuvent être obsolètes.
      </span>
      <button type="button" onClick={onRetry} className="shrink-0 font-semibold underline hover:no-underline">
        Réessayer
      </button>
    </div>
  );
}

const actionButton =
  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold text-ink/80 transition hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-50';
const primaryActionButton =
  'inline-flex items-center gap-1.5 rounded-lg bg-orange px-2.5 py-1.5 text-[12px] font-bold text-white transition hover:bg-orange/90 disabled:cursor-not-allowed disabled:opacity-60';

export default function ListsManageView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const orgId = useSessionStore((s) => s.orgId);
  const userId = useSessionStore((s) => s.userId);
  const [sectionTab, setSectionTab] = useState<SectionTab>('mine');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [query, setQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cadrage 2026-09-07 règle 1 — création ouverte à tout membre connecté d'une organisation.
  const canCreate = useSessionStore(canCreateLists);
  const isAdmin = useSessionStore(isListsAdmin);

  // Clés incluant IDENTITÉ + organisation (revue architecte) : ces trois grilles portent des
  // listes PERSONNELLES et des capacités (`can_edit`…) propres à l'APPELANT, pas seulement à son
  // organisation. Sans `userId`, deux membres de la même ORG partageraient dans le cache mémoire
  // du même onglet la grille/les droits du premier arrivé — `Providers.buster` ne gouverne que la
  // réhydratation du cache PERSISTÉ au chargement, jamais les entrées déjà en mémoire.
  const myListsKey = listsQueryKeys.myLists(orgId, userId);
  const featuredListsKey = listsQueryKeys.featured(orgId, userId);
  const listProposalsKey = listsQueryKeys.proposals(orgId, userId);
  const myListsQuery = useQuery({ queryKey: myListsKey, queryFn: listMyLists, staleTime: 30_000 });
  const featuredQuery = useQuery({ queryKey: featuredListsKey, queryFn: listFeaturedLists, staleTime: 30_000 });
  const proposalsQuery = useQuery({
    queryKey: listProposalsKey,
    queryFn: listListProposals,
    staleTime: 30_000,
    enabled: isAdmin,
  });

  const myLists = myListsQuery.data ?? [];
  // Une liste personnelle NE DOIT JAMAIS disparaître de « Mes listes » parce que la requête « à la
  // une » a échoué : le dédup ne s'applique qu'aux id RÉELLEMENT confirmés à la une (données de
  // succès), jamais à un ensemble vide-par-échec qu'on confondrait avec « rien n'est à la une ».
  const featuredLists = featuredQuery.data ?? [];
  const proposals = proposalsQuery.data ?? [];
  const featuredIds = useMemo(() => new Set(featuredLists.map((l) => l.id)), [featuredLists]);

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: myListsKey });
    void queryClient.invalidateQueries({ queryKey: featuredListsKey });
    void queryClient.invalidateQueries({ queryKey: listProposalsKey });
  };
  // Une action sur une carte doit aussi invalider le DÉTAIL de CETTE liste (même identité) —
  // sinon ouvrir la fiche juste après montre encore l'état d'avant l'action (revue architecte).
  const invalidateDetail = (id: string) =>
    void queryClient.invalidateQueries({ queryKey: listsQueryKeys.detail(id, userId, orgId) });
  const onActionError = (fallback: string) => (e: unknown) =>
    setErrorMessage(e instanceof Error ? e.message : fallback);

  const createBlank = useMutation({
    mutationFn: () => createListFromSelection('Nouvelle liste', []),
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: myListsKey });
      router.push(`/listes/${id}`);
    },
    onError: onActionError('Création de la liste impossible.'),
  });
  // Une seule instance de mutation par action, partagée par toutes les cartes : `variables`
  // porte l'id en cours, ce qui permet de désactiver UNIQUEMENT le bouton de LA carte concernée.
  const proposeFeature = useMutation({
    mutationFn: (id: string) => requestListFeature(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: myListsKey });
      invalidateDetail(id);
    },
    onError: onActionError('Proposition à la une impossible.'),
  });
  const toggleFeatured = useMutation({
    mutationFn: (vars: { id: string; featured: boolean }) => setListFeatured(vars.id, vars.featured),
    onSuccess: (_data, vars) => {
      invalidateAll();
      invalidateDetail(vars.id);
    },
    onError: onActionError('Mise à la une impossible.'),
  });
  const reviewProposal = useMutation({
    mutationFn: (vars: { id: string; accept: boolean }) => reviewListFeature(vars.id, vars.accept),
    onSuccess: (_data, vars) => {
      invalidateAll();
      invalidateDetail(vars.id);
    },
    onError: onActionError('Traitement de la proposition impossible.'),
  });
  const restore = useMutation({
    mutationFn: (id: string) => restoreList(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: myListsKey });
      invalidateDetail(id);
    },
    onError: onActionError('Restauration impossible.'),
  });
  const duplicate = useMutation({
    mutationFn: (id: string) => duplicateList(id),
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: myListsKey });
      router.push(`/listes/${id}`);
    },
    onError: onActionError('Duplication impossible.'),
  });

  const q = query.trim().toLowerCase();
  const matchesQuery = (l: ObjectListCard) =>
    !q || `${l.name} ${l.recipientLabel ?? ''} ${l.creatorName ?? ''}`.toLowerCase().includes(q);

  // « Mes listes » actives : exclut les archivées ET celles déjà montrées dans la section « À la
  // une » ci-dessus (dédup demandée par le contrat — la carte de l'auteur ne doit pas apparaître
  // deux fois sur l'écran).
  const activeMine = myLists.filter((l) => !l.isArchived && !featuredIds.has(l.id));
  const archivedMine = myLists.filter((l) => l.isArchived);
  const counts = useMemo(
    () => ({
      all: activeMine.length,
      draft: activeMine.filter((l) => l.status === 'draft').length,
      sent: activeMine.filter((l) => l.status === 'sent').length,
      shared: activeMine.filter((l) => l.status === 'shared').length,
    }),
    [activeMine],
  );
  const shownMine = (statusTab === 'all' ? activeMine : activeMine.filter((l) => l.status === statusTab)).filter(matchesQuery);
  const shownArchived = archivedMine.filter(matchesQuery);
  const shownProposals = proposals.filter(matchesQuery);
  const shownFeatured = featuredLists.filter(matchesQuery);

  const statusTabs: Array<{ k: StatusTab; label: string }> = [
    { k: 'all', label: 'Toutes' },
    { k: 'draft', label: 'Brouillons' },
    { k: 'sent', label: 'Envoyées' },
    { k: 'shared', label: 'Liens actifs' },
  ];

  function featureActions(list: ObjectListCard): ReactNode {
    const nodes: ReactNode[] = [];
    // Priorité stricte : ne JAMAIS proposer `setListFeatured(true)` sur la liste d'un collègue —
    // la base le refuse (même garde que ListComposeView, revue architecte). Ici les grilles ne
    // montrent que des listes propres (Mes listes/Archives) ou déjà à la une (À la une), donc le
    // cas ne se produit pas en pratique, mais la garde reste correcte si une carte listait un jour
    // une proposition tierce.
    const isOwnList = list.createdBy === userId;
    if (list.canManageFeature && (list.isFeatured || isOwnList)) {
      nodes.push(
        <button
          key="manage-feature"
          type="button"
          disabled={toggleFeatured.isPending && toggleFeatured.variables?.id === list.id}
          onClick={() => toggleFeatured.mutate({ id: list.id, featured: !list.isFeatured })}
          className={list.isFeatured ? actionButton : primaryActionButton}
        >
          <Star className="h-3.5 w-3.5" /> {list.isFeatured ? 'Retirer de la une' : 'Mettre à la une'}
        </button>,
      );
    } else if (list.canProposeFeature && !list.isFeatured) {
      if (list.featureRequestedAt) {
        nodes.push(
          <span key="pending" className="inline-flex items-center gap-1.5 rounded-lg bg-ink/5 px-2.5 py-1.5 text-[12px] font-semibold text-ink/50">
            <Star className="h-3.5 w-3.5" /> Proposition envoyée
          </span>,
        );
      } else {
        nodes.push(
          <button
            key="propose"
            type="button"
            disabled={proposeFeature.isPending && proposeFeature.variables === list.id}
            onClick={() => proposeFeature.mutate(list.id)}
            className={actionButton}
          >
            <Star className="h-3.5 w-3.5" /> Proposer à la une
          </button>,
        );
      }
    }
    return nodes.length > 0 ? <>{nodes}</> : null;
  }

  function duplicateAction(list: ObjectListCard): ReactNode {
    return (
      <button
        key="duplicate"
        type="button"
        disabled={duplicate.isPending && duplicate.variables === list.id}
        onClick={() => duplicate.mutate(list.id)}
        className={actionButton}
      >
        {duplicate.isPending && duplicate.variables === list.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Dupliquer
      </button>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] font-extrabold text-ink">
            <ListChecks className="h-5 w-5 text-orange" /> Listes
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
              className="w-full border-0 bg-transparent p-0 text-[12.5px] outline-none"
            />
          </div>
          {canCreate && (
            <button
              type="button"
              disabled={createBlank.isPending}
              onClick={() => createBlank.mutate()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange px-3 py-2 text-[12.5px] font-bold text-white transition hover:bg-orange/90 disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" /> Nouvelle liste
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {errorMessage && (
          <div role="alert" className="mx-auto mb-5 flex max-w-6xl items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage(null)} className="shrink-0 font-semibold hover:underline">
              Fermer
            </button>
          </div>
        )}

        {/* À la une de l'organisation — au-dessus de « Mes listes », visible à tous les membres. */}
        <section className="mx-auto mb-8 max-w-6xl">
          <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-extrabold uppercase tracking-wide text-ink/60">
            <Star className="h-4 w-4 text-amber-500" /> À la une de mon organisation
          </h2>
          {featuredQuery.isLoading ? (
            <div className="flex items-center gap-2 text-ink/50">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : featuredQuery.isError && featuredLists.length === 0 ? (
            <ErrorRetry
              message="Impossible de charger les listes à la une de l'organisation."
              onRetry={() => void featuredQuery.refetch()}
            />
          ) : shownFeatured.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-[12.5px] text-ink/50">
              {q ? 'Aucune liste à la une ne correspond à la recherche.' : 'Aucune liste à la une pour le moment.'}
            </p>
          ) : (
            <>
              {featuredQuery.isError && <StaleWarning onRetry={() => void featuredQuery.refetch()} />}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-5">
                {shownFeatured.map((l) => (
                  <ListCard key={l.id} list={l} actions={<>{featureActions(l)}{duplicateAction(l)}</>} />
                ))}
              </div>
            </>
          )}
        </section>

        {/* Onglets volontaires : Mes listes (défaut) / Archives / Propositions (admin uniquement). */}
        <div className="mx-auto mb-5 flex max-w-6xl flex-wrap items-center gap-1 rounded-full bg-ink/5 p-1">
          <button
            type="button"
            onClick={() => setSectionTab('mine')}
            className={cn('rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition', sectionTab === 'mine' ? 'bg-white text-orange shadow-sm' : 'text-ink/60 hover:text-ink')}
          >
            Mes listes <span className="text-[11px] tabular-nums text-ink/40">{activeMine.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setSectionTab('archives')}
            className={cn('rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition', sectionTab === 'archives' ? 'bg-white text-orange shadow-sm' : 'text-ink/60 hover:text-ink')}
          >
            Archives <span className="text-[11px] tabular-nums text-ink/40">{archivedMine.length}</span>
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setSectionTab('proposals')}
              className={cn('rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition', sectionTab === 'proposals' ? 'bg-white text-orange shadow-sm' : 'text-ink/60 hover:text-ink')}
            >
              Propositions <span className="text-[11px] tabular-nums text-ink/40">{proposals.length}</span>
            </button>
          )}
        </div>

        {sectionTab === 'mine' && (
          <div className="mx-auto mb-4 flex max-w-6xl flex-wrap gap-1 rounded-full bg-ink/5 p-1">
            {statusTabs.map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => setStatusTab(t.k)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition',
                  statusTab === t.k ? 'bg-white text-orange shadow-sm' : 'text-ink/60 hover:text-ink',
                )}
              >
                {t.label}
                <span className="text-[11px] tabular-nums text-ink/40">{counts[t.k]}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mx-auto max-w-6xl">
          {sectionTab === 'mine' &&
            (myListsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-ink/50">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement des listes…
              </div>
            ) : myListsQuery.isError && myLists.length === 0 ? (
              <ErrorRetry message="Impossible de charger vos listes." onRetry={() => void myListsQuery.refetch()} />
            ) : shownMine.length === 0 ? (
              <div className="mx-auto max-w-md rounded-2xl border-2 border-dashed p-10 text-center">
                <ListChecks className="mx-auto h-10 w-10 text-ink/30" />
                <p className="mt-3 font-bold text-ink">
                  {/* Une liste existe déjà (autre statut) : ne jamais dire « aucune liste » ni
                      inviter à en créer une — l'action correctrice est de changer de filtre. */}
                  {activeMine.length > 0 ? 'Aucune liste avec ce statut' : q ? 'Aucune liste ne correspond' : "Aucune liste pour l'instant"}
                </p>
                <p className="mt-1 text-[13px] text-ink/60">
                  {activeMine.length > 0
                    ? (q ? 'Essayez un autre nom de liste ou de destinataire.' : 'Choisissez un autre statut, ou « Toutes » pour voir vos autres listes.')
                    : q
                      ? 'Essayez un autre nom de liste ou de destinataire.'
                      : 'Partez d’une sélection dans l’explorateur (bouton « Créer une liste »), ou créez une liste vierge.'}
                </p>
                {activeMine.length > 0 && statusTab !== 'all' && (
                  <button type="button" onClick={() => setStatusTab('all')} className="mt-3 text-[12.5px] font-semibold text-orange hover:underline">
                    Voir toutes mes listes
                  </button>
                )}
              </div>
            ) : (
              <>
                {myListsQuery.isError && <StaleWarning onRetry={() => void myListsQuery.refetch()} />}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-5">
                  {shownMine.map((l) => (
                    <ListCard key={l.id} list={l} actions={<>{featureActions(l)}{duplicateAction(l)}</>} />
                  ))}
                  {canCreate && (
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
                  )}
                </div>
              </>
            ))}

          {sectionTab === 'archives' &&
            (myListsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-ink/50">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement des archives…
              </div>
            ) : myListsQuery.isError && myLists.length === 0 ? (
              <ErrorRetry message="Impossible de charger vos archives." onRetry={() => void myListsQuery.refetch()} />
            ) : shownArchived.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-ink/50">
                {q
                  ? 'Aucune liste archivée ne correspond à la recherche.'
                  : 'Aucune liste archivée — une liste rejoint les archives après 21 jours sans modification ni envoi.'}
              </p>
            ) : (
              <>
                {myListsQuery.isError && <StaleWarning onRetry={() => void myListsQuery.refetch()} />}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-5">
                {shownArchived.map((l) => (
                  <ListCard
                    key={l.id}
                    list={l}
                    actions={
                      <>
                        {l.canRestore && (
                          <button
                            type="button"
                            disabled={restore.isPending && restore.variables === l.id}
                            onClick={() => restore.mutate(l.id)}
                            className={primaryActionButton}
                          >
                            Restaurer
                          </button>
                        )}
                        {duplicateAction(l)}
                      </>
                    }
                  />
                ))}
                </div>
              </>
            ))}

          {sectionTab === 'proposals' &&
            isAdmin &&
            (proposalsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-ink/50">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement des propositions…
              </div>
            ) : proposalsQuery.isError && proposals.length === 0 ? (
              <ErrorRetry
                message="Impossible de charger les propositions en attente."
                onRetry={() => void proposalsQuery.refetch()}
              />
            ) : shownProposals.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-ink/50">
                {q ? 'Aucune proposition ne correspond à la recherche.' : 'Aucune proposition en attente.'}
              </p>
            ) : (
              <>
                {proposalsQuery.isError && <StaleWarning onRetry={() => void proposalsQuery.refetch()} />}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-5">
                {shownProposals.map((l) => (
                  <ListCard
                    key={l.id}
                    list={l}
                    showCreator
                    actions={
                      <>
                        <button
                          type="button"
                          disabled={reviewProposal.isPending && reviewProposal.variables?.id === l.id}
                          onClick={() => reviewProposal.mutate({ id: l.id, accept: true })}
                          className={primaryActionButton}
                        >
                          Accepter
                        </button>
                        <button
                          type="button"
                          disabled={reviewProposal.isPending && reviewProposal.variables?.id === l.id}
                          onClick={() => reviewProposal.mutate({ id: l.id, accept: false })}
                          className={actionButton}
                        >
                          Refuser
                        </button>
                      </>
                    }
                  />
                ))}
                </div>
              </>
            ))}
        </div>
      </div>
    </div>
  );
}
