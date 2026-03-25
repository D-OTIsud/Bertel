import type { ReactNode } from 'react';
import type { ObjectDetail } from '../../types/domain';
import {
  readString,
  readArray,
  parseMedia,
  parsePrices,
  parseOpenings,
  parseContacts,
  parseRoomTypes,
  parseActors,
  parseOrganizations,
  parseMemberships,
  parseMeetingRooms,
  type PriceItem,
  type OpeningItem,
  type ContactItem,
  type RoomTypeItem,
  type ActorItem,
  type OrganizationItem,
  type MembershipItem,
  type MeetingRoomItem,
} from './utils';

// ─── Type family sets (backend codes only) ──────────────────────────────────

const ACCOMMODATION_TYPES = new Set(['HOT', 'HPA', 'HLO', 'CAMP', 'RVA']);
const RESTAURANT_TYPES    = new Set(['RES']);
const ITINERARY_TYPES     = new Set(['ITI', 'FMA']);
const ACTIVITY_TYPES      = new Set(['ASC']);
const VISITABLE_TYPES     = new Set(['LOI', 'PCU']);
const NATURAL_TYPES       = new Set(['PNA']);

const TYPE_LABEL: Record<string, string> = {
  HOT:  'Hôtel',
  HPA:  'Hébergement plein air',
  HLO:  'Hébergement loisir',
  CAMP: 'Camping',
  RVA:  'Résidence vacances',
  RES:  'Restaurant',
  ITI:  'Itinéraire',
  FMA:  'Itinéraire',
  ASC:  'Activité',
  LOI:  'Loisir',
  PCU:  'Patrimoine',
  PNA:  'Site naturel',
  PSV:  'Prestataire',
  VIL:  'Ville',
  COM:  'Commune',
};

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface DetailViewProps {
  data: ObjectDetail;
  raw: Record<string, unknown>;
}

interface StatDef {
  value: string;
  label: string;
}

// ─── Inline parsers (display-layer only, not general utilities) ──────────────

/** Extract display names from raw.amenities — handles {code,name}, {amenity:{name}}, or strings. */
function extractAmenities(raw: Record<string, unknown>): string[] {
  const items = readArray(raw.amenities ?? raw.object_amenities ?? []);
  return items
    .map((item) => {
      if (typeof item === 'string') return item;
      const r = item as Record<string, unknown>;
      // Nested amenity object (most common in the unified model)
      if (r.amenity && typeof r.amenity === 'object') {
        const a = r.amenity as Record<string, unknown>;
        return readString(a.name) || readString(a.code);
      }
      return readString(r.name) || readString(r.code);
    })
    .filter(Boolean);
}

/** Extract capacity stats from raw.capacities array or raw.capacity scalar. */
function extractCapacities(raw: Record<string, unknown>): StatDef[] {
  const caps = readArray(raw.capacities ?? raw.object_capacities ?? raw.capacity_metrics ?? []);
  if (caps.length > 0) {
    return caps
      .map((cap) => {
        const r = cap as Record<string, unknown>;
        const value = readString(r.value) || readString(r.min);
        const label = readString(
          typeof r.code === 'object' && r.code !== null
            ? (r.code as Record<string, unknown>).name
            : r.code,
        ) || readString(r.label) || 'Capacité';
        return value && value !== '0' ? { value, label } : null;
      })
      .filter(Boolean) as StatDef[];
  }
  const simple =
    readString(raw.capacity as unknown) ||
    readString(raw.total_capacity as unknown);
  if (simple && simple !== '0') {
    return [{ value: simple, label: 'Capacité' }];
  }
  return [];
}

/** Derive membership status tone — mirrors the edit panel logic. */
function membershipTone(item: MembershipItem): string {
  const s = item.status.toLowerCase();
  const inv = item.invoiceStatus.toLowerCase();
  const vis = item.visibilityImpact.toLowerCase();
  if (s.includes('lapsed') || s.includes('expire') || vis.includes('masquee')) return 'red';
  if (inv.includes('pending') || inv.includes('retard') || s.includes('renew')) return 'orange';
  if (s.includes('active') || s.includes('valide')) return 'green';
  return 'neutral';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveLabel(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object' && !Array.isArray(value)) {
    const r = value as Record<string, unknown>;
    return String(r.name ?? r.label ?? r.code ?? '');
  }
  return '';
}

// ─── Primitive: hero ─────────────────────────────────────────────────────────

