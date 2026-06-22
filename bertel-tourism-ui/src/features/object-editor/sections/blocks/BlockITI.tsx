import { useRef, useState } from 'react';
import { Chip, ChipSet, EditorModal, Field, Fs, Input, ReferenceSelect, SortableList, StatCard, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';
import { ModuleUnavailableNotice } from './block-notes';
import { formatDurationShort, stepMetric } from './iti-metrics';
import { ItiTraceMap } from '../../widgets/ItiTraceMap';
import { StageEditModal } from '../../widgets/StageEditModal';
import { AssociatedObjectModal } from '../../widgets/AssociatedObjectModal';
import type { ObjectWorkspaceItineraryStageSummary } from '../../../../services/object-workspace-parser';

// handle · type/position badge · name+meta · actions
const STAGE_CARD_COLS = '14px 30px 1fr auto';

function stageDndId(stage: ObjectWorkspaceItineraryStageSummary, index: number): string {
  return stage.recordId ?? stage.uid ?? `stage-${index}`;
}

export function BlockITI({ editor, folded }: SectionProps) {
  const itinerary = editor.draft.itinerary;
  // §111 B4: practices are edited in a modal (button → modal), like the other multi-selects.
  const [practicesOpen, setPracticesOpen] = useState(false);
  const [practicesDraft, setPracticesDraft] = useState<string[]>([]);
  // §111 C: index of the stage being edited in the StageEditModal (null = closed).
  const [editingStage, setEditingStage] = useState<number | null>(null);
  const [assocOpen, setAssocOpen] = useState(false);
  const tmpUid = useRef(0);

  function patch(patchValue: Partial<typeof itinerary>) {
    editor.patchModule('itinerary', patchValue);
  }

  function addStage() {
    const next = itinerary.stages.length;
    patch({
      stages: [
        ...itinerary.stages,
        { recordId: null, uid: `tmp-${tmpUid.current++}`, name: '', description: '', position: String(next + 1), kind: '', lng: '', lat: '', mediaIds: [] },
      ],
    });
    setEditingStage(next);
  }

  function openPractices() {
    setPracticesDraft(itinerary.practiceCodes);
    setPracticesOpen(true);
  }

  function togglePracticeDraft(code: string) {
    setPracticesDraft((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  const selectedPracticeLabels = itinerary.practiceOptions
    .filter((option) => itinerary.practiceCodes.includes(option.code))
    .map((option) => option.label);

  function updateStage(index: number, patchValue: Partial<(typeof itinerary.stages)[number]>) {
    patch({
      stages: itinerary.stages.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, ...patchValue } : stage,
      ),
    });
  }

  // traceEditable is loader-hardcoded false — no editable-trace state exists today (§48).
  const traceLabel = itinerary.geometrySummary ? 'Trace GPX importée' : 'Aucune trace — import requis';

  return (
    <Fs
      num="06"
      title="Tracé, étapes & praticabilité"
      sub="GPX, distance, dénivelé, durée, balisage, type de boucle, waypoints, conditions et équipement"
      folded={folded}
      pill={itinerary.unavailableReason ? { tone: 'warn', label: 'Non applicable' } : { tone: itinerary.geometrySummary ? 'ok' : 'warn', label: traceLabel }}
    >
      {/* §46 type-gated itinerary module — the WHOLE section body edits `itinerary`,
          so the notice replaces everything when gated */}
      {itinerary.unavailableReason ? (
        <ModuleUnavailableNotice reason={itinerary.unavailableReason} />
      ) : (
        <>
          {/* §111 B1: real GPX/KML import (drag&drop + button) + MapLibre trace map. The import calls
              api.set_itinerary_track, which writes object_iti.geom and auto-derives the metrics fed
              back into the steppers below. The « Boucle » strip moved to « Infos pratiques ». */}
          <ItiTraceMap
            objectId={editor.objectId}
            initialTrack={itinerary.trackGeojson}
            onMetrics={(m) => patch({ distanceKm: m.distanceKm, elevationPositiveM: m.elevationGain, elevationNegativeM: m.elevationLoss })}
          />

          <div className="grid-4" style={{ marginBottom: 14 }}>
            <StatCard
              label="Distance"
              value={itinerary.distanceKm || '0'}
              suffix="km"
              hasStep
              onStep={(delta) => patch({ distanceKm: stepMetric(itinerary.distanceKm, delta, { step: 0.5, decimals: 1 }) })}
            />
            <StatCard
              label="Durée a/r"
              value={formatDurationShort(itinerary.durationMin)}
              hasStep
              onStep={(delta) => patch({ durationMin: stepMetric(itinerary.durationMin, delta, { step: 15 }) })}
            />
            <StatCard
              label="Dénivelé +"
              value={itinerary.elevationPositiveM || '0'}
              suffix="m"
              hasStep
              onStep={(delta) => patch({ elevationPositiveM: stepMetric(itinerary.elevationPositiveM, delta, { step: 10 }) })}
            />
            <StatCard
              label="Dénivelé −"
              value={itinerary.elevationNegativeM || '0'}
              suffix="m"
              hasStep
              onStep={(delta) => patch({ elevationNegativeM: stepMetric(itinerary.elevationNegativeM, delta, { step: 10 }) })}
            />
          </div>

          <div className="grid-3" style={{ marginBottom: 14 }}>
            <Field label="Difficulté" hint="Niveau 1 (très facile) à 5 (très difficile)">
              <ReferenceSelect
                value={itinerary.difficultyLevel}
                options={itinerary.difficultyOptions}
                onChange={(difficultyLevel) => patch({ difficultyLevel })}
                allowEmpty
                emptyLabel="Non renseigné"
                aria-label="Difficulté"
              />
            </Field>
            <Field label="Statut d'ouverture">
              <ReferenceSelect
                value={itinerary.openStatus}
                options={itinerary.openStatusOptions}
                onChange={(openStatus) => patch({ openStatus })}
                aria-label="Statut d'ouverture"
              />
            </Field>
            <Field label="Pratiques">
              <button
                type="button"
                className="select"
                style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                onClick={openPractices}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selectedPracticeLabels.length > 0 ? 'inherit' : 'var(--ink-4)' }}>
                  {selectedPracticeLabels.length > 0 ? selectedPracticeLabels.join(', ') : 'Ajouter des pratiques'}
                </span>
                <span aria-hidden style={{ color: 'var(--accent)', fontWeight: 600 }}>+</span>
              </button>
            </Field>
          </div>

          {/* §111 B5: Infos pratiques (object_iti_info) — previously editable nowhere.
              The is_loop toggle lives here too (a boolean characteristic, like is_child_friendly),
              though it persists in object_iti, not object_iti_info. */}
          <div className="chip-group__label">Infos pratiques</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
            <Field label="Accès" hint="Comment rejoindre le départ">
              <Input value={itinerary.access} onChange={(access) => patch({ access })} />
            </Field>
            <Field label="Ambiance">
              <Input value={itinerary.ambiance} onChange={(ambiance) => patch({ ambiance })} />
            </Field>
            <Field label="Parking conseillé">
              <Input value={itinerary.recommendedParking} onChange={(recommendedParking) => patch({ recommendedParking })} />
            </Field>
            <Field label="Équipement requis">
              <Input value={itinerary.requiredEquipment} onChange={(requiredEquipment) => patch({ requiredEquipment })} />
            </Field>
            <Field label="Informations sur les lieux">
              <Input value={itinerary.infoPlaces} onChange={(infoPlaces) => patch({ infoPlaces })} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
            <Toggle label="Tracé en boucle" on={itinerary.loop} onChange={(loop) => patch({ loop })} />
            <Toggle label="Adapté aux enfants" on={itinerary.childFriendly} onChange={(childFriendly) => patch({ childFriendly })} />
          </div>

          <div className="chip-group__label">Étapes & points d'intérêt sur le parcours</div>
          {itinerary.stages.length > 0 && (
            <SortableList
              items={itinerary.stages}
              getId={(stage) => stageDndId(stage, itinerary.stages.indexOf(stage))}
              onReorder={(next) => patch({ stages: next.map((stage, i) => ({ ...stage, position: String(i + 1) })) })}
              columns={STAGE_CARD_COLS}
              renderItem={(stage, index) => {
                const kindLabel = itinerary.stageKindOptions.find((option) => option.code === stage.kind)?.label ?? 'Étape';
                const meta = [
                  kindLabel,
                  stage.lng && stage.lat ? 'point GPS' : null,
                  stage.mediaIds.length > 0 ? `${stage.mediaIds.length} photo(s)` : null,
                ].filter(Boolean).join(' · ');
                return (
                  <>
                    <div className="wp-num" aria-hidden>{index + 1}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {stage.name || `Étape ${index + 1}`}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{meta}</div>
                    </div>
                    <div className="rep-row__act" style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn sm" onClick={() => setEditingStage(index)}>Modifier</button>
                      <button
                        type="button"
                        className="del"
                        aria-label={`Supprimer ${stage.name || `l'étape ${index + 1}`}`}
                        onClick={() => patch({ stages: itinerary.stages.filter((_, i) => i !== index) })}
                      >
                        ×
                      </button>
                    </div>
                  </>
                );
              }}
            />
          )}
          <button type="button" className="rep-add" onClick={addStage}>
            + Ajouter une étape / un POI
          </button>

          {editingStage != null && itinerary.stages[editingStage] && (
            <StageEditModal
              key={stageDndId(itinerary.stages[editingStage], editingStage)}
              open
              stage={itinerary.stages[editingStage]}
              stageKindOptions={itinerary.stageKindOptions}
              trackGeojson={itinerary.trackGeojson}
              onSave={(updated) => { updateStage(editingStage, updated); setEditingStage(null); }}
              onClose={() => setEditingStage(null)}
            />
          )}

          {/* §111 C3: objets liés — existing tourism objects attached to the itinerary with a role. */}
          <div className="chip-group__label" style={{ marginTop: 14 }}>Objets liés</div>
          {itinerary.associatedObjects.length > 0 && (
            <div className="repeater">
              {itinerary.associatedObjects.map((assoc, index) => {
                const roleLabel = itinerary.assocRoleOptions.find((option) => option.id === assoc.roleId)?.label ?? '';
                return (
                  <div key={`${assoc.associatedObjectId}-${index}`} className="rep-row" style={{ gridTemplateColumns: '34px 1fr auto' }}>
                    <span className={`rpick__type type-${assoc.targetType.toLowerCase()}`}>{assoc.targetType}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {assoc.targetName || assoc.associatedObjectId}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{[roleLabel, assoc.note].filter(Boolean).join(' · ')}</div>
                    </div>
                    <button
                      type="button"
                      className="del"
                      aria-label={`Détacher ${assoc.targetName || assoc.associatedObjectId}`}
                      onClick={() => patch({ associatedObjects: itinerary.associatedObjects.filter((_, i) => i !== index) })}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <button type="button" className="rep-add" onClick={() => setAssocOpen(true)}>
            + Ajouter un objet lié
          </button>

          <AssociatedObjectModal
            open={assocOpen}
            objectId={editor.objectId}
            roleOptions={itinerary.assocRoleOptions}
            onSave={(assoc) => { patch({ associatedObjects: [...itinerary.associatedObjects, assoc] }); setAssocOpen(false); }}
            onClose={() => setAssocOpen(false)}
          />

          {/* §48: TRAIL_SEASON mock removed (§34 pattern — inert hardcoded constant, no onChange).
              SeasonPicker primitive retained for the future per-object seasonality profile feature.
              statusNote persists via the nested RPC — kept. */}
          <Field label="Note de fermeture saisonnière" hint="Affiché en bandeau quand le sentier est fermé">
            <Input value={itinerary.statusNote} onChange={(statusNote) => patch({ statusNote })} />
          </Field>

          <EditorModal
            open={practicesOpen}
            title="Pratiques de l'itinéraire"
            onClose={() => setPracticesOpen(false)}
            onSave={() => {
              patch({ practiceCodes: practicesDraft });
              setPracticesOpen(false);
            }}
          >
            <ChipSet>
              {itinerary.practiceOptions.map((option) => (
                <Chip
                  key={option.code}
                  label={option.label}
                  on={practicesDraft.includes(option.code)}
                  onClick={() => togglePracticeDraft(option.code)}
                />
              ))}
            </ChipSet>
          </EditorModal>
        </>
      )}
    </Fs>
  );
}
