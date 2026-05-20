import { useState } from 'react';
import { Fs, Input, Select } from '../primitives';
import type { SectionProps } from './section-types';
import { RelationPicker } from '../widgets/RelationPicker';
import type { ObjectSearchResult } from '../useObjectSearch';

export function SectionRelations({ editor, folded, objectId = '' }: SectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const relationships = editor.draft.relationships;
  const outgoing = relationships.relatedObjects.filter((item) => item.direction !== 'in');
  const incoming = relationships.relatedObjects.filter((item) => item.direction === 'in');

  function appendRelation(result: ObjectSearchResult) {
    editor.replaceModule('relationships', {
      ...relationships,
      relatedObjects: [
        ...relationships.relatedObjects,
        {
          id: result.id,
          name: result.name,
          type: result.type,
          status: result.status,
          relationTypeId: '',
          relationTypeCode: 'related',
          relationTypeLabel: 'Lié',
          direction: 'out',
          note: '',
          distanceM: '',
        },
      ],
    });
    setPickerOpen(false);
  }

  return (
    <Fs num="15" title="Liens vers fiches" sub="Relations sortantes, entrantes et associées" folded={folded} pill={{ tone: 'warn', label: 'Lecture seule' }}>
      <div className="section-toolbar">
        <button type="button" className="btn sm" onClick={() => setPickerOpen((value) => !value)}>
          Lier vers une fiche
        </button>
        <span className="toolbar-note">Prévisualisation locale: les relations restent non sauvegardées tant que le module est en lecture seule.</span>
      </div>
      {pickerOpen && <RelationPicker currentObjectId={objectId} onPick={appendRelation} />}

      <div className="chip-group__label" style={{ marginTop: 0 }}>Relations sortantes</div>
      <div className="repeater">
        {outgoing.map((item) => (
          <div key={`${item.id}-${item.relationTypeCode}`} className="rep-row" style={{ gridTemplateColumns: '140px 1fr 100px 1fr' }}>
            <Select value={item.relationTypeCode} options={[item.relationTypeCode || item.relationTypeLabel]} onChange={() => undefined} />
            <Input value={item.name} readOnly onChange={() => undefined} />
            <Input value={item.type} readOnly onChange={() => undefined} />
            <Input value={item.note} readOnly onChange={() => undefined} />
          </div>
        ))}
      </div>

      <div className="chip-group__label">Relations entrantes</div>
      {incoming.map((item) => (
        <div key={`${item.id}-${item.direction}`} className="kv">
          <span className="k">{item.relationTypeLabel || item.relationTypeCode || 'Relation'}</span>
          <span className="v">{item.name} · {item.type || 'type inconnu'}</span>
        </div>
      ))}
    </Fs>
  );
}
