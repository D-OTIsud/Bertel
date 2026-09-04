/**
 * Registre des rubriques du portail partenaire (18a, D10).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════
 * C'est une ALLOWLIST, fail-CLOSED.
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * Un module absent d'ici n'est JAMAIS rendu ni envoyé, quelle que soit la matrice de
 * visibilité de l'office ; un type de fiche sans rubrique n'ouvre aucun écran. On ne
 * dérive rien d'un gating tiers : le gating par type de l'éditeur (§46) est fail-OPEN
 * (catalogue vide ⇒ aucun filtre) et inactif en mode démo, et `getArchetypeMeta` rend une
 * identité VISUELLE (accent, famille, couverture), jamais une gouvernance. L'applicabilité
 * d'une rubrique se lit ICI, et nulle part ailleurs.
 *
 * UNE RUBRIQUE = UN MODULE = UNE ENVELOPPE (contrat `submit_actor_fiche`). Deux rubriques
 * peuvent partager un module — « Vos horaires » (restaurant) et « Ouverture et fermetures »
 * (hébergement) écrivent toutes deux `openings` — mais jamais pour le MÊME type, sans quoi
 * deux enveloppes du même module se marcheraient dessus dans un seul envoi.
 *
 * LIAISONS PURES. `unavailableReason` n'est pas un champ mais une convention éclatée :
 * 408 références, 62 fichiers, 13 identifiants distincts, des imbrications à deux niveaux
 * (`publication.moderation`, `taxonomy.ObjectWorkspaceUnitTypes`) et des cousins invisibles
 * à un grep de racines (`location.zonesUnavailableReason`, `media.placeScopeUnavailableReason`,
 * `pricing.promotionsUnavailableReason`, `providerFollowUp.tasksUnavailableReason`…).
 * Surtout : `contacts` et `descriptions` — deux des rubriques du portail — n'ont AUCUN
 * signal racine. Un accès générique `modules[x].unavailableReason` rendrait donc ces deux
 * rubriques éditables sur une donnée peut-être morte. Chaque rubrique porte ci-dessous le
 * CHEMIN EXACT de son motif.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════
 * `permissions.<module>.disabledReason` N'A RIEN À FAIRE ICI. NE LE RECHAÎNEZ PAS.
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * Ce champ dérive de trois sondes serveur — `api.is_object_owner`,
 * `api.user_can_write_canonical`, `api.user_can_write_enrichment` — qui valent FALSE pour
 * la persona acteur PAR CONSTRUCTION : `is_object_owner` porte `AND NOT
 * api.is_actor_persona()` (c'est D7), et les deux autres exigent une adhésion
 * `user_org_membership` qu'un compte portail n'a jamais. Le chaîner fermait donc les SEPT
 * rubriques de TOUT partenaire : « 0 sur 0 », aucun champ, aucun bouton d'envoi — le
 * portail entier sans chemin d'entrée.
 *
 * Il décrit l'écriture canonique DIRECTE. La question du portail n'est pas « peut-il
 * écrire tout de suite ? » mais « peut-il PROPOSER ? », et cette question a déjà ses
 * réponses, ailleurs :
 *   · la PORTÉE — `api.current_user_portal_object_ids` a déjà filtré la fiche : s'il la
 *     voit, il y a droit ;
 *   · le PLANCHER et le MASQUE de `get_portal_section_visibility`, consommés par
 *     `isModuleSubmittable` juste en dessous ;
 *   · et, en dernier ressort, `api.submit_actor_fiche`, qui revalide chaque enveloppe.
 *
 * L'éditeur, lui, a raison de le lire (`SectionLegal.tsx`) : là l'utilisateur EST un agent
 * d'office, et le signal veut dire « vous n'avez pas le droit ». Ici il veut dire « D7
 * fonctionne » — et le lire comme une indisponibilité inverse son sens.
 *
 * VOCABULAIRE. Les titres atteignent l'écran d'un partenaire — souvent peu à l'aise avec
 * l'informatique, souvent sur un téléphone. Jamais `MODULE_LABEL` (« Descriptions & langues
 * parlées » est du jargon d'outil interne), jamais « prestataire », jamais un code de type.
 */
