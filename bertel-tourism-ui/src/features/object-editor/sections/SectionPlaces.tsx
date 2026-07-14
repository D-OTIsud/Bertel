import { useState } from 'react';
import { Chip, ChipSet, Disclosure, Fs } from '../primitives';
import type { SectionProps } from './section-types';
import { ModuleUnavailableNotice } from './blocks/block-notes';
import { PlaceEditModal } from '../widgets/PlaceEditModal';
import { createEmptyPlaceItem } from '../../../services/object-workspace-parser';

function StageList({
  stages,
  updateStage,
  readOnly,
}: {
  stages: { recordId: string | null; name: string; description: string; position: string }[];
  updateStage: (index: number, patch: { name?: string; description?: string; position?: string }) => void;
  readOnly: boolean;
}) {
  if (stages.length === 0) return null;
  const STAGE_COLS = '14px 28px 1fr 1fr 80px auto';
  return (
    <div className="repeater wp-rep">
      {stages.map((stage, index) => (
        <div key={stage.recordId ?? index} className="rep-row" style={{ gridTemplateColumns: STAGE_COLS }}>
          <span className="rep-row__handle" aria-hidden />
          <div className="wp-num">{index + 1}</div>
          <input
            className="input"
            value={stage.name}
            readOnly={readOnly}
            onChange={(event) => !readOnly && updateStage(index, { name: event.target.value })}
          />
          <span className="pill-mini">{stage.description ? 'Description…' : '—'}</span>
          <input
            className="input mono"
            value={stage.position}
            readOnly={readOnly}
            onChange={(event) => !readOnly && updateStage(index, { position: event.target.value })}
          />
          <span />
        </div>
      ))}
    </div>
  );
}

export function SectionPlaces({ editor, permissions, archetype, folded }: SectionProps) {
  const places = editor.draft.places;
  const itinerary = editor.draft.itinerary;
  const location = editor.draft.location;
  const descriptions = editor.draft.descriptions;
  const canEdit = permissions.places.canDirectWrite || permissions.places.canPrepareProposal;
  const readOnly = !canEdit;
  const canEditZones = permissions.location.canEditZones;
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  function reindex(items: typeof places.items) {
    return items.map((item, index) => ({ ...item, position: index }));
  }

  function savePlace(index: number, next: (typeof places.items)[number]) {
    const items = reindex(places.items.map((item, itemIndex) => (itemIndex === index ? next : item)));
    editor.replaceModule('places', { ...places, items });
    setEditingIndex(null);
  }

  function addPlace() {
    const items = reindex([...places.items, createEmptyPlaceItem(places.items.length)]);
    editor.replaceModule('places', { ...places, items });
    setEditingIndex(items.length - 1);
  }

  function removePlace(index: number) {
    editor.replaceModule('places', {
      ...places,
      items: reindex(places.items.filter((_, itemIndex) => itemIndex !== index)),
    });
    setEditingIndex(null);
  }

  function toggleZone(code: string) {
    const zoneCodes = location.zoneCodes.includes(code)
      ? location.zoneCodes.filter((existing) => existing !== code)
      : [...location.zoneCodes, code];
    editor.replaceModule('location', { ...location, zoneCodes });
  }

  function updateStage(index: number, patch: Partial<(typeof itinerary.stages)[number]>) {
    editor.replaceModule('itinerary', {
      ...itinerary,
      stages: itinerary.stages.map((stage, stageIndex) => (stageIndex === index ? { ...stage, ...patch } : stage)),
    });
  }

  const editingPlace = editingIndex != null ? places.items[editingIndex] : null;

  return (
    <Fs
      num="16"
      title={archetype === 'ITI' ? 'Lieux & étapes' : 'Sites secondaires'}
      sub="Sites complémentaires, étapes d'itinéraire et communes desservies"
      folded={folded}
      pill={{ tone: 'ok', label: `${places.items.length + itinerary.stages.length} lieu(x)` }}
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
              <span className="pill-mini">{place.visibility}</span>
              {!readOnly && (
                <button type="button" className="del" onClick={() => removePlace(index)}>
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

      {itinerary.unavailableReason && <ModuleUnavailableNotice reason={itinerary.unavailableReason} />}
      {!itinerary.unavailableReason && itinerary.stages.length > 0 && (
        <Disclosure title="Étapes d'itinéraire" summary={`${itinerary.stages.length} étape(s)`} defaultOpen>
          <StageList stages={itinerary.stages} updateStage={updateStage} readOnly={readOnly} />
        </Disclosure>
      )}

      {location.zoneOptions.length > 0 && (
        <Disclosure
          title="Communes desservies"
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
    </Fs>
  );
}
