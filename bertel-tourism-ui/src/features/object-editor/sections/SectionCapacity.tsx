import { Fs, Field, Input, Repeater, Select, Textarea, Toggle } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceCapacityItem } from '../../../services/object-workspace-parser';

function createCapacityItem(items: ObjectWorkspaceCapacityItem[], options: SectionProps['editor']['draft']['capacityPolicies']['metricOptions']): ObjectWorkspaceCapacityItem | null {
  const option = options.find((candidate) => !items.some((item) => item.metricCode === candidate.code)) ?? options[0];
  if (!option) {
    return null;
  }
  return {
    recordId: null,
    metricId: option.id,
    metricCode: option.code,
    metricLabel: option.label,
    unit: '',
    value: '',
    effectiveFrom: '',
    effectiveTo: '',
  };
}

export function SectionCapacity({ editor, folded }: SectionProps) {
  const capacity = editor.draft.capacityPolicies;

  function replace(nextItems: ObjectWorkspaceCapacityItem[]) {
    editor.replaceModule('capacityPolicies', { ...capacity, capacityItems: nextItems });
  }

  function update(index: number, patch: Partial<ObjectWorkspaceCapacityItem>) {
    replace(capacity.capacityItems.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const selected = patch.metricCode
        ? capacity.metricOptions.find((option) => option.code === patch.metricCode)
        : null;
      return {
        ...item,
        ...patch,
        metricId: selected?.id ?? item.metricId,
        metricLabel: selected?.label ?? item.metricLabel,
      };
    }));
  }

  return (
    <Fs num="07" title="Capacité & cadre" sub="Métriques, accueil groupes, politique animaux" folded={folded}>
      <Repeater
        items={capacity.capacityItems}
        getKey={(item, index) => `${item.recordId ?? item.metricCode}-${index}`}
        columns="1.3fr 100px 86px 120px 120px auto"
        addLabel="Ajouter une capacité"
        onAdd={() => {
          const next = createCapacityItem(capacity.capacityItems, capacity.metricOptions);
          if (next) replace([...capacity.capacityItems, next]);
        }}
        renderRow={(item, index) => (
          <>
            <Select value={item.metricCode} options={capacity.metricOptions.map((option) => ({ v: option.code, l: option.label }))} onChange={(metricCode) => update(index, { metricCode })} />
            <Input value={item.value} mono onChange={(value) => update(index, { value })} />
            <Input value={item.unit} placeholder="pers." onChange={(unit) => update(index, { unit })} />
            <Input type="date" value={item.effectiveFrom} onChange={(effectiveFrom) => update(index, { effectiveFrom })} />
            <Input type="date" value={item.effectiveTo} onChange={(effectiveTo) => update(index, { effectiveTo })} />
            <button type="button" className="del" onClick={() => replace(capacity.capacityItems.filter((_, itemIndex) => itemIndex !== index))}>Supprimer</button>
          </>
        )}
      />

      <div className="grid-2" style={{ marginTop: 16 }}>
        <Field label="Groupes">
          <div className="grid-2">
            <Input value={capacity.groupPolicy.minSize} placeholder="Min" mono onChange={(minSize) => editor.replaceModule('capacityPolicies', { ...capacity, groupPolicy: { ...capacity.groupPolicy, minSize } })} />
            <Input value={capacity.groupPolicy.maxSize} placeholder="Max" mono onChange={(maxSize) => editor.replaceModule('capacityPolicies', { ...capacity, groupPolicy: { ...capacity.groupPolicy, maxSize } })} />
          </div>
          <Toggle label="Groupes uniquement" on={capacity.groupPolicy.groupOnly} onChange={(groupOnly) => editor.replaceModule('capacityPolicies', { ...capacity, groupPolicy: { ...capacity.groupPolicy, groupOnly } })} />
          <Textarea value={capacity.groupPolicy.notes} rows={3} onChange={(notes) => editor.replaceModule('capacityPolicies', { ...capacity, groupPolicy: { ...capacity.groupPolicy, notes } })} />
        </Field>
        <Field label="Animaux">
          <Toggle label="Politique renseignée" on={capacity.petPolicy.hasPolicy} onChange={(hasPolicy) => editor.replaceModule('capacityPolicies', { ...capacity, petPolicy: { ...capacity.petPolicy, hasPolicy } })} />
          <Toggle label="Animaux acceptés" on={capacity.petPolicy.accepted} onChange={(accepted) => editor.replaceModule('capacityPolicies', { ...capacity, petPolicy: { ...capacity.petPolicy, accepted } })} />
          <Textarea value={capacity.petPolicy.conditions} rows={3} onChange={(conditions) => editor.replaceModule('capacityPolicies', { ...capacity, petPolicy: { ...capacity.petPolicy, conditions } })} />
        </Field>
      </div>
    </Fs>
  );
}