import { getArchetypeMeta, TYPE_LABEL, type ArchetypeCode } from '../object-editor/archetypes';
import { readTranslatableField } from '../object-editor/sections/descriptions-field';
import type { WorkspaceModuleId } from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import {
  readPublicContact,
  readStartingPrice,
  readStayOpening,
  readWeekHours,
  type PortalHeadlineMetric,
} from './portal-bindings';
import { isModuleSubmittable } from './portal-visibility';

export type PortalRubricId =
  | 'contacts'
  | 'presentation'
  | 'hours'
  | 'season'
  | 'amenities'
  | 'welcome'
  | 'pricing'
  | 'activity';

export type RubricState = 'todo' | 'filled' | 'dirty' | 'pending' | 'rejected' | 'unavailable';

/** Ce que lit le partenaire quand une rubrique est fermée. Le motif BRUT n'est jamais
 *  affiché : « Module non applicable au type HLO (référentiel ref_facet_applicability) »
 *  n'aide personne, et « Vos droits actuels… » ne veut rien dire pour un gîte. */
export const PORTAL_UNAVAILABLE_REASON =
  'Cette rubrique n’est pas disponible pour le moment. Contactez l’office si vous devez la modifier.';

export interface PortalRubric {
  id: PortalRubricId;
  /** UNE rubrique = UN module = UNE enveloppe. */
  module: WorkspaceModuleId;
  /** Libellé portail, français courant. */
  title: string;
  /** Types couverts — l'applicabilité vit ICI, fail-closed. Gelé : un consommateur qui
   *  trierait ou pousserait dedans changerait le registre pour tout l'écran. */
  archetypes: readonly ArchetypeCode[];
  isFilled(draft: ObjectWorkspaceModules, archetype: ArchetypeCode): boolean;
  /** Une ligne sous le titre. */
  summary(draft: ObjectWorkspaceModules, archetype: ArchetypeCode): string;
  /** Liaison PURE : le chemin EXACT du motif d'indisponibilité de cette tranche. */
  readUnavailableReason(draft: ObjectWorkspaceModules): string | null;
  /** Lecture seule due à la FORME des données (calendrier saisonnier…), pas à un droit. */
  readStructuralReadOnly?(draft: ObjectWorkspaceModules): string | null;
}

// ───────────────────────── petits lecteurs défensifs ─────────────────────────
// Une tranche peut arriver incomplète (fiche démo, chargement partiel) : une rubrique
// qui jette rend TOUT l'écran blanc, ce qui se lit « vous n'avez plus de fiche ».

type Loose = Record<string, unknown>;

function slice(draft: ObjectWorkspaceModules, key: keyof ObjectWorkspaceModules): Loose {
  const value = (draft as unknown as Loose)[key as string];
  return value && typeof value === 'object' ? (value as Loose) : {};
}

function reasonOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function frText(draft: ObjectWorkspaceModules, field: 'chapo' | 'description'): string {
  const object = slice(draft, 'descriptions').object as Loose | undefined;
  const value = object?.[field];
  if (!value || typeof value !== 'object') return '';
  return readTranslatableField(value as never, 'fr', 'fr') ?? '';
}

function contactsOf(draft: ObjectWorkspaceModules) {
  return slice(draft, 'contacts') as unknown as Parameters<typeof readPublicContact>[0];
}

// ═════════════════════════════ Catalogues curés ═════════════════════════════

/**
 * Les équipements proposés au partenaire, par type — 12 au plus, choisis pour être
 * compréhensibles sur un téléphone. Codes RÉELS de `ref_amenity` (vérifiés contre les
 * seeds le 2026-09-03) : un code absent du catalogue chargé n'est simplement pas rendu,
 * sans erreur — un code inventé disparaîtrait donc en silence.
 *
 * PLACEHOLDER À VALIDER PO. Aucun code de la famille `accessibility` (préfixe `acc_`) :
 * l'accessibilité est saisie par l'office, et `setAmenities` la préserve précisément
 * parce qu'elle reste hors de l'écran.
 */
