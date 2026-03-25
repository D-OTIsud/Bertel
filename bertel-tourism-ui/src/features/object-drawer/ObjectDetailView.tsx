import { Fragment, type ReactNode } from 'react';
import type { ObjectDetail } from '../../types/domain';
import {
  parseActors,
  parseCapacities,
  parseContacts,
  parseItinerarySummary,
  parseMeetingRooms,
  parseMedia,
  parseMemberships,
  parseOpenings,
  parseOrganizations,
  parsePetPolicy,
  parsePrices,
  parseRelatedObjects,
  parseRoomTypes,
  parseTaxonomyGroups,
  readString,
  type ActorItem,
  type CapacityItem,
  type ContactItem,
  type ItinerarySummary,
  type MediaItem,
  type MembershipItem,
  type MeetingRoomItem,
  type OpeningItem,
  type OrganizationItem,
  type PetPolicyItem,
  type PriceItem,
  type RelatedObjectItem,
  type RoomTypeItem,
  type TaxonomyGroup,
} from './utils';

const ACCOMMODATION_TYPES = new Set(['HOT', 'HPA', 'HLO', 'CAMP', 'RVA']);
const RESTAURANT_TYPES = new Set(['RES']);
const ITINERARY_TYPES = new Set(['ITI', 'FMA']);
const ACTIVITY_TYPES = new Set(['ASC']);
const VISITABLE_TYPES = new Set(['LOI', 'PCU']);
const NATURAL_TYPES = new Set(['PNA']);
const SERVICE_TYPES = new Set(['PSV', 'SRV', 'VIL', 'COM']);

const TYPE_LABEL: Record<string, string> = {
  HOT: 'Hotel',
  HPA: 'Hebergement plein air',
  HLO: 'Hebergement loisir',
  CAMP: 'Camping',
  RVA: 'Residence vacances',
  RES: 'Restaurant',
  ITI: 'Itineraire',
  FMA: 'Itineraire',
  ASC: 'Activite',
  LOI: 'Loisir',
  PCU: 'Patrimoine',
  PNA: 'Site naturel',
  PSV: 'Prestataire',
  SRV: 'Service',
  VIL: 'Ville',
  COM: 'Commune',
};

interface DetailViewProps {
  data: ObjectDetail;
  raw: Record<string, unknown>;
}

interface StatDef {
  value: string;
  label: string;
}

interface DetailLocation {
  address: string;
  city: string;
  postcode: string;
  lieuDit: string;
  label: string;
  coordinates: string;
}

interface PreviewData {
  typeCode: string;
  typeLabel: string;
  description: string;
  adaptedDescription: string;
  location: DetailLocation | null;
  amenities: string[];
  capacities: CapacityItem[];
  media: MediaItem[];
  prices: PriceItem[];
  openings: OpeningItem[];
  contacts: ContactItem[];
  actors: ActorItem[];
  organizations: OrganizationItem[];
  memberships: MembershipItem[];
  roomTypes: RoomTypeItem[];
  meetingRooms: MeetingRoomItem[];
  taxonomyGroups: TaxonomyGroup[];
  petPolicy: PetPolicyItem | null;
  relatedObjects: RelatedObjectItem[];
  itinerary: ItinerarySummary | null;
}

