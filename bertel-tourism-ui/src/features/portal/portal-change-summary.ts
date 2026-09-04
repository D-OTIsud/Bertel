/**
 * D12 — projection LISIBLE d'une modification du portail.
 *
 * `api.list_pending_changes` alimente la file de l'office avec `metadata->>'field'`,
 * `'before'` et `'after'`. L'enveloppe contributeur y met le `JSON.stringify` de la
 * tranche ENTIÈRE — catalogues d'options compris — capé à 4000 caractères : un bloc
 * illisible, sur lequel un agent doit pourtant décider d'accepter ou de refuser.
 *
 * Le portail SURCHARGE ces trois clés PRÉSENTATIONNELLES par une projection en clair,
 * une ligne par champ — et RIEN d'autre : `section`, `rpc`, `manual_apply` et `payload`
 * restent byte-identiques, ce sont les seules que le serveur valide et rejoue.
 *
 * Même plafond de 4000 caractères que l'enveloppe d'origine.
 */
import { OPENING_WEEKDAYS } from '../object-editor/sections/opening-period-edit';
import { readTranslatableField } from '../object-editor/sections/descriptions-field';
import type { WorkspaceModuleId } from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import { readStayOpening, readWeekHours } from './portal-bindings';
import { PORTAL_RUBRICS, frDate } from './portal-rubrics';
import type { ArchetypeCode } from '../object-editor/archetypes';

const MAX_CHARS = 4000;

type Loose = Record<string, unknown>;

function slice(draft: ObjectWorkspaceModules, key: string): Loose {
  const value = (draft as unknown as Loose)[key];
  return value && typeof value === 'object' ? (value as Loose) : {};
}

