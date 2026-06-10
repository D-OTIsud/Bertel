import { Chip, ChipSet, Field, Fs, Input, StatCard, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';
import { ModuleUnavailableNotice } from './block-notes';

const STAGE_COLS = '14px 28px 1fr 90px 80px auto';

function repHeader(columns: string, labels: string[]) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: columns,
        gap: 8,
        padding: '6px 12px',
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--ink-4)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {labels.map((label, index) => (
        <span key={`${label}-${index}`}>{label}</span>
      ))}
    </div>
  );
}

export function BlockITI({ editor, folded }: SectionProps) {
  const itinerary = editor.draft.itinerary;

  function patch(patchValue: Partial<typeof itinerary>) {
    editor.patchModule('itinerary', patchValue);
  }

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
      num="05"
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
          <div className="grid-1-2" style={{ marginBottom: 14 }}>
            {/* §48: no GPX upload pipeline; object_iti.geom has no write path in the nested RPC.
                The dropzone is disabled-with-reason instead of an inviting drop target. */}
            <div className="dropzone" aria-disabled="true" style={{ opacity: 0.62, cursor: 'not-allowed' }}>
              <span className="ico">GPX</span>
              <strong>{itinerary.geometrySummary || 'Aucune trace importée'}</strong>
              <small>
                Import GPX/KML indisponible dans l&apos;éditeur — la géométrie est gérée par l&apos;import de données.
                {' '}{itinerary.sectionsCount} section(s) · {itinerary.profilesCount} profil(s)
              </small>
            </div>
            <div className="grid-2-1" style={{ alignItems: 'center' }}>
              <div className="map-mini" style={{ minHeight: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-4)', fontSize: 11 }}>
                {itinerary.distanceKm ? `${itinerary.distanceKm} km` : 'Aperçu carte'}
              </div>
              <Field label="Type de tracé">
                <Toggle label="Boucle" on={itinerary.loop} onChange={(loop) => patch({ loop })} />
              </Field>
            </div>
          </div>

          <div className="grid-4" style={{ marginBottom: 14 }}>
            <StatCard label="Distance" value={itinerary.distanceKm || '0'} suffix="km" hasStep />
            <StatCard label="Durée a/r" value={itinerary.durationMin ? `${Math.round(Number(itinerary.durationMin) / 60)} h` : '—'} hasStep />
            <StatCard label="Dénivelé +" value={itinerary.elevationPositiveM || '0'} suffix="m" hasStep />
            <StatCard label="Dénivelé −" value={itinerary.elevationNegativeM || itinerary.elevationPositiveM || '0'} suffix="m" hasStep />
          </div>

          <div className="grid-3" style={{ marginBottom: 14 }}>
            <Field label="Difficulté" hint="Échelle locale ou SAC">
              <Input value={itinerary.difficultyLevel} onChange={(difficultyLevel) => patch({ difficultyLevel })} />
            </Field>
            <Field label="Statut d'ouverture">
              <Input value={itinerary.openStatus} onChange={(openStatus) => patch({ openStatus })} />
            </Field>
            <Field label="Pratiques">
              <ChipSet>
                {itinerary.practiceOptions.map((option) => (
                  <Chip
                    key={option.code}
                    label={option.label}
                    on={itinerary.practiceCodes.includes(option.code)}
                    onClick={() => {
                      const selected = itinerary.practiceCodes.includes(option.code);
                      patch({
                        practiceCodes: selected
                          ? itinerary.practiceCodes.filter((code) => code !== option.code)
                          : [...itinerary.practiceCodes, option.code],
                      });
                    }}
                  />
                ))}
              </ChipSet>
            </Field>
          </div>

          <div className="chip-group__label">Étapes & points d'intérêt sur le parcours</div>
          {repHeader(STAGE_COLS, ['', '', "Nom de l'étape", 'Position', 'Description'])}
          <div className="repeater wp-rep">
            {itinerary.stages.map((stage, index) => (
              <div key={stage.recordId ?? index} className="rep-row" style={{ gridTemplateColumns: STAGE_COLS }}>
                <span className="rep-row__handle" aria-hidden />
                <div className="wp-num">{index === 0 ? 'D' : index === itinerary.stages.length - 1 ? 'A' : index + 1}</div>
                <Input value={stage.name} onChange={(name) => updateStage(index, { name })} />
                <Input value={stage.position} mono onChange={(position) => updateStage(index, { position })} />
                <Input value={stage.description} onChange={(description) => updateStage(index, { description })} />
                <div className="rep-row__act">
                  <button
                    type="button"
                    className="del"
                    onClick={() => patch({ stages: itinerary.stages.filter((_, i) => i !== index) })}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="rep-add"
            onClick={() =>
              patch({
                stages: [
                  ...itinerary.stages,
                  { recordId: null, name: '', description: '', position: String(itinerary.stages.length + 1) },
                ],
              })
            }
          >
            + Ajouter une étape / un POI
          </button>

          {/* §48: TRAIL_SEASON mock removed (§34 pattern — inert hardcoded constant, no onChange).
              SeasonPicker primitive retained for the future per-object seasonality profile feature.
              statusNote persists via the nested RPC — kept. */}
          <Field label="Note de fermeture saisonnière" hint="Affiché en bandeau quand le sentier est fermé">
            <Input value={itinerary.statusNote} onChange={(statusNote) => patch({ statusNote })} />
          </Field>
        </>
      )}
    </Fs>
  );
}
