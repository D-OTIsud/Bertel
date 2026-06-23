import { Chip, ChipSet, Disclosure, Fs, Input, Repeater, Select } from '../primitives';
import { MarkdownCellField } from '../../../components/markdown/MarkdownCellField';
import type { SectionProps } from './section-types';
import { readTranslatableField, updateTranslatableField } from './descriptions-field';
import { ModuleUnavailableNotice } from './blocks/block-notes';

/**
 * object_place_description.visibility — a READ-AUDIENCE field (the 8t gate publishes
 * only 'public' rows to anon), NOT physical accessibility. The previous labels
 * (« ♿ Accessible / ✕ Non accessible ») misrepresented it: marking a sub-place
 * "non accessible" silently hid its description from the public.
 */
const PLACE_VISIBILITY_OPTIONS = [
  { v: 'public', l: 'Publique' },
  { v: 'partner', l: 'Partenaires' },
  { v: 'internal', l: 'Interne' },
];

// §48 §46 gate: extracted to avoid SWC ternary-in-JSX parse issues with `??` in deeply
// nested JSX attributes. Renders the itinerary stage rows or nothing (the gate is applied
// by the caller — this component is only rendered when the module is available).
function StageList({
  stages,
  updateStage,
}: {
  stages: { recordId: string | null; name: string; description: string; position: string }[];
  updateStage: (index: number, patch: { name?: string; description?: string; position?: string }) => void;
}) {
  if (stages.length === 0) return null;
  const STAGE_COLS = '14px 28px 1fr 1fr 80px auto';
  // The « Étapes d'itinéraire » label now lives on the Disclosure head (6.2).
  return (
    <>
      <div className="repeater wp-rep">
        {stages.map((stage, index) => (
          <div key={stage.recordId ?? index} className="rep-row" style={{ gridTemplateColumns: STAGE_COLS }}>
            <span className="rep-row__handle" aria-hidden />
            <div className="wp-num">{index + 1}</div>
            <Input value={stage.name} onChange={(name) => updateStage(index, { name })} />
            <MarkdownCellField
              variant="inline"
              value={stage.description}
              onChange={(description) => updateStage(index, { description })}
              ariaLabel={`Description de l'etape ${index + 1}`}
            />
            <Input value={stage.position} mono onChange={(position) => updateStage(index, { position })} />
            <span />
          </div>
        ))}
      </div>
    </>
  );
}

export function SectionPlaces({ editor, permissions, archetype, folded }: SectionProps) {
  const descriptions = editor.draft.descriptions;
  const itinerary = editor.draft.itinerary;
  const location = editor.draft.location;
  const canEditZones = permissions.location.canEditZones;
  const shouldRender = archetype === 'ITI' || archetype === 'VIS' || descriptions.places.length > 0 || itinerary.stages.length > 0;

  if (!shouldRender) {
    return null;
  }

  // §41: toggle a commune in/out of the object's service area (object_zone), persisted by the
  // location saver via save_object_places({zones}).
  function toggleZone(code: string) {
    const zoneCodes = location.zoneCodes.includes(code)
      ? location.zoneCodes.filter((existing) => existing !== code)
      : [...location.zoneCodes, code];
    editor.replaceModule('location', { ...location, zoneCodes });
  }

  function updatePlace(index: number, patch: { label?: string; description?: string; visibility?: string }) {
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
      {/* 6.2 : divulgation progressive — le détail des sous-lieux se replie. */}
      <Disclosure
        title="Sous-lieux"
        summary={`${descriptions.places.length} sous-lieu(x)`}
        defaultOpen={descriptions.places.length > 0}
      >
      <Repeater
        items={descriptions.places}
        getKey={(place, index) => `${place.placeId ?? place.recordId ?? 'place'}-${index}`}
        columns="14px 1fr 1fr 130px auto"
        addLabel="Ajouter un sous-lieu"
        onAdd={addPlace}
        renderRow={(place, index) => (
          <>
            <span className="rep-row__handle" style={{ marginTop: 6 }} aria-hidden />
            <Input value={place.label} placeholder="Nom du sous-lieu" onChange={(label) => updatePlace(index, { label })} />
            <MarkdownCellField
              variant="block"
              value={readTranslatableField(place.description, descriptions.activeLanguage, descriptions.localLanguage)}
              onChange={(value) => updatePlace(index, { description: value })}
              ariaLabel={`Description du sous-lieu (${place.label || `lieu ${index + 1}`})`}
            />
            <Select
              value={place.visibility}
              options={place.visibility === ''
                ? [{ v: '', l: 'Visibilité non définie' }, ...PLACE_VISIBILITY_OPTIONS]
                : PLACE_VISIBILITY_OPTIONS}
              onChange={(visibility) => updatePlace(index, { visibility })}
            />
            <button type="button" className="del" onClick={() => removePlace(index)}>
              Supprimer
            </button>
          </>
        )}
      />
      </Disclosure>

      {/* §48 §46 gate: the stage area edits the `itinerary` module exclusively — show
          the notice instead when the module is unavailable for this object type. The
          sub-places repeater and the zones multi-select are different modules
          (descriptions / location) and are NOT affected by this gate. */}
      {itinerary.unavailableReason && <ModuleUnavailableNotice reason={itinerary.unavailableReason} />}
      {/* 6.2 : divulgation progressive — les étapes ITI se replient (titre porté par la tête). */}
      {!itinerary.unavailableReason && itinerary.stages.length > 0 && (
        <Disclosure
          title="Étapes d'itinéraire"
          summary={`${itinerary.stages.length} étape(s)`}
          defaultOpen
        >
          <StageList stages={itinerary.stages} updateStage={updateStage} />
        </Disclosure>
      )}

      {/* 6.2 : divulgation progressive — les communes desservies se replient. */}
      {location.zoneOptions.length > 0 && (
        <Disclosure
          title="Communes desservies"
          summary={`${location.zoneCodes.length} / ${location.zoneOptions.length} · zone d’intervention (filtre Explorer)`}
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
    </Fs>
  );
}
