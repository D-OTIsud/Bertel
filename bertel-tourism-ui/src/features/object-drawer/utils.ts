import type { ObjectDetail } from '../../types/domain';

interface GenericRecord {
  [key: string]: unknown;
}

export interface ContactItem {
  id: string;
  label: string;
  kind: string;
  value: string;
}

export interface ActorItem {
  id: string;
  name: string;
  role: string;
  contacts: string[];
}

export interface OrganizationItem {
  id: string;
  name: string;
  linkType: string;
  contacts: string[];
}

export interface MediaItem {
  id: string;
  url: string;
  title: string;
  tags: string[];
}

export interface LegalItem {
  label: string;
  status: string;
  documentId: string;
  validityMode: string;
  daysUntilExpiry: string;
  deliveredAt: string;
}

export interface PriceItem {
  label: string;
  amount: string;
  currency: string;
  periodLabel: string;
  details: string[];
}

export interface OpeningItem {
  label: string;
  slots: string[];
  weekdays: string[];
  details: string[];
}

export interface RoomTypeItem {
  id: string;
  name: string;
  capacityAdults: string;
  beds: string;
  quantity: string;
  amenities: string[];
}

export interface MeetingRoomItem {
  id: string;
  name: string;
  capacityTheatre: string;
  capacityClassroom: string;
  equipment: string[];
}

export interface MembershipItem {
  id: string;
  name: string;
  tier: string;
  status: string;
  invoiceStatus: string;
  visibilityImpact: string;
  expiresAt: string;
  campaign: string;
}

export interface ExternalSyncItem {
  id: string;
  source: string;
  externalId: string;
  status: string;
  lastSyncAt: string;
  note: string;
}

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value.filter(isRecord) as Array<Record<string, unknown>>) : [];
}

export function readObjectRecord(detail: ObjectDetail | undefined, objectId: string | null): Record<string, unknown> {
  if (!detail || detail.id !== objectId) {
    return {};
  }

  return (detail.raw ?? {}) as Record<string, unknown>;
}

export function readString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return fallback;
}

function readNamedValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return readString(value, fallback);
  }

  if (isRecord(value)) {
    return (
      readString(value.name) ||
      readString(value.label) ||
      readString(value.code) ||
      readString(value.title) ||
      fallback
    );
  }

  return fallback;
}

function mapContactLines(value: unknown): string[] {
  return readArray(value)
    .map((item) => {
      const kind = readNamedValue(item.kind, readString(item.kind_code));
      const label = readNamedValue(item.role, kind || 'Contact');
      const rawValue = readString(item.value);
      return rawValue ? `${label}: ${rawValue}` : '';
    })
    .filter(Boolean);
}

function formatDateRange(start: unknown, end: unknown, fallback: string): string {
  const startLabel = readString(start);
  const endLabel = readString(end);

  if (startLabel && endLabel) {
    return `${startLabel} -> ${endLabel}`;
  }
  if (startLabel) {
    return `A partir du ${startLabel}`;
  }
  if (endLabel) {
    return `Jusqu'au ${endLabel}`;
  }
  return fallback;
}

function flattenPricePeriods(price: Record<string, unknown>, label: string, defaultAmount: string, defaultCurrency: string): PriceItem[] {
  const periods = readArray(price.periods ?? price.price_periods ?? price.object_price_periods);

  if (periods.length === 0) {
    return [{
      label,
      amount: defaultAmount,
      currency: defaultCurrency,
      periodLabel: readString(price.period_label, readString(price.name, 'Periode non detaillee')),
      details: [readNamedValue(price.unit), readString(price.indication_code)].filter(Boolean),
    }];
  }

  return periods.map((period, index) => ({
    label,
    amount: readString(period.amount, readString(period.price, defaultAmount)),
    currency: readString(period.currency, defaultCurrency),
    periodLabel: readString(period.label, formatDateRange(period.start_date, period.end_date, `Periode ${index + 1}`)),
    details: [
      formatDateRange(period.start_date, period.end_date, ''),
      readString(period.start_time) && readString(period.end_time) ? `${readString(period.start_time)} -> ${readString(period.end_time)}` : '',
      readString(period.discount_label),
      readString(period.conditions),
    ].filter(Boolean),
  }));
}