export const PORTAL_AMENITY_CODES: Readonly<Record<ArchetypeCode, readonly string[]>> = {
  HEB: ['wifi', 'parking', 'swimming_pool', 'air_conditioning', 'equipped_kitchen', 'private_bathroom', 'washing_machine', 'garden', 'private_terrace', 'bbq', 'tv', 'baby_crib'],
  RES: ['wifi', 'parking', 'air_conditioning', 'common_terrace', 'garden', 'bar', 'high_chair', 'playground', 'pet_bowls'],
  // 18b a seedé les trois modes de visite (famille visit_mediation) : ils existent enfin
  // dans ref_amenity, et VIS peut s'appuyer dessus.
  VIS: ['visite_libre', 'visite_guidee', 'audioguide', 'parking', 'wifi', 'boutique', 'public_toilets', 'playground', 'dining_room'],
  ASC: ['parking', 'wifi', 'public_toilets', 'boutique', 'bike_rental', 'tour_desk', 'luggage_storage'],
  SRV: ['wifi', 'parking', 'reception', 'boutique', 'public_toilets', 'drinking_water', 'electric_charging'],
  ITI: [],
  FMA: [],
};

// Gel PROFOND : `Object.freeze` ne descend pas dans les tableaux, et c'est justement le
// tableau qu'un consommateur trierait ou pousserait.
for (const codes of Object.values(PORTAL_AMENITY_CODES)) Object.freeze(codes);
Object.freeze(PORTAL_AMENITY_CODES);

/**
 * Moyens de paiement proposés en tête d'écran — codes `ref_code` domaine `payment_method`.
 * Le référentiel en compte 15 : les autres restent joignables sous le repli « Voir tous les
 * moyens de paiement », et un code hors écran est PRÉSERVÉ par `setPayments`, jamais effacé.
 */
export const PORTAL_PAYMENT_CODES: readonly string[] = Object.freeze([
  'especes',
  'carte_bleue',
  'visa',
  'mastercard',
  'cheque',
  'cheque_vacances',
  'virement',
  'tickets_restaurant',
]);

/**
 * L'unité du tarif d'appel. « Par couvert » est du vocabulaire métier : le visiteur lit
 * « par personne » (arbitrage PO du 2026-09-03).
 */
export const PORTAL_PRICE_UNIT: Partial<Record<ArchetypeCode, string>> = {
  HEB: 'par_nuit',
  RES: 'par_personne',
  VIS: 'par_personne',
  ASC: 'par_personne',
};

export const PORTAL_HEADLINE_METRIC: Partial<Record<ArchetypeCode, PortalHeadlineMetric>> = {
  HEB: 'max_capacity',
  RES: 'seats',
};

/**
 * Exception LOCALE aux libellés de type. `TYPE_LABEL.PSV` vaut littéralement
 * « Prestataire » — un mot proscrit à l'écran du partenaire —, mais il vient de la
 * taxonomie PARTAGÉE, lue aussi par l'Explorer, le CRM et l'éditeur : on ne la touche pas,
 * on la surcharge ici, pour le seul portail.
 */
const PORTAL_TYPE_LABEL_OVERRIDES: Record<string, string> = {
  PSV: 'Service touristique',
};

/** Le libellé du type, ou '' quand on ne sait pas le dire — JAMAIS le code lui-même :
 *  « HLO », « PSV » ou « ZZZ » à l'écran d'un partenaire, c'est du jargon d'outil interne.
 *  Fail-closed par elle-même, sans dépendre de la garde de l'appelant. */
export function portalTypeLabel(typeCode: string | null | undefined): string {
  if (!typeCode) return '';
  const code = typeCode.toUpperCase();
  return PORTAL_TYPE_LABEL_OVERRIDES[code] ?? TYPE_LABEL[code] ?? '';
}

// ══════════════════════════════ Les rubriques ═══════════════════════════════

const ALL_ESTABLISHMENTS: readonly ArchetypeCode[] = Object.freeze<ArchetypeCode[]>(['HEB', 'RES', 'ASC', 'VIS', 'SRV']);

