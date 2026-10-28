import { useState } from 'react';
import { Chip, ChipSet, ConfirmDialog, Disclosure, Fs } from '../primitives';
import type { SectionProps } from './section-types';
import { PlaceEditModal } from '../widgets/PlaceEditModal';
import { createEmptyPlaceItem } from '../../../services/object-workspace-parser';

export function SectionPlaces({ editor, permissions, archetype, folded }: SectionProps) {
  const places = editor.draft.places;
  const location = editor.draft.location;
  const descriptions = editor.draft.descriptions;
  const canEdit = permissions.places.canDirectWrite || permissions.places.canPrepareProposal;
  const readOnly = !canEdit;
  const canEditZones = permissions.location.canEditZones;
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);

  function savePlace(index: number, next: (typeof places.items)[number]) {
    const items = places.items.map((item, itemIndex) => (itemIndex === index ? next : item));
    editor.replaceModule('places', { ...places, items });
    setEditingIndex(null);
  }

  function addPlace() {
    const nextPosition = Math.max(-1, ...places.items.map((item) => item.position)) + 1;
    const items = [...places.items, createEmptyPlaceItem(nextPosition)];
    editor.replaceModule('places', { ...places, items });
    setEditingIndex(items.length - 1);
  }

  function removePlace(index: number) {
    editor.replaceModule('places', {
      ...places,
      items: places.items.filter((_, itemIndex) => itemIndex !== index),
    });
    setEditingIndex(null);
  }

  function toggleZone(code: string) {
    const zoneCodes = location.zoneCodes.includes(code)
      ? location.zoneCodes.filter((existing) => existing !== code)
      : [...location.zoneCodes, code];
    editor.replaceModule('location', { ...location, zoneCodes });
  }

  const editingPlace = editingIndex != null ? places.items[editingIndex] : null;

  return (
    <Fs
      num="16"
      title={archetype === 'ITI' ? 'Territoire traversé' : 'Sites secondaires'}
      sub={archetype === 'ITI' ? 'Sites complémentaires et communes traversées par le parcours' : 'Sites complémentaires et communes desservies'}
      folded={folded}
      pill={{ tone: 'ok', label: `${places.items.length} lieu(x)` }}
    >
      <Disclosure
        title="Sites secondaires"
        summary={`${places.items.length} site(s)`}
        defaultOpen={places.items.length > 0}
      >
        {readOnly && (
          <p style={{ fontSize: 12, color: 'var(--ink-4)', marginBottom: 8 }}>
            Lecture seule — vos droits ne permettent pas de modifier les sites.
          </p>
        )}
        <div className="repeater" style={{ marginBottom: 8 }}>
          {places.items.map((place, index) => (
            <div
              key={place.recordId ?? `place-${index}`}
              className="rep-row"
              style={{ gridTemplateColumns: '14px 1fr auto auto', alignItems: 'center', gap: 10 }}
            >
              <span className="rep-row__handle" aria-hidden />
              <button
                type="button"
                className="linkish"
                style={{ textAlign: 'left' }}
                onClick={() => setEditingIndex(index)}
              >
                {place.label || `Site ${index + 1}`}
              </button>
              <span className="pill-mini">{place.rawVisibility === null && !place.visibilityEdited ? 'Non définie' : place.visibility}</span>
              {!readOnly && (
                <button type="button" className="del" onClick={() => setDeletingIndex(index)}>
                  Supprimer
                </button>
              )}
            </div>
          ))}
        </div>
        {!readOnly && (
          <button type="button" className="btn ghost" onClick={addPlace}>
            Ajouter un site
          </button>
        )}
      </Disclosure>

      {location.zoneOptions.length > 0 && (
        <Disclosure
          title={archetype === 'ITI' ? 'Communes traversées' : 'Communes desservies'}
          summary={`${location.zoneCodes.length} / ${location.zoneOptions.length}`}
          defaultOpen={location.zoneCodes.length > 0}
        >
          <ChipSet>
            {location.zoneOptions.map((option) => (
              <Chip
                key={option.code}
                label={option.label}
                on={location.zoneCodes.includes(option.code)}
                onClick={canEditZones ? () => toggleZone(option.code) : undefined}
              />
            ))}
          </ChipSet>
        </Disclosure>
      )}

      {editingPlace && editingIndex != null && (
        <PlaceEditModal
          open
          place={editingPlace}
          activeLanguage={descriptions.activeLanguage}
          localLanguage={descriptions.localLanguage}
          zoneOptions={location.zoneOptions}
          readOnly={readOnly}
          onSave={(next) => savePlace(editingIndex, next)}
          onClose={() => setEditingIndex(null)}
        />
      )}
      {deletingIndex != null && (
        <ConfirmDialog
          open
          title="Supprimer ce site ?"
          message={`Le site « ${places.items[deletingIndex]?.label || `Site ${deletingIndex + 1}`} » et ses adresses, descriptions et médias associés seront supprimés lors de l’enregistrement de la fiche.`}
          confirmLabel="Supprimer le site"
          tone="danger"
          onCancel={() => setDeletingIndex(null)}
          onConfirm={() => { removePlace(deletingIndex); setDeletingIndex(null); }}
        />
      )}
    </Fs>
  );
}