function flattenOpeningSchedules(period: Record<string, unknown>): OpeningItem[] {
  const schedules = readArray(period.schedules ?? period.opening_schedules ?? period.schedule_blocks);

  if (schedules.length === 0) {
    const slots = Array.isArray(period.slots) ? period.slots.map((slot) => String(slot)) : [];
    const weekdays = Array.isArray(period.weekdays) ? period.weekdays.map((day) => String(day)) : [];

    return [{
      label: readString(period.label, formatDateRange(period.date_start, period.date_end, 'Periode')),
      slots,
      weekdays,
      details: [readString(period.status), readString(period.note)].filter(Boolean),
    }];
  }

  return schedules.map((schedule, index) => {
    const timePeriods = readArray(schedule.time_periods ?? schedule.opening_time_periods);
    const frames = timePeriods.flatMap((timePeriod) => {
      const periodFrames = readArray(timePeriod.time_frames ?? timePeriod.frames ?? timePeriod.opening_time_frames);
      return periodFrames.map((frame) => `${readString(frame.time_start, readString(frame.start_time, '00:00'))} -> ${readString(frame.time_end, readString(frame.end_time, '23:59'))}`);
    });
    const weekdays = timePeriods.flatMap((timePeriod) =>
      readArray(timePeriod.weekdays ?? timePeriod.opening_time_period_weekdays).map((weekday) => readNamedValue(weekday.weekday ?? weekday, readString(weekday.code))),
    ).filter(Boolean);

    return {
      label: readString(schedule.label, `${readString(period.label, 'Periode')} / ${readNamedValue(schedule.schedule_type, `Planning ${index + 1}`)}`),
      slots: frames,
      weekdays,
      details: [
        formatDateRange(period.date_start, period.date_end, ''),
        readNamedValue(schedule.schedule_type),
        readString(period.note),
      ].filter(Boolean),
    };
  });
}

export function parseContacts(raw: Record<string, unknown>): ContactItem[] {
  const objectContacts = readArray(raw.contacts);
  const actorContacts = readArray(raw.actors).flatMap((actor, actorIndex) =>
    readArray(actor.contacts).map((contact, contactIndex) => ({
      id: readString(contact.id, `actor-contact-${actorIndex}-${contactIndex}`),
      label: `${readString(actor.display_name, readString(actor.name, 'Acteur'))} / ${readNamedValue(contact.role, 'Contact')}`,
      kind: readNamedValue(contact.kind, readString(contact.kind_code, 'general')),
      value: readString(contact.value, 'Valeur a completer'),
    })),
  );
  const organizationContacts = readArray(raw.organizations ?? raw.org_links).flatMap((organization, organizationIndex) =>
    readArray(organization.contacts).map((contact, contactIndex) => ({
      id: readString(contact.id, `org-contact-${organizationIndex}-${contactIndex}`),
      label: `${readString(organization.name, 'Organisation')} / ${readNamedValue(contact.role, 'Contact')}`,
      kind: readNamedValue(contact.kind, readString(contact.kind_code, 'general')),
      value: readString(contact.value, 'Valeur a completer'),
    })),
  );

  return [
    ...objectContacts.map((contact, index) => ({
      id: readString(contact.id, `contact-${index}`),
      label: readString(contact.label, readNamedValue(contact.role, 'Contact')),
      kind: readNamedValue(contact.kind, readString(contact.kind_code, 'general')),
      value: readString(contact.value, 'Valeur a completer'),
    })),
    ...actorContacts,
    ...organizationContacts,
  ];
}

export function parseActors(raw: Record<string, unknown>): ActorItem[] {
  return readArray(raw.actors).map((actor, index) => ({
    id: readString(actor.id, `actor-${index}`),
    name: readString(actor.display_name, readString(actor.name, 'Acteur sans nom')),
    role: readNamedValue(actor.role, readString(actor.role_code, 'Role non precise')),
    contacts: mapContactLines(actor.contacts),
  }));
}

export function parseOrganizations(raw: Record<string, unknown>): OrganizationItem[] {
  return readArray(raw.organizations ?? raw.org_links ?? raw.parent_objects).map((organization, index) => ({
    id: readString(organization.id, `org-${index}`),
    name: readString(organization.name, 'Organisation'),
    linkType: readNamedValue(organization.role ?? organization.relation_type, readString(organization.link_type, 'Lien non precise')),
    contacts: mapContactLines(organization.contacts),
  }));
}

export function parseMedia(raw: Record<string, unknown>): MediaItem[] {
  return readArray(raw.media).map((item, index) => ({
    id: readString(item.id, `media-${index}`),
    url: readString(item.url, readString(item.secure_url)),
    title: readString(item.title, readString(item.name, 'Media')),
    tags: Array.isArray(item.tags)
      ? item.tags.map((tag) => readNamedValue(tag, String(tag)))
      : readArray(item.media_tags).map((tag) => readNamedValue(tag.tag ?? tag, 'tag a definir')),
  }));
}

