import type { WorkspaceMediaOption } from '../../../services/object-workspace-parser';

/**
 * Generic media-link helpers shared by every sub-entity that *curates* (links) existing object
 * media rows rather than uploading its own files — room types (object_room_type_media), itinerary
 * stages (object_iti_stage_media), etc. The link target is an existing `media` row of the object;
 * new files are always uploaded in §05 Médias (the single media-writer invariant). These operate on
 * a flat `string[]` of media ids + the object's `WorkspaceMediaOption[]`.
 *
 * Relocated from rooms-utils.ts in §111 closeout (stage photos) so the two consumers share one
 * source of truth instead of copy-pasting the link logic.
 */

/** Append a media id once (no duplicates), preserving link order. */
export function addMediaLink(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

/** Drop a media id; a no-op for an absent id. */
export function removeMediaLink(ids: string[], id: string): string[] {
  return ids.filter((existing) => existing !== id);
}

/** Resolve linked ids to their media options, in link order, skipping stale (deleted) ids. */
export function resolveMediaLinks(ids: string[], options: WorkspaceMediaOption[]): WorkspaceMediaOption[] {
  const byId = new Map(options.map((option) => [option.id, option]));
  return ids
    .map((id) => byId.get(id))
    .filter((option): option is WorkspaceMediaOption => Boolean(option));
}

/** Object media not yet linked — the candidates the link picker offers. */
export function availableMediaLinks(ids: string[], options: WorkspaceMediaOption[]): WorkspaceMediaOption[] {
  const linked = new Set(ids);
  return options.filter((option) => !linked.has(option.id));
}

/** Storage extension drives the thumbnail choice: images render as <img>, everything else
 *  (videos, documents) gets a labelled icon tile — robust without a per-row media-type column. */
export function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(url);
}

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}
