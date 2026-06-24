/**
 * P1.3 — Fork contributeur (décision log §122).
 *
 * Quand l'appelant n'est PAS un écrivain canonique direct (`!canWriteCanonicalDirect`), chaque
 * section modifiée de l'éditeur est routée vers la file de modération (`api.submit_pending_change`,
 * §120) au lieu d'appeler le save-RPC directement. La garde backend
 * `api.user_can_write_object_canonical` reste la vraie sécurité — ce fork est purement ergonomique.
 *
 * Deux régimes (Option B = les 22 sections sont proposables) :
 *
 *  1. AUTO-DISPATCH (5 sections à writer uniforme `(p_object_id, p_payload)`) : on stocke l'enveloppe
 *     EXACTE attendue par le writer whitelisté côté §120 (`metadata.rpc`), pour que l'approbation
 *     puisse la ré-invoquer telle quelle. `manual_apply = false`.
 *        characteristics → save_object_commercial
 *        openings        → save_object_openings
 *        sustainability  → save_object_workspace_sustainability
 *        tags            → save_object_workspace_tags
 *        relationships   → save_object_relations
 *     (NB : la whitelist backend contient aussi `save_object_itinerary_nested` et `save_object_places`,
 *      mais la décision PO range itinéraire + lieux/zones en `manual_apply` car leurs writers ne sont
 *      pas alimentables sans contexte additionnel — cf. registre ci-dessous.)
 *
 *  2. MANUAL_APPLY (toutes les autres sections) : payload informatif (la valeur de module brute),
 *     `metadata.rpc = null` ⇒ `approve_pending_change` REFUSE l'auto-application (anti-escalade :
 *     un payload non-uniforme ne peut pas être ré-injecté en aveugle). Un modérateur applique
 *     manuellement la modification dans l'éditeur. `manual_apply = true`.
 *
 * Les clés `field`/`before`/`after` sont posées À PLAT dans `metadata` : c'est le contrat lu par
 * `api.list_pending_changes` (`metadata->>'field'|'before'|'after'`) qui alimente la file de
 * modération ET le panneau §21 de l'éditeur. Ne pas les imbriquer sous `diffs`.
 */
import type { SubmitPendingChangeInput } from '../../services/moderation';
import {
  buildCharacteristicsRpcPayload,
  buildSustainabilityRpcPayload,
  buildTagsRpcPayload,
  buildOpeningsPayload,
  buildRelationshipsRpcPayload,
  type WorkspaceModuleId,
} from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import { MODULE_KEY_MAP } from './editor-state';
import { moduleLabel } from './save-issues';

/** Cap on the serialized before/after diff strings stored in metadata (moderation display only). */
const DIFF_MAX_CHARS = 4000;

/** One auto-dispatch section: the whitelisted §120 writer + the exact `p_payload` it expects. */
interface AutoDispatchRoute {
  /** Whitelisted RPC name — MUST match the §120 approve whitelist exactly. */
  rpc: string;
  /** Builds the exact `p_payload` the writer re-dispatch consumes (no editor-shaped wrappers). */
  buildPayload: (draft: ObjectWorkspaceModules) => Record<string, unknown>;
}

/**
 * The 5 sections whose save goes through a uniform `(p_object_id text, p_payload jsonb)` writer that
 * is whitelisted by `api.approve_pending_change` (§120). For these, a contributor's proposal carries
 * the precise RPC payload so the moderator's approval re-dispatches it verbatim.
 */
export const AUTO_DISPATCH_ROUTES: Partial<Record<WorkspaceModuleId, AutoDispatchRoute>> = {
  characteristics: {
    rpc: 'save_object_commercial',
    buildPayload: (draft) => buildCharacteristicsRpcPayload(draft.characteristics),
  },
  openings: {
    rpc: 'save_object_openings',
    buildPayload: (draft) => ({ periods: buildOpeningsPayload(draft.openings.periods) }),
  },
  sustainability: {
    rpc: 'save_object_workspace_sustainability',
    buildPayload: (draft) => buildSustainabilityRpcPayload(draft.sustainability),
  },
  tags: {
    rpc: 'save_object_workspace_tags',
    buildPayload: (draft) => buildTagsRpcPayload(draft.tags),
  },
  relationships: {
    rpc: 'save_object_relations',
    buildPayload: (draft) => buildRelationshipsRpcPayload(draft.relationships),
  },
};

/**
 * Representative target table per module (the `p_target_table` argument is required non-empty by
 * `api.submit_pending_change`; it is a human label in the queue, not an FK). Several savers touch
 * multiple tables — the table here is the section's canonical anchor.
 */
export const MODULE_TARGET_TABLE: Record<WorkspaceModuleId, string> = {
  'general-info': 'object',
  taxonomy: 'object',
  publication: 'object',
  'sync-identifiers': 'object_external_id',
  location: 'object_location',
  descriptions: 'object_description',
  media: 'media',
  contacts: 'contact_channel',
  characteristics: 'object_amenity',
  distinctions: 'object_classification',
  'capacity-policies': 'object_capacity',
  pricing: 'object_price',
  rooms: 'object_room_type',
  'meeting-rooms': 'object_meeting_room',
  menus: 'object_menu',
  cuisine: 'object_cuisine_type',
  activity: 'object_act',
  event: 'object_fma',
  itinerary: 'object_iti',
  openings: 'opening_period',
  'provider-follow-up': 'object_private_note',
  relationships: 'object_relation',
  memberships: 'object_membership',
  legal: 'object_legal',
  tags: 'tag_link',
  sustainability: 'object_sustainability_action',
  distribution: 'object_web_channel',
  provider: 'actor_object_role',
};

/** TRUE when a contributor's edit to this module is auto-dispatchable on approval (one of the 5). */
export function isAutoDispatchModule(module: WorkspaceModuleId): boolean {
  return Boolean(AUTO_DISPATCH_ROUTES[module]);
}

/** Compact, capped JSON of a module slice for the moderation before/after columns. */
function summarizeModuleValue(value: unknown): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(value ?? null);
  } catch {
    serialized = '';
  }
  if (serialized.length > DIFF_MAX_CHARS) {
    return `${serialized.slice(0, DIFF_MAX_CHARS)}…`;
  }
  return serialized;
}

/**
 * Build the `submit_pending_change` envelope for one dirty module proposed by a contributor.
 *
 * - `payload`: for the 5 auto sections, the exact whitelisted-RPC payload (re-dispatched on approve);
 *   otherwise the raw module draft slice (informational — approve cannot auto-apply it).
 * - `metadata`: `{ rpc, section, manual_apply, field, before, after }`. `rpc` is null for manual
 *   sections (so approve refuses to auto-apply). `before`/`after` are the baseline vs draft slice
 *   serialized for the queue diff.
 */
export function buildContributorSubmission(
  objectId: string,
  module: WorkspaceModuleId,
  baseline: ObjectWorkspaceModules,
  draft: ObjectWorkspaceModules,
): SubmitPendingChangeInput {
  const moduleKey = MODULE_KEY_MAP[module];
  const route = AUTO_DISPATCH_ROUTES[module];
  const before = summarizeModuleValue(baseline[moduleKey]);
  const after = summarizeModuleValue(draft[moduleKey]);
  const field = moduleLabel(module);

  const payload: unknown = route ? route.buildPayload(draft) : (draft[moduleKey] ?? {});

  return {
    objectId,
    targetTable: MODULE_TARGET_TABLE[module],
    targetPk: null,
    action: 'update',
    payload,
    metadata: {
      rpc: route ? route.rpc : null,
      section: module,
      manual_apply: !route,
      field,
      before,
      after,
    },
  };
}
