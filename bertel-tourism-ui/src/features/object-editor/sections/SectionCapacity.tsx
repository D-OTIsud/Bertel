import { Chip, ChipSet, Field, Fs, Input, Repeater, Select, StatCard, Textarea, Toggle } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceCapacityItem } from '../../../services/object-workspace-parser';

function createCapacityItem(
  items: ObjectWorkspaceCapacityItem[],
  options: SectionProps['editor']['draft']['capacityPolicies']['metricOptions'],
): ObjectWorkspaceCapacityItem | null {
  // First UNUSED metric only — the old `?? options[0]` fallback duplicated a used
  // metric and guaranteed a UNIQUE(object_id, metric_id) failure at save time.
  const option = options.find((candidate) => !items.some((item) => item.metricCode === candidate.code));
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

function toggleCode(values: string[], code: string) {
  return values.includes(code) ? values.filter((value) => value !== code) : [...values, code];
}

const CAP_COLS = '14px 1.3fr 100px 86px 120px 120px auto';

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
      {labels.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}

export function SectionCapacity({ editor, folded }: SectionProps) {
  const capacity = editor.draft.capacityPolicies;
  const characteristics = editor.draft.characteristics;
  const statCards = capacity.capacityItems.slice(0, 4).map((item) => ({
    label: item.metricLabel,
    value: item.value || '—',
    suffix: item.unit || undefined,
  }));

  function replace(nextItems: ObjectWorkspaceCapacityItem[]) {
    editor.replaceModule('capacityPolicies', { ...capacity, capacityItems: nextItems });
  }

  function update(index: number, patch: Partial<ObjectWorkspaceCapacityItem>) {
    replace(
      capacity.capacityItems.map((item, itemIndex) => {
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
      }),
    );
  }

  const filledMetrics = capacity.capacityItems.filter((item) => item.value.trim()).length;
  const hasUnusedMetric = capacity.metricOptions.some(
    (option) => !capacity.capacityItems.some((item) => item.metricCode === option.code),
  );

  return (
    <Fs
      num="07"
      title="Capacité & contenance"
      sub="Numéros clés affichés dans l'Explorer (capacité, contenance, prix d'appel). Les labels officiels vivent dans la section Classifications."
      folded={folded}
      pill={{
        tone: filledMetrics > 0 ? 'ok' : 'warn',
        label: filledMetrics > 0 ? `${filledMetrics} métrique(s)` : 'À compléter',
      }}
    >
      {statCards.length > 0 && (
        <div className="grid-4" style={{ marginBottom: 14 }}>
          {statCards.map((stat) => (
            <StatCard key={stat.label} label={stat.label} value={stat.value} suffix={stat.suffix} hasStep />
          ))}
        </div>
      )}

      <div className="chip-group__label" style={{ marginTop: 0 }}>
        Métriques détaillées
      </div>
      {repHeader(CAP_COLS, ['', 'Métrique', 'Valeur', 'Unité', 'Depuis', "Jusqu'au"])}
      <Repeater
        items={capacity.capacityItems}
        getKey={(item, index) => `${item.recordId ?? item.metricCode}-${index}`}
        columns={CAP_COLS}
        addLabel="Ajouter une capacité"
        addDisabled={!hasUnusedMetric}
        addDisabledReason="Toutes les métriques applicables à ce type sont déjà renseignées."
        onAdd={() => {
          const next = createCapacityItem(capacity.capacityItems, capacity.metricOptions);
          if (next) replace([...capacity.capacityItems, next]);
        }}
        renderRow={(item, index) => (
          <>
            <span className="rep-row__handle" aria-hidden />
            <Select
              value={item.metricCode}
              // A metric can carry ONE row per object (UNIQUE) — hide the ones other rows use.
              options={capacity.metricOptions
                .filter(
                  (option) =>
                    option.code === item.metricCode ||
                    !capacity.capacityItems.some(
                      (other, otherIndex) => otherIndex !== index && other.metricCode === option.code,
                    ),
                )
                .map((option) => ({ v: option.code, l: option.label }))}
              onChange={(metricCode) => update(index, { metricCode })}
            />
            <Input value={item.value} type="number" mono onChange={(value) => update(index, { value })} />
            <Input value={item.unit} readOnly onChange={() => undefined} />
            <Input type="date" value={item.effectiveFrom} onChange={(effectiveFrom) => update(index, { effectiveFrom })} />
            <Input type="date" value={item.effectiveTo} onChange={(effectiveTo) => update(index, { effectiveTo })} />
            <button type="button" className="del" onClick={() => replace(capacity.capacityItems.filter((_, itemIndex) => itemIndex !== index))}>
              ×
            </button>
          </>
        )}
      />

      <div className="chip-group__label" style={{ marginTop: 16 }}>
        Cadre / environnement
      </div>
      <ChipSet>
        {characteristics.environmentOptions.map((option) => (
          <Chip
            key={option.code}
            label={option.label}
            on={characteristics.selectedEnvironmentCodes.includes(option.code)}
            onClick={() =>
              editor.replaceModule('characteristics', {
                ...characteristics,
                selectedEnvironmentCodes: toggleCode(characteristics.selectedEnvironmentCodes, option.code),
              })
            }
          />
        ))}
      </ChipSet>

      <div style={{ marginTop: 16 }}>
      <Field label="Groupes">
        <div className="grid-2">
          <Input
            value={capacity.groupPolicy.minSize}
            placeholder="Min"
            mono
            onChange={(minSize) =>
              editor.replaceModule('capacityPolicies', {
                ...capacity,
                groupPolicy: { ...capacity.groupPolicy, minSize },
              })
            }
          />
          <Input
            value={capacity.groupPolicy.maxSize}
            placeholder="Max"
            mono
            onChange={(maxSize) =>
              editor.replaceModule('capacityPolicies', {
                ...capacity,
                groupPolicy: { ...capacity.groupPolicy, maxSize },
              })
            }
          />
        </div>
        <Toggle
          label="Groupes uniquement"
          on={capacity.groupPolicy.groupOnly}
          onChange={(groupOnly) =>
            editor.replaceModule('capacityPolicies', {
              ...capacity,
              groupPolicy: { ...capacity.groupPolicy, groupOnly },
            })
          }
        />
        <Textarea
          value={capacity.groupPolicy.notes}
          rows={3}
          onChange={(notes) =>
            editor.replaceModule('capacityPolicies', {
              ...capacity,
              groupPolicy: { ...capacity.groupPolicy, notes },
            })
          }
        />
      </Field>
      </div>

      {/* Politique d'accueil — moved here from the §06 type block (PO 2026-06-11):
          accepting animals is an accueil concern for ANY establishment type, and
          §07 renders for every archetype. §06 keeps a pointer note (§48 pattern). */}
      <div className="chip-group__label" style={{ marginTop: 16 }}>
        Politique d'accueil
      </div>
      <div className="grid-3">
        <div>
          <Toggle
            label="Animaux acceptés"
            on={capacity.petPolicy.accepted}
            onChange={(accepted) =>
              editor.replaceModule('capacityPolicies', {
                ...capacity,
                petPolicy: { ...capacity.petPolicy, accepted },
              })
            }
          />
          {capacity.petPolicy.accepted && (
            <Field label="Conditions d'accueil des animaux">
              <Textarea
                aria-label="Conditions d'accueil des animaux"
                value={capacity.petPolicy.conditions}
                rows={3}
                onChange={(conditions) =>
                  editor.replaceModule('capacityPolicies', {
                    ...capacity,
                    petPolicy: { ...capacity.petPolicy, conditions },
                  })
                }
              />
            </Field>
          )}
        </div>
      </div>
    </Fs>
  );
}
