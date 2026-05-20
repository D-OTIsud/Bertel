import { Fs, Input, SeasonPicker, TriState, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';
import { addPricingRow, removePricingRow, updatePricingRow } from '../pricing-row';

const DEFAULT_SEASON = ['', '', 'high', 'high', 'peak', 'peak', 'peak', 'peak', 'high', 'high', '', ''] as const;

export function BlockASC({ editor, folded }: SectionProps) {
  const activity = editor.draft.activity;
  const pricing = editor.draft.pricing;

  function patch(patchValue: Partial<typeof activity>) {
    editor.patchModule('activity', patchValue);
  }

  return (
    <Fs num="05" title="Formules, encadrement & saison" sub="Durée, participants, guide, équipement, formules et saisonnalité" folded={folded} pill={{ tone: activity.guideRequired ? 'ok' : 'warn', label: activity.guideRequired ? 'Encadrée' : 'Libre' }}>
      <div className="grid-4" style={{ marginBottom: 14 }}>
        <Input value={activity.durationMin} prefix="durée" suffix="min" mono onChange={(durationMin) => patch({ durationMin })} />
        <Input value={activity.minParticipants} prefix="min" mono onChange={(minParticipants) => patch({ minParticipants })} />
        <Input value={activity.maxParticipants} prefix="max" mono onChange={(maxParticipants) => patch({ maxParticipants })} />
        <Input value={activity.minAge} prefix="âge" suffix="+" mono onChange={(minAge) => patch({ minAge })} />
      </div>
      <div className="grid-3">
        <Toggle label="Guide requis" on={activity.guideRequired} onChange={(guideRequired) => patch({ guideRequired })} />
        <Input value={activity.difficultyLevel} placeholder="Difficulté" onChange={(difficultyLevel) => patch({ difficultyLevel })} />
        <Input value={activity.equipmentProvided} placeholder="Équipement fourni" onChange={(equipmentProvided) => patch({ equipmentProvided })} />
      </div>

      <div className="chip-group__label">Formules tarifaires</div>
      <div className="repeater">
        {pricing.prices.map((price, index) => (
          <div key={`${price.recordId ?? 'price'}-${index}`} className="rep-row" style={{ gridTemplateColumns: '1fr 90px 120px auto' }}>
            <Input value={price.kindLabel} onChange={(kindLabel) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { kindLabel }))} />
            <Input value={price.amount} mono suffix="EUR" onChange={(amount) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { amount }))} />
            <Input value={price.conditions} placeholder="Conditions" onChange={(conditions) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { conditions }))} />
            <button type="button" className="del" onClick={() => editor.replaceModule('pricing', removePricingRow(pricing, index))}>Supprimer</button>
          </div>
        ))}
      </div>
      <button type="button" className="rep-add" onClick={() => editor.replaceModule('pricing', addPricingRow(pricing))}>+ Ajouter une formule</button>

      <div className="chip-group__label">Saisonnalité</div>
      <SeasonPicker value={[...DEFAULT_SEASON]} />
      <div className="chip-group__label">Public</div>
      <TriState label="Familles" value="yes" onChange={() => undefined} />
      <TriState label="Débutants" value={activity.difficultyLevel ? 'conditional' : 'yes'} onChange={() => undefined} />
    </Fs>
  );
}