function weekHoursSummary(draft: ObjectWorkspaceModules): string {
  const { hours } = readWeekHours(slice(draft, 'openings') as never);
  const open = Object.entries(hours).filter(([, entry]) => entry.open);
  if (open.length === 0) return '';
  if (open.length === 7) return 'Ouvert tous les jours';
  return `Ouvert ${open.length} jours sur 7`;
}

const RUBRIC_REGISTRY: PortalRubric[] = [
  {
    id: 'contacts',
    module: 'contacts',
    title: 'Vos coordonnées',
    archetypes: ALL_ESTABLISHMENTS,
    isFilled: (draft) => {
      const contacts = contactsOf(draft);
      return Boolean(readPublicContact(contacts, 'phone') || readPublicContact(contacts, 'email'));
    },
    summary: (draft) => {
      const contacts = contactsOf(draft);
      return [readPublicContact(contacts, 'phone'), readPublicContact(contacts, 'email')].filter(Boolean).join(' · ');
    },
    // La tranche `contacts` ne porte AUCUN motif racine (vérifié dans le parseur) : la
    // liaison rend `null`, elle ne va pas chercher un champ qui n'existe pas.
    readUnavailableReason: () => null,
  },
  {
    id: 'presentation',
    module: 'descriptions',
    title: 'Présentez votre établissement',
    archetypes: ALL_ESTABLISHMENTS,
    isFilled: (draft) => Boolean(frText(draft, 'chapo').trim() && frText(draft, 'description').trim()),
    summary: (draft) => frText(draft, 'chapo'),
    // `descriptions` non plus n'a pas de motif racine.
    readUnavailableReason: () => null,
  },
  {
    id: 'hours',
    module: 'openings',
    title: 'Vos horaires',
    // HEB exclu : les heures d'ouverture n'ont aucun sens pour un gîte — il a la
    // rubrique « Ouverture et fermetures » ci-dessous (arbitrage PO du 2026-09-03).
    archetypes: ['RES', 'ASC', 'VIS', 'SRV'],
    isFilled: (draft) => weekHoursSummary(draft) !== '',
    summary: weekHoursSummary,
    readUnavailableReason: (draft) => reasonOf(slice(draft, 'openings').unavailableReason),
    readStructuralReadOnly: (draft) => readWeekHours(slice(draft, 'openings') as never).readOnlyReason,
  },
  {
    id: 'season',
    module: 'openings',
    title: 'Ouverture et fermetures',
    archetypes: ['HEB'],
    isFilled: (draft) => readStayOpening(slice(draft, 'openings') as never).opening.openAllYear !== null,
    summary: (draft) => {
      const { opening, closures } = readStayOpening(slice(draft, 'openings') as never);
      if (opening.openAllYear === null) return '';
      const head = opening.openAllYear
        ? 'Ouvert toute l’année'
        : [opening.startDate, opening.endDate].every(Boolean)
          ? `Ouvert du ${frDate(opening.startDate)} au ${frDate(opening.endDate)}`
          : 'Ouvert sur une partie de l’année';
      if (closures.length === 0) return head;
      return `${head} · ${closures.length} fermeture${closures.length > 1 ? 's' : ''}`;
    },
    readUnavailableReason: (draft) => reasonOf(slice(draft, 'openings').unavailableReason),
    readStructuralReadOnly: (draft) => readStayOpening(slice(draft, 'openings') as never).readOnlyReason,
  },
  {
    id: 'amenities',
    module: 'characteristics',
    title: 'Équipements et moyens de paiement',
    archetypes: ALL_ESTABLISHMENTS,
    isFilled: (draft) => {
      const characteristics = slice(draft, 'characteristics');
      return (
        ((characteristics.selectedAmenityCodes as unknown[] | undefined)?.length ?? 0) > 0 ||
        ((characteristics.selectedPaymentCodes as unknown[] | undefined)?.length ?? 0) > 0
      );
    },
    summary: (draft) => {
      const characteristics = slice(draft, 'characteristics');
      const amenities = (characteristics.selectedAmenityCodes as unknown[] | undefined)?.length ?? 0;
      const payments = (characteristics.selectedPaymentCodes as unknown[] | undefined)?.length ?? 0;
      const parts: string[] = [];
      if (amenities > 0) parts.push(`${amenities} équipement${amenities > 1 ? 's' : ''}`);
      if (payments > 0) parts.push(`${payments} moyen${payments > 1 ? 's' : ''} de paiement`);
      return parts.join(' · ');
    },
    readUnavailableReason: (draft) => reasonOf(slice(draft, 'characteristics').unavailableReason),
  },
  {
    id: 'welcome',
    module: 'capacity-policies',
    title: 'Capacité et animaux',
    archetypes: ['HEB', 'RES'],
    isFilled: (draft, archetype) => {
      const capacity = slice(draft, 'capacityPolicies');
      const metric = PORTAL_HEADLINE_METRIC[archetype];
      const items = (capacity.capacityItems as Array<Loose> | undefined) ?? [];
      const hasCapacity = items.some((item) => item.metricCode === metric && String(item.value ?? '').trim());
      const pet = capacity.petPolicy as Loose | undefined;
      // Le tri-état : « non renseigné » (null) ne compte pas comme une réponse.
      return hasCapacity || (pet?.accepted === true || pet?.accepted === false);
    },
    summary: (draft, archetype) => {
      const capacity = slice(draft, 'capacityPolicies');
      const metric = PORTAL_HEADLINE_METRIC[archetype];
      const items = (capacity.capacityItems as Array<Loose> | undefined) ?? [];
      const item = items.find((entry) => entry.metricCode === metric);
      const parts: string[] = [];
      const value = String(item?.value ?? '').trim();
      if (value) parts.push(`${String(item?.metricLabel ?? '').trim() || 'Capacité'} : ${value}`);
      const pet = capacity.petPolicy as Loose | undefined;
      if (pet?.accepted === true) parts.push('animaux acceptés');
      if (pet?.accepted === false) parts.push('animaux non acceptés');
      return parts.join(' · ');
    },
    readUnavailableReason: (draft) => reasonOf(slice(draft, 'capacityPolicies').unavailableReason),
  },
  {
    id: 'pricing',
    module: 'pricing',
    title: 'Vos tarifs',
    archetypes: ['HEB', 'RES', 'ASC', 'VIS'],
    isFilled: (draft) => {
      const price = readStartingPrice(slice(draft, 'pricing') as never);
      return price.free || Boolean(price.amount.trim());
    },
    summary: (draft) => {
      const price = readStartingPrice(slice(draft, 'pricing') as never);
      if (price.free) return 'Gratuit';
      return price.amount.trim() ? `À partir de ${price.amount} €` : '';
    },
    // `promotionsUnavailableReason` est un COUSIN : il parle des promotions, pas des
    // tarifs, et le portail n'y touche pas. Le chaîner fermerait le tarif d'appel pour
    // une panne qui ne le concerne pas.
    readUnavailableReason: (draft) => reasonOf(slice(draft, 'pricing').unavailableReason),
  },
  {
    id: 'activity',
    module: 'activity',
    title: 'Votre activité',
    archetypes: ['ASC'],
    isFilled: (draft) => {
      const activity = slice(draft, 'activity');
      return ['durationMin', 'minParticipants', 'maxParticipants', 'minAge'].some((key) =>
        String(activity[key] ?? '').trim(),
      );
    },
    summary: (draft) => {
      const activity = slice(draft, 'activity');
      const parts: string[] = [];
      const duration = String(activity.durationMin ?? '').trim();
      if (duration) parts.push(`${duration} min`);
      const min = String(activity.minParticipants ?? '').trim();
      const max = String(activity.maxParticipants ?? '').trim();
      if (min && max) parts.push(`${min} à ${max} personnes`);
      else if (max) parts.push(`jusqu’à ${max} personnes`);
      const age = String(activity.minAge ?? '').trim();
      if (age) parts.push(`dès ${age} ans`);
      return parts.join(' · ');
    },
    readUnavailableReason: (draft) => reasonOf(slice(draft, 'activity').unavailableReason),
  },
];

