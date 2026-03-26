import { Fragment, useEffect, useState, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Eye,
  Globe,
  Mail,
  MapPinned,
  Navigation,
  Phone,
} from 'lucide-react';
import { Map, Marker } from 'react-map-gl/maplibre';
import { getMarkerImageId } from '../../config/map-markers';
import { env } from '../../lib/env';
import {
  parseObjectDetail,
  type ParsedAmenityItem,
  type ParsedLocation,
  type ParsedObjectDetail,
} from '../../services/object-detail-parser';
import { useSessionStore } from '../../store/session-store';
import type { ObjectDetail } from '../../types/domain';
import {
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

type DetailLocation = ParsedLocation;

interface PreviewData {
  typeCode: string;
  summary: string;
  description: string;
  adaptedDescription: string;
  location: DetailLocation | null;
  amenities: ParsedAmenityItem[];
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
  value?: string;
  items?: string[];
}

function buildPreviewData(data: ObjectDetail, parsed: ParsedObjectDetail): PreviewData {
  const typeCode = (parsed.identity.type || data.type || '').toUpperCase();
  return {
    typeCode,
    summary:
      parsed.text.chapo ||
      parsed.text.description ||
      parsed.text.adaptedDescription ||
      parsed.text.mobileDescription ||
      parsed.text.editorialDescription,
    description: parsed.text.description || parsed.text.chapo,
    adaptedDescription:
      parsed.text.adaptedDescription ||
      parsed.text.mobileDescription ||
      parsed.text.editorialDescription,
    location: parsed.location,
    amenities: parsed.taxonomy.amenityItems,
    capacities: parsed.operations.capacities,
    media: parsed.media.items,
    prices: parsed.operations.prices,
    openings: parsed.operations.openings,
    contacts: parsed.contacts.public,
    actors: parsed.relations.actors,
    organizations: parsed.relations.organizations,
    memberships: parsed.relations.memberships,
    roomTypes: parsed.operations.roomTypes,
    meetingRooms: parsed.operations.meetingRooms,
    taxonomyGroups: parsed.taxonomy.groups,
    petPolicy: parsed.operations.petPolicy,
    relatedObjects: parsed.relations.all,
    itinerary: parsed.itinerary.summary,
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
  if (location.googleMapsUrl) {
    return location.googleMapsUrl;
  }
  const query = location.latitude != null && location.longitude != null
    ? `${location.latitude},${location.longitude}`
    : location.label;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function getGoogleMapsDirectionsUrl(location: DetailLocation): string {
  if (location.directionsUrl) {
    return location.directionsUrl;
  }
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

function sortAmenities(amenities: ParsedAmenityItem[]) {
  return [...amenities].sort((left, right) => Number(Boolean(right.iconUrl)) - Number(Boolean(left.iconUrl)));
}

function getGroup(groups: TaxonomyGroup[], key: string): TaxonomyGroup | null {
  return groups.find((group) => group.key === key) ?? null;
}

function pickGroups(groups: TaxonomyGroup[], keys: string[]): TaxonomyGroup[] {
  return keys
    .map((key) => getGroup(groups, key))
    .filter((group): group is TaxonomyGroup => group !== null);
}

function toCapacityStats(capacities: CapacityItem[]): StatDef[] {
  return capacities.slice(0, 5).map((item) => ({
    value: item.value,
    label: item.label,
  }));
}

function getWrappedIndex(index: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return ((index % total) + total) % total;
}

function getMediaWindow(media: MediaItem[], activeIndex: number, count: number) {
  if (media.length <= 1) {
    return [];
  }

  const items: Array<{ item: MediaItem; index: number }> = [];
  const total = media.length;

  for (let offset = 1; offset < total && items.length < count; offset += 1) {
    const index = getWrappedIndex(activeIndex + offset, total);
    items.push({ item: media[index], index });
  }

  return items;
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
    languages?.items.length ? { label: 'Langues', items: languages.items.map((item) => item.label) } : null,
    payments?.items.length ? { label: 'Paiements', items: payments.items.map((item) => item.label) } : null,
    environment?.items.length
      ? { label: 'Cadre', items: environment.items.map((item) => item.label) }
      : null,
    preview.petPolicy
      ? {
          label: 'Animaux',
          items: [preview.petPolicy.label, ...preview.petPolicy.details].filter(Boolean),
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
  restricted = false,
}: {
  title: string;
  kicker?: string;
  description?: string;
  children: ReactNode;
  aside?: boolean;
  restricted?: boolean;
}) {
  return (
    <article className={`detail-section panel-card panel-card--nested${aside ? ' detail-section--aside' : ''}`}>
      <div className="detail-section__header">
        <div className="detail-section__heading">
          {kicker && <span className="detail-section__eyebrow">{kicker}</span>}
          <h3 className="detail-section__title">{title}</h3>
          {description && <p className="detail-section__description">{description}</p>}
        </div>
        {restricted && (
          <span className="detail-section__scope" title="Visible uniquement pour les utilisateurs autorises">
            <Eye size={14} />
          </span>
        )}
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
  activeIndex,
  onChange,
}: {
  data: ObjectDetail;
  preview: PreviewData;
  activeIndex: number;
  onChange: (index: number) => void;
}) {
  const totalMedia = preview.media.length;
  const mainMedia = totalMedia > 0 ? preview.media[getWrappedIndex(activeIndex, totalMedia)] : null;
  const indicatorCount = Math.min(totalMedia, 3);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const goToPrevious = () => {
    if (totalMedia <= 1) {
      return;
    }
    onChange(getWrappedIndex(activeIndex - 1, totalMedia));
  };

  const goToNext = () => {
    if (totalMedia <= 1) {
      return;
    }
    onChange(getWrappedIndex(activeIndex + 1, totalMedia));
  };

  return (
    <section className={`detail-hero${mainMedia ? '' : ' detail-hero--placeholder'}${totalMedia > 1 ? ' detail-hero--carousel' : ''}`}>
      <h1 className="sr-only">{data.name}</h1>
      <div
        className="detail-hero__frame"
        onTouchStart={(event) => setTouchStartX(event.changedTouches[0]?.clientX ?? null)}
        onTouchEnd={(event) => {
          const endX = event.changedTouches[0]?.clientX ?? null;
          if (touchStartX == null || endX == null) {
            return;
          }

          const delta = endX - touchStartX;
          setTouchStartX(null);

          if (Math.abs(delta) < 40) {
            return;
          }

          if (delta > 0) {
            goToPrevious();
            return;
          }

          goToNext();
        }}
      >
        {mainMedia?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="detail-hero__img" src={mainMedia.url} alt={mainMedia.title || data.name} />
        ) : (
          <div className="detail-hero__placeholder-art" aria-hidden="true" />
        )}
        <div className="detail-hero__veil" aria-hidden="true" />
        {totalMedia > 1 && (
          <>
            <button type="button" className="detail-hero__nav detail-hero__nav--prev" onClick={goToPrevious} aria-label="Image precedente">
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="detail-hero__nav detail-hero__nav--next" onClick={goToNext} aria-label="Image suivante">
              <ChevronRight size={18} />
            </button>
            <div className="detail-hero__dots" aria-hidden="true">
              {Array.from({ length: indicatorCount }, (_, index) => (
                <span
                  key={`dot-${index}`}
                  className={`detail-hero__dot${index === activeIndex % indicatorCount ? ' detail-hero__dot--active' : ''}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="detail-hero__footer">
        {!mainMedia && (
          <p className="detail-hero__placeholder-copy">
            Pas encore de photo principale.
          </p>
        )}
        <div className="detail-hero__meta">
          {preview.media.length > 1 && <span className="detail-hero__meta-pill">{preview.media.length} medias</span>}
          {mainMedia?.credit && <p className="detail-hero__credit">Photo {mainMedia.credit}</p>}
        </div>
      </div>
    </section>
  );
}

function MediaRail({
  preview,
  activeIndex,
  onSelect,
}: {
  preview: PreviewData;
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const items = getMediaWindow(preview.media, activeIndex, 5);

  if (!items.length) {
    return null;
  }

  return (
    <section className="detail-media-rail panel-card panel-card--nested detail-section--aside">
      <div className="detail-media-rail__grid">
        {items.map(({ item, index }, railIndex) => (
          <button
            key={item.id}
            type="button"
            className={`detail-media-thumb detail-media-thumb--${railIndex === 0 ? 'featured' : 'regular'}`}
            onClick={() => onSelect(index)}
            aria-label={`Voir le media ${index + 1}`}
          >
            {item.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.url} alt={item.title || 'Media secondaire'} className="detail-media-thumb__image" />
            ) : (
              <div className="detail-media-thumb__placeholder" aria-hidden="true" />
            )}
            <span className="detail-media-thumb__veil" aria-hidden="true" />
            <span className="detail-media-thumb__label">{item.title || 'Media'}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function OverviewSection({ preview }: { preview: PreviewData }) {
  const [expanded, setExpanded] = useState(false);
  const summary = preview.summary || preview.description || preview.adaptedDescription;
  const fullText = preview.description || summary;
  const alternateText =
    preview.adaptedDescription &&
      preview.adaptedDescription !== fullText &&
      preview.adaptedDescription !== summary
      ? preview.adaptedDescription
      : '';
  const canRevealFull = Boolean(summary && fullText && summary !== fullText);
  const canClamp = !canRevealFull && summary.length > 340;
  const displayedText = expanded && canRevealFull ? fullText : summary;
  const showToggle = canRevealFull || canClamp;
  const hasOverview = Boolean(summary || alternateText);

  if (!hasOverview) {
    return null;
  }

  return (
    <Section title="Description">
      <div className="detail-overview">
        <div className="detail-overview__copy">
          {displayedText && (
            <p className={`detail-overview__lead${!expanded && showToggle ? ' detail-overview__lead--clamped' : ''}`}>
              {displayedText}
            </p>
          )}
          {expanded && alternateText && <p className="detail-overview__support">{alternateText}</p>}
        </div>
        {showToggle && (
          <button
            type="button"
            className="detail-expand-button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {expanded ? 'Voir moins' : 'Lire la suite'}
          </button>
        )}
      </div>
    </Section>
  );
}

function TaxonomySection({ groups }: { groups: TaxonomyGroup[] }) {
  if (!groups.length) {
    return null;
  }

  return (
    <Section title="Labels et engagements">
      <div className="detail-taxonomy-grid">
        {groups.map((group) => (
          <div key={group.key} className="detail-taxonomy-group detail-taxonomy-group--card">
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
    <Section title="Plan d'acces" aside>
      <div className="detail-map-card">
        <div className="detail-map-card__canvas">
          <Map
            reuseMaps
            mapStyle={env.mapStyles.satellite}
            initialViewState={{
              longitude: location.longitude,
              latitude: location.latitude,
              zoom: 15,
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
        <div className="detail-map-card__body">
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

function CapacitySection({
  capacities,
}: {
  capacities: CapacityItem[];
}) {
  const stats = toCapacityStats(capacities);

  if (!stats.length) {
    return null;
  }

  return (
    <Section title="Capacite d'accueil">
      <StatStrip stats={stats} />
    </Section>
  );
}

function AmenitiesSection({ amenities }: { amenities: ParsedAmenityItem[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!amenities.length) {
    return null;
  }

  const sortedAmenities = sortAmenities(amenities);
  const featuredAmenities = sortedAmenities.filter((item) => item.iconUrl);
  const plainAmenities = sortedAmenities.filter((item) => !item.iconUrl);
  const previewFeatured = featuredAmenities.slice(0, 3);
  const previewPlain = previewFeatured.length < 3 ? plainAmenities.slice(0, 3 - previewFeatured.length) : [];
  const visibleFeatured = expanded ? featuredAmenities : previewFeatured;
  const visiblePlain = expanded ? plainAmenities : previewPlain;
  const showToggle = sortedAmenities.length > 3;

  return (
    <Section title="Equipements">
      <div className="detail-amenities">
        {visibleFeatured.length > 0 && (
          <div className="detail-feature-grid">
            {visibleFeatured.map((amenity) => (
              <div key={amenity.id} className="detail-feature-card">
                <span className="detail-feature-card__icon" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={amenity.iconUrl} alt="" />
                </span>
                <strong>{amenity.label}</strong>
              </div>
            ))}
          </div>
        )}
        {visiblePlain.length > 0 && (
          <div className="detail-chip-strip detail-chip-strip--compact">
            {visiblePlain.map((amenity) => (
              <span key={amenity.id} className="detail-chip detail-chip--soft detail-chip--equipment">
                {amenity.label}
              </span>
            ))}
          </div>
        )}
        {showToggle && (
          <button
            type="button"
            className="detail-expand-button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {expanded ? 'Voir moins' : 'Voir tous les equipements'}
          </button>
        )}
      </div>
    </Section>
  );
}

function ItineraryStatsSection({ itinerary }: { itinerary: ItinerarySummary | null }) {
  const stats = toItineraryStats(itinerary);

  if (!stats.length) {
    return null;
  }

  return (
    <Section title="Le parcours">
      <StatStrip stats={stats} />
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

function PracticalSection({ facts }: { facts: PracticalFact[] }) {
  if (!facts.length) {
    return null;
  }

  return (
    <Section title="A savoir" aside>
      <div className="detail-fact-grid">
        {facts.map((fact) => (
          <div key={`${fact.label}-${fact.value ?? fact.items?.join('-') ?? ''}`} className="detail-fact-card">
            <span className="detail-fact-label">{fact.label}</span>
            {fact.items && fact.items.length > 0 ? (
              <div className="detail-chip-strip detail-chip-strip--compact">
                {fact.items.map((item) => (
                  <span key={`${fact.label}-${item}`} className="detail-chip detail-chip--soft detail-chip--practical">
                    {item}
                  </span>
                ))}
              </div>
            ) : (
              <strong>{fact.value}</strong>
            )}
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
    <Section title="Contact" aside>
      <div className="detail-contact-list">
        <div className="detail-contact-card detail-contact-card--deck">
          {contacts.slice(0, 6).map((contact) => (
            <ContactCard key={contact.id} contact={contact} />
          ))}
        </div>
      </div>
    </Section>
  );
}

function ContactCard({ contact }: { contact: ContactItem }) {
  const Icon = getContactIcon(contact.kindCode);
  const content = (
    <>
      <span className="detail-contact-card__icon" aria-hidden="true">
        {contact.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={contact.iconUrl} alt="" className="detail-contact-card__icon-image" />
        ) : (
          <Icon size={18} />
        )}
      </span>
      <span className="detail-contact-card__value">{contact.value}</span>
    </>
  );

  if (contact.href) {
    return (
      <a
        className="detail-contact-row detail-contact-row--link"
        href={contact.href}
        target={contact.href.startsWith('http') ? '_blank' : undefined}
        rel={contact.href.startsWith('http') ? 'noreferrer' : undefined}
      >
        {content}
      </a>
    );
  }

  return <div className="detail-contact-row">{content}</div>;
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

function TeamSection({ actors }: { actors: ActorItem[] }) {
  if (!actors.length) {
    return null;
  }

  return (
    <Section title="Equipe interne" aside restricted>
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
    </Section>
  );
}

function NetworkSection({
  organizations,
  memberships,
}: {
  organizations: OrganizationItem[];
  memberships: MembershipItem[];
}) {
  if (!organizations.length && !memberships.length) {
    return null;
  }

  return (
    <Section title="Reseau" aside>
      <div className="detail-network">
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

  const notes = ([
    itinerary.practices.length > 0 ? { label: 'Pratiques', value: itinerary.practices.join(' · ') } : null,
    itinerary.info.length > 0 ? { label: 'Conseils', value: itinerary.info.join(' · ') } : null,
    itinerary.track
      ? { label: 'Trace', value: itinerary.trackFormat ? `Disponible (${itinerary.trackFormat})` : 'Disponible' }
      : null,
    itinerary.sectionsCount > 0 ? { label: 'Sections', value: String(itinerary.sectionsCount) } : null,
    itinerary.stagesCount > 0 ? { label: 'Etapes', value: String(itinerary.stagesCount) } : null,
    itinerary.profilesCount > 0 ? { label: 'Profils', value: `${itinerary.profilesCount} profil(s)` } : null,
  ] as Array<PracticalFact | null>).filter((item): item is PracticalFact => item !== null);

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
    LocationMapSection({ preview }),
    PracticalSection({ facts }),
    RelatedObjectsSection({ items: preview.relatedObjects }),
    TeamSection({ actors: canSeeActors ? preview.actors : [] }),
    NetworkSection({ organizations: preview.organizations, memberships: preview.memberships }),
  ];
}

function DetailScaffold({
  data,
  preview,
  mainSections,
  asideSections,
}: {
  data: ObjectDetail;
  preview: PreviewData;
  mainSections: ReactNode[];
  asideSections: ReactNode[];
}) {
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);

  useEffect(() => {
    setActiveMediaIndex(0);
  }, [data.id, preview.media.length]);

  const mediaRail = MediaRail({
    preview,
    activeIndex: activeMediaIndex,
    onSelect: setActiveMediaIndex,
  });
  const visibleMain = mainSections.filter(Boolean);
  const visibleAside = [mediaRail, ...asideSections].filter(Boolean);

  return (
    <div className="object-detail-view">
      <div className={`detail-layout${visibleAside.length === 0 ? ' detail-layout--single' : ''}`}>
        <div className="detail-main">
          <HeroBlock data={data} preview={preview} activeIndex={activeMediaIndex} onChange={setActiveMediaIndex} />
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
  const parsed = parseObjectDetail(raw);
  const preview = buildPreviewData(data, parsed);
  const canSeeActors = useActorVisibility(preview.organizations);
  const taxonomyGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'sustainability']);
  const practicalFacts = buildPracticalFacts(preview);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      mainSections={[
        OverviewSection({ preview }),
        TaxonomySection({ groups: taxonomyGroups }),
        CapacitySection({ capacities: preview.capacities }),
        AmenitiesSection({ amenities: preview.amenities }),
        RoomList({ rooms: preview.roomTypes }),
        MeetingRoomList({ rooms: preview.meetingRooms }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function RestaurantDetailView({ data, raw }: DetailViewProps) {
  const parsed = parseObjectDetail(raw);
  const preview = buildPreviewData(data, parsed);
  const canSeeActors = useActorVisibility(preview.organizations);
  const taxonomyGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'sustainability']);
  const practicalFacts = buildPracticalFacts(preview);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      mainSections={[
        OverviewSection({ preview }),
        TaxonomySection({ groups: taxonomyGroups }),
        CapacitySection({ capacities: preview.capacities }),
        AmenitiesSection({ amenities: preview.amenities }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function ItineraryDetailView({ data, raw }: DetailViewProps) {
  const parsed = parseObjectDetail(raw);
  const preview = buildPreviewData(data, parsed);
  const canSeeActors = useActorVisibility(preview.organizations);
  const taxonomyGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'sustainability', 'practices']);
  const practicalFacts = buildPracticalFacts(preview);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      mainSections={[
        OverviewSection({ preview }),
        ItineraryStatsSection({ itinerary: preview.itinerary }),
        TaxonomySection({ groups: taxonomyGroups }),
        ItineraryPracticalSection({ itinerary: preview.itinerary }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function ActivityDetailView({ data, raw }: DetailViewProps) {
  const parsed = parseObjectDetail(raw);
  const preview = buildPreviewData(data, parsed);
  const canSeeActors = useActorVisibility(preview.organizations);
  const taxonomyGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'sustainability']);
  const practicalFacts = buildPracticalFacts(preview);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      mainSections={[
        OverviewSection({ preview }),
        TaxonomySection({ groups: taxonomyGroups }),
        CapacitySection({ capacities: preview.capacities }),
        AmenitiesSection({ amenities: preview.amenities }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function VisitableDetailView({ data, raw }: DetailViewProps) {
  const parsed = parseObjectDetail(raw);
  const preview = buildPreviewData(data, parsed);
  const canSeeActors = useActorVisibility(preview.organizations);
  const taxonomyGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'sustainability']);
  const practicalFacts = buildPracticalFacts(preview);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      mainSections={[
        OverviewSection({ preview }),
        TaxonomySection({ groups: taxonomyGroups }),
        CapacitySection({ capacities: preview.capacities }),
        AmenitiesSection({ amenities: preview.amenities }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function NaturalSiteDetailView({ data, raw }: DetailViewProps) {
  const parsed = parseObjectDetail(raw);
  const preview = buildPreviewData(data, parsed);
  const canSeeActors = useActorVisibility(preview.organizations);
  const taxonomyGroups = pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'sustainability']);
  const practicalFacts = buildPracticalFacts(preview);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      mainSections={[
        OverviewSection({ preview }),
        TaxonomySection({ groups: taxonomyGroups }),
        CapacitySection({ capacities: preview.capacities }),
        AmenitiesSection({ amenities: preview.amenities }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function GenericDetailView({ data, raw }: DetailViewProps) {
  const parsed = parseObjectDetail(raw);
  const preview = buildPreviewData(data, parsed);
  const canSeeActors = useActorVisibility(preview.organizations);
  const practicalFacts = buildPracticalFacts(preview);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      mainSections={[
        OverviewSection({ preview }),
        TaxonomySection({ groups: pickGroups(preview.taxonomyGroups, ['labels', 'badges', 'sustainability']) }),
        CapacitySection({ capacities: preview.capacities }),
        AmenitiesSection({ amenities: preview.amenities }),
        PricingAndOpeningsSection({ prices: preview.prices, openings: preview.openings }),
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
