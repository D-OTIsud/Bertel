import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { EditorModal, Field, Input, Chip, ChipSet } from '../primitives';
import { DishFields } from './DishEditModal';
import {
  createMenuItem,
  groupItemsBySection,
  removeMenuItem,
  updateMenuItem,
} from '../sections/blocks/menu-items';
import type {
  ObjectWorkspaceMenu,
  ObjectWorkspaceMenuItem,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';
import './catalog-modals.css';

interface MenuEditModalProps {
  open: boolean;
  menu: ObjectWorkspaceMenu;
  sectionOptions: WorkspaceReferenceOption[];
  dietaryOptions: WorkspaceReferenceOption[];
  allergenOptions: WorkspaceReferenceOption[];
  onClose: () => void;
  onSave: (menu: ObjectWorkspaceMenu) => void;
}

const MENU_NAMES = ['Carte midi', 'Carte du soir', 'Menu enfant', 'Carte des boissons'];

/** The whole menu is one local draft. Selecting a dish edits it in the right-hand panel. */
export function MenuEditModal({
  open,
  menu,
  sectionOptions,
  dietaryOptions,
  allergenOptions,
  onClose,
  onSave,
}: MenuEditModalProps) {
  const [name, setName] = useState(menu.name);
  const [items, setItems] = useState<ObjectWorkspaceMenuItem[]>(menu.items);
  const [extraSections, setExtraSections] = useState<{ code: string; label: string }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(menu.items.length ? 0 : null);
  const groups = groupItemsBySection(items, sectionOptions, extraSections);
  const usedCodes = new Set(groups.map((group) => group.code));
  const availableSections = sectionOptions.filter((option) => !usedCodes.has(option.code));
  const selected = selectedIndex === null ? null : (items[selectedIndex] ?? null);
  const unnamedNew = items.filter((item) => !item.recordId && !item.name.trim()).length;

  function addDish(sectionCode: string, sectionLabel: string) {
    setItems((current) => [...current, createMenuItem(current.length, sectionCode, sectionLabel)]);
    setSelectedIndex(items.length);
  }
  function deleteSelected() {
    if (selectedIndex === null) return;
    setItems((current) => removeMenuItem(current, selectedIndex));
    setSelectedIndex(items.length > 1 ? Math.min(selectedIndex, items.length - 2) : null);
  }
  function saveMenu() {
    if (unnamedNew) return;
    // Existing unnamed records still carry real IDs and metadata; do not prune them as new blanks.
    onSave({ ...menu, name, items });
  }

  return (
    <EditorModal
      open={open}
      size="xl"
      className="ed-menu-modal"
      title={menu.recordId ? 'Modifier le menu' : 'Ajouter un menu'}
      onClose={onClose}
      onSave={saveMenu}
      saveLabel={menu.recordId ? 'Appliquer le menu' : 'Ajouter le menu'}
      saveDisabled={unnamedNew > 0}
      footerNote={
        unnamedNew
          ? `${unnamedNew} plat${unnamedNew > 1 ? 's' : ''} à nommer`
          : `${items.length} plat${items.length > 1 ? 's' : ''} · prêt à appliquer au brouillon`
      }
    >
      <div className="ed-menu-layout">
        <div className="ed-menu-list">
          <Field label="Nom du menu">
            <Input value={name} placeholder="Nom du menu" onChange={setName} />
          </Field>
          <div className="ed-menu-names">
            <ChipSet>
              {MENU_NAMES.map((label) => (
                <Chip key={label} label={label} sm on={name === label} onClick={() => setName(label)} />
              ))}
            </ChipSet>
          </div>
          {groups.map((group) => (
            <section
              className="ed-menu-group"
              key={group.code || 'sans-section'}
              aria-label={group.label || 'Sans rubrique'}
            >
              <h3 className="ed-menu-group__heading">
                {group.label || 'Sans rubrique'}
                <span>
                  {group.dishes.length} plat{group.dishes.length > 1 ? 's' : ''}
                </span>
              </h3>
              {group.dishes.map(({ item, index }) => {
                const tags = item.dietaryTagCodes.map(
                  (code) => dietaryOptions.find((option) => option.code === code)?.label || code,
                );
                if (item.allergenCodes.length)
                  tags.push(
                    `${item.allergenCodes.length} allergène${item.allergenCodes.length > 1 ? 's' : ''}`,
                  );
                if (!item.available) tags.push('Indisponible');
                return (
                  <button
                    key={item.recordId ?? `new-${index}`}
                    type="button"
                    className="ed-menu-row"
                    aria-label={`Modifier ${item.name || 'le plat'}`}
                    aria-pressed={selectedIndex === index}
                    onClick={() => setSelectedIndex(index)}
                  >
                    <span>
                      <strong>{item.name || 'Nouveau plat'}</strong>
                      {tags.length > 0 && <small>{tags.join(' · ')}</small>}
                    </span>
                    <span>
                      {item.price ? `${item.price} ${item.currency === 'EUR' ? '€' : item.currency}` : '—'}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                className="ed-catalog-link ed-menu-add"
                onClick={() => addDish(group.code, group.label)}
              >
                <Plus size={13} aria-hidden />
                Ajouter un plat en {group.label.toLowerCase() || 'cette rubrique'}
              </button>
            </section>
          ))}
          {groups.length === 0 && (
            <p className="muted" style={{ fontSize: 12, marginTop: 18 }}>
              Ajoutez une rubrique, puis ses plats.
            </p>
          )}
          {availableSections.length > 0 && (
            <div className="ed-menu-extra-sections">
              <p>Ajouter une rubrique</p>
              <ChipSet>
                {availableSections.map((option) => (
                  <Chip
                    key={option.code}
                    label={`+ ${option.label}`}
                    sm
                    onClick={() =>
                      setExtraSections((current) => [...current, { code: option.code, label: option.label }])
                    }
                  />
                ))}
              </ChipSet>
            </div>
          )}
        </div>
        <div className="ed-menu-panel">
          {selected ? (
            <>
              <div className="ed-menu-panel__header">
                <span>Plat · {selected.sectionLabel || 'Sans rubrique'}</span>
                <button type="button" className="ed-catalog-link ed-catalog-danger" onClick={deleteSelected}>
                  <Trash2 size={13} aria-hidden />
                  Supprimer ce plat
                </button>
              </div>
              <DishFields
                draft={selected}
                dietaryOptions={dietaryOptions}
                allergenOptions={allergenOptions}
                onChange={(patch) => setItems((current) => updateMenuItem(current, selectedIndex!, patch))}
              />
            </>
          ) : (
            <div className="ed-catalog-summary">
              Sélectionnez un plat ou ajoutez-en un dans une rubrique pour le modifier.
            </div>
          )}
        </div>
      </div>
    </EditorModal>
  );
}
