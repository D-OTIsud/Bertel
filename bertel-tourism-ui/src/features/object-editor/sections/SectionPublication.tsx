import { useState } from 'react';
import { Archive, EyeOff, Globe, RotateCcw, type LucideIcon } from 'lucide-react';
import { Chip, ChipSet, ConfirmDialog, Field, Fs, Select } from '../primitives';
import type { SectionProps } from './section-types';
import { useSetObjectStatusMutation } from '../../../hooks/useExplorerQueries';
import { computeStatusActions, STATUS_ACTION_CONFIRM, type StatusAction, type StatusActionKind } from './status-actions';

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

// One-line explanation of what the current state means — drives the lifecycle state card.
const STATUS_DESCRIPTION: Record<string, string> = {
  published: "Visible publiquement sur le site et dans l'explorateur.",
  draft: 'Brouillon — visible uniquement par votre organisation.',
  hidden: 'Hors ligne — retirée du site public, modifiable et republiable.',
  archived: "Archivée — retirée de l'explorateur, restaurable à tout moment.",
};

// Each lifecycle action carries a glyph so the row reads at a glance.
const ACTION_ICON: Record<StatusActionKind, LucideIcon> = {
  publish: Globe,
  unpublish: EyeOff,
  archive: Archive,
  restore: RotateCcw,
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
  // The lifecycle change the user clicked, held until they confirm (or cancel) in the modal.
  const [pendingAction, setPendingAction] = useState<StatusAction | null>(null);
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

  const confirm = pendingAction ? STATUS_ACTION_CONFIRM[pendingAction.kind] : null;

  return (
    <Fs num="21" title="Publication & cycle de vie" sub="Statut, visibilité commerciale, dates clés" folded={folded} pill={pill}>
      {/* État courant — carte lisible (remplace l'ancien faux champ read-only). */}
      <div className={`lifecycle-state lifecycle-state--${pill.tone}`}>
        <span className="lifecycle-state__dot" aria-hidden />
        <div className="lifecycle-state__body">
          <strong className="lifecycle-state__label">{pill.label}</strong>
          <p className="lifecycle-state__desc">{STATUS_DESCRIPTION[status] ?? 'Statut courant de la fiche.'}</p>
        </div>
        {publishedAt && (
          <div className="lifecycle-state__meta">
            <span className="lifecycle-state__meta-k">Première publication</span>
            <span className="lifecycle-state__meta-v">{publishedAt}</span>
          </div>
        )}
      </div>

      <div className="grid-3" style={{ marginTop: 14 }}>
        <Field label="Visibilité commerciale">
          <Select
            value={generalInfo.commercialVisibility}
            options={VISIBILITY_OPTIONS}
            onChange={(commercialVisibility) => editor.patchModule('generalInfo', { commercialVisibility })}
          />
        </Field>
      </div>

      <div className="lifecycle-actions">
        <div className="chip-group__label" style={{ marginTop: 0 }}>Cycle de vie</div>
        {canPublish ? (
          <>
            <div className="lifecycle-actions__row">
              {actions.map((a) => {
                const Icon = ACTION_ICON[a.kind];
                const constructive = a.kind === 'publish' || a.kind === 'restore';
                return (
                  <button
                    key={a.target}
                    type="button"
                    className={constructive ? 'btn primary' : 'btn'}
                    disabled={setStatus.isPending}
                    onClick={() => setPendingAction(a)}
                  >
                    <Icon size={14} aria-hidden />
                    {a.label}
                  </button>
                );
              })}
            </div>
            <p className="lifecycle-actions__hint">Chaque changement de statut demande une confirmation avant d'être appliqué.</p>
          </>
        ) : (
          <div className="contacts-notice">{permissions.publication.disabledReason ?? 'Lecture seule — publication.'}</div>
        )}
        {error && <div className="field__error" style={{ marginTop: 8 }}>{error}</div>}
      </div>

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

      {/* Confirmation avant tout changement de statut (action immédiate + visible publiquement). */}
      {pendingAction && confirm && (
        <ConfirmDialog
          open
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          tone={confirm.tone}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => {
            const target = pendingAction.target;
            setPendingAction(null);
            void runAction(target);
          }}
        />
      )}
    </Fs>
  );
}
