import { Fragment, type ReactNode } from 'react';
import { ExternalLink, Globe, Mail, MapPinned, Navigation, Phone } from 'lucide-react';
import { Map, Marker } from 'react-map-gl/maplibre';
import { getMarkerImageId } from '../../config/map-markers';
import { env } from '../../lib/env';
import { useSessionStore } from '../../store/session-store';
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
  latitude: number | null;
  longitude: number | null;
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

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number.parseFloat(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function readRichText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = readRichText(item);
      if (candidate) {
        return candidate;
      }
    }

    return '';
  }

  if (isRecord(value)) {
    const priorityKeys = [
      'fr',
      'text',
      'value',
      'label',
      'name',
      'description',
      'description_adapted',
      'description_chapo',
      'description_mobile',
      'description_edition',
    ];

    for (const key of priorityKeys) {
      const candidate = readRichText(value[key]);
      if (candidate) {
        return candidate;
      }
    }

    for (const candidate of Object.values(value)) {
      const text = readRichText(candidate);
      if (text) {
        return text;
      }
    }
  }

  return '';
}

function pickFirstText(...values: unknown[]): string {
  for (const value of values) {
    const text = readRichText(value).trim();
    if (text) {
      return text;
    }
  }

  return '';
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

function readPrimaryDescriptionEntry(raw: Record<string, unknown>): Record<string, unknown> {
  const sources = [
    raw.object_descriptions,
    raw.object_description,
    raw.descriptions_list,
  ];

  for (const source of sources) {
    const entry = readList(source).find((item) => isRecord(item));
    if (isRecord(entry)) {
      return entry;
    }
  }

  return {};
}

function readDescriptions(raw: Record<string, unknown>): { description: string; adaptedDescription: string } {
  const descriptions = isRecord(raw.descriptions) ? raw.descriptions : {};
  const entry = readPrimaryDescriptionEntry(raw);
  const render = isRecord(raw.render) ? raw.render : {};

  const description = pickFirstText(
    raw.description,
    descriptions.description,
    entry.description,
    raw.description_chapo,
    descriptions.description_chapo,
    entry.description_chapo,
    render.description,
  );
  const adaptedDescription = pickFirstText(
    raw.description_adapted,
    descriptions.description_adapted,
    raw.description_mobile,
    descriptions.description_mobile,
    raw.description_edition,
    descriptions.description_edition,
  );

  return {
    description,
    adaptedDescription: adaptedDescription && adaptedDescription !== description ? adaptedDescription : '',
  };
}

function readLocation(raw: Record<string, unknown>): DetailLocation | null {
  const addressRecord = isRecord(raw.address) ? raw.address : {};
  const locationRecord = isRecord(raw.location) ? raw.location : {};
  const mainLocation = readList(raw.object_locations ?? raw.object_location ?? raw.locations)
    .find((item) => isRecord(item) && item.is_main_location !== false);
  const mainLocationRecord = isRecord(mainLocation) ? mainLocation : {};
  const coordinateSource = Array.isArray(locationRecord.coordinates)
    ? locationRecord.coordinates
    : Array.isArray(mainLocationRecord.coordinates)
      ? mainLocationRecord.coordinates
      : [];

  const address = pickFirstText(
    addressRecord.address1,
    addressRecord.street,
    mainLocationRecord.address1,
    mainLocationRecord.address,
    raw.address1,
    raw.address,
  );
  const city = pickFirstText(addressRecord.city, mainLocationRecord.city, raw.city);
  const postcode = pickFirstText(addressRecord.postcode, addressRecord.zipcode, mainLocationRecord.postcode, raw.postcode);
  const lieuDit = pickFirstText(addressRecord.lieu_dit, mainLocationRecord.lieu_dit, raw.lieu_dit);
  const latitude = readNumber(
    locationRecord.latitude ?? locationRecord.lat ?? mainLocationRecord.latitude ?? mainLocationRecord.lat ?? coordinateSource[1] ?? raw.latitude ?? raw.lat,
  );
  const longitude = readNumber(
    locationRecord.longitude ?? locationRecord.lon ?? mainLocationRecord.longitude ?? mainLocationRecord.lon ?? coordinateSource[0] ?? raw.longitude ?? raw.lon,
  );
  const cityLine = [postcode, city].filter(Boolean).join(' ');
  const label = [address, lieuDit, cityLine].filter(Boolean).join(' · ');

  if (!label && latitude == null && longitude == null) {
    return null;
  }

  return {
    address,
    city,
    postcode,
    lieuDit,
    label: label || [latitude, longitude].filter((value) => value != null).join(', '),
    coordinates: latitude != null && longitude != null ? `${latitude}, ${longitude}` : '',
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

function buildPreviewData(data: ObjectDetail, raw: Record<string, unknown>): PreviewData {
  const typeCode = (data.type ?? '').toUpperCase();
  const descriptions = readDescriptions(raw);

  return {
    typeCode,
    typeLabel: TYPE_LABEL[typeCode] ?? data.type ?? '',
    description: descriptions.description,
    adaptedDescription: descriptions.adaptedDescription,
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

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function canRevealActors(params: {
  role: string | null;
  email: string;
  organizations: OrganizationItem[];
}): boolean {
  const { role, email, organizations } = params;

  if (role === 'super_admin' || role === 'owner') {
    return true;
  }

  if (role !== 'tourism_agent') {
    return false;
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return false;
  }

  const organizationEmails = organizations.flatMap((organization) => organization.emails.map(normalizeEmail));
  return organizationEmails.includes(normalizedEmail);
}

function getGoogleMapsSearchUrl(location: DetailLocation): string {
  const query = location.latitude != null && location.longitude != null
    ? `${location.latitude},${location.longitude}`
    : location.label;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function getGoogleMapsDirectionsUrl(location: DetailLocation): string {
  const destination = location.latitude != null && location.longitude != null
    ? `${location.latitude},${location.longitude}`
    : location.label;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function getContactIcon(kindCode: string) {
  const normalized = kindCode.trim().toLowerCase();

  if (normalized === 'email') {
    return Mail;
  }
  if (['phone', 'mobile', 'whatsapp'].includes(normalized)) {
    return Phone;
  }
  if (
    ['website', 'booking', 'facebook', 'instagram', 'linkedin', 'youtube', 'tiktok'].includes(normalized)
  ) {
    return Globe;
  }

  return ExternalLink;
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

  return dedupeLabels([...groupLabels, ...mediaLabels]).slice(0, 4);
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
  ];

  return facts.filter((item): item is PracticalFact => item !== null);
}

function useActorVisibility(organizations: OrganizationItem[]): boolean {
  const role = useSessionStore((state) => state.role);
  const email = useSessionStore((state) => state.email);

  return canRevealActors({
    role,
    email,
    organizations,
  });
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
  const heroCaption = mainMedia?.title || preview.location?.city || preview.typeLabel;
  const heroSubtitle = preview.location?.label && preview.location.label !== heroCaption ? preview.location.label : '';

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
        <h1 className="sr-only">{data.name}</h1>
        <div className="detail-hero__badges">
          {preview.typeLabel && <span className="detail-hero__type-badge">{preview.typeLabel}</span>}
          {preview.location?.city && <span className="detail-hero__meta-pill">{preview.location.city}</span>}
          {preview.media.length > 1 && <span className="detail-hero__meta-pill">{preview.media.length} medias</span>}
        </div>
        <div className="detail-hero__copy">
          <p className="detail-hero__caption">{heroCaption}</p>
          {heroSubtitle && <p className="detail-hero__subtitle">{heroSubtitle}</p>}
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
            Pas encore de photo principale. Les informations utiles restent disponibles juste en dessous.
          </p>
        )}
        {mainMedia?.credit && <p className="detail-hero__credit">Photo {mainMedia.credit}</p>}
      </div>
    </section>
  );
}

function OverviewSection({ preview, stats }: { preview: PreviewData; stats: StatDef[] }) {
  const leadText = preview.description || preview.adaptedDescription;
  const supportText =
    preview.description && preview.adaptedDescription && preview.adaptedDescription !== preview.description
      ? preview.adaptedDescription
      : '';
  const hasOverview = Boolean(leadText || supportText || preview.location?.label || stats.length);

  if (!hasOverview) {
    return null;
  }

  return (
    <section className="detail-overview panel-card panel-card--nested">
      <div className="detail-overview__header">
        <div className="detail-overview__copy">
          {(leadText || supportText) && <h2 className="detail-overview__title">En quelques mots</h2>}
          {leadText && <p className="detail-overview__lead">{leadText}</p>}
          {supportText && <p className="detail-overview__support">{supportText}</p>}
        </div>
        {preview.location?.label && <p className="detail-overview__location">{preview.location.label}</p>}
      </div>
      <StatStrip stats={stats} />
    </section>
  );
}

function TaxonomySection({ groups }: { groups: TaxonomyGroup[] }) {
  if (!groups.length) {
    return null;
  }

  return (
    <Section title="Reperes">
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

function LocationMapSection({ preview }: { preview: PreviewData }) {
  const location = preview.location;

  if (!location || location.latitude == null || location.longitude == null) {
    return null;
  }

  const markerSrc = `/markers/${getMarkerImageId(preview.typeCode)}.png`;

  return (
    <Section title="Plan d'acces">
      <div className="detail-map-card">
        <div className="detail-map-card__canvas">
          <Map
            reuseMaps
            mapStyle={env.mapStyles.classic}
            initialViewState={{
              longitude: location.longitude,
              latitude: location.latitude,
              zoom: 14,
            }}
            attributionControl={false}
            scrollZoom={false}
            dragPan={false}
            dragRotate={false}
            doubleClickZoom={false}
            touchZoomRotate={false}
            keyboard={false}
            style={{ width: '100%', height: '100%' }}
          >
            <Marker longitude={location.longitude} latitude={location.latitude} anchor="bottom">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="detail-map-pin" src={markerSrc} alt="" aria-hidden="true" />
            </Marker>
          </Map>
        </div>
        <div className="detail-map-card__aside">
          <div className="detail-map-card__address">
            <span className="detail-subtitle">Adresse</span>
            <p>{location.label || `${location.latitude}, ${location.longitude}`}</p>
            {location.coordinates && <small>{location.coordinates}</small>}
          </div>
          <div className="detail-map-card__actions">
            <a
              className="detail-map-link"
              href={getGoogleMapsSearchUrl(location)}
              target="_blank"
              rel="noreferrer"
            >
              <MapPinned size={16} />
              Ouvrir dans Google Maps
            </a>
            <a
              className="detail-map-link detail-map-link--accent"
              href={getGoogleMapsDirectionsUrl(location)}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation size={16} />
              Itineraire
            </a>
          </div>
        </div>
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
    <Section title="Sur place">
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
    <Section title="Chambres">
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
                .join(' · ')}
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
    <Section title="Reunions et evenements">
      <div className="detail-card-list">
        {rooms.map((room) => {
          const stats = [
            room.capacityTheatre !== 'n/a' ? { value: room.capacityTheatre, label: 'Theatre' } : null,
            room.capacityClassroom !== 'n/a' ? { value: room.capacityClassroom, label: 'Classe' } : null,
            room.capacityBoardroom !== 'n/a' ? { value: room.capacityBoardroom, label: 'Conseil' } : null,
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

  const title = prices.length > 0 && openings.length > 0
    ? 'Tarifs et horaires'
    : prices.length > 0
      ? 'Tarifs'
      : 'Horaires';

  return (
    <Section title={title}>
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
  const secondary = media.slice(1, 5);

  if (!secondary.length) {
    return null;
  }

  return (
    <Section title="En images">
      <div className="detail-gallery">
        {secondary.map((item) => (
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
              {item.credit && <small>Photo {item.credit}</small>}
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

function PracticalSection({ facts }: { facts: PracticalFact[] }) {
  if (!facts.length) {
    return null;
  }

  return (
    <Section title="A savoir" aside>
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
    <Section title="Contacter ce lieu" aside>
      <div className="detail-contact-list">
        {contacts.slice(0, 8).map((contact) => (
          <ContactCard key={contact.id} contact={contact} />
        ))}
      </div>
    </Section>
  );
}

function ContactCard({ contact }: { contact: ContactItem }) {
  const Icon = getContactIcon(contact.kindCode);
  const content = (
    <>
      <span className="detail-contact-card__icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <div className="detail-contact-card__content">
        <strong>{contact.label}</strong>
        <span>
          {[contact.kind, contact.isPrimary ? 'Principal' : '']
            .filter(Boolean)
            .join(' · ')}
        </span>
        <small>{contact.value}</small>
      </div>
    </>
  );

  if (contact.href) {
    return (
      <a
        className="detail-contact-card detail-contact-card--link"
        href={contact.href}
        target={contact.href.startsWith('http') ? '_blank' : undefined}
        rel={contact.href.startsWith('http') ? 'noreferrer' : undefined}
      >
        {content}
      </a>
    );
  }

  return <div className="detail-contact-card">{content}</div>;
}

function RelatedObjectsSection({ items }: { items: RelatedObjectItem[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <Section title="A voir aussi" aside>
      <div className="detail-list">
        {items.slice(0, 8).map((item) => (
          <div key={`${item.id}-${item.relationship}-${item.direction}`} className="detail-list-row detail-list-row--stacked">
            <div className="detail-mini-card__header">
              <strong>{item.name}</strong>
              <span className="detail-chip detail-chip--soft">{item.relationship}</span>
            </div>
            <p>{TYPE_LABEL[item.type] ?? item.type}</p>
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
    <Section title="Organisation" aside>
      <div className="detail-network">
        {actors.length > 0 && (
          <div className="detail-network__group">
            <span className="detail-subtitle">Equipe</span>
            <div className="detail-card-list">
              {actors.slice(0, 5).map((actor) => (
                <div key={actor.id} className="detail-mini-card">
                  <div className="detail-mini-card__header">
                    <strong>{actor.name}</strong>
                    {actor.role && <span className="detail-chip detail-chip--soft">{actor.role}</span>}
                  </div>
                  {actor.contacts[0] && <p className="detail-mini-card__meta">{actor.contacts[0]}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
        {organizations.length > 0 && (
          <div className="detail-network__group">
            <span className="detail-subtitle">Organisations</span>
            <div className="detail-card-list">
              {organizations.slice(0, 5).map((organization) => (
                <div key={organization.id} className="detail-mini-card">
                  <div className="detail-mini-card__header">
                    <strong>{organization.name}</strong>
                    {organization.linkType && <span className="detail-chip detail-chip--soft">{organization.linkType}</span>}
                  </div>
                  {organization.contacts[0] && <p className="detail-mini-card__meta">{organization.contacts[0]}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
        {memberships.length > 0 && (
          <div className="detail-network__group">
            <span className="detail-subtitle">Adhesions</span>
            <div className="detail-card-list">
              {memberships.slice(0, 5).map((membership) => (
                <div key={membership.id} className="detail-mini-card">
                  <div className="detail-mini-card__header">
                    <strong>{membership.name || membership.campaign}</strong>
                    <span className={`status-pill status-pill--${membershipTone(membership)}`}>
                      {membership.status}
                    </span>
                  </div>
                  <p className="detail-mini-card__meta">{[membership.tier, membership.expiresAt].filter(Boolean).join(' · ')}</p>
                </div>
              ))}
            </div>
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

  const notes: PracticalFact[] = [
    itinerary.practices.length > 0 ? { label: 'Pratiques', value: itinerary.practices.join(' · ') } : null,
    itinerary.info.length > 0 ? { label: 'Conseils', value: itinerary.info.join(' · ') } : null,
    itinerary.track
      ? { label: 'Trace', value: itinerary.trackFormat ? `Disponible (${itinerary.trackFormat})` : 'Disponible' }
      : null,
    itinerary.sectionsCount > 0 ? { label: 'Sections', value: String(itinerary.sectionsCount) } : null,
    itinerary.stagesCount > 0 ? { label: 'Etapes', value: String(itinerary.stagesCount) } : null,
    itinerary.profilesCount > 0 ? { label: 'Profils', value: `${itinerary.profilesCount} profil(s)` } : null,
  ].filter((item): item is PracticalFact => item !== null);

  if (!notes.length) {
    return null;
  }

  return (
    <Section title="Avant de partir">
      <div className="detail-columns">
        {notes.map((note) => (
          <div key={`${note.label}-${note.value}`} className="detail-inline-note">
            <span className="detail-fact-label">{note.label}</span>
            <strong>{note.value}</strong>
          </div>
        ))}
      </div>
    </Section>
  );
}

function buildAsideSections(preview: PreviewData, facts: PracticalFact[], canSeeActors: boolean): ReactNode[] {
  return [
    ContactSection({ contacts: preview.contacts }),
    PracticalSection({ facts }),
    RelatedObjectsSection({ items: preview.relatedObjects }),
    NetworkSection({
      actors: canSeeActors ? preview.actors : [],
      organizations: preview.organizations,
      memberships: preview.memberships,
    }),
  ];
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
  const canSeeActors = useActorVisibility(preview.organizations);
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
        LocationMapSection({ preview }),
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
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function RestaurantDetailView({ data, raw }: DetailViewProps) {
  const preview = buildPreviewData(data, raw);
  const canSeeActors = useActorVisibility(preview.organizations);
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
        LocationMapSection({ preview }),
        TaxonomySection({ groups: taxonomyGroups }),
        CapacityAmenitiesSection({
          capacities: preview.capacities,
          amenities: preview.amenities,
          petPolicy: preview.petPolicy,
        }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
        GallerySection({ media: preview.media }),
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function ItineraryDetailView({ data, raw }: DetailViewProps) {
  const preview = buildPreviewData(data, raw);
  const canSeeActors = useActorVisibility(preview.organizations);
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
        LocationMapSection({ preview }),
        TaxonomySection({ groups: taxonomyGroups }),
        ItineraryPracticalSection({ itinerary: preview.itinerary }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
        GallerySection({ media: preview.media }),
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function ActivityDetailView({ data, raw }: DetailViewProps) {
  const preview = buildPreviewData(data, raw);
  const canSeeActors = useActorVisibility(preview.organizations);
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
        LocationMapSection({ preview }),
        TaxonomySection({ groups: taxonomyGroups }),
        CapacityAmenitiesSection({
          capacities: preview.capacities,
          amenities: preview.amenities,
          petPolicy: preview.petPolicy,
        }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
        GallerySection({ media: preview.media }),
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function VisitableDetailView({ data, raw }: DetailViewProps) {
  const preview = buildPreviewData(data, raw);
  const canSeeActors = useActorVisibility(preview.organizations);
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
        LocationMapSection({ preview }),
        TaxonomySection({ groups: taxonomyGroups }),
        CapacityAmenitiesSection({
          capacities: preview.capacities,
          amenities: preview.amenities,
          petPolicy: preview.petPolicy,
        }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
        GallerySection({ media: preview.media }),
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function NaturalSiteDetailView({ data, raw }: DetailViewProps) {
  const preview = buildPreviewData(data, raw);
  const canSeeActors = useActorVisibility(preview.organizations);
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
        LocationMapSection({ preview }),
        TaxonomySection({ groups: taxonomyGroups }),
        CapacityAmenitiesSection({
          capacities: preview.capacities,
          amenities: preview.amenities,
          petPolicy: preview.petPolicy,
        }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
        GallerySection({ media: preview.media }),
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function GenericDetailView({ data, raw }: DetailViewProps) {
  const preview = buildPreviewData(data, raw);
  const canSeeActors = useActorVisibility(preview.organizations);
  const highlightGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'tags']);
  const practicalFacts = buildPracticalFacts(preview);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      highlightGroups={highlightGroups}
      overviewStats={toCapacityStats(preview.capacities)}
      mainSections={[
        LocationMapSection({ preview }),
        TaxonomySection({ groups: preview.taxonomyGroups }),
        CapacityAmenitiesSection({
          capacities: preview.capacities,
          amenities: preview.amenities,
          petPolicy: preview.petPolicy,
        }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
        GallerySection({ media: preview.media }),
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
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
