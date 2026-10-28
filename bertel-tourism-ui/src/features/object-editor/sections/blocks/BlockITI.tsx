import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { Chip, ChipSet, Disclosure, EditorModal, Field, Fs, Input, ReferenceSelect, SortableList, StatCard, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';
import { ModuleUnavailableNotice } from './block-notes';
import { formatDurationShort, stepMetric } from './iti-metrics';
import { ItiTraceMap } from '../../widgets/ItiTraceMap';
import { ItineraryStageEditor } from '../../widgets/ItineraryStageEditor';
import { AssociatedObjectModal } from '../../widgets/AssociatedObjectModal';
import { itineraryStagePoint } from '../../widgets/itinerary-map-utils';
import { isInsideCorridor } from './corridor';
import { EnvironmentChips } from '../capacity-controls';
import { SectionOpenings } from '../SectionOpenings';
import type { ObjectWorkspaceItineraryStageSummary } from '../../../../services/object-workspace-parser';
import '../../itinerary-editor.css';

function stageDndId(stage: ObjectWorkspaceItineraryStageSummary, index: number): string {
  return stage.recordId ?? stage.uid ?? `stage-${index}`;
}

export function BlockITI(props: SectionProps) {
  const { editor, permissions, folded } = props;
  const itinerary = editor.draft.itinerary;
  const [practicesOpen, setPracticesOpen] = useState(false);
  const [practicesDraft, setPracticesDraft] = useState<string[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [stageDraft, setStageDraft] = useState<ObjectWorkspaceItineraryStageSummary | null>(null);
  const [placing, setPlacing] = useState(false);
  const [corridorM, setCorridorM] = useState(50);
  const [positionError, setPositionError] = useState('');
  const [assocOpen, setAssocOpen] = useState(false);
  const tmpUid = useRef(0);
  const canEdit = permissions.itinerary.canDirectWrite || permissions.itinerary.canPrepareProposal || permissions.itinerary.canSubmitProposal;
  const canEditCharacteristics = permissions.characteristics.canDirectWrite || permissions.characteristics.canPrepareProposal;
  const hasTrack = Boolean(itinerary.trackGeojson);
  const isNewStage = editingIndex === itinerary.stages.length;
  const selectedPracticeLabels = itinerary.practiceOptions.filter((option) => itinerary.practiceCodes.includes(option.code)).map((option) => option.label);

  function patch(value: Partial<typeof itinerary>) { if (canEdit) editor.patchModule('itinerary', value); }
  function cancelStage() { setStageDraft(null); setEditingIndex(null); setPlacing(false); setPositionError(''); }
  function editStage(index: number) {
    if (stageDraft) return;
    const stage = itinerary.stages[index];
    if (!stage) return;
    setEditingIndex(index); setStageDraft({ ...stage, mediaIds: [...stage.mediaIds] });
    setPlacing(false); setPositionError(''); setCorridorM(50);
  }
  function addStage() {
    if (!canEdit) return;
    setEditingIndex(itinerary.stages.length);
    setStageDraft({ recordId: null, uid: `iti-draft-${tmpUid.current++}`, name: '', description: '', position: String(itinerary.stages.length + 1), kind: '', lng: '', lat: '', mediaIds: [] });
    setPlacing(false); setPositionError(''); setCorridorM(50);
  }
  function placePoint(lng: number, lat: number): boolean {
    if (!stageDraft || !canEdit) return false;
    const line = itinerary.trackGeojson?.coordinates;
    if (line && line.length > 1 && !isInsideCorridor(lng, lat, line, corridorM)) {
      setPositionError(`Le point est à plus de ${corridorM} m du tracé. Rapprochez-le du parcours ou ajustez la tolérance.`);
      return false;
    }
    setStageDraft({ ...stageDraft, lng: lng.toFixed(6), lat: lat.toFixed(6) });
    setPositionError(''); setPlacing(false);
    return true;
  }
  function saveStage() {
    if (!canEdit || !stageDraft?.name.trim() || editingIndex === null) return;
    const point = itineraryStagePoint(stageDraft);
    if ((stageDraft.lng.trim() || stageDraft.lat.trim()) && !point) return;
    const line = itinerary.trackGeojson?.coordinates;
    if (point && line && line.length > 1 && !isInsideCorridor(point[0], point[1], line, corridorM)) {
      setPositionError(`Le point est à plus de ${corridorM} m du tracé. Vérifiez sa position avant de valider.`); return;
    }
    const next = { ...stageDraft, name: stageDraft.name.trim() };
    const stages = isNewStage ? [...itinerary.stages, next] : itinerary.stages.map((stage, index) => index === editingIndex ? next : stage);
    patch({ stages: stages.map((stage, index) => ({ ...stage, position: String(index + 1) })) });
    cancelStage();
  }
  function reorder(stages: ObjectWorkspaceItineraryStageSummary[]) {
    if (canEdit && !stageDraft) patch({ stages: stages.map((stage, index) => ({ ...stage, position: String(index + 1) })) });
  }
  function moveStage(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= itinerary.stages.length) return;
    const next = [...itinerary.stages]; [next[index], next[target]] = [next[target], next[index]]; reorder(next);
  }
  const displayedStages = stageDraft && editingIndex !== null
    ? isNewStage ? [...itinerary.stages, stageDraft] : itinerary.stages.map((stage, index) => index === editingIndex ? stageDraft : stage)
    : itinerary.stages;

  return (
    <Fs num="06" title="Tracé, étapes & praticabilité" sub="Le parcours, ses points de passage et ses conditions d’accès" folded={folded}
      pill={itinerary.unavailableReason ? { tone: 'warn', label: 'Non applicable' } : { tone: hasTrack ? 'ok' : 'warn', label: hasTrack ? 'Tracé importé' : 'Aucune trace — import requis' }}>
      {itinerary.unavailableReason ? <ModuleUnavailableNotice reason={itinerary.unavailableReason} /> : <>
        <ItiTraceMap key={editor.objectId} objectId={editor.objectId} initialTrack={itinerary.trackGeojson} stages={displayedStages}
          readOnly={!permissions.itinerary.canDirectWrite} importDisabled={Boolean(stageDraft)} selectedStageIndex={stageDraft ? editingIndex : null}
          onSelectStage={editStage} placementActive={placing} placementError={positionError} onPlacePoint={placePoint}
          onImported={(result) => patch({ distanceKm: result.distanceKm, elevationPositiveM: result.elevationGain, elevationNegativeM: result.elevationLoss,
            trackGeojson: result.trackGeojson, geometrySummary: result.trackGeojson ? 'Tracé importé' : '' })}>
          <div className="iti-stage-panel">
            {stageDraft ? <ItineraryStageEditor key={stageDndId(stageDraft, editingIndex ?? 0)} stage={stageDraft} isNew={isNewStage}
              kindOptions={itinerary.stageKindOptions} mediaOptions={itinerary.mediaOptions} hasTrack={hasTrack} corridorM={corridorM}
              placementActive={placing} positionMessage={positionError} readOnly={!canEdit}
              onChange={(value) => { setStageDraft({ ...stageDraft, ...value }); setPositionError(''); }} onCorridorChange={(meters) => { setCorridorM(meters); setPositionError(''); }}
              onTogglePlacement={() => { setPlacing(!placing); setPositionError(''); }} onSave={saveStage} onCancel={cancelStage}
              onDelete={() => { if (canEdit && editingIndex !== null && !isNewStage) patch({ stages: itinerary.stages.filter((_, index) => index !== editingIndex).map((stage, index) => ({ ...stage, position: String(index + 1) })) }); cancelStage(); }} /> : <>
              <header className="iti-stage-panel__header"><div><h3>Étapes du parcours <span>{itinerary.stages.length}</span></h3><p>La même numérotation sur la carte et la fiche.</p></div></header>
              <div className="iti-stage-panel__list">
                {itinerary.stages.length === 0 ? <p className="iti-stage-panel__empty">Ajoutez les points de départ, étapes et points d’intérêt du parcours.</p> : <SortableList
                  items={itinerary.stages} getId={(stage) => stageDndId(stage, itinerary.stages.indexOf(stage))} onReorder={reorder} columns="14px minmax(0, 1fr) auto"
                  renderItem={(stage, index) => <>
                    <button type="button" className="iti-stage-select" aria-label={`Modifier l’étape ${index + 1} : ${stage.name || 'Sans nom'}`} onClick={() => editStage(index)}>
                      <span className="iti-stage-number">{index + 1}</span><span><strong>{stage.name || `Étape ${index + 1}`}</strong><small>{itinerary.stageKindOptions.find((option) => option.code === stage.kind)?.label || 'Étape'} · {itineraryStagePoint(stage) ? 'point GPS' : 'À positionner'}</small></span>
                    </button>
                    <div className="iti-stage-order"><button type="button" className="iti-icon-button" aria-label={`Monter ${stage.name || `l’étape ${index + 1}`}`} disabled={!canEdit || index === 0} onClick={() => moveStage(index, -1)}><ArrowUp size={13} aria-hidden /></button><button type="button" className="iti-icon-button" aria-label={`Descendre ${stage.name || `l’étape ${index + 1}`}`} disabled={!canEdit || index === itinerary.stages.length - 1} onClick={() => moveStage(index, 1)}><ArrowDown size={13} aria-hidden /></button></div>
                  </>} />}
              </div>
              <footer className="iti-stage-panel__footer"><button type="button" className="btn sm primary" disabled={!canEdit} onClick={addStage}><Plus size={14} aria-hidden /> Ajouter une étape</button></footer>
            </>}
          </div>
        </ItiTraceMap>
        <fieldset className="iti-embedded-fields" disabled={!canEdit}>
        <div className="grid-4 iti-route-metrics">
          <StatCard label="Distance" value={itinerary.distanceKm || '0'} suffix="km" hasStep onStep={(delta) => patch({ distanceKm: stepMetric(itinerary.distanceKm, delta, { step: .5, decimals: 1 }) })} />
          <StatCard label="Durée" value={formatDurationShort(itinerary.durationMin)} hasStep onStep={(delta) => patch({ durationMin: stepMetric(itinerary.durationMin, delta, { step: 15 }) })} />
          <StatCard label="Dénivelé +" value={itinerary.elevationPositiveM || '0'} suffix="m" hasStep onStep={(delta) => patch({ elevationPositiveM: stepMetric(itinerary.elevationPositiveM, delta, { step: 10 }) })} />
          <StatCard label="Dénivelé −" value={itinerary.elevationNegativeM || '0'} suffix="m" hasStep onStep={(delta) => patch({ elevationNegativeM: stepMetric(itinerary.elevationNegativeM, delta, { step: 10 }) })} />
        </div>
        <div className="grid-3 iti-route-characteristics">
          <Field label="Difficulté" hint="Niveau 1 (très facile) à 5 (très difficile)"><ReferenceSelect value={itinerary.difficultyLevel} options={itinerary.difficultyOptions} onChange={(difficultyLevel) => patch({ difficultyLevel })} allowEmpty emptyLabel="Non renseigné" aria-label="Difficulté" /></Field>
          <Field label="Pratiques"><button type="button" className="select iti-practices" onClick={() => { setPracticesDraft(itinerary.practiceCodes); setPracticesOpen(true); }}><span>{selectedPracticeLabels.length ? selectedPracticeLabels.join(', ') : 'Ajouter des pratiques'}</span><Plus size={14} aria-hidden /></button></Field>
          <Toggle label="Tracé en boucle" on={itinerary.loop} onChange={(loop) => patch({ loop })} />
        </div>
        </fieldset>
        <Disclosure title="Praticabilité & fermetures" summary={itinerary.openStatusOptions.find((option) => option.code === itinerary.openStatus)?.label || 'Statut et restrictions'}>
          <fieldset className="iti-embedded-fields" disabled={!canEdit}>
          <div className="grid-2"><Field label="Statut d’ouverture"><ReferenceSelect value={itinerary.openStatus} options={itinerary.openStatusOptions} onChange={(openStatus) => patch({ openStatus })} aria-label="Statut d'ouverture" /></Field><Field label="Note de fermeture saisonnière" hint="Affichée quand le sentier est fermé"><Input value={itinerary.statusNote} onChange={(statusNote) => patch({ statusNote })} /></Field></div>
          </fieldset>
          <SectionOpenings {...props} archetype="ITI" embedded />
        </Disclosure>
        <Disclosure title="Conseils & accès au départ" summary="Parking, équipement, environnement, enfants">
          <fieldset className="iti-embedded-fields" disabled={!canEdit}><div className="grid-2"><Field label="Accès" hint="Comment rejoindre le départ"><Input value={itinerary.access} onChange={(access) => patch({ access })} /></Field><Field label="Parking conseillé"><Input value={itinerary.recommendedParking} onChange={(recommendedParking) => patch({ recommendedParking })} /></Field><Field label="Ambiance"><Input value={itinerary.ambiance} onChange={(ambiance) => patch({ ambiance })} /></Field><Field label="Équipement requis"><Input value={itinerary.requiredEquipment} onChange={(requiredEquipment) => patch({ requiredEquipment })} /></Field><Field label="Informations sur les lieux"><Input value={itinerary.infoPlaces} onChange={(infoPlaces) => patch({ infoPlaces })} /></Field><Toggle label="Adapté aux enfants" on={itinerary.childFriendly} onChange={(childFriendly) => patch({ childFriendly })} /></div></fieldset>
          <fieldset className="iti-embedded-fields" disabled={!canEditCharacteristics}><EnvironmentChips characteristics={editor.draft.characteristics} onChange={(next) => editor.replaceModule('characteristics', next)} /></fieldset>
        </Disclosure>
        <Disclosure title="Objets liés" summary={`${itinerary.associatedObjects.length} fiche(s)`} defaultOpen={itinerary.associatedObjects.length > 0}>
          {itinerary.associatedObjects.map((assoc, index) => <div key={`${assoc.associatedObjectId}-${index}`} className="iti-associated-row"><div><strong>{assoc.targetName || assoc.associatedObjectId}</strong><small>{[itinerary.assocRoleOptions.find((option) => option.id === assoc.roleId)?.label, assoc.note].filter(Boolean).join(' · ')}</small></div><button type="button" className="del" aria-label={`Détacher ${assoc.targetName || assoc.associatedObjectId}`} disabled={!canEdit} onClick={() => patch({ associatedObjects: itinerary.associatedObjects.filter((_, i) => i !== index) })}>×</button></div>)}
          <button type="button" className="rep-add" disabled={!canEdit} onClick={() => setAssocOpen(true)}>+ Ajouter un objet lié</button>
        </Disclosure>
        <AssociatedObjectModal open={assocOpen} objectId={editor.objectId} roleOptions={itinerary.assocRoleOptions} trackGeojson={itinerary.trackGeojson} onSave={(assoc) => { patch({ associatedObjects: [...itinerary.associatedObjects, assoc] }); setAssocOpen(false); }} onClose={() => setAssocOpen(false)} />
        <EditorModal open={practicesOpen} title="Pratiques de l'itinéraire" onClose={() => setPracticesOpen(false)} onSave={() => { patch({ practiceCodes: practicesDraft }); setPracticesOpen(false); }}>
          <ChipSet>{itinerary.practiceOptions.map((option) => <Chip key={option.code} label={option.label} on={practicesDraft.includes(option.code)} onClick={() => setPracticesDraft((previous) => previous.includes(option.code) ? previous.filter((code) => code !== option.code) : [...previous, option.code])} />)}</ChipSet>
        </EditorModal>
      </>}
    </Fs>
  );
}