// Gel PROFOND, en deux temps : annoter le littéral d'abord (un `.map` en fin de littéral
// coupe le typage contextuel et rend tous les paramètres `any`), figer ensuite.
for (const rubric of RUBRIC_REGISTRY) {
  Object.freeze(rubric.archetypes);
  Object.freeze(rubric);
}

export const PORTAL_RUBRICS: readonly PortalRubric[] = Object.freeze(RUBRIC_REGISTRY);

/** Les modules que le portail peut envoyer — dérivés du registre, jamais réécrits à la main. */
export const PORTAL_MODULES: readonly WorkspaceModuleId[] = Object.freeze(
  Array.from(new Set(PORTAL_RUBRICS.map((rubric) => rubric.module))),
);

export function isPortalSupportedArchetype(archetype: ArchetypeCode): boolean {
  return PORTAL_RUBRICS.some((rubric) => rubric.archetypes.includes(archetype));
}

/**
 * Type de fiche → archétype du portail, fail-CLOSED : `null` pour un type inconnu, pour
 * ORG, et pour tout archétype sans rubrique (itinéraires, manifestations). C'est CETTE
 * garde qui décide si un partenaire a un écran, pas `getArchetypeMeta` — qui rend une
 * identité visuelle et ne dit rien des droits.
 */
