import { ChevronLeft, Pencil } from 'lucide-react';
import type { EditorMode } from './EditorTopbar.types';

export type { EditorMode } from './EditorTopbar.types';

function formatLastBaseSync(iso: string | null | undefined): string {
  if (!iso) return 'Synchronisé avec la base';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Synchronisé avec la base';
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return 'Base à jour · à l\'instant';
  if (diffSec < 3600) return `Base à jour · il y a ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `Base à jour · il y a ${Math.floor(diffSec / 3600)} h`;
  return `Dernière sync base · ${new Date(iso).toLocaleDateString('fr-FR')}`;
}

interface EditorTopbarProps {
  objectName: string;
  typeCode: string;
  archetypeCodeName: string;
  refId: string;
  mode: EditorMode;
  dirtyCount: number;
  lastSavedAt?: string | null;
  blockerCount?: number;
  warningCount?: number;
  publishing?: boolean;
  saving?: boolean;
  publishDisabled?: boolean;
  statusMessage?: string | null;
  onModeChange: (mode: EditorMode) => void;
  onPreview: () => void;
  onCancel: () => void;
  onPublish: () => void;
}

export function EditorTopbar({
  objectName,
  typeCode,
  archetypeCodeName,
  refId,
  mode,
  dirtyCount,
  lastSavedAt,
  blockerCount = 0,
  warningCount = 0,
  publishing = false,
  saving = false,
  publishDisabled = false,
  statusMessage = null,
  onModeChange,
  onPreview,
  onCancel,
  onPublish,
}: EditorTopbarProps) {
  return (
    <div className="edit-top">
      <div className="edit-top__left">
        <button type="button" className="icbtn" aria-label="Retour à l'Explorer" onClick={onCancel}>
          <ChevronLeft width={14} height={14} />
        </button>
        <div>
          <div className="edit-top__crumbs">
            <strong>{archetypeCodeName}</strong> <span className="sep">›</span>
            {objectName} <span className="sep">›</span>
            <strong style={{ color: 'var(--accent-deep)' }}>Modifier</strong>
          </div>
          <div className="edit-top__title">
            {objectName}
            <button type="button" className="pen" title="Renommer (bientôt)" disabled aria-label="Renommer">
              <Pencil width={12} height={12} />
            </button>
            <span className="edit-top__code">{typeCode}</span>
            <span className="edit-top__ref">#{refId}</span>
          </div>
        </div>
      </div>
      <div className="edit-top__right">
        <div className="mode-tog">
          <button
            type="button"
            className={mode === 'rapide' ? 'is-on' : ''}
            onClick={() => onModeChange('rapide')}
          >
            Rapide
          </button>
          <button
            type="button"
            className={mode === 'complet' ? 'is-on' : ''}
            onClick={() => onModeChange('complet')}
          >
            Complet
          </button>
        </div>
        <span className={`edit-top__save${dirtyCount > 0 ? ' is-dirty' : ''}`}>
          {dirtyCount === 0 && !statusMessage && <span className="pulse" aria-hidden />}
          {statusMessage
            ? statusMessage
            : dirtyCount > 0
              ? `${dirtyCount} modif. locale${dirtyCount > 1 ? 's' : ''} · Publier pour enregistrer`
              : formatLastBaseSync(lastSavedAt)}
        </span>
        <span className={`edit-top__validation${blockerCount > 0 ? ' has-blockers' : ''}`}>
          {blockerCount > 0
            ? `${blockerCount} blocage${blockerCount > 1 ? 's' : ''}`
            : `${warningCount} alerte${warningCount > 1 ? 's' : ''}`}
        </span>
        <button type="button" className="btn sm" onClick={onPreview}>
          Aperçu fiche
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Annuler
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={publishDisabled || publishing || saving}
          onClick={onPublish}
        >
          {publishing || saving ? 'Enregistrement…' : 'Publier'}
        </button>
      </div>
    </div>
  );
}
