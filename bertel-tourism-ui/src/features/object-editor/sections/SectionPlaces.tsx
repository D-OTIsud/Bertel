import { Fs, Field, Input, Textarea } from '../primitives';
import type { SectionProps } from './section-types';
import { readTranslatableField, updateTranslatableField } from './descriptions-field';

export function SectionPlaces({ editor, archetype, folded }: SectionProps) {
  const descriptions = editor.draft.descriptions;
  const itinerary = editor.draft.itinerary;
  const shouldRender = archetype === 'ITI' || archetype === 'VIS' || descriptions.places.length > 0 || itinerary.stages.length > 0;

  if (!shouldRender) {
    return null;
  }

  function updatePlace(index: number, field: 'label' | 'description', value: string) {
    const places = descriptions.places.map((place, placeIndex) => {
      if (placeIndex !== index) return place;
      if (field === 'label') return { ...place, label: value };
      return {
        ...place,
        description: updateTranslatableField(place.description, descriptions.activeLanguage, descriptions.localLanguage, value),
      };
    });
    editor.replaceModule('descriptions', { ...descriptions, places });
  }

  function updateStage(index: number, patch: Partial<(typeof itinerary.stages)[number]>) {
    editor.replaceModule('itinerary', {
      ...itinerary,
      stages: itinerary.stages.map((stage, stageIndex) => stageIndex === index ? { ...stage, ...patch } : stage),
    });
  }

  return (
    <Fs num="16" title={archetype === 'ITI' ? 'Lieux & étapes' : 'Sous-lieux'} sub="Sous-lieux descriptifs et étapes d’itinéraire" folded={folded}>
      {descriptions.places.map((place, index) => (
        <Field key={place.placeId ?? index} label={place.label || `Sous-lieu ${index + 1}`}>
          <Input value={place.label} onChange={(label) => updatePlace(index, 'label', label)} />
          <Textarea value={readTranslatableField(place.description, descriptions.activeLanguage)} rows={3} onChange={(value) => updatePlace(index, 'description', value)} />
        </Field>
      ))}

      {itinerary.stages.length > 0 && <div className="chip-group__label">Étapes</div>}
      <div className="repeater wp-rep">
        {itinerary.stages.map((stage, index) => (
          <div key={stage.recordId ?? index} className="rep-row" style={{ gridTemplateColumns: '28px 1fr 1fr 80px' }}>
            <div className="wp-num">{index + 1}</div>
            <Input value={stage.name} onChange={(name) => updateStage(index, { name })} />
            <Input value={stage.description} onChange={(description) => updateStage(index, { description })} />
            <Input value={stage.position} mono onChange={(position) => updateStage(index, { position })} />
          </div>
        ))}
      </div>
    </Fs>
  );
}
