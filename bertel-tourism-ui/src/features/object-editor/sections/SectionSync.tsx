import { Fs } from '../primitives';
import type { SectionProps } from './section-types';

export function SectionSync({ editor, folded }: SectionProps) {
  const sync = editor.draft.syncIdentifiers;
  const rows = sync.externalIdentifiers;

  return (
    <Fs num="22" title="Identifiants externes & synchronisation" sub="Correspondances inter-systèmes, provenance et dernier import" folded={folded} pill={{ tone: 'warn', label: 'Lecture seule' }}>
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <div className="kv"><span className="k">Créé le</span><span className="v">{sync.objectCreatedAt || 'Non renseigné'}</span></div>
        <div className="kv"><span className="k">Dernière source</span><span className="v">{sync.objectUpdatedAtSource || 'Non renseignée'}</span></div>
      </div>
      {rows.length > 0 ? rows.map((row) => (
        <div key={`${row.id}-${row.sourceSystem}`} className="sync-row">
          <div className="sync-row__src">{row.sourceSystem.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{row.sourceSystem}</strong>
            <small>{row.externalId}</small>
          </div>
          <span className="sync-row__when">{row.lastSyncedAt || row.updatedAt || '—'}</span>
          <button type="button" className="sync-row__btn" title="Lecture seule">🔒</button>
        </div>
      )) : (
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>{sync.externalIdentifiersVisibilityNote ?? 'Aucun identifiant externe visible.'}</p>
      )}
    </Fs>
  );
}
