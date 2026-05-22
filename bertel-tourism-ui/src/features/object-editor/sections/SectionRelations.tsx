import { useState } from 'react';
import { Fs, Input, Repeater, Select } from '../primitives';
import type { SectionProps } from './section-types';
import { RelationPicker } from '../widgets/RelationPicker';
import type { ObjectSearchResult } from '../useObjectSearch';
import type { ObjectWorkspaceRelatedObjectItem } from '../../../services/object-workspace-parser';

const RELATION_TYPE_OPTIONS = [
  { v: 'based_at_site', l: 'Situé sur le site' },
  { v: 'uses_itinerary', l: 'Utilise un itinéraire' },
  { v: 'part_of', l: 'Fait partie de' },
  { v: 'part_of_park', l: "Fait partie d'un parc" },
  { v: 'inside_zone', l: 'Dans une zone' },
  { v: 'recommended_by', l: 'Recommandé par' },
  { v: 'mentioned_in', l: 'Mentionné dans' },
  { v: 'operated_by', l: 'Exploité par' },
  { v: 'near', l: 'À proximité' },
  { v: 'related', l: 'Lié' },
];

export function SectionRelations({ editor, folded, objectId = '' }: SectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const relationships = editor.draft.relationships;
  const outgoing = relationships.relatedObjects.filter((item) => item.direction !== 'in');
  const incoming = relationships.relatedObjects.filter((item) => item.direction === 'in');

  function replaceRelated(relatedObjects: ObjectWorkspaceRelatedObjectItem[]) {
    editor.replaceModule('relationships', { ...relationships, relatedObjects });
  }

  function updateOutgoing(index: number, patch: Partial<ObjectWorkspaceRelatedObjectItem>) {
    const outOnly = outgoing.map((item, outIndex) => (outIndex === index ? { ...item, ...patch } : item));
    const inOnly = incoming;
    replaceRelated([...outOnly, ...inOnly]);
  }

  function removeOutgoing(index: number) {
    const outOnly = outgoing.filter((_, outIndex) => outIndex !== index);
    replaceRelated([...outOnly, ...incoming]);
  }

  function appendRelation(result: ObjectSearchResult) {
    replaceRelated([
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
    ]);
    setPickerOpen(false);
  }

  const pillLabel = `${outgoing.length + incoming.length} lien(s)`;

  return (
    <Fs
      num="15"
      title="Liens vers d'autres fiches"
      sub="Fiches liées, rattachements, lieux supports et recommandations"
      folded={folded}
      pill={{ tone: outgoing.length > 0 ? 'ok' : 'warn', label: pillLabel }}
    >
      <div className="chip-group__label" style={{ marginTop: 0 }}>
        Liens sortants — cette fiche pointe vers
      </div>
      {outgoing.length === 0 && (
        <div className="rep-row" style={{ gridTemplateColumns: '1fr', color: 'var(--ink-4)', fontSize: 12, fontStyle: 'italic', marginBottom: 8 }}>
          Aucun lien sortant — utilisez le bouton ci-dessous pour ajouter une relation.
        </div>
      )}
      <Repeater
        items={outgoing}
        getKey={(item) => `${item.id}-${item.relationTypeCode}`}
        columns="14px 130px 1fr 110px 1.5fr auto"
        addLabel="Lier vers une fiche…"
        onAdd={() => setPickerOpen(true)}
        renderRow={(item, index) => (
          <>
            <span className="rep-row__handle" aria-hidden />
            <Select
              value={item.relationTypeCode}
              options={RELATION_TYPE_OPTIONS}
              onChange={(relationTypeCode) => {
                const option = RELATION_TYPE_OPTIONS.find((entry) => entry.v === relationTypeCode);
                updateOutgoing(index, {
                  relationTypeCode,
                  relationTypeLabel: option?.l ?? relationTypeCode,
                });
              }}
            />
            <Input value={item.name} readOnly onChange={() => undefined} />
            <Input value={item.type} mono readOnly onChange={() => undefined} />
            <Input value={item.note} placeholder="Note libre" onChange={(note) => updateOutgoing(index, { note })} />
            <button type="button" className="del" onClick={() => removeOutgoing(index)}>
              Supprimer
            </button>
          </>
        )}
      />
      {pickerOpen && <RelationPicker currentObjectId={objectId} onPick={appendRelation} />}

      <div className="chip-group__label" style={{ marginTop: 18 }}>
        Liens entrants — fiches qui pointent vers celle-ci{' '}
        <span style={{ color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(lecture seule)</span>
      </div>
      <div className="repeater">
        {incoming.length === 0 && (
          <div className="rep-row" style={{ gridTemplateColumns: '1fr', color: 'var(--ink-4)', fontSize: 12, fontStyle: 'italic' }}>
            Aucune fiche ne pointe encore vers cet objet.
          </div>
        )}
        {incoming.map((item) => (
          <div key={`${item.id}-${item.direction}`} className="rep-row" style={{ gridTemplateColumns: '14px 130px 1fr 110px 1.5fr auto' }}>
            <span className="rep-row__handle" style={{ visibility: 'hidden' }} aria-hidden />
            <span className="pill-mini" style={{ height: 22, display: 'inline-flex', alignItems: 'center' }}>
              {item.relationTypeCode || item.relationTypeLabel}
            </span>
            <strong style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>{item.name}</strong>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>{item.type}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{item.note || '—'}</span>
            <button type="button" className="icbtn" title="Ouvrir la fiche" aria-label="Ouvrir la fiche">
              ↗
            </button>
          </div>
        ))}
      </div>
    </Fs>
  );
}
