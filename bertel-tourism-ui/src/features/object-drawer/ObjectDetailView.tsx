import { Fragment, useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  Archive,
  Award,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  CornerDownRight,
  FileText,
  Pencil,
  Leaf,
  ExternalLink,
  Eye,
  Globe,
  Info,
  Loader2,
  Mail,
  MapPin,
  MapPinned,
  Navigation,
  Download,
  Pin,
  Phone,
  Plus,
  ShieldCheck,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { Map, Marker, NavigationControl } from 'react-map-gl/maplibre';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getMarkerImageId } from '../../config/map-markers';
import {
  useAddObjectPrivateNoteMutation,
  useDeleteObjectPrivateNoteMutation,
  useObjectPrivateNoteWriteAccessQuery,
  useUpdateObjectPrivateNoteMutation,
} from '../../hooks/useExplorerQueries';
import { DEFAULT_APP_MAP_STYLE } from '../../lib/map-style';
import {
  type PrivateNoteEntry,
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
  type LegalItem,
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
  COM: 'Commerce',
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
  privateNotes: PrivateNoteEntry[];
  /** From card / raw payload when present; drives STATUT KPI. */
  openNow: boolean | null;
}

const DRAWER_PREVIEW_ROOT_ID = 'object-drawer-preview';

export interface DetailTabItem {
  id: string;
  label: string;
  count?: number;
}

export function buildDetailTabItems(preview: PreviewData, parsed: ParsedObjectDetail): DetailTabItem[] {
  const amenitiesCount = preview.amenities.length;
  const pricingCount = preview.prices.length + preview.openings.length;
  const mediaCount = preview.media.length;
  const legalCount = parsed.internal.legalRecords.filter(
    (r) => r.isPublic && Boolean(r.label?.trim() || r.status?.trim()),
  ).length;
  const notesCount = preview.privateNotes.length;

  return [
    { id: 'detail-section-overview', label: 'Aperçu' },
    { id: 'detail-section-amenities', label: 'Équipements', count: amenitiesCount },
    { id: 'detail-section-pricing', label: 'Tarifs & horaires', count: pricingCount },
    { id: 'detail-section-hero', label: 'Médias', count: mediaCount },
    { id: 'detail-section-legal', label: 'Légal', count: legalCount },
    { id: 'detail-section-notes', label: 'Activité', count: notesCount },
  ];
}