export function resolvePortalArchetype(typeCode: string | null | undefined): ArchetypeCode | null {
  const archetype = getArchetypeMeta(typeCode)?.archetype ?? null;
  if (!archetype) return null;
  return isPortalSupportedArchetype(archetype) ? archetype : null;
}

export interface BuildPortalRubricsInput {
  archetype: ArchetypeCode;
  draft: ObjectWorkspaceModules;
  dirty: Partial<Record<WorkspaceModuleId, boolean>>;
  masked: string[];
  floor: string[];
  pendingModules: Set<WorkspaceModuleId>;
  rejectedModules: Set<WorkspaceModuleId>;
}

export type BuiltPortalRubric = PortalRubric & { state: RubricState; readOnlyReason: string | null };

/**
 * Les rubriques à afficher, dans l'ordre, avec leur état.
 *
 * PRIORITÉ : `unavailable > pending > rejected > dirty > filled > todo`.
 *
 * `pending` AVANT `rejected` : après une correction renvoyée, le module appartient aux
 * DEUX ensembles — refusé par la dernière vérification résolue, en attente dans la
 * nouvelle. Afficher « À reprendre » inviterait à un geste que le verrou « une seule
 * vérification ouverte par fiche » refuse (PT409), et le partenaire croirait avoir perdu
 * sa correction.
 */
export function buildPortalRubrics(input: BuildPortalRubricsInput): BuiltPortalRubric[] {
  const built: BuiltPortalRubric[] = [];

  for (const rubric of PORTAL_RUBRICS) {
    if (!rubric.archetypes.includes(input.archetype)) continue;
    if (!isModuleSubmittable(rubric.module, input.masked, input.floor)) continue;

    // La DONNÉE seule. Aucun refus de droits n'entre ici : voir l'en-tête du fichier —
    // pour un partenaire, `permissions.<module>.disabledReason` est toujours posé, et le
    // lire fermait le portail entier.
    const blocked = rubric.readUnavailableReason(input.draft);
    if (blocked) {
      built.push({ ...rubric, state: 'unavailable', readOnlyReason: PORTAL_UNAVAILABLE_REASON });
      continue;
    }

    const state: RubricState = input.pendingModules.has(rubric.module)
      ? 'pending'
      : input.rejectedModules.has(rubric.module)
        ? 'rejected'
        : input.dirty[rubric.module]
          ? 'dirty'
          : rubric.isFilled(input.draft, input.archetype)
            ? 'filled'
            : 'todo';

    built.push({ ...rubric, state, readOnlyReason: rubric.readStructuralReadOnly?.(input.draft) ?? null });
  }

  return built;
}

/** '2026-12-24' → '24/12/2026'. Rendue telle quelle si la forme n'est pas celle attendue. */
export function frDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}
