import { isRecord } from '../../lib/json-read';
/**
 * Projection d'AFFICHAGE des étapes RÉELLES d'un itinéraire pour le drawer public
 * (PLAN 4.6). Pure. Lit `itinerary_details.stages` (object_iti_stage : `name`,
 * `description`, `extra.kind`, `lng`/`lat`, `media`, ordre serveur par
 * `position`). AUCUNE donnée inventée : le nom reste vide quand absent (jamais
 * « Étape n » comme nom) ; « Étape n » n'est qu'une métadonnée d'ordre. Une
 * étape n'est écartée que si nom + description + type + coordonnées + médias
 * sont TOUS absents.
 */
import { humanizeCode } from '../../utils/labels';
import { parseMedia, type MediaItem } from './utils';

export interface ItineraryStagePhoto {
  id: string;
  url: string;
  title: string;
  description?: string;
  credit?: string;
}

export interface ItineraryStageRow {
  key: string;
  anchorId: string;
  /** Nom réel de l'étape ; '' quand absent (jamais fabriqué). */
  name: string;
  /** Métadonnée d'ordre « Étape n » — jamais utilisée comme nom. */
  positionLabel: string;
  kindLabel: string;
  description: string;
  descriptionMd: string;
  coordinates: [number, number] | null;
  photos: ItineraryStagePhoto[];
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function isFiniteCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function stagePhoto(media: MediaItem): ItineraryStagePhoto | null {
  // Mirrors get_object_resource's public media gate; an extended editor payload
  // can still contain explicitly private or partner-only media.
  if (media.visibility && media.visibility.toLowerCase() !== 'public') return null;
  const url = media.url.trim();
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  const type = media.typeCode.toLowerCase();
  // The API uses `photo`; legacy untyped images use the same extension list as
  // the editor's linked-media thumbnails. Typed photos may use an image CDN URL.
  const isImage = type
    ? type === 'photo' || type === 'image' || type.startsWith('image/')
    : /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(url);
  if (!isImage) return null;
  return {
    id: media.id || url,
    url,
    title: media.title,
    ...(media.description ? { description: media.description } : {}),
    ...(media.credit ? { credit: media.credit } : {}),
  };
}

function stagePhotos(stage: Record<string, unknown>, mediaById: Map<string, MediaItem>): ItineraryStagePhoto[] {
  const photos: ItineraryStagePhoto[] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const links = Array.isArray(stage.media) ? stage.media : [];
  links.filter(isRecord).forEach((link) => {
    if (link.is_published === false) return;
    const mediaId = str(link.media_id);
    // Actual RPC rows are junctions: their `id` identifies the link, not the
    // media. A missing linked target must never fall back to another photo.
    const media = mediaId
      ? mediaById.get(mediaId)
      : parseMedia({ media: [link] })[0];
    if (!media) return;
    const photo = stagePhoto(media);
    if (!photo) return;
    if (!mediaId) photo.id = str(link.id) || photo.url;
    if (seenIds.has(photo.id) || seenUrls.has(photo.url)) return;
    seenIds.add(photo.id);
    seenUrls.add(photo.url);
    photos.push(photo);
  });
  return photos;
}

export function buildItineraryStages(
  details: Record<string, unknown> | null | undefined,
  objectMedia: MediaItem[] = [],
): ItineraryStageRow[] {
  const raw = Array.isArray(details?.stages) ? details!.stages : [];
  const mediaById = new Map(objectMedia.map((media) => [media.id, media]));
  const rows: ItineraryStageRow[] = [];
  raw.filter(isRecord).forEach((stage, index) => {
    const extra = isRecord(stage.extra) ? stage.extra : {};
    const kind = str(extra.kind);
    const name = str(stage.name);
    const description = str(stage.description);
    const descriptionMd = str(stage.description_md);
    const coordinates: [number, number] | null = isFiniteCoord(stage.lng) && isFiniteCoord(stage.lat)
      && Math.abs(stage.lng) <= 180 && Math.abs(stage.lat) <= 90
      ? [stage.lng, stage.lat]
      : null;
    const hasMedia = Array.isArray(stage.media) && stage.media.length > 0;

    // Écarte UNIQUEMENT une étape totalement vide.
    if (!name && !description && !descriptionMd && !kind && !coordinates && !hasMedia) return;

    rows.push({
      key: str(stage.id) || `stage-${index}`,
      anchorId: `detail-itinerary-stage-${index}`,
      name,
      positionLabel: `Étape ${rows.length + 1}`,
      kindLabel: kind ? humanizeCode(kind) : '',
      description,
      descriptionMd,
      coordinates,
      photos: stagePhotos(stage, mediaById),
    });
  });
  return rows;
}
