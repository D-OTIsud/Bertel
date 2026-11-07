import { useId, useState } from 'react';
import { ImagePlus, X, Film, FileText, Plus } from 'lucide-react';
import type { WorkspaceMediaOption } from '../../../services/object-workspace-parser';
import { addMediaLink, removeMediaLink, resolveMediaLinks, availableMediaLinks, isImageUrl, isVideoUrl } from './media-links';

interface MediaLinkFieldProps {
  /** Currently linked media ids (object_*_media link table), in display order. */
  mediaIds: string[];
  /** The object's media rows (§05) available to curate from. */
  options: WorkspaceMediaOption[];
  /** Patch the linked ids — the parent owns the draft. */
  onChange: (ids: string[]) => void;
  /** Muted line shown when nothing is linked yet (e.g. « …à cette chambre / cette étape »). */
  emptyLinkedHint: string;
}

const MEDIA_GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8 } as const;
const MEDIA_TILE = {
  position: 'relative', aspectRatio: '4 / 3', borderRadius: 8, overflow: 'hidden',
  border: '1px solid var(--line)', background: 'var(--bg-tint)',
} as const;
const MEDIA_IMG = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } as const;
const MEDIA_FALLBACK = {
  display: 'grid', placeItems: 'center', width: '100%', height: '100%',
  color: 'var(--ink-3)', gap: 2, padding: 4, textAlign: 'center',
} as const;

/** One media thumbnail: images render as <img>, videos/documents fall back to a labelled icon
 *  tile (the storage extension, not a per-row type column, drives the choice). */
function MediaThumb({ option }: { option: WorkspaceMediaOption }) {
  if (option.url && isImageUrl(option.url)) {
    return <img src={option.url} alt={option.label} style={MEDIA_IMG} loading="lazy" />;
  }
  const Icon = option.url && isVideoUrl(option.url) ? Film : FileText;
  return (
    <span style={MEDIA_FALLBACK}>
      <Icon size={20} aria-hidden />
      <span style={{ fontSize: 10, lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {option.label}
      </span>
    </span>
  );
}

/**
 * Reusable media-link curation field: shows the linked media as thumbnails (with a remove ✕) and a
 * « Lier une photo » picker over the object's remaining §05 media. Files themselves are uploaded in
 * §05 Médias (single media-writer invariant) — this only curates which existing rows to associate.
 * Shared by RoomEditModal (object_room_type_media) and StageEditModal (object_iti_stage_media).
 */
export function MediaLinkField({ mediaIds, options, onChange, emptyLinkedHint }: MediaLinkFieldProps) {
  const [linking, setLinking] = useState(false);
  const pickerId = useId();
  const linkedMedia = resolveMediaLinks(mediaIds, options);
  const availableMedia = availableMediaLinks(mediaIds, options);

  return (
    <>
      {linkedMedia.length > 0 ? (
        <div style={MEDIA_GRID}>
          {linkedMedia.map((m) => (
            <div key={m.id} style={MEDIA_TILE} title={m.label}>
              <MediaThumb option={m} />
              <button
                type="button"
                aria-label={`Retirer la photo ${m.label}`}
                onClick={() => onChange(removeMediaLink(mediaIds, m.id))}
                style={{
                  position: 'absolute', top: 4, right: 4, width: 22, height: 22,
                  display: 'grid', placeItems: 'center', borderRadius: 999, border: 'none',
                  background: 'rgba(0,0,0,.55)', color: '#fff', cursor: 'pointer',
                }}
              >
                <X size={13} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <span className="muted" role="status" style={{ fontSize: 12 }}>{emptyLinkedHint}</span>
      )}
      <button type="button" className="rep-add" onClick={() => setLinking((v) => !v)} aria-expanded={linking} aria-controls={pickerId}>
        <ImagePlus size={14} aria-hidden /> {linking ? 'Fermer' : 'Lier une photo'}
      </button>
      <div id={pickerId}>
      {linking && (
        options.length === 0 ? (
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
            Aucune photo n&apos;est encore enregistrée pour cet établissement. Ajoutez des photos dans la
            section <strong>Médias</strong>, puis revenez les rattacher ici.
          </p>
        ) : availableMedia.length === 0 ? (
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
            Toutes les photos de l&apos;établissement sont déjà rattachées.
          </p>
        ) : (
          <div style={{ ...MEDIA_GRID, marginTop: 8 }}>
            {availableMedia.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-label={`Lier la photo ${m.label}`}
                title={m.label}
                onClick={() => onChange(addMediaLink(mediaIds, m.id))}
                style={{ ...MEDIA_TILE, padding: 0, cursor: 'pointer' }}
              >
                <MediaThumb option={m} />
                <span
                  aria-hidden
                  style={{
                    position: 'absolute', bottom: 4, right: 4, width: 22, height: 22,
                    display: 'grid', placeItems: 'center', borderRadius: 999,
                    background: 'var(--accent, #2563eb)', color: '#fff',
                  }}
                >
                  <Plus size={13} />
                </span>
              </button>
            ))}
          </div>
        )
      )}
      </div>
    </>
  );
}
