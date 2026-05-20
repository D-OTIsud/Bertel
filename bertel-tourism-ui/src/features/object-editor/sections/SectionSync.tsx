import { Fs } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceExternalIdentifierItem } from '../../../services/object-workspace-parser';

const SOURCE_LABELS: Record<string, string> = {
  OTI: 'ID OTI (canonical)',
  AT: 'Airtable recId',
  DT: 'DataTourisme URI',
  AP: 'Apidae object_id',
  SU: 'Supabase row_id',
};

function sourceCode(sourceSystem: string) {
  const normalized = sourceSystem.trim();
  if (normalized.length <= 3 && normalized === normalized.toUpperCase()) {
    return normalized;
  }
  return normalized.slice(0, 2).toUpperCase();
}

function rowLabel(row: ObjectWorkspaceExternalIdentifierItem) {
  const code = sourceCode(row.sourceSystem);
  return SOURCE_LABELS[code] ?? row.sourceSystem;
}

function isCanonicalLocked(row: ObjectWorkspaceExternalIdentifierItem) {
  const code = sourceCode(row.sourceSystem);
  return code === 'OTI' || code === 'SU' || row.sourceSystem.toLowerCase().includes('canonical');
}

function formatWhen(row: ObjectWorkspaceExternalIdentifierItem) {
  if (row.lastSyncedAt) {
    return row.lastSyncedAt.includes('Sync') ? row.lastSyncedAt : `Sync OK · ${row.lastSyncedAt}`;
  }
  return row.updatedAt || row.createdAt || '—';
}

export function SectionSync({ editor, folded }: SectionProps) {
  const sync = editor.draft.syncIdentifiers;
  const rows = sync.externalIdentifiers;
  const syncedCount = rows.filter((r) => Boolean(r.lastSyncedAt)).length;
  const pillTone = rows.length === 0 ? 'warn' : syncedCount >= rows.length ? 'ok' : 'warn';
  const pillLabel = rows.length === 0 ? 'Lecture seule' : `${syncedCount} / ${rows.length} synchros`;

  return (
    <Fs
      num="22"
      title="Identifiants externes & synchronisation"
      sub="Correspondances inter-systèmes · dernier import · jobs planifiés"
      folded={folded}
      pill={{ tone: pillTone, label: pillLabel }}
    >
      {rows.length > 0 ? (
        rows.map((row) => {
          const editable = !isCanonicalLocked(row);
          return (
            <div key={`${row.id}-${row.sourceSystem}`} className="sync-row">
              <div className="sync-row__src">{sourceCode(row.sourceSystem)}</div>
              <div>
                <strong>{rowLabel(row)}</strong>
                <small>{row.externalId}</small>
              </div>
              <span className="sync-row__when">{formatWhen(row)}</span>
              <button
                type="button"
                className="sync-row__btn"
                title={editable ? 'Modifier (bientôt)' : 'Lecture seule'}
                disabled
              >
                {editable ? '✎' : '🔒'}
              </button>
            </div>
          );
        })
      ) : (
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>
          {sync.externalIdentifiersVisibilityNote ?? 'Aucun identifiant externe visible.'}
        </p>
      )}

      <button type="button" className="rep-add" style={{ marginTop: 10 }} disabled title="Lecture seule">
        + Lier un nouvel identifiant externe
      </button>
    </Fs>
  );
}