function HeroBlock({ raw, typeCode }: { raw: Record<string, unknown>; typeCode: string }) {
  const media     = parseMedia(raw);
  const mainImage = media.find((m) => m.url) ?? null;
  const typeName  = TYPE_LABEL[typeCode] ?? typeCode;

  if (mainImage) {
    return (
      <div className="detail-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="detail-hero__img"
          src={mainImage.url}
          alt={mainImage.title || typeName}
        />
        <span className="detail-hero__type-badge">{typeName}</span>
      </div>
    );
  }

  return (
    <div className="detail-hero detail-hero--placeholder">
      <span className="detail-hero__type-code">{typeCode}</span>
      <span className="detail-hero__type-badge">{typeName}</span>
    </div>
  );
}

// ─── Primitive: description ──────────────────────────────────────────────────

function DescriptionBlock({ raw }: { raw: Record<string, unknown> }) {
  const desc =
    readString(raw.description as unknown) ||
    readString(raw.description_adapted as unknown);
  if (!desc) return null;
  return <p className="detail-description">{desc}</p>;
}

// ─── Primitive: stat strip (capacity, trail stats) ───────────────────────────

function StatStrip({ stats }: { stats: StatDef[] }) {
  const valid = stats.filter((s) => Boolean(s.value));
  if (!valid.length) return null;
  return (
    <div className="detail-stats-strip">
      {valid.map(({ value, label }) => (
        <div key={label} className="detail-stat">
          <span className="detail-stat__value">{value}</span>
          <span className="detail-stat__label">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Primitive: section wrapper ──────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="detail-section panel-card panel-card--nested">
      <span className="detail-section__title">{title}</span>
      {children}
    </article>
  );
}

// ─── Primitive: amenities ────────────────────────────────────────────────────

function AmenityStrip({ raw }: { raw: Record<string, unknown> }) {
  const amenities = extractAmenities(raw);
  if (!amenities.length) return null;
  const visible  = amenities.slice(0, 14);
  const overflow = amenities.length - 14;
  return (
    <Section title="Équipements">
      <div className="detail-tag-strip">
        {visible.map((a) => (
          <span key={a} className="detail-tag">{a}</span>
        ))}
        {overflow > 0 && (
          <span className="detail-tag detail-tag--muted">+{overflow}</span>
        )}
      </div>
    </Section>
  );
}

// ─── Primitive: room types ───────────────────────────────────────────────────

function RoomList({ rooms }: { rooms: RoomTypeItem[] }) {
  if (!rooms.length) return null;
  return (
    <Section title="Hébergements">
      {rooms.map((room) => (
        <div key={room.id} className="detail-room-row">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{room.name}</span>
            {room.quantity && room.quantity !== 'n/a' && (
              <span className="detail-tag">{room.quantity} unité(s)</span>
            )}
          </div>
          {(room.capacityAdults !== 'n/a' || room.beds !== 'n/a') && (
            <span className="block text-xs text-muted-foreground">
              {[
                room.capacityAdults !== 'n/a' && `${room.capacityAdults} adultes`,
                room.beds !== 'n/a' && room.beds,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
          {room.amenities.length > 0 && (
            <div className="detail-tag-strip mt-1">
              {room.amenities.slice(0, 5).map((a) => (
                <span key={a} className="detail-tag">{a}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </Section>
  );
}

// ─── Primitive: MICE / meeting rooms ─────────────────────────────────────────

function MeetingRoomList({ rooms }: { rooms: MeetingRoomItem[] }) {
  if (!rooms.length) return null;
  return (
    <Section title="Salles MICE">
      {rooms.map((room) => (
        <div key={room.id} className="detail-meeting-room-row">
          <span className="text-sm font-medium">{room.name}</span>
          <div className="detail-stats-strip mt-1">
            {room.capacityTheatre !== 'n/a' && (
              <div className="detail-stat">
                <span className="detail-stat__value">{room.capacityTheatre}</span>
                <span className="detail-stat__label">Théâtre</span>
              </div>
            )}
            {room.capacityClassroom !== 'n/a' && (
              <div className="detail-stat">
                <span className="detail-stat__value">{room.capacityClassroom}</span>
                <span className="detail-stat__label">Classe</span>
              </div>
            )}
          </div>
          {room.equipment.length > 0 && (
            <div className="detail-tag-strip mt-1">
              {room.equipment.slice(0, 5).map((e) => (
                <span key={e} className="detail-tag">{e}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </Section>
  );
}

// ─── Primitive: prices ───────────────────────────────────────────────────────

function PriceList({ prices }: { prices: PriceItem[] }) {
  if (!prices.length) return null;
  const visible  = prices.slice(0, 6);
  const overflow = prices.length - 6;
  return (
    <Section title="Tarifs">
      {visible.map((price, i) => (
        <div key={`${price.label}-${i}`} className="detail-price-row">
          <div>
            <span className="text-sm font-medium">{price.label}</span>
            {price.periodLabel && (
              <span className="block text-xs text-muted-foreground">{price.periodLabel}</span>
            )}
          </div>
          <span className="detail-price-amount">{price.amount} {price.currency}</span>
        </div>
      ))}
      {overflow > 0 && (
        <small className="text-muted-foreground">+ {overflow} tarif(s)</small>
      )}
    </Section>
  );
}

// ─── Primitive: openings ─────────────────────────────────────────────────────

function OpeningList({ openings }: { openings: OpeningItem[] }) {
  if (!openings.length) return null;
  const visible  = openings.slice(0, 4);
  const overflow = openings.length - 4;
  return (
    <Section title="Ouvertures">
      {visible.map((opening, i) => (
        <div key={`${opening.label}-${i}`} className="detail-opening-row">
          <span className="text-sm font-medium">{opening.label}</span>
          {opening.weekdays.length > 0 && (
            <span className="block text-xs text-muted-foreground">
              {opening.weekdays.join(' · ')}
            </span>
          )}
          {opening.slots.length > 0 && (
            <span className="block text-xs text-muted-foreground">
              {opening.slots.slice(0, 2).join(' · ')}
            </span>
          )}
        </div>
      ))}
      {overflow > 0 && (
        <small className="text-muted-foreground">+ {overflow} période(s)</small>
      )}
    </Section>
  );
}

// ─── Primitive: actors ───────────────────────────────────────────────────────
// Shows real-world operators, guides, managers (not a flat contact list).

function ActorList({ actors }: { actors: ActorItem[] }) {
  if (!actors.length) return null;
  return (
    <Section title="Acteurs">
      {actors.slice(0, 5).map((actor) => (
        <div key={actor.id} className="detail-actor-row">
          <div>
            <span className="text-sm font-medium">{actor.name}</span>
            <span className="block text-xs text-muted-foreground">{actor.role}</span>
          </div>
          {actor.contacts.length > 0 && (
            <span className="detail-actor-contact text-xs text-muted-foreground">
              {actor.contacts[0]}
            </span>
          )}
        </div>
      ))}
    </Section>
  );
}

// ─── Primitive: organizations ────────────────────────────────────────────────
// SIT publishers, OTs — the institutional layer above the object.

function OrgList({ orgs }: { orgs: OrganizationItem[] }) {
  if (!orgs.length) return null;
  return (
    <Section title="Organisations">
      {orgs.slice(0, 3).map((org) => (
        <div key={org.id} className="detail-org-row">
          <span className="text-sm font-medium">{org.name}</span>
          <span className="detail-tag">{org.linkType}</span>
        </div>
      ))}
    </Section>
  );
}

// ─── Primitive: memberships ──────────────────────────────────────────────────
// Network affiliations — Logis, Relais & Châteaux, etc. — with status tone.

function MembershipList({ memberships }: { memberships: MembershipItem[] }) {
  if (!memberships.length) return null;
  return (
    <Section title="Adhésions">
      {memberships.slice(0, 4).map((m) => (
        <div key={m.id} className="detail-membership-row">
          <div>
            <span className="text-sm font-medium">{m.name || m.campaign}</span>
            {m.tier && m.tier !== 'Standard' && (
              <span className="block text-xs text-muted-foreground">{m.tier}</span>
            )}
          </div>
          <span className={`status-pill status-pill--${membershipTone(m)}`}>
            {m.status}
          </span>
        </div>
      ))}
    </Section>
  );
}

// ─── Primitive: contacts ─────────────────────────────────────────────────────

function ContactList({ contacts }: { contacts: ContactItem[] }) {
  if (!contacts.length) return null;
  const visible  = contacts.slice(0, 6);
  const overflow = contacts.length - 6;
  return (
    <Section title="Contacts">
      {visible.map((contact) => (
        <div key={contact.id} className="detail-contact-row">
          <div>
            <span className="text-sm font-medium">{contact.label}</span>
            {contact.kind && (
              <span className="block text-xs text-muted-foreground">{contact.kind}</span>
            )}
          </div>
          <span className="detail-contact-value text-sm">{contact.value}</span>
        </div>
      ))}
      {overflow > 0 && (
        <small className="text-muted-foreground">+ {overflow} contact(s)</small>
      )}
    </Section>
  );
}

// ─── Family views ─────────────────────────────────────────────────────────────
// Each view orders sections editorially for its family.
// Sections that produce no data self-suppress (each primitive returns null when empty).

function AccommodationDetailView({ data, raw }: DetailViewProps) {
  const typeCode   = (data.type ?? 'HOT').toUpperCase();
  // MICE only for hotels (the only type with dedicated meeting rooms)
  const meeting    = typeCode === 'HOT' ? parseMeetingRooms(raw) : [];
  const capacities = extractCapacities(raw);
  const rooms      = parseRoomTypes(raw);
  const prices     = parsePrices(raw);
  const openings   = parseOpenings(raw);
  const actors     = parseActors(raw);
  const orgs       = parseOrganizations(raw);
  const members    = parseMemberships(raw);
  const contacts   = parseContacts(raw);

  return (
    <div className="object-detail-view drawer-form-stack w-full">
      <HeroBlock raw={raw} typeCode={typeCode} />
      <DescriptionBlock raw={raw} />
      {/* Key numbers: capacity stats before editorial content */}
      {capacities.length > 0 && <StatStrip stats={capacities} />}
      {/* Amenities: primary differentiator for accommodation */}
      <AmenityStrip raw={raw} />
      <RoomList rooms={rooms} />
      {meeting.length > 0 && <MeetingRoomList rooms={meeting} />}
      <PriceList prices={prices} />
      <OpeningList openings={openings} />
      {/* Institutional / network layer */}
      <ActorList actors={actors} />
      <OrgList orgs={orgs} />
      <MembershipList memberships={members} />
      <ContactList contacts={contacts} />
    </div>
  );
}

function RestaurantDetailView({ data, raw }: DetailViewProps) {
  const typeCode = (data.type ?? 'RES').toUpperCase();
  const capacities = extractCapacities(raw);
  const prices   = parsePrices(raw);
  const openings = parseOpenings(raw);
  const actors   = parseActors(raw);
  const orgs     = parseOrganizations(raw);
  const members  = parseMemberships(raw);
  const contacts = parseContacts(raw);
  return (
    <div className="object-detail-view drawer-form-stack w-full">
      <HeroBlock raw={raw} typeCode={typeCode} />
      <DescriptionBlock raw={raw} />
      {capacities.length > 0 && <StatStrip stats={capacities} />}
      <AmenityStrip raw={raw} />
      <OpeningList openings={openings} />
      <PriceList prices={prices} />
      <ActorList actors={actors} />
      <OrgList orgs={orgs} />
      <MembershipList memberships={members} />
      <ContactList contacts={contacts} />
    </div>
  );
}

function ItineraryDetailView({ data, raw }: DetailViewProps) {
  const typeCode      = (data.type ?? 'ITI').toUpperCase();
  const lengthKm      = resolveLabel(raw.length_km ?? raw.distance_km ?? raw.total_length_km);
  const durationH     = resolveLabel(raw.duration_h ?? raw.duration_hours ?? raw.total_duration_h);
  const difficulty    = resolveLabel(raw.difficulty);
  const elevationGain = resolveLabel(raw.elevation_gain ?? raw.elevation_gain_m);
  const isLoop        = Boolean(raw.is_loop);
  const practices     = readArray(raw.practices ?? raw.object_practices ?? [])
    .map((p) =>
      resolveLabel(
        (p as Record<string, unknown>).name ??
        (p as Record<string, unknown>).practice ??
        p,
      ),
    )
    .filter(Boolean);
  const openings = parseOpenings(raw);
  const contacts = parseContacts(raw);

  const stats: StatDef[] = (
    [
      lengthKm      ? { value: `${lengthKm} km`,      label: 'Distance'    } : null,
      durationH     ? { value: `${durationH} h`,      label: 'Durée'       } : null,
      difficulty    ? { value: difficulty,             label: 'Difficulté'  } : null,
      elevationGain ? { value: `+${elevationGain} m`, label: 'Dénivelé'    } : null,
      isLoop        ? { value: 'Oui',                  label: 'Boucle'      } : null,
    ] as (StatDef | null)[]
  ).filter(Boolean) as StatDef[];

  return (
    <div className="object-detail-view drawer-form-stack w-full">
      <HeroBlock raw={raw} typeCode={typeCode} />
      {/* Trail characteristics come before the prose description */}
      <StatStrip stats={stats} />
      <DescriptionBlock raw={raw} />
      {practices.length > 0 && (
        <Section title="Pratiques">
          <div className="detail-tag-strip">
            {practices.map((p, i) => (
              <span key={`${p}-${i}`} className="detail-tag">{p}</span>
            ))}
          </div>
        </Section>
      )}
      <OpeningList openings={openings} />
      <ContactList contacts={contacts} />
    </div>
  );
}

function ActivityDetailView({ data, raw }: DetailViewProps) {
  const typeCode = (data.type ?? 'ASC').toUpperCase();
  const prices   = parsePrices(raw);
  const openings = parseOpenings(raw);
  const actors   = parseActors(raw);
  const orgs     = parseOrganizations(raw);
  const contacts = parseContacts(raw);
  return (
    <div className="object-detail-view drawer-form-stack w-full">
      <HeroBlock raw={raw} typeCode={typeCode} />
      <DescriptionBlock raw={raw} />
      <AmenityStrip raw={raw} />
      <PriceList prices={prices} />
      <OpeningList openings={openings} />
      <ActorList actors={actors} />
      <OrgList orgs={orgs} />
      <ContactList contacts={contacts} />
    </div>
  );
}

function VisitableDetailView({ data, raw }: DetailViewProps) {
  const typeCode = (data.type ?? 'LOI').toUpperCase();
  const prices   = parsePrices(raw);
  const openings = parseOpenings(raw);
  const actors   = parseActors(raw);
  const orgs     = parseOrganizations(raw);
  const members  = parseMemberships(raw);
  const contacts = parseContacts(raw);
  return (
    <div className="object-detail-view drawer-form-stack w-full">
      <HeroBlock raw={raw} typeCode={typeCode} />
      <DescriptionBlock raw={raw} />
      <AmenityStrip raw={raw} />
      <OpeningList openings={openings} />
      <PriceList prices={prices} />
      <ActorList actors={actors} />
      <OrgList orgs={orgs} />
      <MembershipList memberships={members} />
      <ContactList contacts={contacts} />
    </div>
  );
}

function NaturalSiteDetailView({ data, raw }: DetailViewProps) {
  const typeCode = (data.type ?? 'PNA').toUpperCase();
  const openings = parseOpenings(raw);
  const actors   = parseActors(raw);
  const orgs     = parseOrganizations(raw);
  const contacts = parseContacts(raw);
  return (
    <div className="object-detail-view drawer-form-stack w-full">
      <HeroBlock raw={raw} typeCode={typeCode} />
      <DescriptionBlock raw={raw} />
      <AmenityStrip raw={raw} />
      <OpeningList openings={openings} />
      <ActorList actors={actors} />
      <OrgList orgs={orgs} />
      <ContactList contacts={contacts} />
    </div>
  );
}

function GenericDetailView({ data, raw }: DetailViewProps) {
  const typeCode = (data.type ?? '').toUpperCase();
  const actors   = parseActors(raw);
  const orgs     = parseOrganizations(raw);
  const contacts = parseContacts(raw);
  return (
    <div className="object-detail-view drawer-form-stack w-full">
      <HeroBlock raw={raw} typeCode={typeCode} />
      <DescriptionBlock raw={raw} />
      <ActorList actors={actors} />
      <OrgList orgs={orgs} />
      <ContactList contacts={contacts} />
    </div>
  );
}

// ─── Public dispatcher ────────────────────────────────────────────────────────

/** Renders a read-only detail view adaptive to object type family.
 *  Each family view orders sections editorially and self-suppresses empty sections.
 *  Falls back to GenericDetailView for unrecognised type codes.
 */
export function ObjectDetailView({ data, raw }: DetailViewProps) {
  const objectType = (data.type ?? '').toUpperCase();
  if (ACCOMMODATION_TYPES.has(objectType)) return <AccommodationDetailView data={data} raw={raw} />;
  if (RESTAURANT_TYPES.has(objectType))    return <RestaurantDetailView    data={data} raw={raw} />;
  if (ITINERARY_TYPES.has(objectType))     return <ItineraryDetailView     data={data} raw={raw} />;
  if (ACTIVITY_TYPES.has(objectType))      return <ActivityDetailView      data={data} raw={raw} />;
  if (VISITABLE_TYPES.has(objectType))     return <VisitableDetailView     data={data} raw={raw} />;
  if (NATURAL_TYPES.has(objectType))       return <NaturalSiteDetailView   data={data} raw={raw} />;
  return <GenericDetailView data={data} raw={raw} />;
}
