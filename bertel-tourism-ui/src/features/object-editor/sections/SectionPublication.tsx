import { useState } from 'react';
import { Chip, ChipSet, Field, Fs, Input, Select } from '../primitives';
import type { SectionProps } from './section-types';
import { useSetObjectStatusMutation } from '../../../hooks/useExplorerQueries';
import { computeStatusActions } from './status-actions';

const VISIBILITY_OPTIONS = [
  { v: 'active', l: 'Complète' },
  { v: 'private', l: 'Privée' },
  { v: 'lapsed', l: 'En pause' },
  { v: 'suspended', l: 'Masquée' },
];

// Read-only status chip tones reuse the existing .fs-pill ok/warn styling.
const STATUS_PILL: Record<string, { tone: 'ok' | 'warn'; label: string }> = {
  published: { tone: 'ok', label: 'Publié — en ligne' },
  draft: { tone: 'warn', label: 'Brouillon' },
  hidden: { tone: 'warn', label: 'Hors ligne' },
  archived: { tone: 'warn', label: 'Archivé' },
};

export function SectionPublication({ editor, permissions, objectId, folded }: SectionProps) {
  const publication = editor.draft.publication;
  const generalInfo = editor.draft.generalInfo;
  const memberships = editor.draft.memberships;
  const status = generalInfo.status || publication.status || 'draft';
  const publishedAt = publication.publishedAt || generalInfo.publishedAt || '';
  const pill = STATUS_PILL[status] ?? { tone: 'warn' as const, label: status };

  const canPublish = permissions.publication.canDirectWrite;
  const setStatus = useSetObjectStatusMutation(objectId ?? null);
  const [error, setError] = useState<string | null>(null);
  const actions = computeStatusActions(status, publishedAt);

  async function runAction(target: Parameters<typeof setStatus.mutateAsync>[0]) {
    setError(null);
    try {
      await setStatus.mutateAsync(target);
      editor.setSavedStatus(target);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Changement de statut impossible.');
    }
  }

  return (
    <Fs num="21" title="Publication & cycle de vie" sub="Statut, visibilité commerciale, dates clés" folded={folded} pill={pill}>
      <div className="grid-3" style={{ marginBottom: 12 }}>
        <Field label="Statut courant">
          <div className={`fs-pill ${pill.tone}`} style={{ display: 'inline-flex' }}>{pill.label}</div>
        </Field>
        <Field label="Visibilité commerciale">
          <Select
            value={generalInfo.commercialVisibility}
            options={VISIBILITY_OPTIONS}
            onChange={(commercialVisibility) => editor.patchModule('generalInfo', { commercialVisibility })}
          />
        </Field>
        <Field label="Première publication">
          <Input value={publishedAt} mono readOnly placeholder="—" onChange={() => undefined} />
        </Field>
      </div>

      <div className="chip-group__label">Cycle de vie</div>
      {canPublish ? (
        <div className="edit-footer__actions" style={{ gap: 8 }}>
          {actions.map((a) => (
            <button
              key={a.target}
              type="button"
              className={a.target === 'published' ? 'btn primary' : 'btn'}
              disabled={setStatus.isPending}
              onClick={() => void runAction(a.target)}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="contacts-notice">{permissions.publication.disabledReason ?? 'Lecture seule — publication.'}</div>
      )}
      {error && <div className="field__error" style={{ marginTop: 8 }}>{error}</div>}

      {publication.moderation.items.length > 0 || publication.printPublications.items.length > 0 ? (
        <div className="grid-2" style={{ marginTop: 14 }}>
          {publication.moderation.items.length > 0 && (
            <div>
              <div className="chip-group__label" style={{ marginTop: 0 }}>Modération</div>
              <div className="kv"><span className="k">En attente</span><span className="v">{publication.moderation.pendingCount}</span></div>
              {publication.moderation.items.map((item) => (
                <div key={item.id} className="kv"><span className="k">{item.status}</span><span className="v">{item.summary}</span></div>
              ))}
            </div>
          )}
          {publication.printPublications.items.length > 0 && (
            <div>
              <div className="chip-group__label" style={{ marginTop: 0 }}>Supports imprimés</div>
              <div className="kv"><span className="k">Sélections</span><span className="v">{publication.printPublications.selectionCount}</span></div>
              {publication.printPublications.items.map((item) => (
                <div key={`${item.publicationId}-${item.workflowStatus}`} className="kv"><span className="k">{item.workflowStatus}</span><span className="v">{item.publicationName || item.publicationCode}</span></div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="chip-group__label" style={{ marginTop: 14 }}>Résumé publication</div>
      <ChipSet>
        <Chip label={pill.label} on />
        {publishedAt && <Chip label={`Publié le ${publishedAt}`} on />}
        {memberships.items.length > 0 && <Chip label={`${memberships.items.length} adhésion(s)`} on />}
      </ChipSet>
    </Fs>
  );
}
