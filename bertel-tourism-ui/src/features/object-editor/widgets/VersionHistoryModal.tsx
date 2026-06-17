import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';
import {
  computeVersionDiff,
  formatChangeType,
  getObjectVersionSnapshot,
  type ObjectVersionDiffField,
  type ObjectVersionRow,
} from '../../../services/object-versions';

interface VersionHistoryModalProps {
  open: boolean;
  onClose: () => void;
  objectId: string;
  versions: ObjectVersionRow[];
  isLoading: boolean;
  canRestore: boolean;
  restoreDisabledReason?: string;
  /** versionNumber being restored (spinner/disable), or null. */
  restoringVersion: number | null;
  onRestore: (versionNumber: number) => void;
}

function formatDate(iso: string): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('fr-FR');
}

/**
 * Object version history: a timeline (vN · date · author · change type), each row expandable to the
 * canonical field diff (this version's snapshot vs the previous version's), and a "Restaurer cette
 * version" action that restores CANONICAL fields only (not media/prices/etc.) and creates a new version.
 */
export function VersionHistoryModal({
  open,
  onClose,
  objectId,
  versions,
  isLoading,
  canRestore,
  restoreDisabledReason,
  restoringVersion,
  onRestore,
}: VersionHistoryModalProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [diff, setDiff] = useState<ObjectVersionDiffField[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  async function toggleExpand(row: ObjectVersionRow) {
    if (expanded === row.versionNumber) {
      setExpanded(null);
      return;
    }
    setExpanded(row.versionNumber);
    setDiff([]);
    setDiffError(null);
    setDiffLoading(true);
    try {
      const idx = versions.findIndex((v) => v.versionNumber === row.versionNumber);
      const previous = idx >= 0 ? versions[idx + 1] : undefined; // versions are newest-first
      const [after, before] = await Promise.all([
        getObjectVersionSnapshot(objectId, row.versionNumber),
        previous ? getObjectVersionSnapshot(objectId, previous.versionNumber) : Promise.resolve(null),
      ]);
      setDiff(computeVersionDiff(before, after));
    } catch {
      setDiffError('Impossible de charger le détail de cette version.');
    } finally {
      setDiffLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <DialogContent className="object-editor max-w-2xl">
        <DialogHeader>
          <DialogTitle>Versions / historique</DialogTitle>
        </DialogHeader>
        <div className="version-history__body">
          <p className="version-history__warn">
            La restauration applique les <strong>champs principaux uniquement</strong> de la fiche
            (identité, type, fuseau, visibilité commerciale…) — pas les médias, tarifs, ouvertures, etc.
            Elle <strong>crée une nouvelle version</strong> ; l'historique n'est jamais réécrit.
          </p>

          {isLoading && <p className="version-history__empty">Chargement de l'historique…</p>}
          {!isLoading && versions.length === 0 && (
            <p className="version-history__empty">Aucun historique pour cette fiche.</p>
          )}

          {versions.map((row) => {
            const isExpanded = expanded === row.versionNumber;
            const isRestoring = restoringVersion === row.versionNumber;
            return (
              <div key={row.versionNumber} className="version-row">
                <div className="version-row__head">
                  <span className="version-row__num">v{row.versionNumber}</span>
                  <span className="version-row__type">{formatChangeType(row.changeType)}</span>
                  <span className="version-row__when">{formatDate(row.createdAt)}</span>
                  <span className="version-row__who">{row.createdByName || 'Système'}</span>
                  <span className="version-row__actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      aria-label={`Voir les changements de la version ${row.versionNumber}`}
                      onClick={() => void toggleExpand(row)}
                    >
                      {isExpanded ? 'Masquer' : 'Détail'}
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      aria-label={`Restaurer la version ${row.versionNumber}`}
                      disabled={!canRestore || isRestoring}
                      title={canRestore ? undefined : restoreDisabledReason}
                      onClick={() => onRestore(row.versionNumber)}
                    >
                      {isRestoring ? 'Restauration…' : 'Restaurer cette version'}
                    </button>
                  </span>
                </div>
                {isExpanded && (
                  <div className="version-row__diff">
                    {diffLoading && <p className="version-history__empty">Chargement du détail…</p>}
                    {diffError && <p className="version-history__empty">{diffError}</p>}
                    {!diffLoading && !diffError && diff.length === 0 && (
                      <p className="version-history__empty">Aucun changement de champ principal.</p>
                    )}
                    {!diffLoading && !diffError && diff.map((field) => (
                      <div key={field.key} className="version-diff__field">
                        <span className="version-diff__key">{field.key}</span>
                        <span className="version-diff__before">{field.before || '—'}</span>
                        <span className="version-diff__arrow">→</span>
                        <span className="version-diff__after">{field.after || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <button type="button" className="btn primary" onClick={onClose}>Fermer</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
