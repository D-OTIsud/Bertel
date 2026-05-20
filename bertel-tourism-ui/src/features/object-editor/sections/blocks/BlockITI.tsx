import { Fs, Input, SeasonPicker, StatCard, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';

const TRAIL_SEASON = ['closed', 'closed', 'high', 'high', 'peak', 'peak', 'peak', 'high', 'high', '', '', 'closed'] as const;

export function BlockITI({ editor, folded }: SectionProps) {
  const itinerary = editor.draft.itinerary;

  function patch(patchValue: Partial<typeof itinerary>) {
    editor.patchModule('itinerary', patchValue);
  }

  function updateStage(index: number, patchValue: Partial<(typeof itinerary.stages)[number]>) {
    patch({
      stages: itinerary.stages.map((stage, stageIndex) => stageIndex === index ? { ...stage, ...patchValue } : stage),
    });
  }

  return (
    <Fs num="05" title="Tracé, GPX & étapes" sub="Trace, distance, dénivelé, difficulté, points d’intérêt" folded={folded} pill={{ tone: itinerary.traceEditable ? 'ok' : 'warn', label: itinerary.traceEditable ? 'Trace éditable' : 'Trace verrouillée' }}>
      <div className="dropzone" style={{ marginBottom: 14 }}>
        <span className="ico">GPX</span>
        <strong>{itinerary.geometrySummary || 'Déposer une trace GPX'}</strong>
        <small>{itinerary.sectionsCount} section(s) · {itinerary.profilesCount} profil(s)</small>
      </div>
      <div className="grid-4" style={{ marginBottom: 14 }}>
        <StatCard label="Distance" value={itinerary.distanceKm || '0'} suffix="km" />
        <StatCard label="Dénivelé +" value={itinerary.elevationPositiveM || '0'} suffix="m" />
        <StatCard label="Durée" value={itinerary.durationMin || '0'} suffix="min" />
        <StatCard label="Difficulté" value={itinerary.difficultyLevel || '—'} />
      </div>
      <div className="grid-3">
        <Input value={itinerary.distanceKm} suffix="km" mono onChange={(distanceKm) => patch({ distanceKm })} />
        <Input value={itinerary.elevationPositiveM} suffix="m+" mono onChange={(elevationPositiveM) => patch({ elevationPositiveM })} />
        <Toggle label="Boucle" on={itinerary.loop} onChange={(loop) => patch({ loop })} />
      </div>

      <div className="chip-group__label">Étapes & points d’intérêt</div>
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
      <div className="chip-group__label">Saison</div>
      <SeasonPicker value={[...TRAIL_SEASON]} />
    </Fs>
  );
}
