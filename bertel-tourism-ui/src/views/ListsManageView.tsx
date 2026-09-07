"use client";

// Module Listes — écran « Mes listes » (grilles). Une liste = une sélection ou un jeu de
// filtres prêt à imprimer / envoyer / partager. Structure (cadrage 2026-09-07) : la une de
// l'organisation au-dessus, « Mes listes » par défaut, Archives et Propositions (admin) en
// onglets volontaires — jamais une grille générale des listes des collègues.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  Clock3,
  ListChecks,
  Loader2,
  MapPin,
  Plus,
  RotateCw,
  Search,
  SlidersHorizontal,
  Star,
  Users,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { CoverImage } from "@/features/lists/CoverImage";
import { ICON_BY_TYPE } from "@/features/lists/OtiTemplate";
import {
  HUE_BY_TYPE,
  LABEL_BY_TYPE,
  OTI_ACCENTS,
} from "@/features/lists/type-meta";
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
} from "@/services/lists";
import { useSessionStore } from "@/store/session-store";
import { canCreateLists, isListsAdmin } from "@/store/session-selectors";
import { notificationKeys } from "@/services/notifications";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<ListStatus, string> = {
  draft: "Brouillon",
  sent: "Envoyée",
  shared: "Lien actif",
};
const STATUS_DOT: Record<ListStatus, string> = {
  draft: "bg-ink/40",
  sent: "bg-orange",
  shared: "bg-emerald-500",
};

type StatusFilter = "all" | "draft" | "sent";
type FeaturedFilter = "all" | "featured" | "pending";
type SectionTab = "mine" | "featured" | "archives";

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
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

function TypeChip({ code, n }: { code: string; n: number }) {
  const hue = OTI_ACCENTS[HUE_BY_TYPE[code] ?? "teal"];
  const Icon = ICON_BY_TYPE[code] ?? MapPin;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-bold"
      style={{ backgroundColor: hue.soft, color: hue.deep }}
    >
      <Icon className="h-3 w-3" />
      {LABEL_BY_TYPE[code]?.fr ?? code}
      {n > 1 ? ` ·${n}` : ""}
    </span>
  );
}

/**
 * Carte de liste. Le lien de navigation ne couvre QUE l'aperçu (image + titre + chips) : les
 * actions (proposer, dupliquer, restaurer…) sont des boutons SIBLINGS, jamais imbriqués dans le
 * `<Link>` — un bouton dans une ancre casse le clic et l'accessibilité.
 */