interface PracticalFact {
  label: string;
  value: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function resolveLabel(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (isRecord(value)) {
    return (
      readString(value.name) ||
      readString(value.label) ||
      readString(value.title) ||
      readString(value.display_name) ||
      readString(value.value_name) ||
      readString(value.code)
    );
  }

  return '';
}

function dedupeLabels(labels: string[]): string[] {
  const seen = new Set<string>();

  return labels.filter((label) => {
    const normalized = label.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function extractAmenities(raw: Record<string, unknown>): string[] {
  const sources = [
    raw.amenities,
    raw.object_amenities,
    raw.features,
    raw.equipment,
    raw.equipments,
  ];

  const labels = sources.flatMap((source) =>
    readList(source).map((item) => {
      if (typeof item === 'string' || typeof item === 'number') {
        return String(item);
      }

      const record = isRecord(item) ? item : {};
      return resolveLabel(record.amenity ?? record.feature ?? record.equipment ?? item);
    }),
  );

  return dedupeLabels(labels.filter(Boolean));
}

function readLocation(raw: Record<string, unknown>): DetailLocation | null {
  const location = isRecord(raw.location) ? raw.location : {};
  const address = readString(location.address, readString(raw.address));
  const city = readString(location.city, readString(raw.city));
  const postcode = readString(location.postcode, readString(raw.postcode));
  const lieuDit = readString(location.lieu_dit, readString(raw.lieu_dit));
  const lat = readString(location.lat);
  const lon = readString(location.lon);
  const cityLine = [postcode, city].filter(Boolean).join(' ');
  const label = [address, lieuDit, cityLine].filter(Boolean).join(' · ');

  if (!label && !lat && !lon) {
    return null;
  }

  return {
    address,
    city,
    postcode,
    lieuDit,
    label: label || [lat, lon].filter(Boolean).join(', '),
    coordinates: lat && lon ? `${lat}, ${lon}` : '',
  };
}

function buildPreviewData(data: ObjectDetail, raw: Record<string, unknown>): PreviewData {
  const typeCode = (data.type ?? '').toUpperCase();

  return {
    typeCode,
    typeLabel: TYPE_LABEL[typeCode] ?? data.type ?? 'Fiche',
    description: readString(raw.description),
    adaptedDescription: readString(raw.description_adapted),
    location: readLocation(raw),
    amenities: extractAmenities(raw),
    capacities: parseCapacities(raw),
    media: parseMedia(raw),
    prices: parsePrices(raw),
    openings: parseOpenings(raw),
    contacts: parseContacts(raw),
    actors: parseActors(raw),
    organizations: parseOrganizations(raw),
    memberships: parseMemberships(raw),
    roomTypes: parseRoomTypes(raw),
    meetingRooms: parseMeetingRooms(raw),
    taxonomyGroups: parseTaxonomyGroups(raw),
    petPolicy: parsePetPolicy(raw),
    relatedObjects: parseRelatedObjects(raw),
    itinerary: parseItinerarySummary(raw),
  };
}

function getGroup(groups: TaxonomyGroup[], key: string): TaxonomyGroup | null {
  return groups.find((group) => group.key === key) ?? null;
}

function pickGroups(groups: TaxonomyGroup[], keys: string[]): TaxonomyGroup[] {
  return keys
    .map((key) => getGroup(groups, key))
    .filter((group): group is TaxonomyGroup => group !== null);
}

function flattenHeroLabels(groups: TaxonomyGroup[], media: MediaItem | null): string[] {
  const groupLabels = groups.flatMap((group) => group.items.map((item) => item.label));
  const mediaLabels = media?.tags ?? [];

  return dedupeLabels([...groupLabels, ...mediaLabels]).slice(0, 8);
}

function toCapacityStats(capacities: CapacityItem[]): StatDef[] {
  return capacities.slice(0, 5).map((item) => ({
    value: item.value,
    label: item.label,
  }));
}

function toItineraryStats(itinerary: ItinerarySummary | null): StatDef[] {
  if (!itinerary) {
    return [];
  }

  const stats: Array<StatDef | null> = [
    itinerary.distanceKm ? { value: `${itinerary.distanceKm} km`, label: 'Distance' } : null,
    itinerary.durationHours ? { value: `${itinerary.durationHours} h`, label: 'Duree' } : null,
    itinerary.difficulty ? { value: itinerary.difficulty, label: 'Difficulte' } : null,
    itinerary.elevationGain ? { value: `+${itinerary.elevationGain} m`, label: 'Denivele' } : null,
    itinerary.isLoop === true ? { value: 'Oui', label: 'Boucle' } : null,
  ];

  return stats.filter((item): item is StatDef => item !== null);
}

function buildPracticalFacts(preview: PreviewData): PracticalFact[] {
  const languages = getGroup(preview.taxonomyGroups, 'languages');
  const payments = getGroup(preview.taxonomyGroups, 'payments');
  const environment = getGroup(preview.taxonomyGroups, 'environment');
  const facts: Array<PracticalFact | null> = [
    preview.location?.label ? { label: 'Adresse', value: preview.location.label } : null,
    preview.location?.coordinates ? { label: 'Coordonnees', value: preview.location.coordinates } : null,
    languages?.items.length ? { label: 'Langues', value: languages.items.map((item) => item.label).join(' · ') } : null,
    payments?.items.length ? { label: 'Paiements', value: payments.items.map((item) => item.label).join(' · ') } : null,
    environment?.items.length
      ? { label: 'Environnement', value: environment.items.map((item) => item.label).join(' · ') }
      : null,
    preview.petPolicy
      ? {
          label: 'Animaux',
          value: [preview.petPolicy.label, ...preview.petPolicy.details].filter(Boolean).join(' · '),
        }
      : null,
    preview.itinerary?.track
      ? {
          label: 'Trace',
          value: preview.itinerary.trackFormat ? `Disponible (${preview.itinerary.trackFormat})` : 'Disponible',
        }
      : null,
    preview.itinerary?.sectionsCount ? { label: 'Sections', value: String(preview.itinerary.sectionsCount) } : null,
    preview.itinerary?.stagesCount ? { label: 'Etapes', value: String(preview.itinerary.stagesCount) } : null,
  ];

  return facts.filter((item): item is PracticalFact => item !== null);
}

function membershipTone(item: MembershipItem): string {
  const status = item.status.toLowerCase();
  const invoice = item.invoiceStatus.toLowerCase();
  const impact = item.visibilityImpact.toLowerCase();

  if (status.includes('lapsed') || status.includes('expire') || impact.includes('masquee')) {
    return 'red';
  }
  if (invoice.includes('retard') || invoice.includes('pending') || status.includes('renew')) {
    return 'orange';
  }
  if (status.includes('active') || status.includes('valide')) {
    return 'green';
  }

  return 'neutral';
}

function Section({
  title,
  kicker,
  description,
  children,
  aside = false,
}: {
  title: string;
  kicker?: string;
  description?: string;
  children: ReactNode;
  aside?: boolean;
}) {
  return (
    <article className={`detail-section panel-card panel-card--nested${aside ? ' detail-section--aside' : ''}`}>
      <div className="detail-section__header">
        {kicker && <span className="detail-section__eyebrow">{kicker}</span>}
        <h3 className="detail-section__title">{title}</h3>
        {description && <p className="detail-section__description">{description}</p>}
      </div>
      <div className="detail-section__body">{children}</div>
    </article>
  );
}

function StatStrip({ stats }: { stats: StatDef[] }) {
  if (!stats.length) {
    return null;
  }

  return (
    <div className="detail-stats-strip">
      {stats.map((stat) => (
        <div key={`${stat.label}-${stat.value}`} className="detail-stat">
          <span className="detail-stat__value">{stat.value}</span>
          <span className="detail-stat__label">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

function HeroBlock({
  data,
  preview,
  highlightGroups,
}: {
  data: ObjectDetail;
  preview: PreviewData;
  highlightGroups: TaxonomyGroup[];
}) {
  const mainMedia = preview.media[0] ?? null;
  const chips = flattenHeroLabels(highlightGroups, mainMedia);

  return (
    <section className={`detail-hero${mainMedia ? '' : ' detail-hero--placeholder'}`}>
      {mainMedia?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="detail-hero__img" src={mainMedia.url} alt={mainMedia.title || data.name} />
      ) : (
        <div className="detail-hero__placeholder-art" aria-hidden="true" />
      )}
      <div className="detail-hero__veil" aria-hidden="true" />
      <div className="detail-hero__content">
        <div className="detail-hero__badges">
          <span className="detail-hero__type-badge">{preview.typeLabel}</span>
          {preview.media.length > 1 && <span className="detail-hero__meta-pill">{preview.media.length} medias</span>}
          {mainMedia?.credit && <span className="detail-hero__meta-pill">Credit {mainMedia.credit}</span>}
        </div>
        <div className="detail-hero__copy">
          <span className="detail-hero__eyebrow">Apercu detaille</span>
          <h1 className="detail-hero__title">{data.name}</h1>
          <p className="detail-hero__subtitle">
            {preview.location?.label || `Fiche ${preview.typeLabel === 'Fiche' ? 'detail' : preview.typeLabel.toLowerCase()} enrichie`}
          </p>
        </div>
        {chips.length > 0 && (
          <div className="detail-chip-strip detail-chip-strip--hero">
            {chips.map((chip) => (
              <span key={chip} className="detail-chip detail-chip--hero">
                {chip}
              </span>
            ))}
          </div>
        )}
        {!mainMedia && (
          <p className="detail-hero__placeholder-copy">
            Aucun media principal disponible pour le moment. La fiche reste complete et met en avant les informations les plus utiles.
          </p>
        )}
      </div>
    </section>
  );
}

function OverviewSection({ preview, stats }: { preview: PreviewData; stats: StatDef[] }) {
  const hasOverview = Boolean(preview.description || preview.adaptedDescription || preview.location?.label || stats.length);

  if (!hasOverview) {
    return null;
  }

  return (
    <section className="detail-overview panel-card panel-card--nested">
      <div className="detail-overview__header">
        <div>
          <span className="detail-section__eyebrow">Apercu</span>
          <h3 className="detail-overview__title">Les informations essentielles</h3>
        </div>
        {preview.location?.label && <p className="detail-overview__location">{preview.location.label}</p>}
      </div>
      <StatStrip stats={stats} />
      {preview.description && <p className="detail-overview__lead">{preview.description}</p>}
      {preview.adaptedDescription && preview.adaptedDescription !== preview.description && (
        <p className="detail-overview__support">{preview.adaptedDescription}</p>
      )}
    </section>
  );
}

function TaxonomySection({ groups }: { groups: TaxonomyGroup[] }) {
  if (!groups.length) {
    return null;
  }

  return (
    <Section
      title="Tags, labels et taxonomies"
      kicker="Editorial"
      description="Toutes les familles utiles visibles sans dump brut."
    >
      <div className="detail-taxonomy-grid">
        {groups.map((group) => (
          <div key={group.key} className="detail-taxonomy-group">
            <span className="detail-taxonomy-group__title">{group.title}</span>
            <div className="detail-chip-strip">
              {group.items.map((item) => (
                <span key={item.id} className="detail-chip" title={item.meta || undefined}>
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function CapacityAmenitiesSection({
  capacities,
  amenities,
  petPolicy,
}: {
  capacities: CapacityItem[];
  amenities: string[];
  petPolicy: PetPolicyItem | null;
}) {
  const stats = toCapacityStats(capacities);
  const hasContent = stats.length > 0 || amenities.length > 0 || Boolean(petPolicy);

  if (!hasContent) {
    return null;
  }

  return (
    <Section
      title="Capacites et equipements"
      kicker="Pratique"
      description="Les points concrets a voir en premier pour qualifier l'offre."
    >
      {stats.length > 0 && <StatStrip stats={stats} />}
      {amenities.length > 0 && (
        <div className="detail-block-stack">
          <span className="detail-subtitle">Equipements</span>
          <div className="detail-chip-strip">
            {amenities.map((amenity) => (
              <span key={amenity} className="detail-chip detail-chip--soft">
                {amenity}
              </span>
            ))}
          </div>
        </div>
      )}
      {petPolicy && (
        <div className="detail-inline-note">
          <strong>{petPolicy.label}</strong>
          {petPolicy.details.length > 0 && <span>{petPolicy.details.join(' · ')}</span>}
        </div>
      )}
    </Section>
  );
}

function RoomList({ rooms }: { rooms: RoomTypeItem[] }) {
  if (!rooms.length) {
    return null;
  }

  return (
    <Section title="Chambres et typologies" kicker="Hebergement">
      <div className="detail-card-list">
        {rooms.map((room) => (
          <div key={room.id} className="detail-mini-card">
            <div className="detail-mini-card__header">
              <strong>{room.name}</strong>
              {room.quantity && room.quantity !== 'n/a' && (
                <span className="detail-chip detail-chip--soft">{room.quantity} unite(s)</span>
              )}
            </div>
            <p className="detail-mini-card__meta">
              {[room.capacityAdults !== 'n/a' ? `${room.capacityAdults} adultes` : '', room.beds !== 'n/a' ? room.beds : '']
                .filter(Boolean)
                .join(' · ') || 'Capacite a completer'}
            </p>
            {room.amenities.length > 0 && (
              <div className="detail-chip-strip">
                {room.amenities.map((amenity) => (
                  <span key={`${room.id}-${amenity}`} className="detail-chip">
                    {amenity}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function MeetingRoomList({ rooms }: { rooms: MeetingRoomItem[] }) {
  if (!rooms.length) {
    return null;
  }

  return (
    <Section title="Salles MICE" kicker="Evenementiel">
      <div className="detail-card-list">
        {rooms.map((room) => {
          const stats = [
            room.capacityTheatre !== 'n/a' ? { value: room.capacityTheatre, label: 'Theatre' } : null,
            room.capacityClassroom !== 'n/a' ? { value: room.capacityClassroom, label: 'Classe' } : null,
            room.capacityBoardroom !== 'n/a' ? { value: room.capacityBoardroom, label: 'Boardroom' } : null,
            room.capacityU !== 'n/a' ? { value: room.capacityU, label: 'U' } : null,
            room.areaM2 !== 'n/a' ? { value: `${room.areaM2} m2`, label: 'Surface' } : null,
          ].filter((item): item is StatDef => item !== null);

          return (
            <div key={room.id} className="detail-mini-card">
              <div className="detail-mini-card__header">
                <strong>{room.name}</strong>
              </div>
              <StatStrip stats={stats} />
              {room.equipment.length > 0 && (
                <div className="detail-chip-strip">
                  {room.equipment.map((equipment) => (
                    <span key={`${room.id}-${equipment}`} className="detail-chip">
                      {equipment}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function PricingAndOpeningsSection({
  prices,
  openings,
}: {
  prices: PriceItem[];
  openings: OpeningItem[];
}) {
  if (!prices.length && !openings.length) {
    return null;
  }

  return (
    <Section title="Tarifs et ouvertures" kicker="Commercial">
      <div className="detail-columns">
        {prices.length > 0 && (
          <div className="detail-column-block">
            <span className="detail-subtitle">Tarifs</span>
            <div className="detail-list">
              {prices.slice(0, 8).map((price, index) => (
                <div key={`${price.label}-${index}`} className="detail-list-row">
                  <div>
                    <strong>{price.label}</strong>
                    {price.periodLabel && <p>{price.periodLabel}</p>}
                    {price.details.length > 0 && <small>{price.details.join(' · ')}</small>}
                  </div>
                  <span className="detail-price-amount">
                    {price.amount} {price.currency}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {openings.length > 0 && (
          <div className="detail-column-block">
            <span className="detail-subtitle">Ouvertures</span>
            <div className="detail-list">
              {openings.slice(0, 8).map((opening, index) => (
                <div key={`${opening.label}-${index}`} className="detail-list-row">
                  <div>
                    <strong>{opening.label}</strong>
                    {opening.weekdays.length > 0 && <p>{opening.weekdays.join(' · ')}</p>}
                    {opening.slots.length > 0 && <small>{opening.slots.join(' · ')}</small>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

function GallerySection({ media }: { media: MediaItem[] }) {
  if (!media.length) {
    return null;
  }

  const secondary = media.slice(1, 5);

  return (
    <Section
      title="Galerie et complements"
      kicker="Media"
      description="Mise en avant du media principal puis rail secondaire si disponible."
    >
      <div className="detail-gallery">
        {secondary.length > 0 ? (
          secondary.map((item) => (
            <figure key={item.id} className="detail-gallery__item">
              {item.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt={item.title || 'Media secondaire'} className="detail-gallery__image" />
              ) : (
                <div className="detail-gallery__placeholder" />
              )}
              <figcaption className="detail-gallery__caption">
                <strong>{item.title || 'Media'}</strong>
                {item.tags.length > 0 && <span>{item.tags.join(' · ')}</span>}
                {item.credit && <small>Credit {item.credit}</small>}
              </figcaption>
            </figure>
          ))
        ) : (
          <div className="detail-inline-note">
            <strong>Un seul media disponible</strong>
            <span>Le hero utilise deja le meilleur visuel disponible pour la fiche.</span>
          </div>
        )}
      </div>
    </Section>
  );
}

function PracticalSection({ facts }: { facts: PracticalFact[] }) {
  if (!facts.length) {
    return null;
  }

  return (
    <Section title="Infos pratiques" kicker="A retenir" aside>
      <div className="detail-list">
        {facts.map((fact) => (
          <div key={`${fact.label}-${fact.value}`} className="detail-list-row detail-list-row--stacked">
            <span className="detail-fact-label">{fact.label}</span>
            <strong>{fact.value}</strong>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ContactSection({ contacts }: { contacts: ContactItem[] }) {
  if (!contacts.length) {
    return null;
  }

  return (
    <Section title="Contacts" kicker="Direct" aside>
      <div className="detail-list">
        {contacts.slice(0, 8).map((contact) => (
          <div key={contact.id} className="detail-list-row">
            <div>
              <strong>{contact.label}</strong>
              <p>
                {[contact.kind, contact.isPrimary ? 'Principal' : '']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <span className="detail-contact-value">{contact.value}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function RelatedObjectsSection({ items }: { items: RelatedObjectItem[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <Section title="Objets lies" kicker="Relations" aside>
      <div className="detail-list">
        {items.slice(0, 8).map((item) => (
          <div key={`${item.id}-${item.relationship}-${item.direction}`} className="detail-list-row detail-list-row--stacked">
            <div className="detail-mini-card__header">
              <strong>{item.name}</strong>
              <span className="detail-chip detail-chip--soft">{item.relationship}</span>
            </div>
            <p>{[item.type, item.direction].filter(Boolean).join(' · ')}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function NetworkSection({
  actors,
  organizations,
  memberships,
}: {
  actors: ActorItem[];
  organizations: OrganizationItem[];
  memberships: MembershipItem[];
}) {
  if (!actors.length && !organizations.length && !memberships.length) {
    return null;
  }

  return (
    <Section title="Reseau et gouvernance" kicker="Secondaire" aside>
      <div className="detail-network">
        {actors.length > 0 && (
          <div className="detail-network__group">
            <span className="detail-subtitle">Acteurs</span>
            {actors.slice(0, 5).map((actor) => (
              <div key={actor.id} className="detail-list-row detail-list-row--stacked">
                <strong>{actor.name}</strong>
                <p>{actor.role}</p>
                {actor.contacts[0] && <small>{actor.contacts[0]}</small>}
              </div>
            ))}
          </div>
        )}
        {organizations.length > 0 && (
          <div className="detail-network__group">
            <span className="detail-subtitle">Organisations</span>
            {organizations.slice(0, 5).map((organization) => (
              <div key={organization.id} className="detail-list-row detail-list-row--stacked">
                <strong>{organization.name}</strong>
                <p>{organization.linkType}</p>
                {organization.contacts[0] && <small>{organization.contacts[0]}</small>}
              </div>
            ))}
          </div>
        )}
        {memberships.length > 0 && (
          <div className="detail-network__group">
            <span className="detail-subtitle">Adhesions</span>
            {memberships.slice(0, 5).map((membership) => (
              <div key={membership.id} className="detail-list-row">
                <div>
                  <strong>{membership.name || membership.campaign}</strong>
                  <p>{[membership.tier, membership.expiresAt].filter(Boolean).join(' · ')}</p>
                </div>
                <span className={`status-pill status-pill--${membershipTone(membership)}`}>
                  {membership.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

function ItineraryPracticalSection({ itinerary }: { itinerary: ItinerarySummary | null }) {
  if (!itinerary) {
    return null;
  }

  const infoLines = [
    itinerary.practices.length > 0 ? `Pratiques: ${itinerary.practices.join(' · ')}` : '',
    itinerary.info.length > 0 ? itinerary.info.join(' · ') : '',
    itinerary.track ? `Trace disponible${itinerary.trackFormat ? ` (${itinerary.trackFormat})` : ''}` : '',
    itinerary.profilesCount > 0 ? `${itinerary.profilesCount} profil(s)` : '',
  ].filter(Boolean);

  if (!infoLines.length) {
    return null;
  }

  return (
    <Section title="Bloc pratique itineraire" kicker="Terrain">
      <div className="detail-block-stack">
        {infoLines.map((line) => (
          <div key={line} className="detail-inline-note">
            <span>{line}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function DetailScaffold({
  data,
  preview,
  highlightGroups,
  overviewStats,
  mainSections,
  asideSections,
}: {
  data: ObjectDetail;
  preview: PreviewData;
  highlightGroups: TaxonomyGroup[];
  overviewStats: StatDef[];
  mainSections: ReactNode[];
  asideSections: ReactNode[];
}) {
  const visibleMain = mainSections.filter(Boolean);
  const visibleAside = asideSections.filter(Boolean);

  return (
    <div className="object-detail-view">
      <HeroBlock data={data} preview={preview} highlightGroups={highlightGroups} />
      <OverviewSection preview={preview} stats={overviewStats} />
      <div className={`detail-layout${visibleAside.length === 0 ? ' detail-layout--single' : ''}`}>
        <div className="detail-main">
          {visibleMain.map((section, index) => (
            <Fragment key={`main-${index}`}>{section}</Fragment>
          ))}
        </div>
        {visibleAside.length > 0 && (
          <aside className="detail-aside">
            {visibleAside.map((section, index) => (
              <Fragment key={`aside-${index}`}>{section}</Fragment>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}

function AccommodationDetailView({ data, raw }: DetailViewProps) {
  const preview = buildPreviewData(data, raw);
  const highlightGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'classifications', 'sustainability', 'tags']);
  const taxonomyGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'classifications', 'sustainability', 'environment', 'payments', 'languages', 'tags']);
  const practicalFacts = buildPracticalFacts(preview);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      highlightGroups={highlightGroups}
      overviewStats={toCapacityStats(preview.capacities)}
      mainSections={[
        TaxonomySection({ groups: taxonomyGroups }),
        CapacityAmenitiesSection({
          capacities: preview.capacities,
          amenities: preview.amenities,
          petPolicy: preview.petPolicy,
        }),
        RoomList({ rooms: preview.roomTypes }),
        MeetingRoomList({ rooms: preview.meetingRooms }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
        GallerySection({ media: preview.media }),
      ]}
      asideSections={[
        PracticalSection({ facts: practicalFacts }),
        ContactSection({ contacts: preview.contacts }),
        RelatedObjectsSection({ items: preview.relatedObjects }),
        NetworkSection({
          actors: preview.actors,
          organizations: preview.organizations,
          memberships: preview.memberships,
        }),
      ]}
    />
  );
}

function RestaurantDetailView({ data, raw }: DetailViewProps) {
  const preview = buildPreviewData(data, raw);
  const highlightGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'classifications', 'tags']);
  const taxonomyGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'classifications', 'payments', 'languages', 'tags']);
  const practicalFacts = buildPracticalFacts(preview);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      highlightGroups={highlightGroups}
      overviewStats={toCapacityStats(preview.capacities)}
      mainSections={[
        TaxonomySection({ groups: taxonomyGroups }),
        CapacityAmenitiesSection({
          capacities: preview.capacities,
          amenities: preview.amenities,
          petPolicy: preview.petPolicy,
        }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
        GallerySection({ media: preview.media }),
      ]}
      asideSections={[
        PracticalSection({ facts: practicalFacts }),
        ContactSection({ contacts: preview.contacts }),
        RelatedObjectsSection({ items: preview.relatedObjects }),
        NetworkSection({
          actors: preview.actors,
          organizations: preview.organizations,
          memberships: preview.memberships,
        }),
      ]}
    />
  );
}

function ItineraryDetailView({ data, raw }: DetailViewProps) {
  const preview = buildPreviewData(data, raw);
  const highlightGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'practices', 'tags']);
  const taxonomyGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'practices', 'environment', 'languages', 'tags']);
  const practicalFacts = buildPracticalFacts(preview);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      highlightGroups={highlightGroups}
      overviewStats={toItineraryStats(preview.itinerary)}
      mainSections={[
        TaxonomySection({ groups: taxonomyGroups }),
        ItineraryPracticalSection({ itinerary: preview.itinerary }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
        GallerySection({ media: preview.media }),
      ]}
      asideSections={[
        PracticalSection({ facts: practicalFacts }),
        ContactSection({ contacts: preview.contacts }),
        RelatedObjectsSection({ items: preview.relatedObjects }),
        NetworkSection({
          actors: preview.actors,
          organizations: preview.organizations,
          memberships: preview.memberships,
        }),
      ]}
    />
  );
}

function ActivityDetailView({ data, raw }: DetailViewProps) {
  const preview = buildPreviewData(data, raw);
  const highlightGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'tags']);
  const taxonomyGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'tags', 'payments', 'languages', 'environment']);
  const practicalFacts = buildPracticalFacts(preview);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      highlightGroups={highlightGroups}
      overviewStats={toCapacityStats(preview.capacities)}
      mainSections={[
        TaxonomySection({ groups: taxonomyGroups }),
        CapacityAmenitiesSection({
          capacities: preview.capacities,
          amenities: preview.amenities,
          petPolicy: preview.petPolicy,
        }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
        GallerySection({ media: preview.media }),
      ]}
      asideSections={[
        PracticalSection({ facts: practicalFacts }),
        ContactSection({ contacts: preview.contacts }),
        RelatedObjectsSection({ items: preview.relatedObjects }),
        NetworkSection({
          actors: preview.actors,
          organizations: preview.organizations,
          memberships: preview.memberships,
        }),
      ]}
    />
  );
}

function VisitableDetailView({ data, raw }: DetailViewProps) {
  const preview = buildPreviewData(data, raw);
  const highlightGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'classifications', 'tags']);
  const taxonomyGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'classifications', 'payments', 'languages', 'tags']);
  const practicalFacts = buildPracticalFacts(preview);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      highlightGroups={highlightGroups}
      overviewStats={toCapacityStats(preview.capacities)}
      mainSections={[
        TaxonomySection({ groups: taxonomyGroups }),
        CapacityAmenitiesSection({
          capacities: preview.capacities,
          amenities: preview.amenities,
          petPolicy: preview.petPolicy,
        }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
        GallerySection({ media: preview.media }),
      ]}
      asideSections={[
        PracticalSection({ facts: practicalFacts }),
        ContactSection({ contacts: preview.contacts }),
        RelatedObjectsSection({ items: preview.relatedObjects }),
        NetworkSection({
          actors: preview.actors,
          organizations: preview.organizations,
          memberships: preview.memberships,
        }),
      ]}
    />
  );
}

function NaturalSiteDetailView({ data, raw }: DetailViewProps) {
  const preview = buildPreviewData(data, raw);
  const highlightGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'environment', 'tags']);
  const taxonomyGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'environment', 'languages', 'tags']);
  const practicalFacts = buildPracticalFacts(preview);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      highlightGroups={highlightGroups}
      overviewStats={toCapacityStats(preview.capacities)}
      mainSections={[
        TaxonomySection({ groups: taxonomyGroups }),
        CapacityAmenitiesSection({
          capacities: preview.capacities,
          amenities: preview.amenities,
          petPolicy: preview.petPolicy,
        }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
        GallerySection({ media: preview.media }),
      ]}
      asideSections={[
        PracticalSection({ facts: practicalFacts }),
        ContactSection({ contacts: preview.contacts }),
        RelatedObjectsSection({ items: preview.relatedObjects }),
        NetworkSection({
          actors: preview.actors,
          organizations: preview.organizations,
          memberships: preview.memberships,
        }),
      ]}
    />
  );
}

function GenericDetailView({ data, raw }: DetailViewProps) {
  const preview = buildPreviewData(data, raw);
  const highlightGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'tags']);
  const practicalFacts = buildPracticalFacts(preview);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      highlightGroups={highlightGroups}
      overviewStats={toCapacityStats(preview.capacities)}
      mainSections={[
        TaxonomySection({ groups: preview.taxonomyGroups }),
        CapacityAmenitiesSection({
          capacities: preview.capacities,
          amenities: preview.amenities,
          petPolicy: preview.petPolicy,
        }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
        GallerySection({ media: preview.media }),
      ]}
      asideSections={[
        PracticalSection({ facts: practicalFacts }),
        ContactSection({ contacts: preview.contacts }),
        RelatedObjectsSection({ items: preview.relatedObjects }),
        NetworkSection({
          actors: preview.actors,
          organizations: preview.organizations,
          memberships: preview.memberships,
        }),
      ]}
    />
  );
}

export function ObjectDetailView({ data, raw }: DetailViewProps) {
  const objectType = (data.type ?? '').toUpperCase();

  if (ACCOMMODATION_TYPES.has(objectType)) {
    return <AccommodationDetailView data={data} raw={raw} />;
  }
  if (RESTAURANT_TYPES.has(objectType)) {
    return <RestaurantDetailView data={data} raw={raw} />;
  }
  if (ITINERARY_TYPES.has(objectType)) {
    return <ItineraryDetailView data={data} raw={raw} />;
  }
  if (ACTIVITY_TYPES.has(objectType)) {
    return <ActivityDetailView data={data} raw={raw} />;
  }
  if (VISITABLE_TYPES.has(objectType)) {
    return <VisitableDetailView data={data} raw={raw} />;
  }
  if (NATURAL_TYPES.has(objectType)) {
    return <NaturalSiteDetailView data={data} raw={raw} />;
  }
  if (SERVICE_TYPES.has(objectType)) {
    return <GenericDetailView data={data} raw={raw} />;
  }

  return <GenericDetailView data={data} raw={raw} />;
}
