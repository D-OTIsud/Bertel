import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  Archive,
  Award,
  CalendarDays,
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
import { buildEventDisplayData, type EventDateRange, type EventDisplayData } from './event-occurrences';
import { buildRestaurantMenuData } from './restaurant-menu';
import { buildItineraryStages, type ItineraryStageRow } from './itinerary-stages';
import { buildActivityFacts } from './activity-facts';
import { MarkdownContent } from '../../components/markdown/MarkdownContent';
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
import { getObjectItineraryGpx } from '../../services/rpc';
import type { ObjectDetail } from '../../types/domain';
import {
  getNoteAuthorDisplayName,
  getNoteAuthorEmail,
  getNoteAuthorFullName,
  getNoteAuthorShortLabel,
} from './note-author-display';
import {
  type ActorItem,
  type CapacityItem,
  type ContactItem,
  type ItineraryProfilePoint,
  type ItinerarySummary,
  type MediaItem,
  type LegalItem,
  type MembershipItem,
  type MeetingRoomItem,
  type OpeningItem,
  getOpeningYearTimelineSegment,
  type OrganizationItem,
  parseWebChannels,
  type PetPolicyItem,
  type GroupPolicyItem,
  type PriceItem,
  type RelatedObjectItem,
  type RoomTypeItem,
  type TaxonomyGroup,
  type TaxonomyItem,
} from './utils';
import { measureAmenitiesLineClamp } from './amenities-line-clamp';
import { getArchetypeMeta, TYPE_LABEL, type ArchetypeMeta, type ArchetypeCode } from '../object-editor/archetypes';