function ListCard({
  list,
  actions,
  showCreator,
  reviewAction,
}: {
  list: ObjectListCard;
  actions?: ReactNode;
  showCreator?: boolean;
  reviewAction?: ReactNode;
}) {
  const updated = timeAgo(list.updatedAt);
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/listes/${list.id}`} className="flex flex-1 flex-col">
        <div className="relative h-32 overflow-hidden">
          <CoverImage
            src={list.coverUrl}
            className="absolute inset-0 h-full w-full"
          />
          <span
            className="absolute inset-x-0 top-0 h-1"
            style={{
              background: (OTI_ACCENTS[list.accent] ?? OTI_ACCENTS.teal).ink,
            }}
          />
          {!reviewAction && (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-ink shadow-sm">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  STATUS_DOT[list.status],
                )}
              />
              {STATUS_LABEL[list.status]}
            </span>
          )}
          <span className="absolute bottom-2 left-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-white drop-shadow">
            <MapPin className="h-3.5 w-3.5" /> {list.itemCount}{" "}
            {list.itemCount > 1 ? "lieux" : "lieu"}
          </span>
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-ink/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {list.kind === "dynamic" ? "Dynamique" : "Statique"}
            {list.isFeatured && (
              <span className="inline-flex items-center gap-0.5 normal-case tracking-normal text-amber-300">
                <Star className="h-2.5 w-2.5 fill-current" /> à la une
              </span>
            )}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <h3 className="text-[16px] font-bold leading-tight text-ink">
            {list.name}
          </h3>
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
          {reviewAction && (
            <span className="mt-2 inline-flex w-fit items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
              À valider
            </span>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {list.typeBreakdown.slice(0, 4).map((t) => (
              <TypeChip key={t.code} code={t.code} n={t.n} />
            ))}
          </div>
          <div className="mt-auto flex items-center justify-between border-t pt-3 text-[12px] text-ink/50">
            <span className="flex items-center gap-2">
              <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                {list.lang}
              </span>
              {updated && (
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3 w-3" /> {updated}
                </span>
              )}
            </span>
            <span className="font-semibold text-orange group-hover:underline">
              Ouvrir →
            </span>
          </div>
        </div>
      </Link>
      {reviewAction && (
        <div className="absolute right-3 top-3 z-10">{reviewAction}</div>
      )}
      {actions && (
        <div className="flex flex-wrap items-center gap-2 border-t p-3">
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * Échec de chargement d'une grille : jamais confondu avec « aucune liste ». Un opérateur qui
 * voit « Aucune liste à la une » alors que la requête a simplement échoué croirait à tort que son
 * organisation n'a rien mis en avant — la relance est l'action correctrice immédiate.
 */
function ErrorRetry({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
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
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Actualisation
        impossible — ces données peuvent être obsolètes.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 font-semibold underline hover:no-underline"
      >
        Réessayer
      </button>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-ink/50">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

function CardsOrEmpty({
  cards,
  query,
  empty,
  stale,
  onRetry,
  renderCard,
}: {
  cards: ObjectListCard[];
  query: string;
  empty: string;
  stale: boolean;
  onRetry: () => void;
  renderCard: (list: ObjectListCard) => ReactNode;
}) {
  if (cards.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-ink/50">
        {query ? "Aucune liste ne correspond à la recherche." : empty}
      </p>
    );
  }
  return (
    <>
      {stale && <StaleWarning onRetry={onRetry} />}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-5">
        {cards.map(renderCard)}
      </div>
    </>
  );
}

const actionButton =
  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold text-ink/80 transition hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-50";
const primaryActionButton =
  "inline-flex items-center gap-1.5 rounded-lg bg-orange px-2.5 py-1.5 text-[12px] font-bold text-white transition hover:bg-orange/90 disabled:cursor-not-allowed disabled:opacity-60";

export default function ListsManageView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const orgId = useSessionStore((s) => s.orgId);
  const userId = useSessionStore((s) => s.userId);
  const [sectionTab, setSectionTab] = useState<SectionTab>("mine");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [featuredFilter, setFeaturedFilter] = useState<FeaturedFilter>("all");
  const [sharedOnly, setSharedOnly] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const filtersRef = useRef<HTMLDetailsElement>(null);

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
  const myListsQuery = useQuery({
    queryKey: myListsKey,
    queryFn: listMyLists,
    staleTime: 30_000,
  });
  const featuredQuery = useQuery({
    queryKey: featuredListsKey,
    queryFn: listFeaturedLists,
    staleTime: 30_000,
  });
  const proposalsQuery = useQuery({
    queryKey: listProposalsKey,
    queryFn: listListProposals,
    staleTime: 30_000,
    enabled: isAdmin,
  });

  const sectionParam = searchParams.get("section");
  const stateParam = searchParams.get("state");
  const reviewParam = searchParams.get("review");

  const replaceDeepLink = (section: SectionTab, state?: string) => {
    if (!sectionParam && !stateParam && !reviewParam) return;
    const params = new URLSearchParams();
    if (section !== "mine") params.set("section", section);
    if (state) params.set("state", state);
    const suffix = params.toString();
    router.replace(suffix ? `/listes?${suffix}` : "/listes");
  };

  // Les liens des notifications sont réhydratés à chaque navigation. Un `review` seul n'est
  // jamais suffisant : l'action reste réservée à un administrateur et à l'onglet À la une.
  useEffect(() => {
    const nextSection: SectionTab =
      sectionParam === "featured" || sectionParam === "archives"
        ? sectionParam
        : "mine";
    setSectionTab(nextSection);
    setFeaturedFilter(
      nextSection === "featured" && stateParam === "pending" && isAdmin
        ? "pending"
        : stateParam === "featured"
          ? "featured"
          : "all",
    );
    setStatusFilter(
      nextSection === "mine" &&
        (stateParam === "draft" || stateParam === "sent")
        ? stateParam
        : "all",
    );
    setReviewId(
      nextSection === "featured" && isAdmin && reviewParam ? reviewParam : null,
    );
  }, [isAdmin, reviewParam, sectionParam, stateParam]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && filtersRef.current?.open)
        filtersRef.current.open = false;
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        filtersRef.current &&
        !filtersRef.current.contains(event.target as Node)
      )
        filtersRef.current.open = false;
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, []);

  const myLists = myListsQuery.data ?? [];
  // Une liste personnelle NE DOIT JAMAIS disparaître de « Mes listes » parce que la requête « à la
  // une » a échoué : le dédup ne s'applique qu'aux id RÉELLEMENT confirmés à la une (données de
  // succès), jamais à un ensemble vide-par-échec qu'on confondrait avec « rien n'est à la une ».
  const featuredLists = featuredQuery.data ?? [];
  const proposals = proposalsQuery.data ?? [];
  // L'onglet « À la une » est l'unique espace collectif : les propositions en attente y sont
  // ajoutées pour les admins, sans jamais dupliquer une liste déjà publiée.
  const featuredAndPending = useMemo(() => {
    const byId = new Map(featuredLists.map((list) => [list.id, list]));
    if (isAdmin) {
      for (const proposal of proposals) {
        if (!byId.has(proposal.id)) byId.set(proposal.id, proposal);
      }
    }
    return [...byId.values()];
  }, [featuredLists, isAdmin, proposals]);

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: myListsKey });
    void queryClient.invalidateQueries({ queryKey: featuredListsKey });
    void queryClient.invalidateQueries({ queryKey: listProposalsKey });
  };
  // Une action sur une carte doit aussi invalider le DÉTAIL de CETTE liste (même identité) —
  // sinon ouvrir la fiche juste après montre encore l'état d'avant l'action (revue architecte).
  const invalidateDetail = (id: string) =>
    void queryClient.invalidateQueries({
      queryKey: listsQueryKeys.detail(id, userId, orgId),
    });
  const onActionError = (fallback: string) => (e: unknown) =>
    setErrorMessage(e instanceof Error ? e.message : fallback);

  const createBlank = useMutation({
    mutationFn: () => createListFromSelection("Nouvelle liste", []),
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: myListsKey });
      router.push(`/listes/${id}`);
    },
    onError: onActionError("Création de la liste impossible."),
  });
  // Une seule instance de mutation par action, partagée par toutes les cartes : `variables`
  // porte l'id en cours, ce qui permet de désactiver UNIQUEMENT le bouton de LA carte concernée.
  const proposeFeature = useMutation({
    mutationFn: (id: string) => requestListFeature(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: myListsKey });
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.inbox(userId),
      });
      invalidateDetail(id);
    },
    onError: onActionError("Proposition à la une impossible."),
  });
  const toggleFeatured = useMutation({
    mutationFn: (vars: { id: string; featured: boolean }) =>
      setListFeatured(vars.id, vars.featured),
    onSuccess: (_data, vars) => {
      invalidateAll();
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.inbox(userId),
      });
      invalidateDetail(vars.id);
    },
    onError: onActionError("Mise à la une impossible."),
  });
  const reviewProposal = useMutation({
    mutationFn: (vars: { id: string; accept: boolean }) =>
      reviewListFeature(vars.id, vars.accept),
    onSuccess: (_data, vars) => {
      invalidateAll();
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.inbox(userId),
      });
      invalidateDetail(vars.id);
      setFeaturedFilter("all");
      setReviewId(null);
      replaceDeepLink("featured", "featured");
    },
    onError: onActionError("Traitement de la proposition impossible."),
  });
  const restore = useMutation({
    mutationFn: (id: string) => restoreList(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: myListsKey });
      invalidateDetail(id);
    },
    onError: onActionError("Restauration impossible."),
  });
  const duplicate = useMutation({
    mutationFn: (id: string) => duplicateList(id),
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: myListsKey });
      router.push(`/listes/${id}`);
    },
    onError: onActionError("Duplication impossible."),
  });

  const q = query.trim().toLowerCase();
  const matchesQuery = (l: ObjectListCard) =>
    !q ||
    `${l.name} ${l.recipientLabel ?? ""} ${l.creatorName ?? ""}`
      .toLowerCase()
      .includes(q);

  // Une liste personnelle reste dans « Mes listes », y compris si elle est aussi à la une : les
  // deux onglets sont désormais des vues distinctes, plus deux grilles de la même page.
  const activeMine = myLists.filter((l) => !l.isArchived);
  const archivedMine = myLists.filter((l) => l.isArchived);
  const hasActiveShareLink = (
    list: ObjectListCard & { hasActiveShareLink?: boolean },
  ) => list.hasActiveShareLink ?? list.status === "shared";
  const matchesShared = (list: ObjectListCard) =>
    !sharedOnly || hasActiveShareLink(list);
  const shownMine = (
    statusFilter === "all"
      ? activeMine
      : activeMine.filter((l) => l.status === statusFilter)
  )
    .filter(matchesQuery)
    .filter(matchesShared);
  const shownArchived = archivedMine.filter(matchesQuery);
  const isPendingProposal = (list: ObjectListCard) =>
    !list.isFeatured && proposals.some((proposal) => proposal.id === list.id);
  const shownFeatured = featuredAndPending
    .filter(
      (list) =>
        featuredFilter === "all" ||
        (featuredFilter === "pending"
          ? isPendingProposal(list)
          : list.isFeatured),
    )
    .filter(matchesQuery)
    .filter(matchesShared);
  const reviewedProposal = reviewId
    ? (proposals.find((proposal) => proposal.id === reviewId) ?? null)
    : null;
  const canReviewProposals =
    isAdmin && !proposalsQuery.isLoading && !proposalsQuery.isError;
  const showReviewPanel =
    sectionTab === "featured" && canReviewProposals && reviewId !== null;
  const activeFilterCount =
    Number(
      (sectionTab === "featured" ? featuredFilter : statusFilter) !== "all",
    ) + Number(sharedOnly);

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
          disabled={
            toggleFeatured.isPending && toggleFeatured.variables?.id === list.id
          }
          onClick={() =>
            toggleFeatured.mutate({ id: list.id, featured: !list.isFeatured })
          }
          className={list.isFeatured ? actionButton : primaryActionButton}
        >
          <Star className="h-3.5 w-3.5" />{" "}
          {list.isFeatured ? "Retirer de la une" : "Mettre à la une"}
        </button>,
      );
    } else if (list.canProposeFeature && !list.isFeatured) {
      if (list.featureRequestedAt) {
        nodes.push(
          <span
            key="pending"
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink/5 px-2.5 py-1.5 text-[12px] font-semibold text-ink/50"
          >
            <Star className="h-3.5 w-3.5" /> Proposition envoyée
          </span>,
        );
      } else {
        nodes.push(
          <button
            key="propose"
            type="button"
            disabled={
              proposeFeature.isPending && proposeFeature.variables === list.id
            }
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
        {duplicate.isPending && duplicate.variables === list.id ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : null}
        Dupliquer
      </button>
    );
  }

  const switchSection = (section: SectionTab) => {
    if (filtersRef.current) filtersRef.current.open = false;
    replaceDeepLink(section);
    setSectionTab(section);
    setReviewId(null);
    setSharedOnly(false);
    if (section === "mine") setStatusFilter("all");
    if (section === "featured") setFeaturedFilter("all");
  };
  const selectedState =
    sectionTab === "featured" ? featuredFilter : statusFilter;
  const stateOptions =
    sectionTab === "featured"
      ? ([
          ["all", "Tous les états"],
          ["featured", "À la une"],
          ...(isAdmin ? [["pending", "À valider"]] : []),
        ] as Array<[FeaturedFilter, string]>)
      : ([
          ["all", "Tous les états"],
          ["draft", "Brouillons"],
          ["sent", "Envoyées"],
        ] as Array<[StatusFilter, string]>);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="relative z-20 border-b bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:flex sm:flex-wrap sm:gap-x-5 sm:gap-y-3">
          <h1 className="col-start-1 row-start-1 flex items-center gap-2 text-[18px] font-extrabold text-ink">
            <ListChecks className="h-5 w-5 text-orange" /> Listes
          </h1>
          <div
            className="col-span-2 row-start-2 flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-start"
            role="tablist"
            aria-label="Espaces de listes"
          >
            {(
              [
                ["mine", "Mes listes", ListChecks, activeMine.length],
                ["featured", "À la une", Star, featuredLists.length],
                ["archives", "Archives", Archive, archivedMine.length],
              ] as const
            ).map(([section, label, Icon, count]) => (
              <button
                key={section}
                type="button"
                role="tab"
                aria-selected={sectionTab === section}
                onClick={() => switchSection(section)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 border-b-2 px-1.5 py-2 text-[12px] font-bold transition sm:gap-1.5 sm:px-2 sm:text-[12.5px]",
                  sectionTab === section
                    ? "border-orange text-ink"
                    : "border-transparent text-ink/55 hover:text-ink",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}{" "}
                <span className="text-[11px] tabular-nums text-ink/45">
                  {count}
                </span>
              </button>
            ))}
          </div>
          <div className="col-span-2 row-start-3 flex w-full items-center gap-2 sm:ml-auto sm:w-auto sm:flex-1 sm:justify-end">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border bg-white px-3 focus-within:border-orange sm:max-w-52 sm:flex-none">
              <Search className="h-3.5 w-3.5 shrink-0 text-ink/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher…"
                aria-label="Rechercher une liste"
                className="w-full border-0 bg-transparent p-0 text-[12.5px] outline-none"
              />
            </label>
            {sectionTab !== "archives" && (
              <details ref={filtersRef} className="relative">
                <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold text-ink/75 hover:bg-ink/5">
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Filtres
                  {activeFilterCount > 0 && (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-orange px-1 text-[10px] text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border bg-white p-3 shadow-lg">
                  <label className="block text-[12px] font-bold text-ink/70">
                    État
                    <select
                      value={selectedState}
                      onChange={(e) =>
                        sectionTab === "featured"
                          ? setFeaturedFilter(e.target.value as FeaturedFilter)
                          : setStatusFilter(e.target.value as StatusFilter)
                      }
                      className="mt-1.5 w-full rounded-lg border bg-white px-2 py-1 text-[12.5px] leading-normal"
                    >
                      {stateOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-3 flex items-center gap-2 text-[12.5px] text-ink/75">
                    <input
                      type="checkbox"
                      checked={sharedOnly}
                      onChange={(e) => setSharedOnly(e.target.checked)}
                    />{" "}
                    Avec un lien actif
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter("all");
                      setFeaturedFilter("all");
                      setSharedOnly(false);
                    }}
                    className="mt-3 text-[12px] font-semibold text-orange hover:underline"
                  >
                    Réinitialiser
                  </button>
                </div>
              </details>
            )}
          </div>
          {canCreate && (
            <button
              type="button"
              disabled={createBlank.isPending}
              onClick={() => createBlank.mutate()}
              className="col-start-2 row-start-1 inline-flex h-9 items-center gap-1.5 rounded-lg bg-orange px-3 text-[12.5px] font-bold text-white transition hover:bg-orange/90 disabled:opacity-60 sm:order-none"
            >
              <Plus className="h-3.5 w-3.5" /> Nouvelle liste
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <main className="mx-auto max-w-6xl">
          {errorMessage && (
            <div
              role="alert"
              className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700"
            >
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="font-semibold hover:underline"
              >
                Fermer
              </button>
            </div>
          )}
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[14px] font-extrabold text-ink">
              {sectionTab === "mine"
                ? "Mes listes"
                : sectionTab === "featured"
                  ? "À la une"
                  : "Archives"}
            </h2>
            <span className="text-[12px] text-ink/50">
              {sectionTab === "featured"
                ? "Sélections de l’organisation"
                : sectionTab === "archives"
                  ? "Vos listes archivées"
                  : "Votre espace personnel"}
            </span>
          </div>
          {activeFilterCount > 0 && sectionTab !== "archives" && (
            <div className="mb-4 flex flex-wrap gap-2">
              {selectedState !== "all" && (
                <button
                  type="button"
                  onClick={() =>
                    sectionTab === "featured"
                      ? setFeaturedFilter("all")
                      : setStatusFilter("all")
                  }
                  className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-[12px] text-ink/70"
                >
                  {stateOptions.find(([value]) => value === selectedState)?.[1]}{" "}
                  <X className="h-3 w-3" />
                </button>
              )}
              {sharedOnly && (
                <button
                  type="button"
                  onClick={() => setSharedOnly(false)}
                  className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-[12px] text-ink/70"
                >
                  Lien actif <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
          {sectionTab === "featured" && isAdmin && proposalsQuery.isError && (
            <div className="mb-5">
              <ErrorRetry
                message="Impossible de charger les propositions en attente."
                onRetry={() => void proposalsQuery.refetch()}
              />
            </div>
          )}
          {showReviewPanel && (
            <section
              aria-label="Validation d’une proposition"
              className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-ink">
                    {reviewedProposal
                      ? "Proposition à la une"
                      : "Proposition déjà traitée"}
                  </h3>
                  {reviewedProposal ? (
                    <p className="mt-1 text-[13px] text-ink/70">
                      {reviewedProposal.creatorName
                        ? `${reviewedProposal.creatorName} propose `
                        : ""}
                      « {reviewedProposal.name} ».
                    </p>
                  ) : (
                    <p className="mt-1 text-[13px] text-ink/70">
                      Cette proposition n’est plus en attente ou n’est plus
                      accessible.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReviewId(null);
                    replaceDeepLink(
                      "featured",
                      featuredFilter === "all" ? undefined : featuredFilter,
                    );
                  }}
                  className="rounded p-1 text-ink/60 hover:bg-amber-100"
                  aria-label="Fermer la proposition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {reviewedProposal && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/listes/${reviewedProposal.id}`}
                    className="text-[12.5px] font-semibold text-orange hover:underline"
                  >
                    Voir la liste
                  </Link>
                  <button
                    type="button"
                    disabled={reviewProposal.isPending}
                    onClick={() =>
                      reviewProposal.mutate({
                        id: reviewedProposal.id,
                        accept: true,
                      })
                    }
                    className={primaryActionButton}
                  >
                    Mettre à la une
                  </button>
                  <button
                    type="button"
                    disabled={reviewProposal.isPending}
                    onClick={() =>
                      reviewProposal.mutate({
                        id: reviewedProposal.id,
                        accept: false,
                      })
                    }
                    className={actionButton}
                  >
                    Refuser
                  </button>
                </div>
              )}
            </section>
          )}
          {sectionTab === "mine" &&
            (myListsQuery.isLoading ? (
              <Loading label="Chargement des listes…" />
            ) : myListsQuery.isError && myLists.length === 0 ? (
              <ErrorRetry
                message="Impossible de charger vos listes."
                onRetry={() => void myListsQuery.refetch()}
              />
            ) : (
              <CardsOrEmpty
                cards={shownMine}
                query={q}
                empty="Aucune liste pour l’instant."
                stale={myListsQuery.isError}
                onRetry={() => void myListsQuery.refetch()}
                renderCard={(list) => (
                  <ListCard
                    key={list.id}
                    list={list}
                    actions={
                      <>
                        {featureActions(list)}
                        {duplicateAction(list)}
                      </>
                    }
                  />
                )}
              />
            ))}
          {sectionTab === "archives" &&
            (myListsQuery.isLoading ? (
              <Loading label="Chargement des archives…" />
            ) : myListsQuery.isError && myLists.length === 0 ? (
              <ErrorRetry
                message="Impossible de charger vos archives."
                onRetry={() => void myListsQuery.refetch()}
              />
            ) : (
              <CardsOrEmpty
                cards={shownArchived}
                query={q}
                empty="Aucune liste archivée."
                stale={myListsQuery.isError}
                onRetry={() => void myListsQuery.refetch()}
                renderCard={(list) => (
                  <ListCard
                    key={list.id}
                    list={list}
                    actions={
                      <>
                        {list.canRestore && (
                          <button
                            type="button"
                            disabled={
                              restore.isPending && restore.variables === list.id
                            }
                            onClick={() => restore.mutate(list.id)}
                            className={primaryActionButton}
                          >
                            Restaurer
                          </button>
                        )}
                        {duplicateAction(list)}
                      </>
                    }
                  />
                )}
              />
            ))}
          {sectionTab === "featured" &&
            (featuredQuery.isLoading ||
            (isAdmin && proposalsQuery.isLoading) ? (
              <Loading label="Chargement des listes à la une…" />
            ) : featuredQuery.isError && featuredLists.length === 0 ? (
              <ErrorRetry
                message="Impossible de charger les listes à la une de l’organisation."
                onRetry={() => void featuredQuery.refetch()}
              />
            ) : (
              <CardsOrEmpty
                cards={shownFeatured}
                query={q}
                empty={
                  featuredFilter === "pending"
                    ? "Aucune proposition à valider."
                    : "Aucune liste à la une pour le moment."
                }
                stale={featuredQuery.isError}
                onRetry={() => void featuredQuery.refetch()}
                renderCard={(list) => {
                  const pending = isPendingProposal(list);
                  return (
                    <ListCard
                      key={list.id}
                      list={list}
                      showCreator={pending}
                      reviewAction={
                        pending ? (
                          canReviewProposals ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (filtersRef.current)
                                  filtersRef.current.open = false;
                                setReviewId(list.id);
                              }}
                              className="grid min-h-11 min-w-11 place-items-center rounded-full bg-amber-100 text-amber-800 shadow-sm hover:bg-amber-200"
                              aria-label={`Valider la proposition ${list.name}`}
                            >
                              <Clock3 className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <span className="inline-flex min-h-11 items-center gap-1 rounded-full bg-amber-100 px-2 text-[11px] font-bold text-amber-800">
                              <Clock3 className="h-3.5 w-3.5" />À valider
                            </span>
                          )
                        ) : undefined
                      }
                      actions={
                        pending ? undefined : (
                          <>
                            {featureActions(list)}
                            {duplicateAction(list)}
                          </>
                        )
                      }
                    />
                  );
                }}
              />
            ))}
        </main>
      </div>
    </div>
  );
}