function DetailTabs({ items }: { items: DetailTabItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');

  useEffect(() => {
    const previewRoot = document.getElementById(DRAWER_PREVIEW_ROOT_ID);
    const scrollRoot = previewRoot?.closest('.drawer__content') as HTMLElement | null;
    if (!previewRoot || !scrollRoot || items.length === 0) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting && e.target.id)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) {
          setActiveId(visible.target.id);
        }
      },
      { root: scrollRoot, rootMargin: '-38% 0px -38% 0px', threshold: [0.08, 0.15, 0.25, 0.4] },
    );

    for (const it of items) {
      const el = document.getElementById(it.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <nav className="drawer-detail-tabs" aria-label="Sections de la fiche">
      <div className="drawer-detail-tabs__inner">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn('drawer-detail-tab', activeId === item.id && 'drawer-detail-tab--active')}
            onClick={() => scrollTo(item.id)}
          >
            <span>{item.label}</span>
            {typeof item.count === 'number' && item.count > 0 ? (
              <span className="drawer-detail-tab__count">{item.count}</span>
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  );
}

interface PracticalFact {
  label: string;
  value?: string;
  items?: string[];
}

interface DistinctionGroupMeta {
  title: string;
  icon: typeof Award;
  tone: 'classifications' | 'sustainability' | 'labels' | 'badges';
  priority: number;
}

interface DistinctionHighlight {
  id: string;
  label: string;
  meta: string;
  groupTitle: string;
  icon: typeof Award;
  tone: DistinctionGroupMeta['tone'];
  priority: number;
}

interface NoteCategoryMeta {
  label: string;
  tone: 'neutral' | 'important' | 'urgent' | 'internal' | 'followup';
}

const DISTINCTION_GROUPS: Record<string, DistinctionGroupMeta> = {
  classifications: {
    title: 'Classements',
    icon: Award,
    tone: 'classifications',
    priority: 0,
  },
  sustainability: {
    title: 'Engagements durables',
    icon: Leaf,
    tone: 'sustainability',
    priority: 1,
  },
  labels: {
    title: 'Labels',
    icon: ShieldCheck,
    tone: 'labels',
    priority: 2,
  },
  badges: {
    title: 'Badges',
    icon: Tag,
    tone: 'badges',
    priority: 3,
  },
};

const NOTE_CATEGORY_META: Record<PrivateNoteEntry['category'], NoteCategoryMeta> = {
  general: { label: 'General', tone: 'neutral' },
  important: { label: 'Important', tone: 'important' },
  urgent: { label: 'Urgent', tone: 'urgent' },
  internal: { label: 'Interne', tone: 'internal' },
  followup: { label: 'Suivi', tone: 'followup' },
};

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
    privateNotes: parsed.text.privateNotes,
    openNow: typeof data.raw.open_now === 'boolean' ? data.raw.open_now : null,
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

function getContactIcon(kindCode: string, value = '') {
  const normalized = kindCode.trim().toLowerCase();
  const normalizedValue = value.trim();
  const digits = normalizedValue.replace(/[^\d]/g, '');
  const isLikelyPhone = digits.length >= 6 && /^[+()\d\s.-]+$/.test(normalizedValue);
  const isPhoneKind = ['phone', 'mobile', 'fax', 'tel', 'telephone', 'telephone_fixe', 'telephone_mobile', 'whatsapp'].includes(normalized)
    || /(^|[_-])(phone|mobile|fax|tel)([_-]|$)/.test(normalized);

  if (['email', 'mail', 'e-mail', 'courriel'].includes(normalized) || (!normalized && normalizedValue.includes('@'))) {
    return Mail;
  }
  if (isPhoneKind || (!normalized && isLikelyPhone)) {
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

function getDistinctionGroupMeta(key: string): DistinctionGroupMeta {
  return DISTINCTION_GROUPS[key] ?? DISTINCTION_GROUPS.labels;
}

function getDistinctionHighlightScore(params: {
  label: string;
  meta: string;
  groupPriority: number;
}): number {
  const haystack = `${params.label} ${params.meta}`.toLowerCase();

  if (/(tourisme\s*&?\s*handicap|handicap|pmr|accessible)/.test(haystack)) {
    return params.groupPriority - 300;
  }

  if (/(clef verte|green|durab|eco|ecolo|environ)/.test(haystack)) {
    return params.groupPriority - 200;
  }

  if (/(qualite tourisme|qualité tourisme|ecolabel|label)/.test(haystack)) {
    return params.groupPriority - 100;
  }

  return params.groupPriority;
}

function buildDistinctionHighlights(groups: TaxonomyGroup[]): DistinctionHighlight[] {
  return groups
    .flatMap((group) => {
      const meta = getDistinctionGroupMeta(group.key);

      return group.items.map((item) => ({
        id: `${group.key}-${item.id}`,
        label: item.label,
        meta: item.meta,
        groupTitle: meta.title,
        icon: meta.icon,
        tone: meta.tone,
        priority: getDistinctionHighlightScore({
          label: item.label,
          meta: item.meta,
          groupPriority: meta.priority,
        }),
      }));
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return left.label.localeCompare(right.label, 'fr', { sensitivity: 'base' });
    })
    .slice(0, 4);
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
  const childLine = preview.petPolicy?.details.find((d) => /enfant/i.test(d));
  const facts: Array<PracticalFact | null> = [
    languages?.items.length ? { label: 'Langues', items: languages.items.map((item) => item.label) } : null,
    payments?.items.length ? { label: 'Paiements', items: payments.items.map((item) => item.label) } : null,
    preview.petPolicy
      ? {
          label: 'Animaux',
          items: [preview.petPolicy.label, ...preview.petPolicy.details].filter(Boolean),
        }
      : null,
    childLine ? { label: 'Enfants', value: childLine } : null,
  ];

  return facts.filter((item): item is PracticalFact => item !== null);
}

function extractCheckInLine(openings: OpeningItem[]): string | null {
  for (const o of openings) {
    const label = o.label.toLowerCase();
    const haystack = `${label} ${o.details.join(' ')}`.toLowerCase();
    if (/(check|arriv|accueil|remise|cle|key)/.test(haystack)) {
      const slot = o.slots.filter(Boolean).join(' · ');
      if (slot) {
        return slot;
      }
      const fromDetails = o.details.filter(Boolean).join(' · ');
      if (fromDetails) {
        return fromDetails;
      }
      if (o.weekdays.length) {
        return o.weekdays.join(' · ');
      }
    }
  }
  return null;
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

function sortNotesByRecency(notes: PrivateNoteEntry[]): PrivateNoteEntry[] {
  return [...notes].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return Number(right.isPinned) - Number(left.isPinned);
    }

    const leftTime = left.createdAt ? Date.parse(left.createdAt) : Number.NaN;
    const rightTime = right.createdAt ? Date.parse(right.createdAt) : Number.NaN;

    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return left.id.localeCompare(right.id);
  });
}

function dedupeNotes(notes: PrivateNoteEntry[]): PrivateNoteEntry[] {
  const seen = new Set<string>();
  const items: PrivateNoteEntry[] = [];

  for (const note of notes) {
    const key = note.id;
    if (!note.body || seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(note);
  }

  return sortNotesByRecency(items);
}

function formatNoteDate(value: string): string {
  if (!value) {
    return '';
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(timestamp));
}

function formatNoteDateTime(value: string): string {
  if (!value) {
    return '';
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function getNoteAuthorName(note: PrivateNoteEntry): string {
  const fallback = note.createdByName || 'Equipe';
  if (!fallback.includes('@')) {
    return fallback;
  }

  const [localPart] = fallback.split('@');
  return localPart || fallback;
}

function getNoteExcerpt(note: PrivateNoteEntry): string {
  const value = note.body.trim();
  if (value.length <= 120) {
    return value;
  }
  return `${value.slice(0, 117).trimEnd()}...`;
}

function getNoteCategoryIcon(category: PrivateNoteEntry['category']) {
  switch (category) {
    case 'important':
      return Info;
    case 'urgent':
      return AlertTriangle;
    case 'internal':
      return ShieldCheck;
    case 'followup':
      return CornerDownRight;
    case 'general':
    default:
      return FileText;
  }
}

function escapeCsvValue(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return `"${normalized.replace(/"/g, '""')}"`;
}

function buildNotesCsv(notes: PrivateNoteEntry[]): string {
  const rows = [
    ['date', 'author', 'category', 'pinned', 'archived', 'note'],
    ...notes.map((note) => [
      note.createdAt,
      getNoteAuthorName(note),
      NOTE_CATEGORY_META[note.category].label,
      note.isPinned ? 'yes' : 'no',
      note.isArchived ? 'yes' : 'no',
      note.body,
    ]),
  ];

  return rows.map((row) => row.map((cell) => escapeCsvValue(cell)).join(',')).join('\n');
}

function DetailTooltip({
  content,
  children,
  block = false,
  bubbleClassName,
}: {
  content?: ReactNode;
  children: ReactNode;
  block?: boolean;
  bubbleClassName?: string;
}) {
  if (!content) {
    return <>{children}</>;
  }

  const Tag = block ? 'div' : 'span';

  return (
    <Tag className={`detail-tooltip${block ? ' detail-tooltip--block' : ''}`}>
      {children}
      <span className={`detail-tooltip__bubble${bubbleClassName ? ` ${bubbleClassName}` : ''}`} role="tooltip">
        {content}
      </span>
    </Tag>
  );
}

function NoteTooltipContent({ note }: { note: PrivateNoteEntry }) {
  const meta = [
    NOTE_CATEGORY_META[note.category].label,
    note.isPinned ? 'Epinglée' : '',
    note.isArchived ? 'Archivée' : '',
  ].filter(Boolean).join(' · ');

  return (
    <span className="detail-tooltip__stack">
      <strong>{getNoteAuthorName(note)}</strong>
      {meta && <span>{meta}</span>}
      {formatNoteDateTime(note.createdAt) && <span>{formatNoteDateTime(note.createdAt)}</span>}
      <span className="detail-tooltip__body">{note.body}</span>
    </span>
  );
}

function Section({
  title,
  kicker,
  description,
  children,
  aside = false,
  restricted = false,
  id,
  headerExtra,
}: {
  title: string;
  kicker?: string;
  description?: string;
  children: ReactNode;
  aside?: boolean;
  restricted?: boolean;
  id?: string;
  headerExtra?: ReactNode;
}) {
  return (
    <article
      id={id}
      className={cn('detail-section', aside && 'detail-section--aside')}
    >
      <div className="detail-section__header">
        <div className="detail-section__heading">
          {kicker && <span className="detail-section__eyebrow">{kicker}</span>}
          <h3 className="detail-section__title">{title}</h3>
          {description && <p className="detail-section__description">{description}</p>}
        </div>
        <div className="detail-section__header-tools">
          {headerExtra}
          {restricted && (
            <DetailTooltip content="Visible uniquement pour les utilisateurs autorises">
              <span className="detail-section__scope">
                <Eye size={14} />
              </span>
            </DetailTooltip>
          )}
        </div>
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

/** KPI row matching fiche-detail mockup (label kicker above value). */
function KpiStrip({
  stats,
  statusLine,
}: {
  stats: StatDef[];
  statusLine?: { label: string; value: string; open: boolean } | null;
}) {
  if (!stats.length && !statusLine) {
    return null;
  }

  return (
    <div className="detail-kpi-strip">
      {stats.map((stat) => {
        const valueMatch = stat.value.trim().match(/^(\S+)(?:\s+(.+))?$/);
        const num = valueMatch?.[1] ?? stat.value;
        const unit = valueMatch?.[2] ?? '';
        return (
          <div key={`${stat.label}-${stat.value}`} className="detail-kpi">
            <span className="detail-kpi__label">{stat.label}</span>
            <strong className="detail-kpi__value">
              {num}
              {unit ? <small>{unit}</small> : null}
            </strong>
          </div>
        );
      })}
      {statusLine ? (
        <div
          className={cn(
            'detail-kpi',
            'detail-kpi--status',
            statusLine.open ? 'detail-kpi--status-open' : 'detail-kpi--status-closed',
          )}
        >
          <span className="detail-kpi__label">{statusLine.label}</span>
          <strong className="detail-kpi__value">
            <span className="detail-kpi__dot" aria-hidden />
            {statusLine.value}
          </strong>
        </div>
      ) : null}
    </div>
  );
}

function HeroBlock({
  data,
  preview,
  activeIndex,
  onChange,
  onOpenGallery,
}: {
  data: ObjectDetail;
  preview: PreviewData;
  activeIndex: number;
  onChange: (index: number) => void;
  onOpenGallery: () => void;
}) {
  const totalMedia = preview.media.length;
  const mainMedia = totalMedia > 0 ? preview.media[getWrappedIndex(activeIndex, totalMedia)] : null;
  const loc = preview.location;
  const locationPill =
    loc && (loc.city || loc.lieuDit) ? [loc.city, loc.lieuDit].filter(Boolean).join(' · ') : '';

  const thumbSlots = 3;
  const thumbSlotsData: Array<{ item: MediaItem; index: number }> = [];
  if (totalMedia > 1) {
    for (let i = 0; i < thumbSlots; i++) {
      const idx = getWrappedIndex(activeIndex + 1 + i, totalMedia);
      thumbSlotsData.push({ item: preview.media[idx], index: idx });
    }
  }

  const extrasOverlay = totalMedia > 4 ? totalMedia - 4 : 0;
  const hasThumbs = thumbSlotsData.length > 0;

  const openGalleryAt = (index: number) => {
    onChange(index);
    onOpenGallery();
  };

  return (
    <section
      id="detail-section-hero"
      className={cn('detail-hero detail-hero--mosaic', !mainMedia && 'detail-hero--placeholder')}
    >
      <h1 className="sr-only">{data.name}</h1>
      <div className={cn('detail-hero__mosaic', !hasThumbs && 'detail-hero__mosaic--single')}>
        <div
          className="detail-hero__main-cell"
          role={mainMedia ? 'button' : undefined}
          tabIndex={mainMedia ? 0 : -1}
          aria-label={mainMedia ? 'Ouvrir la galerie photo' : undefined}
          onClick={() => {
            if (mainMedia) {
              onOpenGallery();
            }
          }}
          onKeyDown={(event) => {
            if (!mainMedia) {
              return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpenGallery();
            }
          }}
        >
          {mainMedia?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="detail-hero__img" src={mainMedia.url} alt={mainMedia.title || data.name} />
          ) : (
            <div className="detail-hero__placeholder-art" aria-hidden="true" />
          )}
          {locationPill ? (
            <div className="detail-hero__location-pill">
              <MapPin size={12} aria-hidden />
              <span>{locationPill}</span>
            </div>
          ) : null}
          <div className="detail-hero__veil detail-hero__veil--light" aria-hidden="true" />
          {mainMedia?.credit ? (
            <p className="detail-hero__credit detail-hero__credit--overlay">Photo {mainMedia.credit}</p>
          ) : null}
        </div>
        {thumbSlotsData.length > 0 ? (
          <div className="detail-hero__thumbs">
            {thumbSlotsData.map((slot, slotIdx) => {
              const showOverlay = slotIdx === thumbSlots - 1 && extrasOverlay > 0;
              return (
                <button
                  key={`${slot.item.id}-thumb-${slotIdx}`}
                  type="button"
                  className="detail-hero__thumb"
                  onClick={() => openGalleryAt(slot.index)}
                  aria-label={`Miniature ${slotIdx + 1} — ouvrir la photo ${slot.index + 1} dans la galerie`}
                >
                  {slot.item.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={slot.item.url} alt="" className="detail-hero__thumb-img" />
                  ) : null}
                  {showOverlay ? <span className="detail-hero__thumb-more">+{extrasOverlay}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      {totalMedia > 0 ? (
        <p className="detail-hero__media-count">{totalMedia} photos</p>
      ) : null}
      {!mainMedia && (
        <p className="detail-hero__placeholder-copy">
          Pas encore de photo principale.
        </p>
      )}
    </section>
  );
}

function GalleryLightbox({
  data,
  media,
  activeIndex,
  open,
  onOpenChange,
  onChange,
}: {
  data: ObjectDetail;
  media: MediaItem[];
  activeIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (index: number) => void;
}) {
  const total = media.length;
  const activeMedia = total > 0 ? media[getWrappedIndex(activeIndex, total)] : null;
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  if (!total || !activeMedia) {
    return null;
  }

  const goToPrevious = () => onChange(getWrappedIndex(activeIndex - 1, total));
  const goToNext = () => onChange(getWrappedIndex(activeIndex + 1, total));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="detail-gallery-dialog"
        showClose={false}
        onKeyDown={(event) => {
          if (event.defaultPrevented || total < 2 || event.altKey || event.ctrlKey || event.metaKey) {
            return;
          }

          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            goToPrevious();
            return;
          }

          if (event.key === 'ArrowRight') {
            event.preventDefault();
            goToNext();
          }
        }}
      >
        <DialogTitle className="sr-only">Galerie photo de {data.name}</DialogTitle>
        <DialogDescription className="sr-only">
          Visionneuse plein ecran des photos disponibles pour cette fiche.
        </DialogDescription>
        <div className="detail-gallery-modal">
          <button
            type="button"
            className="detail-gallery-modal__close"
            onClick={() => onOpenChange(false)}
            aria-label="Fermer la galerie"
          >
            <X size={20} />
          </button>
          <div
            className="detail-gallery-modal__frame"
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="detail-gallery-modal__image"
              src={activeMedia.url}
              alt={activeMedia.title || data.name}
            />
            {total > 1 && (
              <>
                <button
                  type="button"
                  className="detail-gallery-modal__nav detail-gallery-modal__nav--prev"
                  onClick={goToPrevious}
                  aria-label="Image precedente dans la galerie"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  className="detail-gallery-modal__nav detail-gallery-modal__nav--next"
                  onClick={goToNext}
                  aria-label="Image suivante dans la galerie"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}
          </div>
          <div className="detail-gallery-modal__footer">
            <div className="detail-gallery-modal__meta">
              <strong>{activeMedia.title || data.name}</strong>
              {activeMedia.credit && <span>Photo {activeMedia.credit}</span>}
            </div>
            {media.length > 1 && (
              <div className="detail-gallery-modal__thumbs">
                {media.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`detail-gallery-modal__thumb${index === activeIndex ? ' detail-gallery-modal__thumb--active' : ''}`}
                    onClick={() => onChange(index)}
                    aria-label={`Voir la photo ${index + 1} en grand`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt={item.title || `Photo ${index + 1}`} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OverviewSection({ preview, parsed }: { preview: PreviewData; parsed: ParsedObjectDetail }) {
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
  const showToggle = canRevealFull || canClamp;
  const hasOverview = Boolean(summary || alternateText);
  const showExtendedText = expanded && canRevealFull;

  const descriptionLanguages = useMemo(() => {
    const codes = new Set<string>();
    for (const entry of parsed.text.descriptions) {
      if (entry.language?.trim()) {
        codes.add(entry.language.trim().toUpperCase());
      }
    }
    return [...codes];
  }, [parsed.text.descriptions]);

  const versionsLink =
    descriptionLanguages.length > 1 ? (
      <button type="button" className="detail-section__link" disabled title="Bientot disponible">
        Voir versions · {descriptionLanguages.slice(0, 3).join(' / ')}
        {' '}
        &gt;
      </button>
    ) : null;

  if (!hasOverview) {
    return null;
  }

  return (
    <Section title="Description" headerExtra={versionsLink}>
      <div className="detail-overview">
        <div className="detail-overview__copy">
          {summary && (
            <p className={`detail-overview__lead${!expanded && showToggle ? ' detail-overview__lead--clamped' : ''}`}>
              {summary}
            </p>
          )}
          {showExtendedText && (
            <>
              <span className="detail-overview__separator" aria-hidden="true" />
              <p className="detail-overview__body">{fullText}</p>
            </>
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

function TeamNotesSection({
  objectId,
  notes,
}: {
  objectId: string;
  notes: PrivateNoteEntry[];
}) {
  const addNoteMutation = useAddObjectPrivateNoteMutation(objectId);
  const updateNoteMutation = useUpdateObjectPrivateNoteMutation(objectId);
  const deleteNoteMutation = useDeleteObjectPrivateNoteMutation(objectId);
  const writeAccessQuery = useObjectPrivateNoteWriteAccessQuery(objectId);
  const sessionUserName = useSessionStore((state) => state.userName);
  const sessionUserId = useSessionStore((state) => state.userId);
  const sessionRole = useSessionStore((state) => state.role);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftCategory, setDraftCategory] = useState<PrivateNoteEntry['category']>('general');
  const [draftPinned, setDraftPinned] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [createdNotes, setCreatedNotes] = useState<PrivateNoteEntry[]>([]);
  const [editedNotes, setEditedNotes] = useState<Record<string, PrivateNoteEntry>>({});
  const [deletedNoteIds, setDeletedNoteIds] = useState<Set<string>>(new Set());
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [openMenuNoteId, setOpenMenuNoteId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editCategory, setEditCategory] = useState<PrivateNoteEntry['category']>('general');
  const [editPinned, setEditPinned] = useState(false);
  const [editErrorMessage, setEditErrorMessage] = useState('');

  useEffect(() => {
    setComposerOpen(false);
    setDraft('');
    setDraftCategory('general');
    setDraftPinned(false);
    setErrorMessage('');
    setCreatedNotes([]);
    setEditedNotes({});
    setDeletedNoteIds(new Set());
    setShowAllNotes(false);
    setOpenMenuNoteId(null);
    setEditingNoteId(null);
    setEditDraft('');
    setEditCategory('general');
    setEditPinned(false);
    setEditErrorMessage('');
  }, [objectId]);

  const mergedNotes = useMemo(() => {
    const deletedIds = deletedNoteIds;
    const baseNotes = [...createdNotes, ...notes]
      .filter((note) => !deletedIds.has(note.id))
      .map((note) => editedNotes[note.id] ?? note);

    return dedupeNotes(baseNotes);
  }, [createdNotes, deletedNoteIds, editedNotes, notes]);
  const totalNoteCount = mergedNotes.length;
  const displayedNotes = showAllNotes ? mergedNotes.slice(0, 10) : mergedNotes.slice(0, 3);
  const hiddenNoteCount = Math.max(totalNoteCount - displayedNotes.length, 0);

  const hasContent = mergedNotes.length > 0;
  const canWriteNotes = writeAccessQuery.data === true;
  const noteAccessKnown = writeAccessQuery.isSuccess || writeAccessQuery.isError;

  if (noteAccessKnown && !canWriteNotes && !hasContent) {
    return null;
  }

  const canEditNote = (note: PrivateNoteEntry) =>
    note.canEdit
    || note.createdById === sessionUserId
    || sessionRole === 'super_admin'
    || sessionRole === 'owner';

  const canDeleteNote = (note: PrivateNoteEntry) =>
    note.canDelete
    || sessionRole === 'super_admin'
    || sessionRole === 'owner';

  const handleExport = () => {
    if (!mergedNotes.length || typeof window === 'undefined') {
      return;
    }

    const csv = buildNotesCsv(mergedNotes);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeObjectId = objectId.replace(/[^a-zA-Z0-9_-]+/g, '-');
    link.href = url;
    link.download = `notes-internes-${safeObjectId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const startEditingNote = (note: PrivateNoteEntry) => {
    setEditingNoteId(note.id);
    setOpenMenuNoteId(null);
    setEditDraft(note.body);
    setEditCategory(note.category);
    setEditPinned(note.isPinned);
    setEditErrorMessage('');
  };

  const cancelEditingNote = () => {
    setEditingNoteId(null);
    setEditDraft('');
    setEditCategory('general');
    setEditPinned(false);
    setEditErrorMessage('');
  };

  const handleSubmit = async () => {
    const value = draft.trim();
    if (!value) {
      return;
    }

    setErrorMessage('');

    try {
      const createdNote = await addNoteMutation.mutateAsync({
        body: value,
        category: draftCategory,
        isPinned: draftPinned,
      });
      setCreatedNotes((current) =>
        dedupeNotes([
          {
            id: createdNote.id,
            body: createdNote.body,
            audience: createdNote.audience,
            category: createdNote.category,
            isPinned: createdNote.is_pinned,
            isArchived: createdNote.is_archived,
            canEdit: true,
            canDelete: sessionRole === 'super_admin' || sessionRole === 'owner',
            language: createdNote.lang ?? '',
            createdAt: createdNote.created_at,
            updatedAt: createdNote.updated_at,
            createdById: createdNote.created_by?.id ?? sessionUserId ?? '',
            createdByName: createdNote.created_by?.display_name ?? sessionUserName ?? '',
            createdByAvatarUrl: createdNote.created_by?.avatar_url ?? '',
          },
          ...current,
        ]),
      );
      setDraft('');
      setDraftCategory('general');
      setDraftPinned(false);
      setComposerOpen(false);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Impossible d'enregistrer cette note pour le moment.";
      setErrorMessage(message);
    }
  };

  const handleSaveNote = async (note: PrivateNoteEntry) => {
    const value = editDraft.trim();
    if (!value) {
      return;
    }

    setEditErrorMessage('');

    try {
      const updatedNote = await updateNoteMutation.mutateAsync({
        noteId: note.id,
        body: value,
        category: editCategory,
        isPinned: editPinned,
        isArchived: note.isArchived,
      });

      setEditedNotes((current) => ({
        ...current,
        [note.id]: {
          ...note,
          body: updatedNote.body,
          category: updatedNote.category,
          isPinned: updatedNote.is_pinned,
          isArchived: updatedNote.is_archived,
          updatedAt: updatedNote.updated_at,
          audience: updatedNote.audience,
          canEdit: note.canEdit,
          canDelete: note.canDelete,
        },
      }));
      cancelEditingNote();
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Impossible de modifier cette note pour le moment.";
      setEditErrorMessage(message);
    }
  };

  const handleArchiveToggle = async (note: PrivateNoteEntry) => {
    setEditErrorMessage('');
    setOpenMenuNoteId(null);

    try {
      const updatedNote = await updateNoteMutation.mutateAsync({
        noteId: note.id,
        body: note.body,
        category: note.category,
        isPinned: note.isPinned,
        isArchived: !note.isArchived,
      });

      setEditedNotes((current) => ({
        ...current,
        [note.id]: {
          ...note,
          isArchived: updatedNote.is_archived,
          updatedAt: updatedNote.updated_at,
        },
      }));
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Impossible d'archiver cette note pour le moment.";
      setEditErrorMessage(message);
    }
  };

  const handleDeleteNote = async (note: PrivateNoteEntry) => {
    if (typeof window !== 'undefined' && !window.confirm('Supprimer cette note interne ?')) {
      return;
    }

    setEditErrorMessage('');
    setOpenMenuNoteId(null);

    try {
      await deleteNoteMutation.mutateAsync(note.id);
      setDeletedNoteIds((current) => new Set([...current, note.id]));
      setEditedNotes((current) => {
        if (!(note.id in current)) {
          return current;
        }

        const next = { ...current };
        delete next[note.id];
        return next;
      });
      if (editingNoteId === note.id) {
        cancelEditingNote();
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Impossible de supprimer cette note pour le moment.";
      setEditErrorMessage(message);
    }
  };

  return (
    <Section id="detail-section-notes" title="Informations equipe" restricted>
      <div className="detail-team-notes">
        {!noteAccessKnown && !hasContent ? (
          <span className="detail-team-notes__hint">Chargement des notes internes...</span>
        ) : null}
        {hasContent ? (
          <>
            <div className="detail-team-notes__toolbar">
              {totalNoteCount > 3 ? (
                <button
                  type="button"
                  className="detail-team-notes__utility"
                  onClick={() => setShowAllNotes((value) => !value)}
                >
                  {showAllNotes ? 'Voir moins' : `Voir plus (${hiddenNoteCount})`}
                </button>
              ) : <span />}
            </div>
            <div className="detail-team-notes__list">
              {displayedNotes.map((note) => (
              <article
                key={`${note.id}-${note.createdAt}`}
                className={`detail-team-note${note.isArchived ? ' detail-team-note--archived' : ''}${openMenuNoteId === note.id ? ' detail-team-note--menu-open' : ''}`}
              >
                <DetailTooltip content={<NoteTooltipContent note={note} />} block bubbleClassName="detail-tooltip__bubble--note">
                  <div className="detail-team-note__row">
                    <span
                      className={`detail-team-note__avatar detail-team-note__avatar--${NOTE_CATEGORY_META[note.category].tone}`}
                      aria-hidden="true"
                    >
                      {(() => {
                        const NoteIcon = getNoteCategoryIcon(note.category);
                        return <NoteIcon size={14} />;
                      })()}
                    </span>
                    <p className="detail-team-note__line">
                      {note.isPinned && (
                        <DetailTooltip content="Note epinglee">
                          <span className="detail-team-note__pin">
                            <Pin size={10} />
                          </span>
                        </DetailTooltip>
                      )}
                      {formatNoteDate(note.createdAt) && (
                        <time className="detail-team-note__date" dateTime={note.createdAt}>
                          {formatNoteDate(note.createdAt)}
                        </time>
                      )}
                      <span className="detail-team-note__separator" aria-hidden="true">-</span>
                      <span>{getNoteExcerpt(note)}</span>
                    </p>
                    {(canEditNote(note) || canDeleteNote(note)) && (
                      <div className="detail-team-note__menu-shell">
                        <button
                          type="button"
                          className="detail-team-note__menu-trigger"
                          aria-label="Actions de la note"
                          aria-expanded={openMenuNoteId === note.id}
                          onClick={() => setOpenMenuNoteId((current) => (current === note.id ? null : note.id))}
                        >
                          ...
                        </button>
                        {openMenuNoteId === note.id && (
                          <div className="detail-team-note__menu">
                            {canEditNote(note) && (
                              <button
                                type="button"
                                className="detail-team-note__menu-item"
                                onClick={() => startEditingNote(note)}
                              >
                                <Pencil size={14} />
                                Modifier
                              </button>
                            )}
                            {canEditNote(note) && (
                              <button
                                type="button"
                                className="detail-team-note__menu-item"
                                onClick={() => handleArchiveToggle(note)}
                              >
                                <Archive size={14} />
                                {note.isArchived ? 'Restaurer' : 'Archiver'}
                              </button>
                            )}
                            {canDeleteNote(note) && (
                              <button
                                type="button"
                                className="detail-team-note__menu-item detail-team-note__menu-item--danger"
                                onClick={() => handleDeleteNote(note)}
                                disabled={deleteNoteMutation.isPending}
                              >
                                {deleteNoteMutation.isPending ? (
                                  <Loader2 size={14} className="detail-team-notes__spinner" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                                Supprimer
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </DetailTooltip>
                {editingNoteId === note.id && (
                  <div className="detail-team-note__content">
                    <div className="detail-team-note__editor">
                      <div className="detail-team-notes__controls">
                        <select
                          className="detail-team-notes__select"
                          value={editCategory}
                          onChange={(event) => setEditCategory(event.target.value as PrivateNoteEntry['category'])}
                          aria-label="Importance de la note"
                        >
                          {Object.entries(NOTE_CATEGORY_META).map(([key, meta]) => (
                            <option key={key} value={key}>
                              {meta.label}
                            </option>
                          ))}
                        </select>
                        <label className="detail-team-notes__checkbox">
                          <input
                            type="checkbox"
                            checked={editPinned}
                            onChange={(event) => setEditPinned(event.target.checked)}
                          />
                          <span>Epingler</span>
                        </label>
                      </div>
                      <textarea
                        className="detail-team-notes__input detail-team-notes__input--compact"
                        value={editDraft}
                        onChange={(event) => {
                          setEditDraft(event.target.value);
                          if (editErrorMessage) {
                            setEditErrorMessage('');
                          }
                        }}
                        rows={4}
                        placeholder="Modifier cette note interne."
                      />
                      {editErrorMessage && <p className="detail-team-notes__error">{editErrorMessage}</p>}
                      <div className="detail-team-note__actions">
                        <button
                          type="button"
                          className="detail-team-notes__utility"
                          onClick={cancelEditingNote}
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          className="detail-team-notes__utility detail-team-notes__utility--primary"
                          onClick={() => handleSaveNote(note)}
                          disabled={!editDraft.trim() || updateNoteMutation.isPending}
                        >
                          {updateNoteMutation.isPending && editingNoteId === note.id ? (
                            <Loader2 size={14} className="detail-team-notes__spinner" />
                          ) : (
                            <Pencil size={14} />
                          )}
                          Enregistrer
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
              ))}
            </div>
            {showAllNotes && totalNoteCount > 10 && (
              <p className="detail-team-notes__hint">10 notes les plus recentes affichees.</p>
            )}
            {editErrorMessage && !editingNoteId && (
              <p className="detail-team-notes__error">{editErrorMessage}</p>
            )}
          </>
        ) : noteAccessKnown ? (
          <p className="detail-team-notes__empty">Aucune information interne pour le moment.</p>
        ) : null}

        <div className="detail-team-notes__composer">
          {composerOpen && canWriteNotes ? (
            <div className="detail-team-notes__editor">
              <div className="detail-team-notes__controls">
                <select
                  className="detail-team-notes__select"
                  value={draftCategory}
                  onChange={(event) => setDraftCategory(event.target.value as PrivateNoteEntry['category'])}
                  aria-label="Importance de la note"
                >
                  {Object.entries(NOTE_CATEGORY_META).map(([key, meta]) => (
                    <option key={key} value={key}>
                      {meta.label}
                    </option>
                  ))}
                </select>
                <label className="detail-team-notes__checkbox">
                  <input
                    type="checkbox"
                    checked={draftPinned}
                    onChange={(event) => setDraftPinned(event.target.checked)}
                  />
                  <span>Epingler</span>
                </label>
              </div>
              <textarea
                className="detail-team-notes__input"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (errorMessage) {
                    setErrorMessage('');
                  }
                }}
                placeholder="Ajouter une information utile pour l'equipe."
                rows={4}
              />
              {errorMessage && <p className="detail-team-notes__error">{errorMessage}</p>}
              <div className="detail-team-notes__actions">
                <button
                  type="button"
                  className="detail-team-notes__button detail-team-notes__button--ghost"
                  onClick={() => {
                    setComposerOpen(false);
                    setDraft('');
                    setErrorMessage('');
                  }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="detail-team-notes__button detail-team-notes__button--primary"
                  onClick={handleSubmit}
                  disabled={!draft.trim() || addNoteMutation.isPending}
                >
                  {addNoteMutation.isPending ? (
                    <Loader2 size={16} className="detail-team-notes__spinner" />
                  ) : (
                    <Plus size={16} />
                  )}
                  Enregistrer
                </button>
              </div>
            </div>
          ) : canWriteNotes ? (
            <div className="detail-team-notes__footer">
              <button
                type="button"
                className="detail-team-notes__button detail-team-notes__button--inline"
                onClick={() => setComposerOpen(true)}
              >
                <Plus size={16} />
                Ajouter une note
              </button>
              {hasContent && (
                <DetailTooltip content="Exporter les notes">
                  <button
                    type="button"
                    className="detail-team-notes__utility detail-team-notes__utility--icon"
                    onClick={handleExport}
                    aria-label="Exporter les notes"
                  >
                    <Download size={15} />
                  </button>
                </DetailTooltip>
              )}
            </div>
          ) : hasContent ? (
            <div className="detail-team-notes__footer detail-team-notes__footer--end">
              <DetailTooltip content="Exporter les notes">
                <button
                  type="button"
                  className="detail-team-notes__utility detail-team-notes__utility--icon"
                  onClick={handleExport}
                  aria-label="Exporter les notes"
                >
                  <Download size={15} />
                </button>
              </DetailTooltip>
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

function TaxonomySection({ groups }: { groups: TaxonomyGroup[] }) {
  if (!groups.length) {
    return null;
  }

  const sortedGroups = [...groups].sort((left, right) => {
    const leftPriority = getDistinctionGroupMeta(left.key).priority;
    const rightPriority = getDistinctionGroupMeta(right.key).priority;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.title.localeCompare(right.title, 'fr', { sensitivity: 'base' });
  });
  const highlights = buildDistinctionHighlights(sortedGroups);
  const highlightedIds = new Set(highlights.map((h) => h.id));

  // Items already shown in highlights are excluded from the grid chips to avoid duplication.
  const remainingGroups = sortedGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !highlightedIds.has(`${group.key}-${item.id}`)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Section title="Distinctions">
      {highlights.length > 0 && (
        <div className="detail-distinction-highlights">
          {highlights.map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.id} className={`detail-distinction-highlight detail-distinction-highlight--${item.tone}`}>
                <span className="detail-distinction-highlight__icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <div className="detail-distinction-highlight__copy">
                  <span className="detail-distinction-highlight__kicker">{item.groupTitle}</span>
                  <strong>{item.label}</strong>
                  {item.meta && <small>{item.meta}</small>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {remainingGroups.length > 0 && (
        <div className="detail-taxonomy-grid detail-taxonomy-grid--distinctions">
          {remainingGroups.map((group) => {
            const meta = getDistinctionGroupMeta(group.key);
            const Icon = meta.icon;

            return (
              <div key={group.key} className={`detail-taxonomy-group detail-taxonomy-group--card detail-taxonomy-group--${meta.tone}`}>
                <div className="detail-taxonomy-group__header">
                  <span className={`detail-taxonomy-group__icon detail-taxonomy-group__icon--${meta.tone}`} aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <span className="detail-taxonomy-group__title">{meta.title}</span>
                </div>
                <div className="detail-chip-strip">
                  {group.items.map((item) => {
                    const chip = (
                      <span key={item.id} className={`detail-chip detail-chip--distinction detail-chip--distinction-${meta.tone}`}>
                        {item.label}
                      </span>
                    );

                    if (!item.meta) {
                      return chip;
                    }

                    return (
                      <DetailTooltip key={item.id} content={item.meta}>
                        {chip}
                      </DetailTooltip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function organizationInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) {
    return '?';
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function networkRolePillLabel(linkType: string): string {
  const t = linkType.trim().toLowerCase();
  if (!t) {
    return 'PARTENAIRE';
  }
  if (/(publisher|publicateur|éditeur|edit|oti|diffuseur)/.test(t)) {
    return 'PUBLISHER';
  }
  if (/(partner|partenaire)/.test(t)) {
    return 'PARTENAIRE';
  }
  return 'PARTENAIRE';
}

function LegalSection({ records }: { records: LegalItem[] }) {
  const publicRecords = records.filter((r) => r.isPublic && Boolean(r.label?.trim() || r.status?.trim()));
  if (!publicRecords.length) {
    return null;
  }

  return (
    <Section id="detail-section-legal" title="Mentions legales">
      <ul className="detail-legal-list">
        {publicRecords.map((record, index) => {
          const meta = [
            record.status,
            record.daysUntilExpiry && record.daysUntilExpiry !== 'n/a' ? `valide jusqu'au ${record.daysUntilExpiry}` : '',
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <li key={`${record.label}-${index}`} className="detail-legal-list__row">
              <div className="detail-legal-list__main">
                <strong>{record.label}</strong>
                {meta ? <span className="detail-legal-list__meta">{meta}</span> : null}
              </div>
              {record.documentId && record.documentId !== 'non fourni' ? (
                <span className="detail-legal-list__doc">{record.documentId}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function LocationMapSection({ preview }: { preview: PreviewData }) {
  const location = preview.location;

  if (!location || location.latitude == null || location.longitude == null) {
    return null;
  }

  const markerSrc = `/markers/${getMarkerImageId(preview.typeCode)}.png`;
  const mapsHref = getGoogleMapsSearchUrl(location);
  const addressLine = [location.address, location.lieuDit, [location.postcode, location.city].filter(Boolean).join(' ')]
    .filter((part) => Boolean(part?.trim()))
    .join(', ')
    || location.label;
  const coords =
    location.latitude != null && location.longitude != null
      ? `${location.latitude}, ${location.longitude}`
      : '';

  return (
    <Section
      title="Plan d'acces"
      aside
      headerExtra={(
        <a className="detail-section__link" href={mapsHref} target="_blank" rel="noreferrer">
          Ouvrir &gt;
        </a>
      )}
    >
      <div className="detail-map-card detail-map-card--compact">
        <div className="detail-map-card__canvas detail-map-card__canvas--short">
          <Map
            reuseMaps
            mapStyle={DEFAULT_APP_MAP_STYLE}
            initialViewState={{
              longitude: location.longitude,
              latitude: location.latitude,
              zoom: 15,
            }}
            attributionControl={false}
            scrollZoom
            dragPan
            dragRotate={false}
            doubleClickZoom
            touchZoomRotate
            keyboard
            style={{ width: '100%', height: '100%' }}
          >
            <Marker longitude={location.longitude} latitude={location.latitude} anchor="bottom">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="detail-map-pin" src={markerSrc} alt="" aria-hidden="true" />
            </Marker>
            <NavigationControl position="bottom-right" showCompass={false} visualizePitch={false} />
          </Map>
        </div>
        <div className="detail-map-card__body detail-map-card__body--stacked">
          <div className="detail-map-card__address detail-map-card__address--muted">
            <p className="detail-map-card__address-line">{addressLine}</p>
            {coords ? <small className="detail-map-card__coords">{coords}</small> : null}
          </div>
          <div className="detail-map-card__actions detail-map-card__actions--row">
            <a
              className="detail-map-link"
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              aria-label="Ouvrir dans Google Maps"
            >
              <MapPinned size={16} />
              Google Maps
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
  openNow,
}: {
  capacities: CapacityItem[];
  openNow?: boolean | null;
}) {
  const stats = toCapacityStats(capacities);
  const statusLine =
    openNow === true ? { label: 'STATUT', value: 'Ouvert', open: true }
    : openNow === false ? { label: 'STATUT', value: 'Ferme', open: false }
    : null;
  const statusSlots = statusLine ? 1 : 0;
  const cappedStats = stats.slice(0, Math.max(0, 4 - statusSlots));

  if (!cappedStats.length && !statusLine) {
    return null;
  }

  return <KpiStrip stats={cappedStats} statusLine={statusLine} />;
}

function AmenitiesSection({
  amenities,
  environmentGroup,
}: {
  amenities: ParsedAmenityItem[];
  environmentGroup: TaxonomyGroup | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasEnvironment = Boolean(environmentGroup?.items.length);
  if (!amenities.length && !hasEnvironment) {
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
    <Section id="detail-section-amenities" title="Equipements">
      {amenities.length > 0 ? (
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
      ) : null}
      {hasEnvironment ? (
        <div className="detail-cadre-env">
          <h4 className="detail-cadre-env__title">Cadre & environnement</h4>
          <div className="detail-chip-strip detail-chip-strip--compact">
            {environmentGroup!.items.map((item) => (
              <span key={item.id} className="detail-chip detail-chip--soft detail-chip--practical">
                {item.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
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
      <KpiStrip stats={stats.slice(0, 4)} />
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
  sectionId,
}: {
  prices: PriceItem[];
  openings: OpeningItem[];
  sectionId?: string;
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
    <Section id={sectionId} title={title}>
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

function PracticalSection({ facts, openings }: { facts: PracticalFact[]; openings: OpeningItem[] }) {
  const checkIn = extractCheckInLine(openings);
  const rows: PracticalFact[] = checkIn ? [...facts, { label: 'Check-in', value: checkIn }] : facts;

  if (!rows.length) {
    return null;
  }

  return (
    <Section title="A savoir" aside>
      <table className="detail-practical-table">
        <tbody>
          {rows.map((fact) => (
            <tr key={`${fact.label}-${fact.value ?? fact.items?.join('-') ?? ''}`}>
              <th scope="row" className="detail-practical-table__label">
                {fact.label}
              </th>
              <td className="detail-practical-table__value">
                {fact.items && fact.items.length > 0 ? (
                  <span>{fact.items.join(' · ')}</span>
                ) : (
                  <span>{fact.value}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const [copied, setCopied] = useState(false);
  const Icon = getContactIcon(contact.kindCode, contact.value);

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(contact.value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1000);
    } catch {
      /* clipboard may be denied */
    }
  };

  const body = (
    <span className="detail-contact-row__link-body">
      <span className="detail-contact-card__icon" aria-hidden="true">
        {contact.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={contact.iconUrl} alt="" className="detail-contact-card__icon-image" />
        ) : (
          <Icon size={18} />
        )}
      </span>
      <span className="detail-contact-card__value">{contact.value}</span>
    </span>
  );

  const copyButton = (
    <button type="button" className="detail-contact-row__copy" onClick={handleCopy} aria-label="Copier dans le presse-papiers">
      {copied ? <Check size={16} strokeWidth={2.5} /> : <Copy size={16} strokeWidth={2} />}
    </button>
  );

  if (contact.href) {
    return (
      <div className="detail-contact-row detail-contact-row--with-copy">
        <a
          className="detail-contact-row__link-body detail-contact-row--link"
          href={contact.href}
          target={contact.href.startsWith('http') ? '_blank' : undefined}
          rel={contact.href.startsWith('http') ? 'noreferrer' : undefined}
        >
          <span className="detail-contact-card__icon" aria-hidden="true">
            {contact.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={contact.iconUrl} alt="" className="detail-contact-card__icon-image" />
            ) : (
              <Icon size={18} />
            )}
          </span>
          <span className="detail-contact-card__value">{contact.value}</span>
        </a>
        {copyButton}
      </div>
    );
  }

  return (
    <div className="detail-contact-row detail-contact-row--with-copy">
      {body}
      {copyButton}
    </div>
  );
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
            <div className="detail-network__list">
              {organizations.slice(0, 5).map((organization) => (
                <div key={organization.id} className="detail-network__card">
                  <div className="detail-network__avatar" aria-hidden>
                    {organizationInitials(organization.name)}
                  </div>
                  <div className="detail-network__text">
                    <strong className="detail-network__name">{organization.name}</strong>
                    <span className="detail-network__subtitle">
                      {organization.linkType || organization.contacts[0] || organization.note || ''}
                    </span>
                  </div>
                  <span className="detail-network__pill">{networkRolePillLabel(organization.linkType)}</span>
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
    LocationMapSection({ preview }),
    ContactSection({ contacts: preview.contacts }),
    PracticalSection({ facts, openings: preview.openings }),
    RelatedObjectsSection({ items: preview.relatedObjects }),
    TeamSection({ actors: canSeeActors ? preview.actors : [] }),
    NetworkSection({ organizations: preview.organizations, memberships: preview.memberships }),
  ];
}

function ApercuRegion({ children }: { children: ReactNode }) {
  return (
    <div id="detail-section-overview" className="detail-apercu-region">
      {children}
    </div>
  );
}

function DetailScaffold({
  data,
  preview,
  tabItems,
  mainSections,
  asideSections,
}: {
  data: ObjectDetail;
  preview: PreviewData;
  tabItems: DetailTabItem[];
  mainSections: ReactNode[];
  asideSections: ReactNode[];
}) {
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    setActiveMediaIndex(0);
    setLightboxOpen(false);
  }, [data.id, preview.media.length]);

  const visibleMain = mainSections.filter(Boolean);
  const visibleAside = asideSections.filter(Boolean);

  return (
    <div className="object-detail-view">
      <GalleryLightbox
        data={data}
        media={preview.media}
        activeIndex={activeMediaIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onChange={setActiveMediaIndex}
      />
      <DetailTabs items={tabItems} />
      <div className={`detail-layout${visibleAside.length === 0 ? ' detail-layout--single' : ''}`}>
        <div className="detail-main">
          <HeroBlock
            data={data}
            preview={preview}
            activeIndex={activeMediaIndex}
            onChange={setActiveMediaIndex}
            onOpenGallery={() => setLightboxOpen(true)}
          />
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
  const parsed = useMemo(() => parseObjectDetail(raw), [raw]);
  const preview = useMemo(() => buildPreviewData(data, parsed), [data, parsed]);
  const tabItems = useMemo(() => buildDetailTabItems(preview, parsed), [preview, parsed]);
  const canSeeActors = useActorVisibility(preview.organizations);
  const taxonomyGroups = useMemo(
    () => pickGroups(preview.taxonomyGroups, ['classifications', 'labels', 'badges', 'sustainability']),
    [preview.taxonomyGroups],
  );
  const practicalFacts = useMemo(() => buildPracticalFacts(preview), [preview]);
  const environmentGroup = useMemo(() => getGroup(preview.taxonomyGroups, 'environment'), [preview.taxonomyGroups]);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      tabItems={tabItems}
      mainSections={[
        <ApercuRegion key="apercu">
          <CapacitySection capacities={preview.capacities} openNow={preview.openNow} />
          <OverviewSection preview={preview} parsed={parsed} />
          <TaxonomySection groups={taxonomyGroups} />
        </ApercuRegion>,
        <AmenitiesSection key="amenities" amenities={preview.amenities} environmentGroup={environmentGroup} />,
        <RoomList key="rooms" rooms={preview.roomTypes} />,
        <MeetingRoomList key="meetings" rooms={preview.meetingRooms} />,
        <PricingAndOpeningsSection
          key="pricing"
          prices={preview.prices}
          openings={preview.openings}
          sectionId="detail-section-pricing"
        />,
        <LegalSection key="legal" records={parsed.internal.legalRecords} />,
        <TeamNotesSection key="notes" objectId={data.id} notes={preview.privateNotes} />,
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function RestaurantDetailView({ data, raw }: DetailViewProps) {
  const parsed = useMemo(() => parseObjectDetail(raw), [raw]);
  const preview = useMemo(() => buildPreviewData(data, parsed), [data, parsed]);
  const tabItems = useMemo(() => buildDetailTabItems(preview, parsed), [preview, parsed]);
  const canSeeActors = useActorVisibility(preview.organizations);
  const taxonomyGroups = useMemo(
    () => pickGroups(preview.taxonomyGroups, ['classifications', 'labels', 'badges', 'sustainability']),
    [preview.taxonomyGroups],
  );
  const practicalFacts = useMemo(() => buildPracticalFacts(preview), [preview]);
  const environmentGroup = useMemo(() => getGroup(preview.taxonomyGroups, 'environment'), [preview.taxonomyGroups]);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      tabItems={tabItems}
      mainSections={[
        <ApercuRegion key="apercu">
          <CapacitySection capacities={preview.capacities} openNow={preview.openNow} />
          <OverviewSection preview={preview} parsed={parsed} />
          <TaxonomySection groups={taxonomyGroups} />
        </ApercuRegion>,
        <AmenitiesSection key="amenities" amenities={preview.amenities} environmentGroup={environmentGroup} />,
        <PricingAndOpeningsSection
          key="pricing"
          prices={preview.prices}
          openings={preview.openings}
          sectionId="detail-section-pricing"
        />,
        <LegalSection key="legal" records={parsed.internal.legalRecords} />,
        <TeamNotesSection key="notes" objectId={data.id} notes={preview.privateNotes} />,
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function ItineraryDetailView({ data, raw }: DetailViewProps) {
  const parsed = useMemo(() => parseObjectDetail(raw), [raw]);
  const preview = useMemo(() => buildPreviewData(data, parsed), [data, parsed]);
  const tabItems = useMemo(() => buildDetailTabItems(preview, parsed), [preview, parsed]);
  const canSeeActors = useActorVisibility(preview.organizations);
  const taxonomyGroups = useMemo(
    () => pickGroups(preview.taxonomyGroups, ['classifications', 'labels', 'badges', 'sustainability']),
    [preview.taxonomyGroups],
  );
  const practicalFacts = useMemo(() => buildPracticalFacts(preview), [preview]);
  const environmentGroup = useMemo(() => getGroup(preview.taxonomyGroups, 'environment'), [preview.taxonomyGroups]);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      tabItems={tabItems}
      mainSections={[
        <ApercuRegion key="apercu">
          <ItineraryStatsSection itinerary={preview.itinerary} />
          <OverviewSection preview={preview} parsed={parsed} />
          <TaxonomySection groups={taxonomyGroups} />
        </ApercuRegion>,
        <ItineraryPracticalSection key="iti-practical" itinerary={preview.itinerary} />,
        <AmenitiesSection key="amenities" amenities={preview.amenities} environmentGroup={environmentGroup} />,
        <PricingAndOpeningsSection
          key="pricing"
          prices={preview.prices}
          openings={preview.openings}
          sectionId="detail-section-pricing"
        />,
        <LegalSection key="legal" records={parsed.internal.legalRecords} />,
        <TeamNotesSection key="notes" objectId={data.id} notes={preview.privateNotes} />,
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function ActivityDetailView({ data, raw }: DetailViewProps) {
  const parsed = useMemo(() => parseObjectDetail(raw), [raw]);
  const preview = useMemo(() => buildPreviewData(data, parsed), [data, parsed]);
  const tabItems = useMemo(() => buildDetailTabItems(preview, parsed), [preview, parsed]);
  const canSeeActors = useActorVisibility(preview.organizations);
  const taxonomyGroups = useMemo(
    () => pickGroups(preview.taxonomyGroups, ['classifications', 'labels', 'badges', 'sustainability']),
    [preview.taxonomyGroups],
  );
  const practicalFacts = useMemo(() => buildPracticalFacts(preview), [preview]);
  const environmentGroup = useMemo(() => getGroup(preview.taxonomyGroups, 'environment'), [preview.taxonomyGroups]);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      tabItems={tabItems}
      mainSections={[
        <ApercuRegion key="apercu">
          <CapacitySection capacities={preview.capacities} openNow={preview.openNow} />
          <OverviewSection preview={preview} parsed={parsed} />
          <TaxonomySection groups={taxonomyGroups} />
        </ApercuRegion>,
        <AmenitiesSection key="amenities" amenities={preview.amenities} environmentGroup={environmentGroup} />,
        <PricingAndOpeningsSection
          key="pricing"
          prices={preview.prices}
          openings={preview.openings}
          sectionId="detail-section-pricing"
        />,
        <LegalSection key="legal" records={parsed.internal.legalRecords} />,
        <TeamNotesSection key="notes" objectId={data.id} notes={preview.privateNotes} />,
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function VisitableDetailView({ data, raw }: DetailViewProps) {
  const parsed = useMemo(() => parseObjectDetail(raw), [raw]);
  const preview = useMemo(() => buildPreviewData(data, parsed), [data, parsed]);
  const tabItems = useMemo(() => buildDetailTabItems(preview, parsed), [preview, parsed]);
  const canSeeActors = useActorVisibility(preview.organizations);
  const taxonomyGroups = useMemo(
    () => pickGroups(preview.taxonomyGroups, ['classifications', 'labels', 'badges', 'sustainability']),
    [preview.taxonomyGroups],
  );
  const practicalFacts = useMemo(() => buildPracticalFacts(preview), [preview]);
  const environmentGroup = useMemo(() => getGroup(preview.taxonomyGroups, 'environment'), [preview.taxonomyGroups]);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      tabItems={tabItems}
      mainSections={[
        <ApercuRegion key="apercu">
          <CapacitySection capacities={preview.capacities} openNow={preview.openNow} />
          <OverviewSection preview={preview} parsed={parsed} />
          <TaxonomySection groups={taxonomyGroups} />
        </ApercuRegion>,
        <AmenitiesSection key="amenities" amenities={preview.amenities} environmentGroup={environmentGroup} />,
        <PricingAndOpeningsSection
          key="pricing"
          prices={preview.prices}
          openings={preview.openings}
          sectionId="detail-section-pricing"
        />,
        <LegalSection key="legal" records={parsed.internal.legalRecords} />,
        <TeamNotesSection key="notes" objectId={data.id} notes={preview.privateNotes} />,
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function NaturalSiteDetailView({ data, raw }: DetailViewProps) {
  const parsed = useMemo(() => parseObjectDetail(raw), [raw]);
  const preview = useMemo(() => buildPreviewData(data, parsed), [data, parsed]);
  const tabItems = useMemo(() => buildDetailTabItems(preview, parsed), [preview, parsed]);
  const canSeeActors = useActorVisibility(preview.organizations);
  const taxonomyGroups = useMemo(
    () => pickGroups(preview.taxonomyGroups, ['classifications', 'labels', 'badges', 'sustainability']),
    [preview.taxonomyGroups],
  );
  const practicalFacts = useMemo(() => buildPracticalFacts(preview), [preview]);
  const environmentGroup = useMemo(() => getGroup(preview.taxonomyGroups, 'environment'), [preview.taxonomyGroups]);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      tabItems={tabItems}
      mainSections={[
        <ApercuRegion key="apercu">
          <CapacitySection capacities={preview.capacities} openNow={preview.openNow} />
          <OverviewSection preview={preview} parsed={parsed} />
          <TaxonomySection groups={taxonomyGroups} />
        </ApercuRegion>,
        <AmenitiesSection key="amenities" amenities={preview.amenities} environmentGroup={environmentGroup} />,
        <PricingAndOpeningsSection
          key="pricing"
          prices={preview.prices}
          openings={preview.openings}
          sectionId="detail-section-pricing"
        />,
        <LegalSection key="legal" records={parsed.internal.legalRecords} />,
        <TeamNotesSection key="notes" objectId={data.id} notes={preview.privateNotes} />,
      ]}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

function GenericDetailView({ data, raw }: DetailViewProps) {
  const parsed = useMemo(() => parseObjectDetail(raw), [raw]);
  const preview = useMemo(() => buildPreviewData(data, parsed), [data, parsed]);
  const tabItems = useMemo(() => buildDetailTabItems(preview, parsed), [preview, parsed]);
  const canSeeActors = useActorVisibility(preview.organizations);
  const taxonomyGroups = useMemo(
    () => pickGroups(preview.taxonomyGroups, ['classifications', 'labels', 'badges', 'sustainability']),
    [preview.taxonomyGroups],
  );
  const practicalFacts = useMemo(() => buildPracticalFacts(preview), [preview]);
  const environmentGroup = useMemo(() => getGroup(preview.taxonomyGroups, 'environment'), [preview.taxonomyGroups]);

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      tabItems={tabItems}
      mainSections={[
        <ApercuRegion key="apercu">
          <CapacitySection capacities={preview.capacities} openNow={preview.openNow} />
          <OverviewSection preview={preview} parsed={parsed} />
          <TaxonomySection groups={taxonomyGroups} />
        </ApercuRegion>,
        <AmenitiesSection key="amenities" amenities={preview.amenities} environmentGroup={environmentGroup} />,
        <PricingAndOpeningsSection
          key="pricing"
          prices={preview.prices}
          openings={preview.openings}
          sectionId="detail-section-pricing"
        />,
        <LegalSection key="legal" records={parsed.internal.legalRecords} />,
        <TeamNotesSection key="notes" objectId={data.id} notes={preview.privateNotes} />,
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
