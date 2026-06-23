import { Disclosure, Fs, Input, Repeater, Select, StatCard } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceCapacityItem } from '../../../services/object-workspace-parser';
import { ModuleUnavailableNotice } from './blocks/block-notes';
import { EnvironmentChips, GroupPolicyButton, PetPolicyInline } from './capacity-controls';

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

const CAP_COLS = '14px 1.3fr 100px 86px 120px 120px 44px';

function repHeader(columns: string, labels: string[]) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: columns,
        gap: 10,
        padding: '6px 12px',
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--ink-4)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {labels.map((label, index) => (
        <span key={label || `col-${index}`}>{label}</span>
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
      title="Capacité & accueil"
      sub="Capacité d'accueil, groupes et animaux — alimente les filtres Explorer et la fiche publique. Le prix d'appel se gère dans Tarifs (§13)."
      folded={folded}
      pill={{
        tone: filledMetrics > 0 ? 'ok' : 'warn',
        label: filledMetrics > 0 ? `${filledMetrics} métrique(s)` : 'À compléter',
      }}
    >
      {/* §07 review no-clobber: a degraded load renders the notice INSTEAD of the
          module's controls — the saver also throws on this reason (defense-in-depth;
          the capacities delete-reinsert would wipe effective dates otherwise). */}
      {capacity.unavailableReason ? (
        <ModuleUnavailableNotice reason={capacity.unavailableReason} />
      ) : (
      <>
      {statCards.length > 0 && (
        <div className="grid-4" style={{ marginBottom: 14 }}>
          {statCards.map((stat) => (
            <StatCard key={stat.label} label={stat.label} value={stat.value} suffix={stat.suffix} />
          ))}
        </div>
      )}

      {/* 6.2 : divulgation progressive — les StatCards restent le résumé visible,
          le détail éditable (lignes de métriques) se replie. */}
      <Disclosure
        title="Détails de capacité"
        summary={`${capacity.capacityItems.length} métrique(s)`}
        defaultOpen={capacity.capacityItems.length > 0}
      >
      {repHeader(CAP_COLS, ['', 'Métrique', 'Valeur', 'Unité', 'Depuis', "Jusqu'au", ''])}
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
      <p style={{ fontSize: 11, color: 'var(--ink-4)', margin: '4px 0 0' }}>
        Les dates de validité sont internes (non publiées), utiles pour préparer une saison.
      </p>
      </Disclosure>

      {/* Cadre/environnement + Groupes + Animaux : composants partagés (§07 ici, §06 pour HEB).
          La source d'état reste editor.draft.characteristics / .capacityPolicies. */}
      <EnvironmentChips
        characteristics={characteristics}
        onChange={(next) => editor.replaceModule('characteristics', next)}
      />

      <GroupPolicyButton capacity={capacity} onChange={(next) => editor.replaceModule('capacityPolicies', next)} />
      <PetPolicyInline capacity={capacity} onChange={(next) => editor.replaceModule('capacityPolicies', next)} />
      </>
      )}
    </Fs>
  );
}