// §48: FMA is no longer rendered as an itinerary — events fall through to GenericDetailView
// (no trail/GPX panels); the editor gives them BlockFMA (object_fma dates/occurrences).

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
  /** Raw Markdown siblings of the three rendered fields; '' when the field has no `*_md`. */
  summaryMd: string;
  descriptionMd: string;
  adaptedDescriptionMd: string;
  location: DetailLocation | null;
  amenities: ParsedAmenityItem[];
  capacities: CapacityItem[];
  media: MediaItem[];
  prices: PriceItem[];
  openings: OpeningItem[];
  contacts: ContactItem[];
  webChannels: ContactItem[];
  actors: ActorItem[];
  organizations: OrganizationItem[];
  memberships: MembershipItem[];
  roomTypes: RoomTypeItem[];
  meetingRooms: MeetingRoomItem[];
  taxonomyGroups: TaxonomyGroup[];
  petPolicy: PetPolicyItem | null;
  groupPolicy: GroupPolicyItem | null;
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

  // Onglets = sections réellement rendues (Phase 4) : « Aperçu » est toujours présent
  // (l'aperçu se rend toujours) ; les autres n'apparaissent QUE si leur section a du
  // contenu — fini l'onglet « Tarifs (0) » qui défile vers une ancre inexistante. Les
  // sections de type (menu/dates/étapes/faits) sont data-gated en amont et n'ont pas
  // d'onglet propre, par parité avec le comportement historique.
  return [
    { id: 'detail-section-overview', label: 'Aperçu' },
    { id: 'detail-section-amenities', label: 'Équipements', count: amenitiesCount },
    { id: 'detail-section-pricing', label: 'Tarifs & horaires', count: pricingCount },
    { id: 'detail-section-hero', label: 'Médias', count: mediaCount },
    { id: 'detail-section-legal', label: 'Légal', count: legalCount },
    { id: 'detail-section-notes', label: 'Activité', count: notesCount },
  ].filter((tab) => tab.count === undefined || tab.count > 0);
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
    summaryMd:
      parsed.text.chapoMd ||
      parsed.text.descriptionMd ||
      parsed.text.adaptedDescriptionMd ||
      parsed.text.mobileDescriptionMd ||
      parsed.text.editorialDescriptionMd,
    descriptionMd: parsed.text.descriptionMd || parsed.text.chapoMd,
    adaptedDescriptionMd:
      parsed.text.adaptedDescriptionMd ||
      parsed.text.mobileDescriptionMd ||
      parsed.text.editorialDescriptionMd,
    location: parsed.location,
    amenities: parsed.taxonomy.amenityItems,
    capacities: parsed.operations.capacities,
    media: parsed.media.items,
    prices: parsed.operations.prices,
    openings: parsed.operations.openings,
    contacts: parsed.contacts.public,
    webChannels: parseWebChannels(parsed.raw),
    actors: parsed.relations.actors,
    organizations: parsed.relations.organizations,
    memberships: parsed.relations.memberships,
    roomTypes: parsed.operations.roomTypes,
    meetingRooms: parsed.operations.meetingRooms,
    taxonomyGroups: parsed.taxonomy.groups,
    petPolicy: parsed.operations.petPolicy,
    groupPolicy: parsed.operations.groupPolicy,
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
    // §07 review: object_group_policy was emitted then dropped — surface it here.
    preview.groupPolicy
      ? {
          label: 'Groupes',
          items: [
            preview.groupPolicy.minSize && preview.groupPolicy.maxSize
              ? `${preview.groupPolicy.minSize}–${preview.groupPolicy.maxSize} pers.`
              : preview.groupPolicy.minSize
                ? `À partir de ${preview.groupPolicy.minSize} pers.`
                : preview.groupPolicy.maxSize
                  ? `Jusqu'à ${preview.groupPolicy.maxSize} pers.`
                  : '',
            preview.groupPolicy.groupOnly ? 'Réservé aux groupes' : '',
            preview.groupPolicy.notes,
          ].filter(Boolean),
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

function TeamNoteAuthorByline({
  note,
  className,
}: {
  note: PrivateNoteEntry;
  className?: string;
}) {
  const shortLabel = getNoteAuthorShortLabel(note);
  const fullName = getNoteAuthorFullName(note);
  const email = getNoteAuthorEmail(note);
  const tooltipTitle = fullName || shortLabel;
  const tooltipContent =
    tooltipTitle || email ? (
      <span className="detail-tooltip__stack">
        {tooltipTitle ? <strong>{tooltipTitle}</strong> : null}
        {email ? <span>{email}</span> : null}
      </span>
    ) : undefined;

  return (
    <DetailTooltip content={tooltipContent}>
      <span className={cn('detail-team-note__author', className)}>{shortLabel}</span>
    </DetailTooltip>
  );
}

function getNoteExcerpt(note: PrivateNoteEntry): string {
  const value = note.body.trim();
  if (value.length <= 120) {
    return value;
  }
  return `${value.slice(0, 117).trimEnd()}...`;
}

function isNoteExcerptTruncated(note: PrivateNoteEntry): boolean {
  return note.body.trim().length > 120;
}

function TeamNoteDetailDialog({
  note,
  open,
  onOpenChange,
}: {
  note: PrivateNoteEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!note) {
    return null;
  }

  const categoryMeta = NOTE_CATEGORY_META[note.category];
  const NoteIcon = getNoteCategoryIcon(note.category);
  const metaParts = [
    categoryMeta.label,
    note.isPinned ? 'Epinglee' : '',
    note.isArchived ? 'Archivee' : '',
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="detail-team-note-dialog max-w-lg">
        <DialogTitle>Note interne</DialogTitle>
        <DialogDescription className="sr-only">
          Contenu complet de la note interne de l equipe.
        </DialogDescription>
        <div className="detail-team-note-dialog__content">
          <div className="detail-team-note-dialog__header">
            <span
              className={`detail-team-note__avatar detail-team-note__avatar--${categoryMeta.tone}`}
              aria-hidden="true"
            >
              <NoteIcon size={14} />
            </span>
            <div className="detail-team-note-dialog__meta">
              <TeamNoteAuthorByline note={note} className="detail-team-note-dialog__author" />
              {metaParts.length > 0 && (
                <p className="detail-team-note-dialog__tags">{metaParts.join(' · ')}</p>
              )}
              {formatNoteDateTime(note.createdAt) && (
                <time className="detail-team-note-dialog__date" dateTime={note.createdAt}>
                  {formatNoteDateTime(note.createdAt)}
                </time>
              )}
            </div>
          </div>
          <p className="detail-team-note-dialog__body">{note.body}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
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
      getNoteAuthorDisplayName(note),
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

function TypeRibbon({ meta }: { meta: ArchetypeMeta }) {
  return (
    <div className="detail-type-ribbon" role="presentation">
      <span className="detail-type-ribbon__dot" aria-hidden />
      <span className="detail-type-ribbon__label">
        <strong>{meta.codeName}</strong>
        <span className="detail-type-ribbon__family"> · {meta.family}</span>
      </span>
      <span className="detail-type-ribbon__codes">{meta.covers}</span>
    </div>
  );
}

/** KPI row matching fiche-detail mockup (label kicker above value). */
function KpiStrip({
  stats,
  statusLine,
  fiveColumns,
}: {
  stats: StatDef[];
  statusLine?: { label: string; value: string; open: boolean } | null;
  fiveColumns?: boolean;
}) {
  if (!stats.length && !statusLine) {
    return null;
  }

  return (
    <div className={cn('detail-kpi-strip', fiveColumns && 'detail-kpi-strip--five')}>
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
            mainMedia.typeCode === 'video' ? (
              <video className="detail-hero__img" src={mainMedia.url} controls preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="detail-hero__img" src={mainMedia.url} alt={mainMedia.description || mainMedia.title || data.name} />
            )
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
                    slot.item.typeCode === 'video' ? (
                      <video src={slot.item.url} className="detail-hero__thumb-img" preload="metadata" muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={slot.item.url} alt="" className="detail-hero__thumb-img" />
                    )
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
            {activeMedia.typeCode === 'video' ? (
              <video className="detail-gallery-modal__image" src={activeMedia.url} controls preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="detail-gallery-modal__image"
                src={activeMedia.url}
                alt={activeMedia.description || activeMedia.title || data.name}
              />
            )}
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
                    {item.typeCode === 'video' ? (
                      <video src={item.url} preload="metadata" muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.url} alt={item.description || item.title || `Photo ${index + 1}`} />
                    )}
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
  const showToggle = canRevealFull || canClamp;
  const hasOverview = Boolean(summary || alternateText);
  const showExtendedText = expanded && canRevealFull;

  // S12 : plus de contrôle « Voir versions » désactivé-en-permanence (fausse
  // affordance) sur la surface read-only — l'historique des versions vit dans
  // l'éditeur (§98), pas dans le drawer.

  if (!hasOverview) {
    return null;
  }

  // Render the Markdown sibling (*_md) when present, else plain text. The md is passed explicitly
  // per call site (no fragile reverse-mapping by string equality). When a field has no *_md (it was
  // never Markdown-authored), md is '' and the plain text renders as a <p>.
  const renderCopy = (text: string, md: string, className: string) =>
    md
      ? <MarkdownContent markdown={md} className={className} />
      : <p className={className}>{text}</p>;

  return (
    <Section title="Description">
      <div className="detail-overview">
        <div className="detail-overview__copy">
          {summary && renderCopy(
            summary, preview.summaryMd,
            `detail-overview__lead${!expanded && showToggle ? ' detail-overview__lead--clamped' : ''}`,
          )}
          {showExtendedText && (
            <>
              <span className="detail-overview__separator" aria-hidden="true" />
              {renderCopy(fullText, preview.descriptionMd, 'detail-overview__body')}
            </>
          )}
          {expanded && alternateText && renderCopy(alternateText, preview.adaptedDescriptionMd, 'detail-overview__support')}
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
  const sessionEmail = useSessionStore((state) => state.email);
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
  const [viewingNote, setViewingNote] = useState<PrivateNoteEntry | null>(null);

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
    setViewingNote(null);
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
            createdByEmail: createdNote.created_by?.email ?? sessionEmail ?? '',
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
                <div className="detail-team-note__row">
                  <button
                    type="button"
                    className="detail-team-note__preview"
                    aria-label="Afficher la note complete"
                    onClick={() => {
                      setOpenMenuNoteId(null);
                      setViewingNote(note);
                    }}
                  >
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
                      <TeamNoteAuthorByline note={note} />
                      <span className="detail-team-note__separator" aria-hidden="true">-</span>
                      <span className="detail-team-note__excerpt">{getNoteExcerpt(note)}</span>
                      {isNoteExcerptTruncated(note) && (
                        <span className="detail-team-note__more" aria-hidden="true">Voir plus</span>
                      )}
                    </p>
                  </button>
                    {(canEditNote(note) || canDeleteNote(note)) && (
                      <div className="detail-team-note__menu-shell">
                        <button
                          type="button"
                          className="detail-team-note__menu-trigger"
                          aria-label="Actions de la note"
                          aria-expanded={openMenuNoteId === note.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuNoteId((current) => (current === note.id ? null : note.id));
                          }}
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
      <TeamNoteDetailDialog
        note={viewingNote}
        open={viewingNote !== null}
        onOpenChange={(open) => {
          if (!open) {
            setViewingNote(null);
          }
        }}
      />
    </Section>
  );
}

interface DistinctionDetail {
  label: string;
  meta: string;
  lines: string[];
}

function DistinctionDetailDialog({
  detail,
  onOpenChange,
}: {
  detail: DistinctionDetail | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={detail !== null} onOpenChange={onOpenChange}>
      <DialogContent className="detail-distinction-dialog max-w-md">
        <DialogTitle>{detail?.label ?? ''}</DialogTitle>
        <DialogDescription className="sr-only">{detail?.meta || 'Détail de la distinction.'}</DialogDescription>
        {detail ? (
          <div className="detail-distinction-dialog__body">
            {detail.meta ? <p className="detail-distinction-dialog__meta">{detail.meta}</p> : null}
            {detail.lines.length > 1 ? (
              <ul className="detail-distinction-dialog__list">
                {detail.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : detail.lines.length === 1 ? (
              <p className="detail-distinction-dialog__text">{detail.lines[0]}</p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TaxonomySection({ groups }: { groups: TaxonomyGroup[] }) {
  const [detail, setDetail] = useState<DistinctionDetail | null>(null);

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

  const openDetail = (item: TaxonomyItem) => {
    const lines = (item.description ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
    setDetail({ label: item.label, meta: item.meta, lines });
  };

  return (
    <Section title="Distinctions">
      {/*
        Compact, single-altitude layout: every distinction is a chip grouped by
        family. Long sustainability-action prose lives behind a detail modal
        (`detail-chip--has-detail`), never dumped inline — keeps the section light.
      */}
      <div className="detail-distinction-grid">
        {sortedGroups.map((group) => {
          const meta = getDistinctionGroupMeta(group.key);
          const Icon = meta.icon;

          return (
            <div key={group.key} className={`detail-distinction-group detail-distinction-group--${meta.tone}`}>
              <div className="detail-distinction-group__header">
                <span className={`detail-distinction-group__icon detail-distinction-group__icon--${meta.tone}`} aria-hidden="true">
                  <Icon size={14} />
                </span>
                <span className="detail-distinction-group__title">{meta.title}</span>
              </div>
              <div className="detail-chip-strip">
                {group.items.map((item) => {
                  const chipClass = `detail-chip detail-chip--distinction detail-chip--distinction-${meta.tone}`;

                  if (item.description) {
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`${chipClass} detail-chip--has-detail`}
                        onClick={() => openDetail(item)}
                      >
                        <span>{item.label}</span>
                        <Info size={12} aria-hidden="true" />
                        <span className="sr-only">, voir le détail</span>
                      </button>
                    );
                  }

                  // Short-meta chips (labels/classifications): focusable + named so the
                  // meta (status/dates) reaches keyboard and screen-reader users, not only hover.
                  if (item.meta) {
                    return (
                      <DetailTooltip key={item.id} content={item.meta}>
                        <span className={chipClass} tabIndex={0} aria-label={`${item.label}, ${item.meta}`}>
                          {item.label}
                        </span>
                      </DetailTooltip>
                    );
                  }

                  return (
                    <span key={item.id} className={chipClass}>
                      {item.label}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <DistinctionDetailDialog
        detail={detail}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
          }
        }}
      />
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
  const amenitiesRootRef = useRef<HTMLDivElement>(null);
  const featureMeasureRef = useRef<HTMLDivElement>(null);
  const chipMeasureRef = useRef<HTMLDivElement>(null);
  const [lineClamp, setLineClamp] = useState({
    featureVisibleCount: 0,
    chipVisibleCount: 0,
    showToggle: false,
  });
  const hasEnvironment = Boolean(environmentGroup?.items.length);
  const sortedAmenities = sortAmenities(amenities);
  const featuredAmenities = sortedAmenities.filter((item) => item.iconUrl);
  const plainAmenities = sortedAmenities.filter((item) => !item.iconUrl);
  const amenitySignature = sortedAmenities.map((item) => item.id).join('|');

  const remeasureLineClamp = useCallback(() => {
    setLineClamp(
      measureAmenitiesLineClamp(featureMeasureRef.current, chipMeasureRef.current),
    );
  }, []);

  useLayoutEffect(() => {
    remeasureLineClamp();
  }, [amenitySignature, remeasureLineClamp]);

  useLayoutEffect(() => {
    const root = amenitiesRootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      remeasureLineClamp();
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [amenitySignature, remeasureLineClamp]);

  useEffect(() => {
    setExpanded(false);
  }, [amenitySignature]);

  if (!amenities.length && !hasEnvironment) {
    return null;
  }

  const showToggle = lineClamp.showToggle;
  const visibleFeatured =
    expanded || !showToggle
      ? featuredAmenities
      : featuredAmenities.slice(0, lineClamp.featureVisibleCount);
  const visiblePlain =
    expanded || !showToggle ? plainAmenities : plainAmenities.slice(0, lineClamp.chipVisibleCount);

  return (
    <Section id="detail-section-amenities" title="Equipements">
      {amenities.length > 0 ? (
        <div className="detail-amenities" ref={amenitiesRootRef}>
          <div className="detail-amenities__measure" aria-hidden="true">
            {featuredAmenities.length > 0 ? (
              <div ref={featureMeasureRef} className="detail-feature-grid">
                {featuredAmenities.map((amenity) => (
                  <div key={`measure-feature-${amenity.id}`} className="detail-feature-card">
                    <span className="detail-feature-card__icon" aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={amenity.iconUrl} alt="" />
                    </span>
                    <strong>{amenity.label}</strong>
                  </div>
                ))}
              </div>
            ) : null}
            {plainAmenities.length > 0 ? (
              <div ref={chipMeasureRef} className="detail-chip-strip detail-chip-strip--compact">
                {plainAmenities.map((amenity) => (
                  <span
                    key={`measure-chip-${amenity.id}`}
                    className="detail-chip detail-chip--soft detail-chip--equipment"
                  >
                    {amenity.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
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
          {showToggle ? (
            <button
              type="button"
              className="detail-expand-button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {expanded ? 'Voir moins' : 'Voir tous les equipements'}
            </button>
          ) : null}
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

  const visibleStats = stats.slice(0, 5);
  return (
    <Section title="Le parcours">
      <KpiStrip stats={visibleStats} fiveColumns={visibleStats.length === 5} />
    </Section>
  );
}

function RoomList({ rooms }: { rooms: RoomTypeItem[] }) {
  if (!rooms.length) {
    return null;
  }

  const hasAnyDetail = rooms.some((r) => r.capacityAdults !== 'n/a' || r.beds !== 'n/a');
  const hasAnyQty = rooms.some((r) => r.quantity && r.quantity !== 'n/a');

  return (
    <Section title="Chambres">
      <table className="detail-rooms-table">
        <thead>
          <tr>
            <th>Type</th>
            {hasAnyDetail ? <th>Couchages</th> : null}
            {hasAnyQty ? <th className="detail-rooms-table__num">Unités</th> : null}
            <th>Équipements</th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => {
            const bedsLine = [
              room.capacityAdults !== 'n/a' ? `${room.capacityAdults} adultes` : '',
              room.beds !== 'n/a' ? room.beds : '',
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <tr key={room.id}>
                <td>
                  <strong>{room.name}</strong>
                </td>
                {hasAnyDetail ? <td>{bedsLine || '—'}</td> : null}
                {hasAnyQty ? (
                  <td className="detail-rooms-table__num">
                    {room.quantity && room.quantity !== 'n/a' ? room.quantity : '—'}
                  </td>
                ) : null}
                <td>
                  {room.amenities.length > 0 ? (
                    <div className="detail-chip-strip">
                      {room.amenities.slice(0, 4).map((amenity) => (
                        <span key={`${room.id}-${amenity}`} className="detail-chip detail-chip--soft">
                          {amenity}
                        </span>
                      ))}
                      {room.amenities.length > 4 ? (
                        <span className="detail-chip detail-chip--soft">+{room.amenities.length - 4}</span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="detail-rooms-table__dim">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

function MeetingRoomList({ rooms }: { rooms: MeetingRoomItem[] }) {
  if (!rooms.length) {
    return null;
  }

  return (
    <Section title="Reunions et evenements">
      <div className="detail-mice-grid">
        {rooms.map((room) => {
          const caps: Array<{ label: string; value: string }> = [];
          if (room.areaM2 !== 'n/a') caps.push({ label: 'Surface', value: `${room.areaM2} m²` });
          if (room.capacityTheatre !== 'n/a') caps.push({ label: 'Théâtre', value: room.capacityTheatre });
          if (room.capacityClassroom !== 'n/a') caps.push({ label: 'Classe', value: room.capacityClassroom });
          if (room.capacityBoardroom !== 'n/a') caps.push({ label: 'Conseil', value: room.capacityBoardroom });
          if (room.capacityU !== 'n/a') caps.push({ label: 'U', value: room.capacityU });

          return (
            <article key={room.id} className="detail-mice">
              <h4 className="detail-mice__name">{room.name}</h4>
              {caps.length > 0 ? (
                <div className="detail-mice__caps">
                  {caps.map((cap) => (
                    <span key={`${room.id}-${cap.label}`}>
                      {cap.label} <strong>{cap.value}</strong>
                    </span>
                  ))}
                </div>
              ) : null}
              {room.equipment.length > 0 ? (
                <div className="detail-chip-strip detail-mice__equip">
                  {room.equipment.slice(0, 4).map((equipment) => (
                    <span key={`${room.id}-${equipment}`} className="detail-chip detail-chip--soft">
                      {equipment}
                    </span>
                  ))}
                  {room.equipment.length > 4 ? (
                    <span className="detail-chip detail-chip--soft">+{room.equipment.length - 4}</span>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </Section>
  );
}

type OpeningViewMode = 'compact' | 'week' | 'all';

const OPENING_WEEKDAYS = [
  { key: 'monday', short: 'Lun', letter: 'L' },
  { key: 'tuesday', short: 'Mar', letter: 'M' },
  { key: 'wednesday', short: 'Mer', letter: 'M' },
  { key: 'thursday', short: 'Jeu', letter: 'J' },
  { key: 'friday', short: 'Ven', letter: 'V' },
  { key: 'saturday', short: 'Sam', letter: 'S' },
  { key: 'sunday', short: 'Dim', letter: 'D' },
] as const;

type OpeningWeekdayKey = (typeof OPENING_WEEKDAYS)[number]['key'];

interface OpeningWeekRow {
  key: OpeningWeekdayKey;
  label: string;
  slots: string[];
}

function normalizeOpeningText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeWeekdayKey(value: string): OpeningWeekdayKey | null {
  const normalized = normalizeOpeningText(value);
  const map: Record<string, OpeningWeekdayKey> = {
    monday: 'monday',
    mon: 'monday',
    lundi: 'monday',
    lun: 'monday',
    tuesday: 'tuesday',
    tue: 'tuesday',
    mardi: 'tuesday',
    mar: 'tuesday',
    wednesday: 'wednesday',
    wed: 'wednesday',
    mercredi: 'wednesday',
    mer: 'wednesday',
    thursday: 'thursday',
    thu: 'thursday',
    jeudi: 'thursday',
    jeu: 'thursday',
    friday: 'friday',
    fri: 'friday',
    vendredi: 'friday',
    ven: 'friday',
    saturday: 'saturday',
    sat: 'saturday',
    samedi: 'saturday',
    sam: 'saturday',
    sunday: 'sunday',
    sun: 'sunday',
    dimanche: 'sunday',
    dim: 'sunday',
  };

  return map[normalized] ?? null;
}

function getTodayWeekdayKey(): OpeningWeekdayKey {
  const index = new Date().getDay();
  return index === 0 ? 'sunday' : OPENING_WEEKDAYS[index - 1].key;
}

function normalizeSlotLabel(slot: string): string {
  return slot
    .trim()
    .replace(/\s*->\s*/g, '–')
    .replace(/(\d{1,2}:\d{2})(?::\d{2})?\s*[-–]\s*(\d{1,2}:\d{2})(?::\d{2})?/g, (_, start, end) => `${start}–${end}`);
}

function getSlotTimes(slot: string): string[] {
  return [...slot.matchAll(/\d{1,2}:\d{2}(?::\d{2})?/g)].map((match) => match[0]);
}

function getTimeMinutes(time: string): number | null {
  const [hour, minute] = time.split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  return hour * 60 + minute;
}

function formatSlotTimeLabel(time: string): string {
  const match = time.match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : time;
}

function getSlotRanges(slot: string): Array<{ start: number; end: number; startLabel: string; endLabel: string }> {
  const times = getSlotTimes(slot);
  const ranges: Array<{ start: number; end: number; startLabel: string; endLabel: string }> = [];

  for (let index = 0; index < times.length - 1; index += 2) {
    const start = getTimeMinutes(times[index]);
    const end = getTimeMinutes(times[index + 1]);

    if (start !== null && end !== null) {
      ranges.push({
        start,
        end,
        startLabel: formatSlotTimeLabel(times[index]),
        endLabel: formatSlotTimeLabel(times[index + 1]),
      });
    }
  }

  return ranges;
}

function isMinuteInRange(minute: number, range: { start: number; end: number }): boolean {
  if (range.end < range.start) {
    return minute >= range.start || minute <= range.end;
  }

  return minute >= range.start && minute <= range.end;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function getOpeningRows(opening: OpeningItem): OpeningWeekRow[] {
  const slotsByDay = new globalThis.Map<OpeningWeekdayKey, string[]>();
  const addSlots = (key: OpeningWeekdayKey, slots: string[]) => {
    slotsByDay.set(key, dedupeStrings([...(slotsByDay.get(key) ?? []), ...slots.map(normalizeSlotLabel)]));
  };

  if (opening.weekdaySlots?.length) {
    for (const entry of opening.weekdaySlots) {
      const key = normalizeWeekdayKey(entry.weekday);
      if (key) {
        addSlots(key, entry.slots);
      }
    }
  } else if (opening.weekdays.length > 0) {
    for (const weekday of opening.weekdays) {
      const key = normalizeWeekdayKey(weekday);
      if (key) {
        addSlots(key, opening.slots);
      }
    }
  } else if (opening.slots.length > 0) {
    for (const weekday of OPENING_WEEKDAYS) {
      addSlots(weekday.key, opening.slots);
    }
  }

  return OPENING_WEEKDAYS.map((weekday) => ({
    key: weekday.key,
    label: weekday.short,
    slots: slotsByDay.get(weekday.key) ?? [],
  }));
}

function getCombinedWeekRows(openings: OpeningItem[]): OpeningWeekRow[] {
  const merged = new globalThis.Map<OpeningWeekdayKey, string[]>();

  for (const opening of openings) {
    for (const row of getOpeningRows(opening)) {
      if (row.slots.length > 0) {
        merged.set(row.key, dedupeStrings([...(merged.get(row.key) ?? []), ...row.slots]));
      }
    }
  }

  return OPENING_WEEKDAYS.map((weekday) => ({
    key: weekday.key,
    label: weekday.short,
    slots: merged.get(weekday.key) ?? [],
  }));
}

/** Single source of truth for the opening card: the pulse dot and the label must never disagree. */
function getOpeningStatus(openNow: boolean | null, todaySlots: string[]): { open: boolean; label: string } {
  const now = new Date();
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const ranges = todaySlots.flatMap(getSlotRanges);
  const activeRange = ranges
    .filter((range) => isMinuteInRange(currentMinute, range))
    .sort((left, right) => right.end - left.end)[0];
  const nextRange = ranges
    .filter((range) => range.start > currentMinute)
    .sort((left, right) => left.start - right.start)[0];

  if (openNow === true) {
    return { open: true, label: activeRange ? `Ouvert · ferme à ${activeRange.endLabel}` : 'Ouvert aujourd’hui' };
  }

  if (openNow === false) {
    return { open: false, label: nextRange ? `Fermé · ouvre à ${nextRange.startLabel}` : 'Fermé aujourd’hui' };
  }

  if (activeRange) {
    return { open: true, label: `Ouvert · ferme à ${activeRange.endLabel}` };
  }

  if (nextRange) {
    return { open: false, label: `Fermé · ouvre à ${nextRange.startLabel}` };
  }

  return { open: false, label: 'Fermé aujourd’hui' };
}

function getOpeningMeta(opening: OpeningItem): string {
  const dateRange = opening.allYears
    ? 'Toute l\'annee'
    : opening.details.find((detail) => /\d{4}|\d{1,2}[/\-.]\d{1,2}/.test(detail) || detail === 'Toute l\'annee');
  return [dateRange, opening.season && opening.season !== opening.label ? opening.season : ''].filter(Boolean).join(' · ');
}

// Bar covers 08:00–22:00 (840 min span, start at 480 min)
const BAR_START_MINUTES = 8 * 60;
const BAR_SPAN_MINUTES = 14 * 60;

function OpeningWeekGrid({
  rows,
  todayKey,
  compact = false,
}: {
  rows: OpeningWeekRow[];
  todayKey: OpeningWeekdayKey;
  compact?: boolean;
}) {
  return (
    <div className={cn('detail-opening-week', compact && 'detail-opening-week--compact')}>
      {rows.map((row) => {
        const isToday = row.key === todayKey;
        const closed = row.slots.length === 0;
        const ranges = row.slots.flatMap(getSlotRanges);

        return (
          <div key={row.key} className={cn('detail-opening-day', isToday && 'detail-opening-day--today', closed && 'detail-opening-day--closed')}>
            <span className="detail-opening-day__name">{row.label}</span>
            <span className="detail-opening-day__bar" aria-hidden="true">
              {ranges.map((range, index) => {
                const left = Math.max(0, Math.min(100, ((range.start - BAR_START_MINUTES) / BAR_SPAN_MINUTES) * 100));
                const width = Math.max(0, Math.min(100 - left, ((range.end - range.start) / BAR_SPAN_MINUTES) * 100));
                return (
                  <span
                    key={`${row.key}-${index}`}
                    className="detail-opening-day__segment"
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                );
              })}
            </span>
            <span className="detail-opening-day__slots">{closed ? 'Fermé' : row.slots.join(' · ')}</span>
          </div>
        );
      })}
    </div>
  );
}

function OpeningTimeline({
  openings,
  selectedIndex,
  onSelect,
}: {
  openings: OpeningItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const segments = openings.slice(0, 4);

  return (
    <div className="detail-opening-timeline" aria-label="Ruban annuel des périodes">
      <div className="detail-opening-timeline__months" aria-hidden="true">
        {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((month, index) => (
          <span key={`${month}-${index}`}>{month}</span>
        ))}
      </div>
      <div className="detail-opening-timeline__track">
        {segments.map((opening, index) => {
          const segment = getOpeningYearTimelineSegment(opening);
          return (
            <button
              key={`${opening.label}-${index}`}
              type="button"
              className={cn('detail-opening-timeline__segment', index === selectedIndex && 'detail-opening-timeline__segment--active')}
              style={{
                left: `${segment.left}%`,
                width: `${segment.width}%`,
              }}
              title={opening.label}
              onClick={() => onSelect(index)}
            />
          );
        })}
      </div>
    </div>
  );
}

function OpeningsAsideSection({ openings, openNow }: { openings: OpeningItem[]; openNow: boolean | null }) {
  if (!openings.length) {
    return null;
  }

  return (
    <Section title="Horaires" aside>
      <OpeningPeriodsCard openings={openings} openNow={openNow} />
    </Section>
  );
}

function OpeningPeriodsCard({ openings, openNow }: { openings: OpeningItem[]; openNow: boolean | null }) {
  const [mode, setMode] = useState<OpeningViewMode>('compact');
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);
  const todayKey = getTodayWeekdayKey();
  const weekRows = useMemo(() => getCombinedWeekRows(openings), [openings]);
  const todaySlots = weekRows.find((row) => row.key === todayKey)?.slots ?? [];
  const primaryOpening = openings[0];
  const status = getOpeningStatus(openNow, todaySlots);
  const todayLabel = todaySlots.length > 0 ? todaySlots.join(' · ') : 'Fermé';
  const periodLabel = primaryOpening?.season || primaryOpening?.label || 'Semaine en cours';

  if (openings.length === 0) {
    return null;
  }

  return (
    <div className={cn('detail-opening-card', mode !== 'compact' && 'detail-opening-card--expanded')}>
      <button
        type="button"
        className="detail-opening-hero"
        onClick={() => setMode((current) => current === 'compact' ? 'week' : 'compact')}
        aria-expanded={mode !== 'compact'}
      >
        <span className={cn('detail-opening-hero__pulse', !status.open && 'detail-opening-hero__pulse--closed')} aria-hidden="true" />
        <span className="detail-opening-hero__copy">
          <span className="detail-opening-hero__status">{status.label}</span>
          <span className="detail-opening-hero__today">Aujourd'hui · <strong>{todayLabel}</strong></span>
        </span>
        <ChevronDown className={cn('detail-opening-hero__chevron', mode !== 'compact' && 'detail-opening-hero__chevron--open')} size={15} aria-hidden />
      </button>

      {mode === 'compact' ? (
        <div className="detail-opening-card__compact-row">
          <span className="detail-opening-season-chip">
            <span aria-hidden="true" />
            {periodLabel}
          </span>
          <button type="button" className="detail-opening-card__link" onClick={() => setMode('week')}>
            Voir la semaine
          </button>
        </div>
      ) : null}

      {mode === 'week' ? (
        <>
          <OpeningWeekGrid rows={weekRows} todayKey={todayKey} />
          {openings.length > 1 ? (
            <div className="detail-opening-alert">
              <AlertTriangle size={14} aria-hidden />
              <span>{openings.length - 1} autre{openings.length > 2 ? 's' : ''} période{openings.length > 2 ? 's' : ''} configurée{openings.length > 2 ? 's' : ''}</span>
            </div>
          ) : null}
          <button type="button" className="detail-opening-card__all" onClick={() => setMode('all')}>
            Toutes les périodes
            <ChevronRight size={14} aria-hidden />
          </button>
        </>
      ) : null}

      {mode === 'all' ? (
        <div className="detail-opening-all">
          <button type="button" className="detail-opening-card__back" onClick={() => setMode('week')}>
            <ChevronLeft size={14} aria-hidden />
            Semaine en cours
          </button>
          <OpeningTimeline
            openings={openings}
            selectedIndex={selectedPeriodIndex}
            onSelect={setSelectedPeriodIndex}
          />
          {(() => {
            const opening = openings[selectedPeriodIndex] ?? openings[0];
            const rows = getOpeningRows(opening);
            const meta = getOpeningMeta(opening);
            return (
              <section className="detail-opening-period">
                <div className="detail-opening-period__header">
                  <div>
                    <strong>{opening.label || `Période ${selectedPeriodIndex + 1}`}</strong>
                    {meta ? <p>{meta}</p> : null}
                  </div>
                  {selectedPeriodIndex === 0 ? <span>En cours</span> : null}
                </div>
                <OpeningWeekGrid rows={rows} todayKey={todayKey} compact />
              </section>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
}

function PricingAndOpeningsSection({
  prices,
  sectionId,
}: {
  prices: PriceItem[];
  sectionId?: string;
}) {
  if (!prices.length) {
    return null;
  }

  return (
    <Section id={sectionId} title="Tarifs">
      <div className="detail-tariff-list">
        {prices.slice(0, 8).map((price, index) => (
          <div key={`${price.label}-${index}`} className="detail-tariff-row">
            <div className="detail-tariff-row__main">
              <span className="detail-tariff-row__label">{price.label}</span>
              {(price.periodLabel || price.details.length > 0) && (
                <span className="detail-tariff-row__sub">
                  {[price.periodLabel, price.details.join(' · ')].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            <span className="detail-tariff-row__amount">
              {price.amount}
              <small>{' '}{price.currency}</small>
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function WeekScheduleSection({ openings }: { openings: OpeningItem[] }) {
  const periodColumns = openings
    .filter((opening) => opening.weekdaySlots?.length || opening.weekdays.length || opening.slots.length)
    .slice(0, 3);

  if (periodColumns.length < 2) {
    return null;
  }

  const todayKey = getTodayWeekdayKey();
  const rowsByPeriod = periodColumns.map((opening) => getOpeningRows(opening));
  const headers = periodColumns.map((opening, index) => {
    const explicit = opening.label || opening.season;
    if (explicit) return explicit;
    return `Période ${index + 1}`;
  });
  const gridTemplate = `72px repeat(${periodColumns.length}, minmax(0, 1fr))`;

  return (
    <Section title="Horaires par période">
      <div className="detail-week-grid" style={{ gridTemplateColumns: gridTemplate }}>
        <div className="detail-week-grid__head">Jour</div>
        {headers.map((header, index) => (
          <div key={`head-${index}`} className="detail-week-grid__head">
            {header}
          </div>
        ))}
        {OPENING_WEEKDAYS.map((weekday) => (
          <Fragment key={weekday.key}>
            <div
              className={cn('detail-week-grid__day', weekday.key === todayKey && 'detail-week-grid__day--today')}
            >
              {weekday.short}
              <small>{`${weekday.key.charAt(0).toUpperCase()}${weekday.key.slice(1)}`}</small>
            </div>
            {rowsByPeriod.map((rows, periodIdx) => {
              const slots = rows.find((r) => r.key === weekday.key)?.slots ?? [];
              const isToday = weekday.key === todayKey && periodIdx === 0;
              const isClosed = slots.length === 0;
              return (
                <div
                  key={`${weekday.key}-${periodIdx}`}
                  className={cn(
                    'detail-week-grid__slot',
                    isClosed && 'detail-week-grid__slot--closed',
                    isToday && !isClosed && 'detail-week-grid__slot--now',
                  )}
                >
                  {isClosed ? 'Fermé' : slots.join(' · ')}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </Section>
  );
}

/**
 * Étapes RÉELLES de l'itinéraire (impl. 4.3) — depuis `object_iti_stage` (nom,
 * type, description). Remplace l'ancienne fabrication par interpolation de
 * distances. Rendu seulement si des étapes réelles existent (sinon null).
 */
function WaypointListSection({ stages }: { stages: ItineraryStageRow[] }) {
  if (stages.length === 0) {
    return null;
  }
  return (
    <Section id="detail-section-stages" title="Étapes de l'itinéraire" kicker="Le parcours">
      <ol className="detail-waypoints">
        {stages.map((stage, idx) => (
          <li key={stage.key} className="detail-waypoint">
            <span className="detail-waypoint__num" aria-hidden>
              {idx + 1}
            </span>
            <div className="detail-waypoint__body">
              {/* §4.6 : « Étape n » = métadonnée d'ordre (dim) ; le nom réel n'est rendu que s'il existe. */}
              <span className="detail-waypoint__position">{stage.positionLabel}</span>
              {stage.name ? <strong className="detail-waypoint__name">{stage.name}</strong> : null}
              {stage.description ? <p className="detail-waypoint__desc">{stage.description}</p> : null}
            </div>
            {stage.kindLabel ? <span className="detail-waypoint__meta">{stage.kindLabel}</span> : null}
          </li>
        ))}
      </ol>
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

/** §90 — object-scoped réseaux sociaux + distribution (object_web_channel). Reuses ContactCard
 *  (platform favicon + href already resolved in parseWebChannels). Public rows only. */
function WebChannelsSection({ channels }: { channels: ContactItem[] }) {
  if (!channels.length) {
    return null;
  }

  return (
    <Section title="Réseaux sociaux & réservation" aside>
      <div className="detail-contact-list">
        <div className="detail-contact-card detail-contact-card--deck">
          {channels.slice(0, 8).map((channel) => (
            <ContactCard key={channel.id} contact={channel} />
          ))}
        </div>
      </div>
    </Section>
  );
}

function ContactCard({ contact }: { contact: ContactItem }) {
  const [copied, setCopied] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
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

  // Favicon when available (resolved web platform or payload icon); on load error fall
  // back to the lucide icon so a broken image is never shown. Shared by both layouts.
  const iconNode = (
    <span className="detail-contact-card__icon" aria-hidden="true">
      {contact.iconUrl && !iconFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={contact.iconUrl}
          alt=""
          className="detail-contact-card__icon-image"
          onError={() => setIconFailed(true)}
        />
      ) : (
        <Icon size={18} />
      )}
    </span>
  );

  const body = (
    <span className="detail-contact-row__link-body">
      {iconNode}
      <span className="detail-contact-card__value">{contact.displayValue}</span>
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
          {iconNode}
          <span className="detail-contact-card__value">{contact.displayValue}</span>
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
    OpeningsAsideSection({ openings: preview.openings, openNow: preview.openNow }),
    ContactSection({ contacts: preview.contacts }),
    WebChannelsSection({ channels: preview.webChannels }),
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
  const archetype = getArchetypeMeta(preview.typeCode || data.type || '');

  return (
    <div className={cn('object-detail-view', archetype && archetype.accent)}>
      <GalleryLightbox
        data={data}
        media={preview.media}
        activeIndex={activeMediaIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onChange={setActiveMediaIndex}
      />
      <DetailTabs items={tabItems} />
      {archetype && <TypeRibbon meta={archetype} />}
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

/**
 * Bloc « Cuisine & carte » d'un restaurant (impl. 4.2). Cuisine + carte/menu
 * structurée (sections → plats + prix + régimes), depuis le payload réel
 * (`menus`/`cuisine_types`). Rendu seulement si la donnée existe (§104).
 */
function RestaurantMenuSection({ raw }: { raw: Record<string, unknown> }) {
  const { cuisines, menus } = useMemo(() => buildRestaurantMenuData(raw), [raw]);
  if (cuisines.length === 0 && menus.length === 0) {
    return null;
  }
  return (
    <Section id="detail-section-menu" title="Cuisine & carte" kicker="Au menu">
      {cuisines.length > 0 ? (
        <div className="detail-cuisine-row">
          {cuisines.map((cuisine) => (
            <span key={cuisine} className="detail-cuisine-chip">{cuisine}</span>
          ))}
        </div>
      ) : null}
      {menus.map((menu) => (
        <div key={menu.key} className="detail-menu">
          {menus.length > 1 ? <h4 className="detail-menu__title">{menu.title}</h4> : null}
          {/* §4.3 : un menu peut n'avoir qu'une description (aucune section) — on la rend quand même. */}
          {menu.description ? <p className="detail-menu__description">{menu.description}</p> : null}
          {menu.sections.map((section) => (
            <div key={section.name} className="detail-menu__section">
              <span className="detail-menu__section-name">{section.name}</span>
              <ul className="detail-menu__dishes">
                {section.dishes.map((dish) => (
                  <li key={dish.key} className="detail-menu__dish">
                    <div className="detail-menu__dish-head">
                      <span className="detail-menu__dish-name">{dish.name}</span>
                      {dish.formattedPrice ? (
                        <span className="detail-menu__dish-price">{dish.formattedPrice}</span>
                      ) : null}
                    </div>
                    {dish.description ? (
                      <p className="detail-menu__dish-description">{dish.description}</p>
                    ) : null}
                    {/* §4.3 : régimes ET allergènes = deux jeux de puces distincts (jamais fusionnés). */}
                    {dish.dietary.length > 0 || dish.allergens.length > 0 ? (
                      <div className="detail-menu__tags">
                        {dish.dietary.map((tag) => (
                          <span key={`diet-${tag}`} className="detail-menu__tag detail-menu__tag--diet">
                            {tag}
                          </span>
                        ))}
                        {dish.allergens.map((tag) => (
                          <span key={`allergen-${tag}`} className="detail-menu__tag detail-menu__tag--allergen">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </Section>
  );
}

/**
 * Bloc « Fiche activité » (impl. 4.3) — faits d'une activité encadrée (object_act :
 * durée, participants, âge, niveau, encadrement, équipement). Rendu seulement si
 * la donnée existe ; ne fabrique rien.
 */
function ActivityFactsSection({ raw }: { raw: Record<string, unknown> }) {
  const facts = useMemo(() => buildActivityFacts(raw), [raw]);
  if (facts.length === 0) {
    return null;
  }
  return (
    <Section id="detail-section-activity" title="Fiche activité" kicker="L'activité">
      <dl className="detail-facts">
        {facts.map((fact) => (
          <div key={fact.label} className="detail-facts__row">
            <dt className="detail-facts__label">{fact.label}</dt>
            <dd className="detail-facts__value">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/**
 * Formate une valeur ISO-like en date FR SANS décalage UTC (impl. 4.1). Une
 * date-only (`YYYY-MM-DD`) n'est JAMAIS passée à `new Date(iso)` (qui la lirait en
 * UTC et pourrait la décaler d'un jour) : on extrait les composantes et on
 * construit une date LOCALE. L'heure n'est ajoutée que si elle est présente.
 */
function formatEventDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value);
  if (!match) {
    return value;
  }
  const [, y, mo, d, hh, mm] = match;
  const hasTime = hh !== undefined && mm !== undefined;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), hasTime ? Number(hh) : 0, hasTime ? Number(mm) : 0);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

/** Deux valeurs ISO-like tombent-elles le même jour civil (comparaison sur la partie date). */
function isSameCalendarDay(a: string, b: string): boolean {
  return Boolean(a) && Boolean(b) && a.slice(0, 10) === b.slice(0, 10);
}

/** Libellé d'une plage d'occurrence : « Du … au … » quand les jours diffèrent, sinon la date seule. */
function formatEventRangeLabel(range: EventDateRange): string {
  const start = range.start ? formatEventDate(range.start) : '';
  const end = range.end ? formatEventDate(range.end) : '';
  if (start && end && !isSameCalendarDay(range.start, range.end)) {
    return `Du ${start} au ${end}`;
  }
  return start || end;
}

/**
 * Bloc « Prochaine date » d'un événement (impl. 4.1). Rendu UNIQUEMENT quand une
 * prochaine date existe (occurrence future la plus proche, sinon date canonique non
 * passée). Récurrence + bouton réservation (uniquement un canal public
 * `booking_engine` — pas de repli site générique).
 */
function EventNextDateSection({
  next,
  recurring,
  recurrencePattern,
  location,
  reservationHref,
}: {
  next: EventDateRange;
  recurring: boolean;
  recurrencePattern: string;
  location: DetailLocation | null;
  reservationHref: string;
}) {
  const startLabel = next.start ? formatEventDate(next.start) : '';
  // Fin affichée seulement si elle diffère du début (autre jour OU autre heure).
  const endLabel =
    next.end && (!isSameCalendarDay(next.start, next.end) || next.end !== next.start)
      ? formatEventDate(next.end)
      : '';
  const locationLine = location
    ? [location.city, location.lieuDit].filter(Boolean).join(' · ') || location.label
    : '';
  const recurrenceLabel = recurrencePattern
    ? `Événement récurrent · ${recurrencePattern}`
    : 'Événement récurrent';

  return (
    <Section id="detail-section-events-next" kicker="À venir" title="Prochaine date">
      <div className="detail-event-next">
        <p className="detail-event-next__date">
          <CalendarDays size={16} className="detail-event-next__icon" aria-hidden />
          <span>
            {startLabel}
            {endLabel ? <span className="detail-event-next__end"> → {endLabel}</span> : null}
          </span>
        </p>
        {locationLine ? (
          <p className="detail-event-next__location">
            <MapPin size={14} aria-hidden /> {locationLine}
          </p>
        ) : null}
        {recurring ? <span className="detail-event-recurrence">{recurrenceLabel}</span> : null}
        {reservationHref ? (
          <div className="detail-event-next__actions">
            <a
              className="detail-event-next__cta"
              href={reservationHref}
              target="_blank"
              rel="noreferrer"
            >
              Réserver / Billetterie
            </a>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

/**
 * Bloc « Toutes les dates » d'un événement (impl. 4.1). Occurrences à venir d'abord,
 * puis passées sous « Dates passées », puis annulées (barrées + badge « Annulé »).
 * La note d'occurrence s'affiche sous la date. Une date canonique SEULE (sans
 * occurrence) n'est PAS dupliquée ici — le bloc « Prochaine date » la montre déjà.
 * Rendu null si upcoming + past + cancelled sont tous vides.
 */
function EventOccurrencesSection({ eventData }: { eventData: EventDisplayData }) {
  const { upcoming, past, cancelled } = eventData;
  if (upcoming.length === 0 && past.length === 0 && cancelled.length === 0) {
    return null;
  }

  const renderRow = (range: EventDateRange) => (
    <li
      key={range.key}
      className={cn('detail-event-list__row', range.cancelled && 'detail-event-list__row--cancelled')}
    >
      <CalendarDays size={15} className="detail-event-list__icon" aria-hidden />
      <span className="detail-event-list__body">
        <span className="detail-event-list__date">{formatEventRangeLabel(range)}</span>
        {range.note ? <span className="detail-event-list__note">{range.note}</span> : null}
      </span>
      {range.cancelled ? <span className="detail-event-list__state">Annulé</span> : null}
    </li>
  );

  return (
    <Section id="detail-section-events" title="Toutes les dates" kicker="Quand">
      {upcoming.length > 0 ? <ul className="detail-event-list">{upcoming.map(renderRow)}</ul> : null}
      {past.length > 0 ? (
        <>
          <p className="detail-event-list__subhead">Dates passées</p>
          <ul className="detail-event-list detail-event-list--past">{past.map(renderRow)}</ul>
        </>
      ) : null}
      {cancelled.length > 0 ? (
        <ul className="detail-event-list detail-event-list--cancelled">{cancelled.map(renderRow)}</ul>
      ) : null}
    </Section>
  );
}

/**
 * Profil altimétrique d'un itinéraire (impl. 4.4). SVG responsive tracé à partir des
 * points de profil RÉELS (`object_iti` profiles) — aucune interpolation, aucun point
 * fabriqué. Rendu seulement quand ≥ 2 points existent. Un résumé texte double l'info
 * (distance / alt. min-max / dénivelé) pour l'accessibilité — l'info n'est pas
 * seulement dans le SVG.
 */
function ItineraryElevationProfileSection({ profiles }: { profiles: ItineraryProfilePoint[] }) {
  const geometry = useMemo(() => {
    if (profiles.length < 2) {
      return null;
    }
    const width = 600;
    const height = 180;
    const padLeft = 36;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 28;
    const innerW = width - padLeft - padRight;
    const innerH = height - padTop - padBottom;
    const positions = profiles.map((point) => point.positionM);
    const elevations = profiles.map((point) => point.elevationM);
    const minPos = Math.min(...positions);
    const maxPos = Math.max(...positions);
    const minEle = Math.min(...elevations);
    const maxEle = Math.max(...elevations);
    const posSpan = maxPos - minPos || 1;
    // Toutes les altitudes égales : plage d'affichage ±1 m pour éviter la division par zéro.
    const flat = maxEle - minEle === 0;
    const eleSpan = flat ? 2 : maxEle - minEle;
    const eleBase = flat ? minEle - 1 : minEle;
    const baseY = padTop + innerH;
    const x = (pos: number) => padLeft + ((pos - minPos) / posSpan) * innerW;
    const y = (ele: number) => padTop + innerH - ((ele - eleBase) / eleSpan) * innerH;
    const coords = profiles.map((point) => `${x(point.positionM).toFixed(1)},${y(point.elevationM).toFixed(1)}`);
    const linePath = `M ${coords.join(' L ')}`;
    const areaPath = `M ${x(minPos).toFixed(1)},${baseY.toFixed(1)} L ${coords.join(' L ')} L ${x(maxPos).toFixed(1)},${baseY.toFixed(1)} Z`;
    const firstPoint = profiles[0];
    const lastPoint = profiles[profiles.length - 1];
    return {
      width,
      height,
      linePath,
      areaPath,
      minEle,
      maxEle,
      distanceKm: maxPos / 1000,
      start: { x: x(firstPoint.positionM), y: y(firstPoint.elevationM) },
      end: { x: x(lastPoint.positionM), y: y(lastPoint.elevationM) },
      maxLabelY: y(maxEle),
      minLabelY: y(minEle),
    };
  }, [profiles]);

  if (!geometry) {
    return null;
  }

  const range = geometry.maxEle - geometry.minEle;
  const distanceKm = geometry.distanceKm.toFixed(1);
  const minEle = Math.round(geometry.minEle);
  const maxEle = Math.round(geometry.maxEle);
  const ariaLabel = `Profil altimétrique sur ${distanceKm} km : altitude de ${minEle} à ${maxEle} mètres, dénivelé ${Math.round(range)} mètres.`;

  return (
    <Section id="detail-section-profile" title="Profil altimétrique">
      <div className="detail-elevation-profile">
        <svg
          className="detail-elevation-profile__svg"
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          style={{ width: '100%' }}
          role="img"
          aria-label={ariaLabel}
        >
          <path className="detail-elevation-profile__area" d={geometry.areaPath} />
          <path className="detail-elevation-profile__line" d={geometry.linePath} fill="none" />
          <circle className="detail-elevation-profile__point" cx={geometry.start.x} cy={geometry.start.y} r={4} />
          <circle className="detail-elevation-profile__point" cx={geometry.end.x} cy={geometry.end.y} r={4} />
          <text className="detail-elevation-profile__axis" x={4} y={geometry.maxLabelY} dy="0.32em">
            {maxEle} m
          </text>
          <text className="detail-elevation-profile__axis" x={4} y={geometry.minLabelY} dy="0.32em">
            {minEle} m
          </text>
        </svg>
        <p className="detail-elevation-profile__summary">
          Distance {distanceKm} km · Altitude {minEle}–{maxEle} m · Dénivelé {Math.round(range)} m
        </p>
      </div>
    </Section>
  );
}

/** Slug pour nom de fichier GPX : minuscules, accents retirés, non-alphanum → '-', repli « itineraire ». */
function slugForFilename(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'itineraire';
}

/**
 * Téléchargement PARESSEUX de la trace GPX (impl. 4.5) — jamais préchargé à
 * l'ouverture du drawer, uniquement au clic. Un seul appel en vol (les clics
 * concurrents sont ignorés pendant le chargement). Rendu par l'appelant seulement
 * quand une trace existe (gate `trackGeojson` non nul).
 */
function ItineraryGpxDownload({
  objectId,
  name,
  langPrefs,
}: {
  objectId: string;
  name: string;
  langPrefs: string[];
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const handleDownload = async () => {
    if (status === 'loading') {
      return; // un seul appel en vol
    }
    setStatus('loading');
    try {
      const track = await getObjectItineraryGpx(objectId, langPrefs);
      if (typeof window !== 'undefined') {
        const blob = new Blob([track], { type: 'application/gpx+xml;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${slugForFilename(name)}.gpx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="detail-gpx-action">
      <button
        type="button"
        className="detail-gpx-action__button"
        onClick={handleDownload}
        disabled={status === 'loading'}
      >
        <Download size={16} aria-hidden />
        {status === 'loading'
          ? 'Préparation du GPX…'
          : status === 'error'
            ? 'Réessayer'
            : 'Télécharger le GPX'}
      </button>
      {status === 'error' ? (
        <span className="detail-gpx-action__error">Impossible de générer le GPX.</span>
      ) : null}
    </div>
  );
}

export

/**
 * Phase 4 — vue de fiche pilotée par configuration. Remplace les 7 gabarits clonés
 * (un par type) par UNE vue + une table `ARCHETYPE_SECTIONS` keyée par archétype
 * (registre unique `TYPE_ARCHETYPES`). Chaque clone ne différait QUE par sa liste
 * `mainSections` ; on l'exprime ici en tokens de section. L'aside est invariant
 * (`buildAsideSections`), tout comme la chaîne de hooks/memos de préparation.
 *
 * Alignements sur le registre d'archétypes (déjà actés §48/§57, plus de dérive de
 * gabarits) : ACT → archétype ASC ⇒ disposition Activité (faits object_act) ; PNA →
 * archétype VIS ⇒ gagne un WeekScheduleSection (data-gated : null sans horaires). Tous
 * les blocs spécifiques d'un type sont data-gated (rendent null hors de leur donnée),
 * donc une section listée pour un archétype reste vide si l'objet n'a pas la donnée.
 */
type DrawerSectionKind =
  | 'apercu'
  | 'apercu-iti'
  | 'eventsNext'
  | 'events'
  | 'rooms'
  | 'meetingRooms'
  | 'restaurantMenu'
  | 'waypoints'
  | 'profile'
  | 'itineraryPractical'
  | 'activityFacts'
  | 'amenities'
  | 'weekSchedule'
  | 'pricing'
  | 'legal'
  | 'notes';

// Queue commune « équipements → (horaires) → tarifs → légal → notes ».
const TAIL_WITH_SCHEDULE: DrawerSectionKind[] = ['amenities', 'weekSchedule', 'pricing', 'legal', 'notes'];
const TAIL_NO_SCHEDULE: DrawerSectionKind[] = ['amenities', 'pricing', 'legal', 'notes'];

// Exhaustif sur ArchetypeCode (pas de fallback silencieux d'archétype — invariant §46).
const ARCHETYPE_SECTIONS: Record<ArchetypeCode, DrawerSectionKind[]> = {
  HEB: ['apercu', 'amenities', 'rooms', 'meetingRooms', 'pricing', 'legal', 'notes'],
  RES: ['apercu', 'restaurantMenu', ...TAIL_WITH_SCHEDULE],
  ITI: ['apercu-iti', 'waypoints', 'profile', 'itineraryPractical', ...TAIL_NO_SCHEDULE],
  ASC: ['apercu', 'activityFacts', ...TAIL_NO_SCHEDULE],
  VIS: ['apercu', ...TAIL_WITH_SCHEDULE],
  SRV: ['apercu', ...TAIL_WITH_SCHEDULE],
  FMA: ['eventsNext', 'events', 'apercu', ...TAIL_WITH_SCHEDULE],
};

// Type sans archétype résolu (chaîne vide / inconnue) : disposition générique.
const FALLBACK_DRAWER_SECTIONS = ARCHETYPE_SECTIONS.SRV;

function ConfigDrivenDetailView({ data, raw }: DetailViewProps) {
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
  const langPrefs = useSessionStore((state) => state.langPrefs);
  // §4.1 : projection now-relative des dates FMA (canonique + occurrences) — une seule source.
  const eventData = useMemo(
    () => buildEventDisplayData(parsed.itinerary.fma, parsed.itinerary.fmaOccurrences),
    [parsed.itinerary.fma, parsed.itinerary.fmaOccurrences],
  );
  // §4.1 : réservation = premier canal web public de type booking_engine (pas de repli site).
  const reservationHref = useMemo(
    () => preview.webChannels.find((channel) => channel.kindCode === 'booking_engine')?.href ?? '',
    [preview.webChannels],
  );

  const archetype = getArchetypeMeta(data.type);
  const kinds = (archetype && ARCHETYPE_SECTIONS[archetype.archetype]) ?? FALLBACK_DRAWER_SECTIONS;

  const renderKind = (kind: DrawerSectionKind): ReactNode => {
    switch (kind) {
      case 'apercu':
        return (
          <ApercuRegion key="apercu">
            <CapacitySection capacities={preview.capacities} openNow={preview.openNow} />
            <OverviewSection preview={preview} />
            <TaxonomySection groups={taxonomyGroups} />
          </ApercuRegion>
        );
      case 'apercu-iti':
        return (
          <ApercuRegion key="apercu">
            <ItineraryStatsSection itinerary={preview.itinerary} />
            <OverviewSection preview={preview} />
            <TaxonomySection groups={taxonomyGroups} />
          </ApercuRegion>
        );
      case 'eventsNext':
        return eventData.next ? (
          <EventNextDateSection
            key="events-next"
            next={eventData.next}
            recurring={eventData.recurring}
            recurrencePattern={eventData.recurrencePattern}
            location={preview.location}
            reservationHref={reservationHref}
          />
        ) : null;
      case 'events':
        return <EventOccurrencesSection key="events" eventData={eventData} />;
      case 'rooms':
        return <RoomList key="rooms" rooms={preview.roomTypes} />;
      case 'meetingRooms':
        return <MeetingRoomList key="meetings" rooms={preview.meetingRooms} />;
      case 'restaurantMenu':
        return <RestaurantMenuSection key="menu" raw={raw} />;
      case 'waypoints':
        return <WaypointListSection key="waypoints" stages={buildItineraryStages(parsed.itinerary.details)} />;
      case 'profile':
        return <ItineraryElevationProfileSection key="profile" profiles={preview.itinerary?.profiles ?? []} />;
      case 'itineraryPractical':
        return (
          <Fragment key="iti-practical">
            <ItineraryPracticalSection itinerary={preview.itinerary} />
            {preview.itinerary?.trackGeojson ? (
              <ItineraryGpxDownload objectId={data.id} name={data.name} langPrefs={langPrefs} />
            ) : null}
          </Fragment>
        );
      case 'activityFacts':
        return <ActivityFactsSection key="activity" raw={raw} />;
      case 'amenities':
        return <AmenitiesSection key="amenities" amenities={preview.amenities} environmentGroup={environmentGroup} />;
      case 'weekSchedule':
        return <WeekScheduleSection key="schedule" openings={preview.openings} />;
      case 'pricing':
        return <PricingAndOpeningsSection key="pricing" prices={preview.prices} sectionId="detail-section-pricing" />;
      case 'legal':
        return <LegalSection key="legal" records={parsed.internal.legalRecords} />;
      case 'notes':
        return <TeamNotesSection key="notes" objectId={data.id} notes={preview.privateNotes} />;
      default:
        return null;
    }
  };

  return (
    <DetailScaffold
      data={data}
      preview={preview}
      tabItems={tabItems}
      mainSections={kinds.map(renderKind)}
      asideSections={buildAsideSections(preview, practicalFacts, canSeeActors)}
    />
  );
}

export function ObjectDetailView({ data, raw }: DetailViewProps) {
  return <ConfigDrivenDetailView data={data} raw={raw} />;
}