function rows(value: unknown): Loose[] {
  return Array.isArray(value) ? value.filter((entry): entry is Loose => Boolean(entry) && typeof entry === 'object') : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

// ───────────────────────────────── contacts ─────────────────────────────────

const CONTACT_ORDER = ['phone', 'mobile', 'email', 'website'];
const CONTACT_LABEL: Record<string, string> = {
  phone: 'Téléphone',
  mobile: 'Mobile',
  email: 'E-mail',
  website: 'Site internet',
};

function projectContacts(draft: ObjectWorkspaceModules): string[] {
  const items = rows(slice(draft, 'contacts').objectItems).filter(
    (item) => item.isPublic === true && text(item.value).trim(),
  );
  const rank = (item: Loose) => {
    const index = CONTACT_ORDER.indexOf(text(item.kindCode).toLowerCase());
    return index === -1 ? CONTACT_ORDER.length : index;
  };
  return [...items]
    .sort((a, b) => rank(a) - rank(b))
    .map((item) => {
      const code = text(item.kindCode).toLowerCase();
      const label = CONTACT_LABEL[code] ?? text(item.kindLabel) ?? code;
      return `${label || code} : ${text(item.value).trim()}`;
    });
}

// ──────────────────────────────── descriptions ──────────────────────────────

function frField(draft: ObjectWorkspaceModules, field: 'chapo' | 'description'): string {
  const object = slice(draft, 'descriptions').object as Loose | undefined;
  const value = object?.[field];
  if (!value || typeof value !== 'object') return '';
  return readTranslatableField(value as never, 'fr', 'fr') ?? '';
}

function projectDescriptions(draft: ObjectWorkspaceModules): string[] {
  const lines: string[] = [];
  const chapo = frField(draft, 'chapo').trim();
  const description = frField(draft, 'description').trim();
  if (chapo) lines.push(`Accroche : ${chapo}`);
  if (description) lines.push(`Présentation : ${description}`);
  return lines;
}

// ───────────────────────────────── horaires ─────────────────────────────────

function projectWeekHours(draft: ObjectWorkspaceModules): string[] {
  const { hours } = readWeekHours(slice(draft, 'openings') as never);
  const lines: string[] = [];
  for (const { code, label } of OPENING_WEEKDAYS) {
    const entry = hours[code];
    if (!entry?.open) continue;
    const filled = entry.slots.filter((slot) => slot.start.trim() && slot.end.trim());
    lines.push(
      filled.length > 0
        ? `${label} : ${filled.map((slot) => `${slot.start}–${slot.end}`).join(', ')}`
        : `${label} : ouvert, sans horaires fixes`,
    );
  }
  return lines;
}

function projectStayOpening(draft: ObjectWorkspaceModules): string[] {
  const { opening, closures } = readStayOpening(slice(draft, 'openings') as never);
  const lines: string[] = [];
  if (opening.openAllYear === null) lines.push('Ouvert toute l’année : non renseigné');
  else if (opening.openAllYear) lines.push('Ouvert toute l’année : oui');
  else {
    lines.push('Ouvert toute l’année : non');
    if (opening.startDate && opening.endDate) {
      lines.push(`Ouvert du ${frDate(opening.startDate)} au ${frDate(opening.endDate)}`);
    }
  }
  for (const closure of closures) {
    const window = closure.startDate && closure.endDate
      ? `du ${frDate(closure.startDate)} au ${frDate(closure.endDate)}`
      : 'aux dates indiquées';
    lines.push(`Fermé ${window}${closure.label ? ` (${closure.label})` : ''}`);
  }
  return lines;
}

// ──────────────────────── équipements et paiements ──────────────────────────

function labelFor(options: Loose[], code: string): string {
  return text(options.find((option) => text(option.code) === code)?.label) || code;
}

function projectCharacteristics(draft: ObjectWorkspaceModules): string[] {
  const characteristics = slice(draft, 'characteristics');
  const amenityOptions = rows(characteristics.amenityGroups).flatMap((group) => rows(group.options));
  const paymentOptions = rows(characteristics.paymentOptions);
  const amenities = (characteristics.selectedAmenityCodes as string[] | undefined) ?? [];
  const payments = (characteristics.selectedPaymentCodes as string[] | undefined) ?? [];
  const lines: string[] = [];
  if (amenities.length > 0) lines.push(`Équipements : ${amenities.map((code) => labelFor(amenityOptions, code)).join(', ')}`);
  if (payments.length > 0) lines.push(`Paiement : ${payments.map((code) => labelFor(paymentOptions, code)).join(', ')}`);
  return lines;
}

// ────────────────────────── capacité et accueil ─────────────────────────────

function projectCapacityPolicies(draft: ObjectWorkspaceModules): string[] {
  const capacity = slice(draft, 'capacityPolicies');
  const lines: string[] = [];
  for (const item of rows(capacity.capacityItems)) {
    const value = text(item.value).trim();
    if (!value) continue;
    lines.push(`${text(item.metricLabel).trim() || text(item.metricCode)} : ${value}`);
  }
  const pet = (capacity.petPolicy as Loose | undefined) ?? {};
  const conditions = text(pet.conditions).trim();
  if (pet.accepted === true) lines.push(`Animaux : oui${conditions ? ` (${conditions})` : ''}`);
  else if (pet.accepted === false) lines.push('Animaux : non');
  else lines.push('Animaux : non renseigné');

  const stay = (capacity.stayPolicy as Loose | undefined) ?? {};
  const stayParts: string[] = [];
  if (text(stay.checkInFrom).trim()) stayParts.push(`Arrivée : à partir de ${text(stay.checkInFrom).trim()}`);
  if (text(stay.checkOutUntil).trim()) stayParts.push(`Départ : avant ${text(stay.checkOutUntil).trim()}`);
  if (stayParts.length > 0) lines.push(stayParts.join(' · '));
  return lines;
}

// ───────────────────────────────── tarifs ───────────────────────────────────

function projectPricing(draft: ObjectWorkspaceModules): string[] {
  const pricing = slice(draft, 'pricing');
  const prices = rows(pricing.prices);
  const main =
    prices.find((price) => text(price.indicationCode) === 'principal' && text(price.kindCode) === 'adulte') ??
    prices.find((price) => text(price.indicationCode) === 'principal');
  if (!main) return ['Aucun tarif indiqué'];
  if (text(main.kindCode) === 'gratuit') return ['Gratuit'];
  const amount = text(main.amount).trim();
  if (!amount) return ['Tarif sur demande'];
  const unitLabel =
    text(main.unitLabel).trim() || labelFor(rows(pricing.priceUnitOptions), text(main.unitCode));
  const unit = unitLabel && unitLabel !== text(main.unitCode) ? ` ${unitLabel.charAt(0).toLowerCase()}${unitLabel.slice(1)}` : '';
  return [`À partir de ${amount} €${unit}`];
}

// ──────────────────────────────── activité ──────────────────────────────────

function projectActivity(draft: ObjectWorkspaceModules): string[] {
  const activity = slice(draft, 'activity');
  const parts: string[] = [];
  const duration = text(activity.durationMin).trim();
  if (duration) parts.push(`Durée : ${duration} min`);
  const min = text(activity.minParticipants).trim();
  const max = text(activity.maxParticipants).trim();
  if (min && max) parts.push(`${min} à ${max} personnes`);
  else if (max) parts.push(`jusqu’à ${max} personnes`);
  else if (min) parts.push(`à partir de ${min} personnes`);
  const age = text(activity.minAge).trim();
  if (age) parts.push(`dès ${age} ans`);
  return parts.length > 0 ? [parts.join(' · ')] : [];
}

// ─────────────────────────────── projection ─────────────────────────────────

type Projection = (draft: ObjectWorkspaceModules, archetype: ArchetypeCode) => string[];

const PROJECTIONS: Partial<Record<WorkspaceModuleId, Projection>> = {
  contacts: projectContacts,
  descriptions: projectDescriptions,
  // Le MÊME module, deux lectures : un gîte parle de saison et de fermetures, un
  // restaurant d'heures d'ouverture. C'est la saisie qui change, pas le modèle.
  openings: (draft, archetype) => (archetype === 'HEB' ? projectStayOpening(draft) : projectWeekHours(draft)),
  characteristics: projectCharacteristics,
  'capacity-policies': projectCapacityPolicies,
  pricing: projectPricing,
  activity: projectActivity,
};

function titleFor(module: WorkspaceModuleId, archetype: ArchetypeCode): string {
  const scoped = PORTAL_RUBRICS.find(
    (rubric) => rubric.module === module && rubric.archetypes.includes(archetype),
  );
  return (scoped ?? PORTAL_RUBRICS.find((rubric) => rubric.module === module))?.title ?? module;
}

/**
 * Le trio `field` / `before` / `after` que l'office lira dans sa file, pour UNE rubrique.
 *
 * `archetype` est OBLIGATOIRE : deux rubriques partagent le module `openings`, et un défaut
 * « restaurant » ferait lire « Lundi : 09:00–12:00 » à l'agent pour un hébergement — sur le
 * texte MÊME dont il dépend pour accepter ou refuser. Le typecheck est la garde.
 */
export function describePortalChange(
  module: WorkspaceModuleId,
  baseline: ObjectWorkspaceModules,
  draft: ObjectWorkspaceModules,
  archetype: ArchetypeCode,
): { field: string; before: string; after: string } {
  const project = PROJECTIONS[module];
  const render = (source: ObjectWorkspaceModules) => (project ? project(source, archetype).join('\n').slice(0, MAX_CHARS) : '');
  return { field: titleFor(module, archetype), before: render(baseline), after: render(draft) };
}
