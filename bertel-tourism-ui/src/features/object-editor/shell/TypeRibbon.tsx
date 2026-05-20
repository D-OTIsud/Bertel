import type { ArchetypeMeta } from '../archetypes';
import { TYPE_LABEL } from '../archetypes';

const STATUS_RIBBON: Record<string, string> = {
  published: 'Publié',
  draft: 'Brouillon',
  archived: 'Archivé',
  hidden: 'Masqué',
};

export interface TypeRibbonProps {
  meta: ArchetypeMeta;
  /** Canonical object type code (HOT, RES, ITI, …). */
  typeCode: string;
  /** Optional override when the API exposes a richer label than TYPE_LABEL. */
  typeLabel?: string;
  /** Primary taxonomy path for this object (object_taxonomy assignment). */
  taxoPath?: string;
  status?: string;
  /** Short location hint (commune, zone, …). */
  locationHint?: string;
}

/** Accent band: this object's type + taxonomy, not the whole archetype family. */
export function TypeRibbon({ meta, typeCode, typeLabel, taxoPath, status, locationHint }: TypeRibbonProps) {
  const label = typeLabel?.trim() || TYPE_LABEL[typeCode.toUpperCase()] || typeCode;
  const statusText = status ? STATUS_RIBBON[status] ?? status : '';
  const metaParts = [statusText, locationHint?.trim()].filter(Boolean);

  return (
    <div className={`type-ribbon ${meta.accent}`}>
      <span className="blob" />
      <span>
        <strong>
          {typeCode} — {label}
        </strong>
        {taxoPath ? (
          <>
            {' '}
            <span className="type-ribbon__taxo">· {taxoPath}</span>
          </>
        ) : null}
      </span>
      {metaParts.length > 0 ? <span className="meta">{metaParts.join(' · ')}</span> : null}
    </div>
  );
}
