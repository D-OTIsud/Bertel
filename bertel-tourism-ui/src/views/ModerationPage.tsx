"use client";

// Modération P2.1 (§120) — file de suggestions terrain (`pending_change`) câblée aux RPCs
// api.list/approve/reject_pending_change (services/rpc → services/moderation). Vue split avant /
// après + actions Approuver / Rejeter (motif obligatoire en modale). EmptyState honnête conservé.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listPendingChanges, approvePendingChange, rejectPendingChange } from '../services/rpc';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';
import { diffWords } from '../lib/diff-words';
import type { PendingChangeItem } from '../types/domain';

/** D6 — rendu du diff : Avant = same+del (<del> rouge), Après = same+ins (<ins> vert). */
function DiffText({ before, after, side }: { before: string; after: string; side: 'before' | 'after' }) {
  const segments = diffWords(before, after);
  const visible = segments.filter((segment) => segment.type === 'same' || segment.type === (side === 'before' ? 'del' : 'ins'));
  if (visible.length === 0) return <p className="mod-diff">—</p>;
  return (
    <p className="mod-diff">
      {visible.map((segment, index) =>
        segment.type === 'same' ? (
          <span key={index}>{segment.text}</span>
        ) : segment.type === 'del' ? (
          <del key={index}>{segment.text}</del>
        ) : (
          <ins key={index}>{segment.text}</ins>
        ),
      )}
    </p>
  );
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'pending', label: 'En attente' },
  { value: 'applied', label: 'Approuvées' },
  { value: 'rejected', label: 'Rejetées' },
];

export default function ModerationPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>('pending');
  // D6 : « Approuver » n'est plus fire-and-forget — confirmation nommant fiche + champ.
  const [approveTarget, setApproveTarget] = useState<PendingChangeItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingChangeItem | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['pending-changes', status],
    queryFn: () => listPendingChanges(status),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['pending-changes'] });
  }

  const approveMutation = useMutation({
    mutationFn: (id: string) => approvePendingChange(id, null),
    onSuccess: () => {
      setActionError(null);
      setApproveTarget(null);
      refresh();
    },
    onError: (error) => {
      setApproveTarget(null);
      setActionError(error instanceof Error ? error.message : "Échec de l'approbation.");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => rejectPendingChange(id, note),
    onSuccess: () => {
      setActionError(null);
      closeReject();
      refresh();
    },
    onError: (error) => setNoteError(error instanceof Error ? error.message : 'Échec du refus.'),
  });

  function closeReject() {
    setRejectTarget(null);
    setRejectNote('');
    setNoteError(null);
  }

  function submitReject() {
    if (!rejectTarget) return;
    if (rejectNote.trim().length === 0) {
      setNoteError('Un motif de refus est obligatoire.');
      return;
    }
    rejectMutation.mutate({ id: rejectTarget.id, note: rejectNote.trim() });
  }

  if (query.isLoading) {
    return <section className="panel-card panel-card--wide m-4">Chargement de la modération…</section>;
  }

  if (query.isError) {
    return (
      <section className="p-4">
        <EmptyState
          mode="error"
          title="Modération indisponible"
          description={(query.error as Error).message}
          action={{ label: 'Réessayer', onClick: () => query.refetch() }}
        />
      </section>
    );
  }

  const items = query.data ?? [];

  return (
    <section className="page-grid p-4">
      <article className="hero-panel">
        <span className="eyebrow">Contrôle</span>
        <h2>Suggestions à modérer</h2>
        <p>Vue avant / après pour valider ou refuser les modifications soumises sur les fiches de votre organisation.</p>
        <div className="inline-actions" style={{ marginTop: '0.75rem' }}>
          <label htmlFor="mod-status">Statut</label>
          <select
            id="mod-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="select-input"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </article>

      {actionError && (
        <p role="alert" className="form-error">
          {actionError}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          mode="coming-soon"
          title="Aucune suggestion à modérer"
          description="Rien à valider pour ce statut. Les suggestions terrain en attente apparaîtront ici."
        />
      ) : (
        <div className="stack-list">
          {items.map((item) => {
            const resolved = item.status && item.status !== 'pending';
            return (
              <article key={item.id} className="split-card">
                <div>
                  <span className="facet-title">Avant</span>
                  <DiffText before={item.before ?? ''} after={item.after ?? ''} side="before" />
                </div>
                <div>
                  <span className="facet-title">Après</span>
                  <DiffText before={item.before ?? ''} after={item.after ?? ''} side="after" />
                </div>
                <footer className="split-card__footer">
                  {/* D6 : métadonnées sur deux lignes (fiche/champ puis auteur/date) au lieu
                      d'une seule ligne tassée. */}
                  <span className="mod-meta">
                    <span className="mod-meta__subject">
                      <strong>{item.objectName}</strong> · {item.field || item.targetTable}
                      {resolved ? ` · ${item.status}` : ''}
                    </span>
                    <span className="mod-meta__byline">
                      {item.author} · {item.submittedAt}
                    </span>
                  </span>
                  {!resolved && (
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="primary-button"
                        disabled={approveMutation.isPending}
                        onClick={() => setApproveTarget(item)}
                      >
                        Approuver
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          setRejectTarget(item);
                          setRejectNote('');
                          setNoteError(null);
                        }}
                      >
                        Rejeter
                      </button>
                    </div>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {/* D6 : approbation confirmée — nomme la fiche et le champ, applique l'écriture
          structurée whitelistée (metadata.rpc) seulement après confirmation. */}
      <ConfirmDialog
        open={approveTarget !== null}
        title="Approuver la suggestion"
        message={
          approveTarget ? (
            <>
              La modification de <strong>{approveTarget.field || approveTarget.targetTable}</strong> sur{' '}
              <strong>{approveTarget.objectName}</strong> sera appliquée à la fiche.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Approuver"
        cancelLabel="Annuler"
        busy={approveMutation.isPending}
        onCancel={() => setApproveTarget(null)}
        onConfirm={() => {
          if (approveTarget) approveMutation.mutate(approveTarget.id);
        }}
      />

      {rejectTarget && (
        <Modal
          title="Refuser la suggestion"
          onClose={closeReject}
          footer={
            <>
              <button type="button" className="ghost-button" onClick={closeReject}>
                Annuler
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={rejectMutation.isPending}
                onClick={submitReject}
              >
                Confirmer le refus
              </button>
            </>
          }
        >
          <p>
            Refuser la modification soumise sur <strong>{rejectTarget.objectName}</strong>. Le motif est communiqué et
            tracé.
          </p>
          <label htmlFor="mod-reject-note">Motif du refus</label>
          <textarea
            id="mod-reject-note"
            value={rejectNote}
            onChange={(event) => {
              setRejectNote(event.target.value);
              if (noteError) setNoteError(null);
            }}
            rows={3}
            className="text-input"
          />
          {noteError && (
            <p role="alert" className="form-error">
              {noteError}
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}

export { ModerationPage };
