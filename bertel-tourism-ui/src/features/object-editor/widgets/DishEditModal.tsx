import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { EditorModal, Field, Input, Chip, ChipSet, Toggle } from '../primitives';
import { MarkdownEditorLazy } from '../../../components/markdown/MarkdownEditorLazy';
import type {
  ObjectWorkspaceMenuItem,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';
import { toggleItemCode } from '../sections/blocks/menu-items';
import './catalog-modals.css';

interface DishEditModalProps {
  open: boolean;
  dish: ObjectWorkspaceMenuItem;
  /** Section the dish belongs to (Entrée/Plat/Dessert…), shown in the title. */
  sectionLabel: string;
  dietaryOptions: WorkspaceReferenceOption[];
  allergenOptions: WorkspaceReferenceOption[];
  onClose: () => void;
  onSave: (dish: ObjectWorkspaceMenuItem) => void;
  /** Present for an existing dish — offers a delete action inside the modal. */
  onDelete?: () => void;
}

/**
 * §06 P2c — single-dish editor (object_menu_item): name, price, description/ingrédients, régimes,
 * allergènes, disponibilité, + delete. Opened from a menu's expanded section (one dish at a time).
 * Cuisine is NOT authored per dish (global object-level facet, §06 P1); unit is dropped (flat price).
 */
export function DishFields({
  draft,
  dietaryOptions,
  allergenOptions,
  onChange,
}: {
  draft: ObjectWorkspaceMenuItem;
  dietaryOptions: WorkspaceReferenceOption[];
  allergenOptions: WorkspaceReferenceOption[];
  onChange: (patch: Partial<ObjectWorkspaceMenuItem>) => void;
}) {
  const originCodes = new Set(['local', 'organic', 'bio', 'biologique']);
  const originOptions = dietaryOptions.filter((option) => originCodes.has(option.code.toLowerCase()));
  const dietOptions = dietaryOptions.filter((option) => !originCodes.has(option.code.toLowerCase()));
  const set = onChange;
  return (
    <>
      <div className="ed-catalog-name-price">
        <Field label="Nom du plat" required>
          <Input value={draft.name} placeholder="ex. Cari poulet" onChange={(name) => set({ name })} />
        </Field>
        <Field label="Prix facultatif">
          <Input
            type="number"
            value={draft.price}
            mono
            suffix={draft.currency === 'EUR' ? '€' : draft.currency}
            aria-label="Prix du plat"
            onChange={(price) => set({ price })}
          />
        </Field>
      </div>

      <div className="ed-dish-description">
        <Field label="Ce qu’il y a dedans" hint="facultatif">
          <MarkdownEditorLazy
            value={draft.description}
            onChange={(description) => set({ description })}
            ariaLabel="Description du plat"
            variant="inline"
          />
        </Field>
      </div>

      {dietOptions.length > 0 && (
        <section className="ed-catalog-section" aria-label="Régime">
          <h3>
            Régime <small>facultatif</small>
          </h3>
          <ChipSet>
            {dietOptions.map((o) => (
              <Chip
                key={o.code}
                label={o.label}
                sm
                on={draft.dietaryTagCodes.includes(o.code)}
                onClick={() => set({ dietaryTagCodes: toggleItemCode(draft.dietaryTagCodes, o.code) })}
              />
            ))}
          </ChipSet>
        </section>
      )}

      {originOptions.length > 0 && (
        <section className="ed-catalog-section" aria-label="Origine et qualité">
          <h3>
            Origine &amp; qualité <small>facultatif</small>
          </h3>
          <ChipSet>
            {originOptions.map((option) => (
              <Chip
                key={option.code}
                label={option.label}
                sm
                on={draft.dietaryTagCodes.includes(option.code)}
                onClick={() => set({ dietaryTagCodes: toggleItemCode(draft.dietaryTagCodes, option.code) })}
              />
            ))}
          </ChipSet>
        </section>
      )}

      {allergenOptions.length > 0 && (
        <section className="ed-catalog-section" aria-label="Allergènes présents">
          <h3>
            Allergènes présents <small>facultatif</small>
          </h3>
          <ChipSet>
            {allergenOptions.map((o) => (
              <Chip
                key={o.code}
                label={o.label}
                sm
                on={draft.allergenCodes.includes(o.code)}
                onClick={() => set({ allergenCodes: toggleItemCode(draft.allergenCodes, o.code) })}
              />
            ))}
          </ChipSet>
        </section>
      )}

      <div className="ed-dish-availability">
        <Toggle label="Disponible" on={draft.available} onChange={(available) => set({ available })} />
      </div>

      <DishSummary draft={draft} dietaryOptions={dietaryOptions} />
    </>
  );
}

export function DishSummary({
  draft,
  dietaryOptions,
}: {
  draft: ObjectWorkspaceMenuItem;
  dietaryOptions: WorkspaceReferenceOption[];
}) {
  return (
    <div className="ed-catalog-summary">
      <small>Sur la carte :</small>
      <div className="ed-catalog-summary__line">
        <strong>{draft.name || 'Nom du plat'}</strong>
        {draft.price && (
          <span>
            {draft.price} {draft.currency === 'EUR' ? '€' : draft.currency}
          </span>
        )}
      </div>
      {draft.description && <p>{draft.description}</p>}
      {draft.dietaryTagCodes.length > 0 && (
        <p>
          {draft.dietaryTagCodes
            .map((code) => dietaryOptions.find((option) => option.code === code)?.label || code)
            .join(' · ')}
        </p>
      )}
      {!draft.available && <p>Indisponible</p>}
    </div>
  );
}

export function DishEditModal({
  open,
  dish,
  sectionLabel,
  dietaryOptions,
  allergenOptions,
  onClose,
  onSave,
  onDelete,
}: DishEditModalProps) {
  const [draft, setDraft] = useState(dish);
  return (
    <EditorModal
      open={open}
      title={dish.recordId ? 'Modifier le plat' : 'Ajouter un plat'}
      eyebrow={sectionLabel || undefined}
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveDisabled={!draft.name.trim()}
      saveLabel={dish.recordId ? 'Appliquer' : 'Ajouter'}
      footerNote={draft.name.trim() ? 'Prêt à appliquer au brouillon' : '1 point à compléter'}
    >
      <DishFields
        draft={draft}
        dietaryOptions={dietaryOptions}
        allergenOptions={allergenOptions}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      />

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 8,
            background: 'transparent',
            border: 'none',
            color: 'var(--danger, #c0392b)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            padding: 0,
          }}
        >
          <Trash2 size={15} aria-hidden /> Supprimer ce plat
        </button>
      )}
    </EditorModal>
  );
}
