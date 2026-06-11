import type { DashboardFilters } from '@/types/dashboard';
import type { BackendObjectTypeCode, ExplorerBucketKey, ExplorerStatusFilter } from '@/types/domain';
import {
  DEFAULT_EXPLORER_FILTERS,
  EXPLORER_BUCKET_TYPE_MAP,
  HOT_BUCKET_TYPES,
  normalizeExplorerFilters,
} from '@/utils/facets';
import { buildSearchParams } from '@/lib/explorer-search-params';

export interface ExplorerBridgeResult {
  url: string;
  /** Filtres dashboard actifs SANS équivalent Explorer — affichés à l'utilisateur. */
  dropped: string[];
}

/**
 * Pont sens unique dashboard → Explorer : sérialise les filtres dashboard dans
 * le vocabulaire URL de l'Explorer (lu au mount par useExplorerUrlSync).
 *
 * Tout champ actif sans équivalent Explorer est listé dans `dropped`, jamais
 * silencieusement perdu — le composant appelant peut les afficher à l'utilisateur
 * (tooltip, notice, etc.).
 *
 * Correspondances :
 *   types[]            → selectedBuckets (familles Explorer) + hot.subtypes (sous-familles HOT)
 *   status[]           → common.statuses  (published|draft uniquement — archived/hidden → dropped)
 *   cities[]           → common.cities
 *   lieuDits[0]        → common.lieuDit   (mono-valué côté Explorer — [1..] → dropped)
 *   pmr                → common.pmr
 *   petsAccepted       → common.petsAccepted
 *   labelsAny[]        → DROP ('tags') — labelsAny Explorer est frontend-only sur labels
 *                         d'affichage ; les slugs ref_tag (tags_any serveur) n'ont pas de cible
 *   taxonomyAny[taxonomy_hot] → hot.taxonomy
 *   taxonomyAny[autre] → dropped ('catégories hors hébergement')
 *   updatedAtFrom/To   → dropped ('période de mise à jour')
 *   classificationsAny → dropped ('distinctions')
 *   languagesAny       → dropped ('langues')
 *   amenityFamiliesAny → dropped ("familles d'équipements")
 */
export function mapDashboardFiltersToExplorerUrl(filters: DashboardFilters): ExplorerBridgeResult {
  const dropped: string[] = [];
  const types = filters.types ?? [];

  // ── Types → buckets Explorer + sous-types HOT ────────────────────────────
  // Un bucket est inclus si au moins un des types du dashboard appartient à sa famille.
  const buckets = (
    Object.entries(EXPLORER_BUCKET_TYPE_MAP) as [ExplorerBucketKey, BackendObjectTypeCode[]][]
  )
    .filter(([, members]) => members.some((m) => types.includes(m)))
    .map(([bucket]) => bucket);

  // Les sous-types HOT sont les types dashboard qui font partie de la famille HOT.
  const hotSubtypes = types.filter((t) => HOT_BUCKET_TYPES.includes(t));

  // Buckets multi-types sans narrowing côté Explorer (HOT a hotSubtypes) : si la
  // sélection ne couvre pas toute la famille du bucket, l'Explorer affichera plus
  // large que le filtre dashboard — on le signale, jamais d'élargissement silencieux.
  const widenedTypes = types.filter((t) => {
    if (HOT_BUCKET_TYPES.includes(t)) return false;
    const bucket = buckets.find((b) => EXPLORER_BUCKET_TYPE_MAP[b].includes(t));
    if (!bucket) return false;
    const family = EXPLORER_BUCKET_TYPE_MAP[bucket];
    return family.length > 1 && !family.every((m) => types.includes(m));
  });
  if (widenedTypes.length > 0) {
    dropped.push(`précision de type (l'Explorer élargira : ${widenedTypes.join(', ')})`);
  }

  // ── Statuts ───────────────────────────────────────────────────────────────
  // L'Explorer ne connaît que published/draft ; archived/hidden sont unsupported.
  const statuses = (filters.status ?? []).filter(
    (s): s is ExplorerStatusFilter => s === 'published' || s === 'draft',
  );
  if ((filters.status ?? []).some((s) => s === 'archived' || s === 'hidden')) {
    dropped.push('statut archivé/masqué');
  }

  // ── Lieu-dit ──────────────────────────────────────────────────────────────
  // L'Explorer est mono-valué sur lieuDit : on prend le premier, on signale le reste.
  const [firstLieuDit, ...restLieuDits] = filters.lieuDits ?? [];
  if (restLieuDits.length > 0) {
    dropped.push('lieux-dits supplémentaires');
  }

  // ── Taxonomie ─────────────────────────────────────────────────────────────
  // Seul le domaine taxonomy_hot est exprimable dans l'Explorer (hot.taxonomy).
  const hotTaxonomy = (filters.taxonomyAny ?? []).filter((t) => t.domain === 'taxonomy_hot');
  if ((filters.taxonomyAny ?? []).some((t) => t.domain !== 'taxonomy_hot')) {
    dropped.push('catégories hors hébergement');
  }

  // ── Champs sans équivalent Explorer ──────────────────────────────────────
  if (filters.updatedAtFrom || filters.updatedAtTo) {
    dropped.push('période de mise à jour');
  }
  if (filters.classificationsAny?.length) {
    dropped.push('distinctions');
  }
  if (filters.languagesAny?.length) {
    dropped.push('langues');
  }
  if (filters.amenityFamiliesAny?.length) {
    dropped.push("familles d'équipements");
  }
  // Tags dashboard = slugs ref_tag (serveur tags_any) ; le labelsAny de l'Explorer est un
  // filtre frontend-only sur les labels d'AFFICHAGE — aucune cible fidèle ⇒ drop signalé.
  if (filters.labelsAny?.length) {
    dropped.push('tags');
  }

  // ── Construction des filtres Explorer ────────────────────────────────────
  const explorerFilters = normalizeExplorerFilters({
    ...DEFAULT_EXPLORER_FILTERS,
    selectedBuckets: buckets,
    common: {
      ...DEFAULT_EXPLORER_FILTERS.common,
      cities: filters.cities ?? [],
      lieuDit: firstLieuDit ?? '',
      pmr: !!filters.pmr,
      petsAccepted: !!filters.petsAccepted,
      statuses,
    },
    hot: {
      ...DEFAULT_EXPLORER_FILTERS.hot,
      // subtypes explicites : si des types HOT sont sélectionnés → sous-ensemble ;
      // si aucun type n'est sélectionné du tout → [] (URL propre, pas de paramètre) ;
      // si des buckets non-HOT sont sélectionnés sans HOT → [] (idem).
      // On évite que normalizeExplorerFilters ne réinjecte DEFAULT_HOT_SUBTYPES.
      subtypes: hotSubtypes,
      taxonomy: hotTaxonomy,
    },
  });

  const params = buildSearchParams(explorerFilters);
  const qs = params.toString();
  return { url: qs ? `/explorer?${qs}` : '/explorer', dropped };
}
