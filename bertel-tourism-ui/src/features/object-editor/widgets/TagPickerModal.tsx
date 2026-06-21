import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';
import { Input } from '../primitives';
import { tagChipStyle } from '../../../utils/explorer-card';
import { createWorkspaceTag } from '../../../services/object-workspace';
import type { ObjectWorkspaceTagItem } from '../../../services/object-workspace-parser';

/**
 * Curated, on-brand hue anchors (hex). Deliberately muted, not neon: each renders through
 * tagChipStyle as a soft same-hue chip in harmony with the Explorer's teal/terracotta palette. The
 * tag's current color is prepended if not already in the set.
 */
const TAG_PALETTE = [
  '#176b6a', // teal (brand)
  '#3a6ea5', // blue
  '#5b8c5a', // sage green
  '#b88a3e', // ochre
  '#c96d3b', // terracotta (brand)
  '#b15a5a', // dusty rose
  '#8a6d9e', // plum
  '#64748b', // slate (neutral)
];

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function Swatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const palette = TAG_PALETTE.includes(value) ? TAG_PALETTE : [value, ...TAG_PALETTE];
  return (
    <div className="chip-set" style={{ marginTop: 6 }}>
      {palette.map((hex) => {
        // WYSIWYG: the swatch shows the chip's soft tint background + a dot in its dark text color, so
        // the picked color matches exactly how the tag renders on a card.
        const { backgroundColor, color } = tagChipStyle(hex);
        const selected = hex === value;
        return (
          <button
            key={hex}
            type="button"
            aria-label={`Couleur ${hex}`}
            aria-pressed={selected}
            onClick={() => onChange(hex)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: 7,
              cursor: 'pointer',
              background: backgroundColor,
              outline: selected ? '2px solid var(--ink)' : '1px solid var(--line)',
              outlineOffset: 1,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
          </button>
        );
      })}
    </div>
  );
}

interface TagPickerModalProps {
  open: boolean;
  anchorObjectId?: string;
  library: ObjectWorkspaceTagItem[];
  displayed: ObjectWorkspaceTagItem[];
  onClose: () => void;
  /** Add an existing-or-just-created tag to the displayed list (carries the canonical tagId). */
  onAdd: (tag: ObjectWorkspaceTagItem) => void;
}

/**
 * §09 — Add a tag (search existing or create). Any editor may pick the colour HERE, ONCE, at
 * creation time (api.create_tag). There is deliberately NO recolor mode: a tag's colour is GLOBAL
 * (ref_tag.color), so editing an existing tag's colour belongs to the admin-only list-administration
 * page (not yet built), never to an on-the-fly per-row control in this editor. Writes are immediate,
 * gated per-object; errors surface inline (never silently dropped).
 */
export function TagPickerModal({
  open,
  anchorObjectId,
  library,
  displayed,
  onClose,
  onAdd,
}: TagPickerModalProps) {
  const [query, setQuery] = useState('');
  const [color, setColor] = useState(TAG_PALETTE[0]);
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="object-editor">
        <DialogHeader>
          <DialogTitle>Ajouter un tag</DialogTitle>
        </DialogHeader>

        <div className="ed-modal__body">
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
              {/* Colour is chosen ONCE, at creation, by any editor. Changing it afterwards is a
                  global admin action (future list-admin page) — never an on-the-fly editor control. */}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
