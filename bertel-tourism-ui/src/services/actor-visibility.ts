/**
 * Matrice de visibilité des rubriques du portail acteur, côté OFFICE (18a §4.3 / §4.5).
 *
 * Deux RPC `api.*` DEFINER, et rien d'autre : `org_actor_module_visibility` est RLS
 * service_role only — un `client.from('org_actor_module_visibility')` rendrait
 * silencieusement zéro ligne, ce qui se lirait « aucune rubrique n'est fermée » alors que
 * plusieurs le sont. Même règle que `services/portal.ts` et `services/moderation.ts` :
 * **ne JAMAIS ajouter de `client.from(...)` ici**.
 *
 * Ce module sert la surface d'ADMINISTRATION (/settings, org + type explicites). La variante
 * du portail — `get_portal_section_visibility(p_object_id)`, qui résout l'ORG publisher et le
 * type depuis la fiche — vit dans `services/portal.ts` et lit la MÊME table : ce sont deux
 * portes sur un seul réglage, pas deux réglages.
 */
import { getApiClient } from '../lib/supabase';
import { mapDatabaseError } from './api-error';

type GenericRecord = Record<string, unknown>;

function readStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function requireApiClient() {
  const client = getApiClient();
  // Cet écran est lu par un agent d'office : le message peut nommer la cause réelle.
  if (!client) throw new Error('Service indisponible : la connexion à la base n’est pas configurée.');
  return client;
}

export interface ActorSectionVisibility {
  /**
   * Le PLANCHER DUR — `api.actor_portal_floor_modules()`, une fonction SQL, donc non
   * paramétrable par construction. Le serveur refuse en 22023 toute écriture le visant,
   * y compris pour RE-ouvrir un de ses modules. L'écran doit donc le rendre VERROUILLÉ :
   * proposer un interrupteur qui échouera à chaque clic est pire que ne rien proposer.
   */
  floorModules: string[];
  /** Ce que CET office a fermé en plus, pour CE type de fiche (`is_visible = FALSE`). */
  maskedModules: string[];
}

/** Clés de cache — portées par l'ORG **et** par le type : deux types = deux matrices. */
export const actorVisibilityKeys = {
  matrix: (orgId: string, objectType: string) => ['actor-section-visibility', orgId, objectType] as const,
};

export async function getActorSectionVisibility(
  orgId: string,
  objectType: string,
): Promise<ActorSectionVisibility> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('get_actor_section_visibility', {
    p_org_object_id: orgId,
    p_object_type: objectType,
  });
  if (error) throw mapDatabaseError(error, 'Impossible de lire les rubriques ouvertes aux partenaires.');
  const record = (data && typeof data === 'object' ? data : {}) as GenericRecord;
  return {
    floorModules: readStringList(record.floor_modules),
    maskedModules: readStringList(record.masked_modules),
  };
}

/**
 * Ouvre (`visible = true`) ou ferme (`false`) UNE rubrique pour UN type de fiche.
 *
 * Le serveur revalide tout : rang admin ≥ 30 sur l'ORG (42501) et refus du plancher (22023).
 * Le formulaire ne garde rien — il évite seulement de proposer les gestes déjà perdus.
 */
export async function setActorSectionVisibility(
  orgId: string,
  objectType: string,
  moduleId: string,
  visible: boolean,
): Promise<void> {
  const client = requireApiClient();
  const { error } = await client.schema('api').rpc('rpc_set_actor_section_visibility', {
    p_org_object_id: orgId,
    p_object_type: objectType,
    p_module_id: moduleId,
    p_visible: visible,
  });
  if (error) throw mapDatabaseError(error, 'Impossible d’enregistrer ce réglage.');
}