export function parseLegal(raw: Record<string, unknown>): LegalItem[] {
  return readArray(raw.legal_records).map((record) => ({
    label: readNamedValue(record.type, readString(record.label, 'Document legal')),
    status: readString(record.status, 'Statut inconnu'),
    documentId: readString(record.document_id, 'non fourni'),
    validityMode: readString(record.validity_mode, 'non precisee'),
    daysUntilExpiry: readString(record.days_until_expiry, 'n/a'),
    deliveredAt: readString(record.document_delivered_at, readString(record.delivered_at, readString(record.document_requested_at, 'en attente'))),
  }));
}

export function parsePrices(raw: Record<string, unknown>): PriceItem[] {
  const prices = readArray(raw.prices ?? raw.object_prices);

  return prices.flatMap((price, index) => {
    const label = readString(price.label, readNamedValue(price.kind, readString(price.name, `Tarif ${index + 1}`)));
    const defaultAmount = readString(price.amount, readString(price.base_amount, 'n/a'));
    const defaultCurrency = readString(price.currency, readString(price.currency_code, 'EUR'));
    return flattenPricePeriods(price, label, defaultAmount, defaultCurrency);
  });
}

export function parseOpenings(raw: Record<string, unknown>): OpeningItem[] {
  const openingPeriods = readArray(raw.opening_times ?? raw.opening_periods ?? raw.openings);
  return openingPeriods.flatMap((period) => flattenOpeningSchedules(period));
}

export function parseRoomTypes(raw: Record<string, unknown>): RoomTypeItem[] {
  return readArray(raw.room_types ?? raw.object_room_types).map((room, index) => ({
    id: readString(room.id, `room-${index}`),
    name: readString(room.name, readNamedValue(room.room_type, 'Type de chambre')),
    capacityAdults: readString(room.capacity_adults, readString(room.max_capacity, 'n/a')),
    beds: readString(room.beds, readString(room.bed_config_summary, 'n/a')),
    quantity: readString(room.quantity, readString(room.inventory_count, 'n/a')),
    amenities: readArray(room.amenities ?? room.room_type_amenities).map((amenity) => readNamedValue(amenity.amenity ?? amenity, 'Amenite')).filter(Boolean),
  }));
}

export function parseMeetingRooms(raw: Record<string, unknown>): MeetingRoomItem[] {
  return readArray(raw.meeting_rooms ?? raw.object_meeting_rooms).map((room, index) => ({
    id: readString(room.id, `meeting-${index}`),
    name: readString(room.name, 'Salle MICE'),
    capacityTheatre: readString(room.capacity_theatre, readString(room.capacity_seated, 'n/a')),
    capacityClassroom: readString(room.capacity_classroom, readString(room.capacity_boardroom, 'n/a')),
    equipment: readArray(room.equipment ?? room.meeting_room_equipment).map((item) => readNamedValue(item.equipment ?? item, 'equipement')).filter(Boolean),
  }));
}

export function parseMemberships(raw: Record<string, unknown>): MembershipItem[] {
  return readArray(raw.memberships ?? raw.object_memberships).map((membership, index) => ({
    id: readString(membership.id, `membership-${index}`),
    name: readString(membership.name, readNamedValue(membership.campaign, 'Adhesion')),
    tier: readNamedValue(membership.tier, 'Standard'),
    status: readString(membership.status, 'Statut inconnu'),
    invoiceStatus: readString(membership.invoice_status, 'Facture non renseignee'),
    visibilityImpact: readString(membership.visibility_impact, 'Impact non precise'),
    expiresAt: readString(membership.expires_at, readString(membership.ends_at, 'Echeance non renseignee')),
    campaign: readNamedValue(membership.campaign),
  }));
}

export function parseExternalSyncs(raw: Record<string, unknown>): ExternalSyncItem[] {
  return readArray(raw.external_ids ?? raw.object_external_ids).map((item, index) => ({
    id: readString(item.id, `external-${index}`),
    source: readString(item.source, readString(item.source_system, 'Source')),
    externalId: readString(item.external_id, 'non renseigne'),
    status: readString(item.status, 'Statut inconnu'),
    lastSyncAt: readString(item.last_sync_at, readString(item.updated_at, 'Jamais')),
    note: readString(item.note, readString(item.sync_note, 'Aucune note')),
  }));
}
