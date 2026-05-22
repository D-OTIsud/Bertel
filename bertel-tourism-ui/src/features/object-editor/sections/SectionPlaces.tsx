import { Fs, Input, Repeater, Select, Textarea } from '../primitives';
import type { SectionProps } from './section-types';
import { readTranslatableField, updateTranslatableField } from './descriptions-field';

const PLACE_KIND_OPTIONS = [
  { v: 'start', l: 'Départ / Entrée' },
  { v: 'mid', l: 'Étape / Salle' },
  { v: 'end', l: 'Arrivée / Sortie' },
  { v: 'park', l: 'Parking' },
  { v: 'wc', l: 'Sanitaires' },
  { v: 'shop', l: 'Boutique' },
];

const ACCESSIBILITY_OPTIONS = [
  { v: 'public', l: '♿ Accessible' },
  { v: 'partner', l: '◐ Partiellement' },
  { v: 'internal', l: '✕ Non accessible' },
];

function placeKindFromIndex(index: number, total: number): string {
  if (index === 0) return 'start';
  if (index === total - 1 && total > 1) return 'end';
  return 'mid';
}

export function SectionPlaces({ editor, archetype, folded }: SectionProps) {
  const descriptions = editor.draft.descriptions;
  const itinerary = editor.draft.itinerary;
  const shouldRender = archetype === 'ITI' || archetype === 'VIS' || descriptions.places.length > 0 || itinerary.stages.length > 0;

  if (!shouldRender) {
    return null;
  }

  function updatePlace(index: number, patch: { label?: string; description?: string; visibility?: string; kind?: string }) {
    const places = descriptions.places.map((place, placeIndex) => {
      if (placeIndex !== index) return place;
      const next = { ...place };
      if (patch.label !== undefined) next.label = patch.label;
      if (patch.visibility !== undefined) next.visibility = patch.visibility;
      if (patch.description !== undefined) {
        next.description = updateTranslatableField(
          place.description,
          descriptions.activeLanguage,
          descriptions.localLanguage,
          patch.description,
        );
      }
      if (patch.kind !== undefined) {
        next.chapo = updateTranslatableField(place.chapo, descriptions.localLanguage, descriptions.localLanguage, patch.kind);
      }
      return next;
    });
    editor.replaceModule('descriptions', { ...descriptions, places });
  }

  function addPlace() {
    editor.replaceModule('descriptions', {
      ...descriptions,
      places: [
        ...descriptions.places,
        {
          recordId: null,
          scope: 'place',
          placeId: null,
          label: '',
          visibility: 'public',
          description: { baseValue: '', values: {} },
          chapo: { baseValue: 'mid', values: {} },
          adaptedDescription: { baseValue: '', values: {} },
          mobileDescription: { baseValue: '', values: {} },
          editorialDescription: { baseValue: '', values: {} },
        },
      ],
    });
  }

  function removePlace(index: number) {
    editor.replaceModule('descriptions', {
      ...descriptions,
      places: descriptions.places.filter((_, placeIndex) => placeIndex !== index),
    });
  }

  function updateStage(index: number, patch: Partial<(typeof itinerary.stages)[number]>) {
    editor.replaceModule('itinerary', {
      ...itinerary,
      stages: itinerary.stages.map((stage, stageIndex) => (stageIndex === index ? { ...stage, ...patch } : stage)),
    });
  }

  return (
    <Fs
      num="16"
      title={archetype === 'ITI' ? 'Lieux & étapes' : 'Sous-lieux & description'}
      sub="Descriptions, étapes et accessibilité des sous-lieux"
      folded={folded}
      pill={{ tone: 'ok', label: `${descriptions.places.length + itinerary.stages.length} lieu(x)` }}
    >
      <Repeater
        items={descriptions.places}
        getKey={(place, index) => `${place.placeId ?? place.recordId ?? 'place'}-${index}`}
        columns="14px 110px 1fr 1fr 130px auto"
        addLabel="Ajouter un sous-lieu"
        onAdd={addPlace}
        renderRow={(place, index) => (
          <>
            <span className="rep-row__handle" style={{ marginTop: 6 }} aria-hidden />
            <Select
              value={
                readTranslatableField(place.chapo, descriptions.localLanguage, descriptions.localLanguage)
                || placeKindFromIndex(index, descriptions.places.length)
              }
              options={PLACE_KIND_OPTIONS}
              onChange={(kind) => updatePlace(index, { kind })}
            />
            <Input value={place.label} placeholder="Nom du sous-lieu" onChange={(label) => updatePlace(index, { label })} />
            <Textarea
              value={readTranslatableField(place.description, descriptions.activeLanguage, descriptions.localLanguage)}
              rows={2}
              onChange={(value) => updatePlace(index, { description: value })}
            />
            <Select
              value={place.visibility}
              options={ACCESSIBILITY_OPTIONS}
              onChange={(visibility) => updatePlace(index, { visibility })}
            />
            <button type="button" className="del" onClick={() => removePlace(index)}>
              Supprimer
            </button>
          </>
        )}
      />

      {itinerary.stages.length > 0 && <div className="chip-group__label">Étapes d’itinéraire</div>}
      <div className="repeater wp-rep">
        {itinerary.stages.map((stage, index) => (
          <div key={stage.recordId ?? index} className="rep-row" style={{ gridTemplateColumns: '14px 28px 110px 1fr 1fr 80px auto' }}>
            <span className="rep-row__handle" aria-hidden />
            <div className="wp-num">{index + 1}</div>
            <Select
              value={placeKindFromIndex(index, itinerary.stages.length)}
              options={PLACE_KIND_OPTIONS}
              onChange={() => undefined}
            />
            <Input value={stage.name} onChange={(name) => updateStage(index, { name })} />
            <Input value={stage.description} onChange={(description) => updateStage(index, { description })} />
            <Input value={stage.position} mono onChange={(position) => updateStage(index, { position })} />
            <span />
          </div>
        ))}
      </div>
    </Fs>
  );
}
