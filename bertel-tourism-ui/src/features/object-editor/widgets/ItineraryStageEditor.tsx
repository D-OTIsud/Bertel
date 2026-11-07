import { useEffect, useRef } from 'react';
import { MapPin, X } from 'lucide-react';
import { Disclosure, Field, Input, ReferenceSelect } from '../primitives';
import { MarkdownCellField } from '../../../components/markdown/MarkdownCellField';
import { MediaLinkField } from './MediaLinkField';
import { itineraryStagePoint } from './itinerary-map-utils';
import type { ObjectWorkspaceItineraryStageSummary, WorkspaceMediaOption, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';

interface ItineraryStageEditorProps {
  stage: ObjectWorkspaceItineraryStageSummary;
  isNew: boolean;
  kindOptions: WorkspaceReferenceOption[];
  mediaOptions: WorkspaceMediaOption[];
  hasTrack: boolean;
  corridorM: number;
  placementActive: boolean;
  positionMessage: string;
  readOnly: boolean;
  onChange: (patch: Partial<ObjectWorkspaceItineraryStageSummary>) => void;
  onCorridorChange: (meters: number) => void;
  onTogglePlacement: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

export function ItineraryStageEditor({ stage, isNew, kindOptions, mediaOptions, hasTrack, corridorM, placementActive,
  positionMessage, readOnly, onChange, onCorridorChange, onTogglePlacement, onSave, onCancel, onDelete }: ItineraryStageEditorProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus({ preventScroll: true }); }, []);
  const point = itineraryStagePoint(stage);
  const invalidPoint = Boolean(stage.lng.trim() || stage.lat.trim()) && !point;
  return (
    <form className="iti-stage-editor" aria-label={isNew ? 'Nouvelle étape' : 'Modifier l’étape'} onSubmit={(event) => { event.preventDefault(); onSave(); }}>
      <header className="iti-stage-panel__header"><div><h3>{isNew ? 'Nouvelle étape' : 'Modifier l’étape'}</h3><p>Le point se place sur la grande carte.</p></div>
        <button type="button" className="iti-icon-button" aria-label="Fermer l’édition de l’étape" onClick={onCancel}><X size={16} aria-hidden /></button>
      </header>
      <fieldset className="iti-stage-editor__body" disabled={readOnly}>
        <Field label="Type d’étape"><ReferenceSelect value={stage.kind} options={kindOptions} onChange={(kind) => onChange({ kind })} allowEmpty emptyLabel="Étape" aria-label="Type d’étape" /></Field>
        <Field label="Nom de l’étape" required><input ref={nameRef} className="input" value={stage.name} onChange={(event) => onChange({ name: event.target.value })} required /></Field>
        <Disclosure title="Description" defaultOpen={Boolean(stage.description)}><MarkdownCellField variant="inline" value={stage.description} onChange={(description) => onChange({ description })} ariaLabel="Description de l’étape" disabled={readOnly} /></Disclosure>
        <div className="iti-stage-editor__position"><p>{point ? 'Point renseigné sur le parcours.' : 'Cette étape n’a pas encore de position.'}</p>
          <button type="button" className="btn sm" aria-pressed={placementActive} onClick={onTogglePlacement}><MapPin size={14} aria-hidden />{placementActive ? 'Annuler le placement' : point ? 'Déplacer le point sur la carte' : 'Positionner sur la carte'}</button>
          {hasTrack && <label className="iti-stage-editor__corridor">Tolérance autour du tracé <strong>{corridorM} m</strong><input type="range" min={10} max={200} step={10} value={corridorM} aria-label="Largeur du corridor en mètres" onChange={(event) => onCorridorChange(Number(event.target.value))} /></label>}
          {positionMessage && <p role={placementActive ? undefined : 'alert'} className="iti-trace-error">{positionMessage}</p>}
        </div>
        <Disclosure title="Coordonnées GPS"><div className="grid-2"><Field label="Latitude"><Input value={stage.lat} onChange={(lat) => onChange({ lat })} /></Field><Field label="Longitude"><Input value={stage.lng} onChange={(lng) => onChange({ lng })} /></Field></div>
          {invalidPoint && <p role="alert" className="iti-trace-error">Renseignez une latitude et une longitude valides, ou retirez les deux coordonnées.</p>}
          {point && <button type="button" className="btn sm" onClick={() => onChange({ lng: '', lat: '' })}>Retirer le point</button>}
        </Disclosure>
        <Disclosure title="Photos et médias" summary={stage.mediaIds.length > 0 ? String(stage.mediaIds.length) : undefined}><MediaLinkField mediaIds={stage.mediaIds} options={mediaOptions} onChange={(mediaIds) => onChange({ mediaIds })} emptyLinkedHint="Aucune photo rattachée à cette étape." /></Disclosure>
        {!isNew && <button type="button" className="iti-stage-editor__delete" onClick={onDelete}>Retirer cette étape</button>}
      </fieldset>
      <footer className="iti-stage-panel__footer"><button type="button" className="btn sm" onClick={onCancel}>Annuler</button><button type="submit" className="btn sm primary" disabled={readOnly || !stage.name.trim() || invalidPoint}>Valider l’étape</button></footer>
    </form>
  );
}
