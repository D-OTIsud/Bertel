import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';
import { Input } from '../primitives';
import { tagChipStyle } from '../../../utils/explorer-card';
import { createWorkspaceTag, setWorkspaceTagColor } from '../../../services/object-workspace';
import type { ObjectWorkspaceTagItem } from '../../../services/object-workspace-parser';

/** Curated swatch palette (hex). The tag's current color is prepended if not already in the set. */
const TAG_PALETTE = [
  '#14b8a6', '#f97316', '#3b82f6', '#8b5cf6', '#22c55e',
  '#f59e0b', '#0ea5e9', '#ef4444', '#a16207', '#64748b',
];

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function Swatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const palette = TAG_PALETTE.includes(value) ? TAG_PALETTE : [value, ...TAG_PALETTE];
  return (
    <div className="chip-set" style={{ marginTop: 6 }}>
      {palette.map((hex) => (
        <button
          key={hex}
          type="button"
          aria-label={`Couleur ${hex}`}
          aria-pressed={hex === value}
          onClick={() => onChange(hex)}
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            cursor: 'pointer',
            background: hex,
            outline: hex === value ? '2px solid var(--ink)' : '1px solid var(--line)',
            outlineOffset: 1,
          }}
        />
      ))}
    </div>
  );
}

interface TagPickerModalProps {
  open: boolean;
  mode: 'add' | 'color';
  anchorObjectId?: string;
  library: ObjectWorkspaceTagItem[];
  displayed: ObjectWorkspaceTagItem[];
  editTag?: ObjectWorkspaceTagItem | null;
  onClose: () => void;
  /** Add an existing-or-just-created tag to the displayed list (carries the canonical tagId). */
  onAdd: (tag: ObjectWorkspaceTagItem) => void;
  /** A tag's GLOBAL color changed (after api.set_tag_color). */
  onRecolor: (tagId: string, color: string) => void;
}

/**
 * §09 — Add / Create / Recolor tags. One modal, two modes (mirrors the §08 ClassificationEditModal
 * house pattern on the shared Dialog shell):
 *  - mode='add'   : search existing tags (click to add) + dedup-guarded create (api.create_tag).
 *  - mode='color' : recolor a tag GLOBALLY (api.set_tag_color) — applies to every object/surface.
 * Both global writes are immediate, gated per-object; errors surface inline (never silently dropped).
 */
export function TagPickerModal({
  open,
  mode,
  anchorObjectId,
  library,
  displayed,
  editTag,
  onClose,
  onAdd,
  onRecolor,
}: TagPickerModalProps) {
  const [query, setQuery] = useState('');
  const [color, setColor] = useState(mode === 'color' ? editTag?.color ?? TAG_PALETTE[0] : TAG_PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayedKeys = useMemo(() => new Set(displayed.map((t) => normalizeKey(t.label))), [displayed]);
  const q = query.trim();
  const qKey = normalizeKey(q);

  const matches = useMemo(
    () =>
      library.filter(
        (t) =>
          !displayedKeys.has(normalizeKey(t.label)) &&
          (!qKey || normalizeKey(t.label).includes(qKey) || normalizeKey(t.slug).includes(qKey)),
      ),
    [library, displayedKeys, qKey],
  );

  // The "Créer" affordance only appears when the trimmed query has NO exact normalized match
  // (existing library tag OR an already-displayed one) — so a near-duplicate surfaces the existing tag.
  const exactExists = library.some((t) => normalizeKey(t.label) === qKey) || displayedKeys.has(qKey);

  function addExisting(tag: ObjectWorkspaceTagItem) {
    onAdd(tag);
    onClose();
  }

  async function handleCreate() {
    if (!q || !anchorObjectId) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createWorkspaceTag(anchorObjectId, q, color);
      onAdd(created);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRecolor() {
    if (!editTag || !anchorObjectId) return;
    setBusy(true);
    setError(null);
    try {
      const next = await setWorkspaceTagColor(anchorObjectId, editTag.tagId, color);
      onRecolor(editTag.tagId, next);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Changement de couleur impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="object-editor">
        <DialogHeader>
          <DialogTitle>{mode === 'color' ? 'Couleur du tag' : 'Ajouter un tag'}</DialogTitle>
        </DialogHeader>

        <div className="ed-modal__body">
          {mode === 'color' ? (
            <>
              <span
                style={{ ...tagChipStyle(color), display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}
              >
                {editTag?.label}
              </span>
              <Swatches value={color} onChange={setColor} />
              <p className="muted" style={{ marginTop: 8 }}>
                La couleur est globale : elle s’applique à ce tag sur toutes les fiches.
              </p>
            </>
          ) : (
            <>
              <Input
                value={query}
                onChange={setQuery}
                placeholder="Rechercher ou créer un tag…"
                aria-label="Rechercher ou créer un tag"
              />
              <div className="chip-set" style={{ marginTop: 10 }}>
                {matches.map((tag) => (
                  <button
                    key={tag.tagId || tag.slug}
                    type="button"
                    onClick={() => addExisting(tag)}
                    style={{ ...tagChipStyle(tag.color), padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {tag.label}
                  </button>
                ))}
                {matches.length === 0 && !q ? (
                  <p className="muted">Saisir un nom pour rechercher ou créer un tag.</p>
                ) : null}
              </div>

              {q && !exactExists ? (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                  <div className="chip-group__label" style={{ marginTop: 0 }}>
                    Nouveau tag
                  </div>
                  <Swatches value={color} onChange={setColor} />
                  <button
                    type="button"
                    className="btn primary"
                    style={{ marginTop: 10 }}
                    onClick={handleCreate}
                    disabled={busy || !anchorObjectId}
                  >
                    Créer « {q} »
                  </button>
                  {!anchorObjectId ? (
                    <p className="muted" style={{ marginTop: 6 }}>Enregistrez la fiche avant de créer un tag.</p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}

          {error ? (
            <p role="alert" style={{ marginTop: 10, color: 'var(--red, #93392a)', fontSize: 12 }}>
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <button type="button" className="btn" onClick={onClose}>
            Fermer
          </button>
          {mode === 'color' ? (
            <button type="button" className="btn primary" onClick={handleRecolor} disabled={busy || !anchorObjectId}>
              Enregistrer
            </button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
