import { useState } from 'react';
import { ConfirmDialog, Fs } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceExternalIdentifierItem } from '../../../services/object-workspace-parser';
import { ExternalIdEditModal } from '../widgets/ExternalIdEditModal';
import { createExternalIdDraft, isCanonicalSourceSystem } from './external-id-edit';
import { useUpsertExternalIdMutation, useDeleteExternalIdMutation } from '../../../hooks/useExplorerQueries';

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

function formatWhen(row: ObjectWorkspaceExternalIdentifierItem) {
  if (row.lastSyncedAt) {
    return row.lastSyncedAt.includes('Sync') ? row.lastSyncedAt : `Sync OK · ${row.lastSyncedAt}`;
  }
  return row.updatedAt || row.createdAt || '—';
}

type ModalState = { mode: 'add' | 'edit'; item: ObjectWorkspaceExternalIdentifierItem } | null;

export function SectionSync({ editor, permissions, objectId, folded }: SectionProps) {
  const sync = editor.draft.syncIdentifiers;
  const rows = sync.externalIdentifiers;
  const canManage = permissions.syncIdentifiers.canDirectWrite;
  const manageReason = permissions.syncIdentifiers.disabledReason ?? 'Réservé aux administrateurs.';

  const upsert = useUpsertExternalIdMutation(objectId ?? null);
  const remove = useDeleteExternalIdMutation(objectId ?? null);
  const [modal, setModal] = useState<ModalState>(null);
  const [pendingDelete, setPendingDelete] = useState<ObjectWorkspaceExternalIdentifierItem | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const syncedCount = rows.filter((r) => Boolean(r.lastSyncedAt)).length;
  const pillTone = rows.length === 0 ? 'warn' : syncedCount >= rows.length ? 'ok' : 'warn';
  const pillLabel = rows.length === 0 ? 'Lecture seule' : `${syncedCount} / ${rows.length} synchros`;

  // Optimistically patch the loaded draft so the row reflects immediately; the mutation's
  // invalidation of ['object-workspace', id] reloads the authoritative snapshot right after.
  function patchDraftRows(next: ObjectWorkspaceExternalIdentifierItem[]) {
    editor.replaceModule('syncIdentifiers', { ...sync, externalIdentifiers: next });
  }

  async function handleSave(item: ObjectWorkspaceExternalIdentifierItem) {
    setFeedback(null);
    try {
      const newId = await upsert.mutateAsync({
        sourceSystem: item.sourceSystem,
        externalId: item.externalId,
        lastSyncedAt: item.lastSyncedAt ? item.lastSyncedAt : null,
      });
      const saved: ObjectWorkspaceExternalIdentifierItem = { ...item, id: item.id || newId };
      const next = item.id
        ? rows.map((r) => (r.id === item.id ? saved : r))
        : [...rows, saved];
      patchDraftRows(next);
      setModal(null);
      setFeedback('Identifiant externe enregistré.');
    } catch (error) {
      setModal(null);
      setFeedback(error instanceof Error ? error.message : "Enregistrement impossible.");
    }
  }

  async function handleDelete(item: ObjectWorkspaceExternalIdentifierItem) {
    setFeedback(null);
    try {
      await remove.mutateAsync(item.id);
      patchDraftRows(rows.filter((r) => r.id !== item.id));
      setPendingDelete(null);
      setFeedback('Identifiant externe supprimé.');
    } catch (error) {
      setPendingDelete(null);
      setFeedback(error instanceof Error ? error.message : 'Suppression impossible.');
    }
  }

  return (
    <Fs
      num="22"
      title="Identifiants externes & synchronisation"
      sub="Correspondances inter-systèmes · dernier import · jobs planifiés"
      folded={folded}
      pill={{ tone: pillTone, label: pillLabel }}
    >
      {rows.length > 0 ? (
        rows.map((rowItem) => {
          const locked = isCanonicalSourceSystem(rowItem.sourceSystem);
          const actionsDisabled = !canManage || locked;
          const actionTitle = locked ? 'Source canonique — verrouillée' : (!canManage ? manageReason : undefined);
          return (
            <div key={`${rowItem.id}-${rowItem.sourceSystem}`} className="sync-row">
              <div className="sync-row__src">{sourceCode(rowItem.sourceSystem)}</div>
              <div>
                <strong>{rowLabel(rowItem)}</strong>
                <small>{rowItem.externalId}</small>
              </div>
              <span className="sync-row__when">{formatWhen(rowItem)}</span>
              <div className="sync-row__actions">
                <button
                  type="button"
                  className="sync-row__btn"
                  aria-label="Modifier cet identifiant"
                  title={actionTitle ?? 'Modifier'}
                  disabled={actionsDisabled}
                  onClick={() => setModal({ mode: 'edit', item: rowItem })}
                >
                  {locked ? '🔒' : '✎'}
                </button>
                <button
                  type="button"
                  className="sync-row__btn"
                  aria-label="Supprimer cet identifiant"
                  title={actionTitle ?? 'Supprimer'}
                  disabled={actionsDisabled}
                  onClick={() => setPendingDelete(rowItem)}
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })
      ) : (
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>
          {sync.externalIdentifiersVisibilityNote ?? 'Aucun identifiant externe visible.'}
        </p>
      )}

      <button
        type="button"
        className="rep-add"
        style={{ marginTop: 10 }}
        disabled={!canManage}
        title={canManage ? undefined : manageReason}
        onClick={() => setModal({ mode: 'add', item: createExternalIdDraft() })}
      >
        + Lier un nouvel identifiant externe
      </button>

      {!canManage && (
        <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>{manageReason}</p>
      )}
      {feedback && (
        <p className="muted" role="status" style={{ marginTop: 8, fontSize: 12 }}>{feedback}</p>
      )}

      {modal && (
        <ExternalIdEditModal
          open
          mode={modal.mode}
          item={modal.item}
          onClose={() => setModal(null)}
          onSave={(item) => void handleSave(item)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          open
          title="Supprimer l’identifiant externe"
          message={`Le lien ${rowLabel(pendingDelete)} (${pendingDelete.externalId}) sera supprimé. Cette action ne supprime pas la fiche source dans le système externe.`}
          confirmLabel="Supprimer"
          tone="danger"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void handleDelete(pendingDelete)}
        />
      )}
    </Fs>
  );
}
