import { getSupabaseClient } from '../lib/supabase';

export type RefCodeRow = {
  id: string;
  code: string;
  name: string;
  domain: string;
  position: number | null;
};

/**
 * Les 27 domaines `ref_code` que le chargeur de l'editeur lisait jusqu'ici en 27
 * requetes separees (une par `.eq('domain', …)` ou `.in('domain', […])`), soit
 * ~23 allers-retours mesures par ouverture de fiche en production.
 *
 * Liste regenerable — ATTENTION, la commande naive qui ne cherche que `.eq(...)`
 * rate `social_network` / `distribution_channel`, charges par `.in(...)` :
 *   grep -oE "(eq\('domain', '[a-z_]+'\)|in\('domain', \[[^]]*\])" \
 *     src/services/object-workspace.ts \
 *     | grep -oE "'[a-z_]+'" | tr -d "'" | grep -v '^domain$' | sort -u
 *
 * Ajouter un domaine ICI quand un nouveau module de l'editeur en a besoin —
 * ne jamais rouvrir une requete `ref_code` ad hoc dans object-workspace.ts.
 */
export const REF_CODE_DOMAINS = [
  'allergen',
  'bed_type',
  'contact_kind',
  'cuisine_type',
  'dietary_tag',
  'distribution_channel',
  'environment_tag',
  'iti_difficulty',
  'iti_open_status',
  'iti_practice',
  'iti_stage_kind',
  'language_level',
  'media_tag',
  'media_type',
  'meeting_equipment',
  'membership_campaign',
  'membership_tier',
  'menu_category',
  'opening_period_type',
  'payment_method',
  'price_kind',
  'price_type',
  'price_unit',
  'room_type',
  'season_type',
  'social_network',
  'view_type',
] as const;

/**
 * Les autres catalogues publics du chemin de chargement. Meme nature que
 * `ref_code` : lecture publique, identiques pour toutes les fiches ET pour tous
 * les utilisateurs. Ne PAS y ajouter :
 *  - `ref_document` : filtre par les identifiants de documents de l'objet, ce
 *    n'est pas un catalogue ;
 *  - la liste des ORG (`from('object').eq('object_type','ORG')`) : elle passe
 *    par la RLS et depend de l'utilisateur — ce cache est partage entre tous
 *    les utilisateurs du navigateur.
 *
 * Colonnes = UNION des `select()` des sites d'appel existants. Les elargir est
 * sans risque ; les retreindre casserait silencieusement un module.
 */
export const REFERENCE_TABLE_SELECT = {
  ref_amenity: 'id, code, name, extra, family_id, position, scope, family:family_id(code, name, position)',
  ref_language: 'id, code, name, position',
  ref_contact_role: 'id, code, name',
  ref_org_role: 'id, code, name',
  ref_actor_role: 'id, code, name',
  ref_iti_assoc_role: 'id, code, name, position',
  ref_tag: 'id, slug, name, color, position',
  ref_legal_type: 'id, code, name, category, is_public, is_required',
  ref_capacity_metric: 'id, code, name, position',
  // `object_type` est necessaire : les appelants filtraient cote serveur, ils
  // filtrent desormais en memoire sur la table entiere (elle est petite).
  ref_capacity_applicability: 'metric_id, object_type',
  ref_classification_scheme: 'id, code, name, description, selection, position, display_group, is_distinction',
  ref_classification_value: 'id, scheme_id, code, name, ordinal, metadata',
  ref_sustainability_action: 'id, code, label, description, category_id, position',
  ref_sustainability_action_category: 'id, code, name, description, position',
  ref_code_domain_registry: 'domain, name, description, object_type, position, is_taxonomy, is_active',
  ref_facet_applicability: 'facet_table, object_type',
} as const;

export const REFERENCE_TABLES = Object.keys(REFERENCE_TABLE_SELECT) as ReadonlyArray<
  keyof typeof REFERENCE_TABLE_SELECT
>;

export type ReferenceCatalogs = {
  refCodeByDomain: Record<string, RefCodeRow[]>;
  tables: Record<string, Record<string, unknown>[]>;
};

/**
 * Charge en UN appel tous les codes de reference des 27 domaines, plus une
 * requete par table de reference, et regroupe le tout. Chaque domaine et chaque
 * table declares rendent TOUJOURS un tableau (vide si aucune ligne) : les
 * appelants n'ont pas a gerer `undefined`.
 *
 * Une erreur sur une table de reference n'est PAS fatale : le module concerne
 * affichera un catalogue vide, ce qui est le comportement degrade que le
 * chargeur avait deja (Promise.allSettled par module). Seule une erreur sur
 * `ref_code` est propagee — c'est le socle de tous les selecteurs.
 */
export async function fetchReferenceCatalogs(): Promise<ReferenceCatalogs> {
  const client = getSupabaseClient();
  const refCodeByDomain: Record<string, RefCodeRow[]> = {};
  for (const domain of REF_CODE_DOMAINS) {
    refCodeByDomain[domain] = [];
  }
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of REFERENCE_TABLES) {
    tables[table] = [];
  }

  if (!client) {
    return { refCodeByDomain, tables };
  }

  const [refCodeResult, ...tableResults] = await Promise.all([
    client
      .from('ref_code')
      .select('id, code, name, domain, position')
      .in('domain', [...REF_CODE_DOMAINS])
      .order('domain', { ascending: true })
      .order('position', { ascending: true }),
    ...REFERENCE_TABLES.map((table) => client.from(table).select(REFERENCE_TABLE_SELECT[table])),
  ]);

  if (refCodeResult.error) {
    throw refCodeResult.error;
  }

  for (const row of (refCodeResult.data ?? []) as RefCodeRow[]) {
    const bucket = refCodeByDomain[row.domain];
    if (bucket) {
      bucket.push(row);
    }
  }

  REFERENCE_TABLES.forEach((table, index) => {
    const result = tableResults[index] as { data?: unknown; error?: unknown } | undefined;
    if (result?.error) {
      return; // degrade : catalogue vide pour cette table, jamais un chargement casse
    }
    tables[table] = (result?.data ?? []) as Record<string, unknown>[];
  });

  return { refCodeByDomain, tables };
}
