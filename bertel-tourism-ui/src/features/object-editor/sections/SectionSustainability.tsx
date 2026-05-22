import { useMemo, useState } from 'react';
import { Chip, ChipSet, Fs, StatCard } from '../primitives';
import type { SectionProps } from './section-types';
import type {
  ObjectWorkspaceSustainabilityAction,
  ObjectWorkspaceSustainabilityCategory,
  ObjectWorkspaceSustainabilityModule,
} from '../../../services/object-workspace-parser';

function initialExpandedByCategory(
  categories: ObjectWorkspaceSustainabilityCategory[],
): Record<string, boolean> {
  return Object.fromEntries(
    categories.map((category) => [
      category.id,
      category.actions.some((action) => action.selected),
    ]),
  );
}

/**
 * Section 11 — Démarche durable.
 * Categories and actions come from `ref_sustainability_action_*` (enriched in
 * `getObjectWorkspaceSustainabilityModule`); labels/descriptions from API i18n.
 */
export function SectionSustainability({ editor, folded }: SectionProps) {
  const module = editor.draft.sustainability;
  const [expandedByCategory, setExpandedByCategory] = useState<Record<string, boolean>>(() =>
    initialExpandedByCategory(module.categories),
  );

  const totalActions = useMemo(
    () => module.categories.reduce((sum, cat) => sum + cat.actions.length, 0),
    [module.categories],
  );
  const selectedActions = useMemo(
    () => module.categories.reduce((sum, cat) => sum + cat.actions.filter((a) => a.selected).length, 0),
    [module.categories],
  );
  const categoriesWithSelection = useMemo(
    () => module.categories.filter((cat) => cat.actions.some((a) => a.selected)).length,
    [module.categories],
  );
  // Stub until api exposes a server-side sustainability_score.
  const bertelScore = totalActions > 0 ? Math.round((100 * selectedActions) / totalActions) : 0;

  function toggleCategory(categoryId: string) {
    setExpandedByCategory((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }));
  }

  function toggleAction(
    category: ObjectWorkspaceSustainabilityCategory,
    action: ObjectWorkspaceSustainabilityAction,
  ) {
    const next: ObjectWorkspaceSustainabilityModule = {
      ...module,
      categories: module.categories.map((c) =>
        c.id !== category.id
          ? c
          : {
              ...c,
              actions: c.actions.map((a) =>
                a.id !== action.id ? a : { ...a, selected: !a.selected },
              ),
            },
      ),
    };
    editor.replaceModule('sustainability', next);
  }

  return (
    <Fs
      num="11"
      title="Démarche durable"
      sub="Actions concrètes déclarées par l'établissement, distinctes des labels officiels"
      folded={folded}
      pill={{ tone: selectedActions > 0 ? 'ok' : 'warn', label: `${selectedActions} action(s)` }}
    >
      <div className="sust-kpi">
        <StatCard label="Actions déclarées" value={String(selectedActions)} suffix={`/ ${totalActions || '—'}`} />
        <StatCard
          label="Catégories couvertes"
          value={String(categoriesWithSelection)}
          suffix={`/ ${module.categories.length || '—'}`}
        />
        <StatCard label="Score Bertel" value={String(bertelScore)} suffix="/ 100" />
      </div>

      {module.categories.length === 0 && (
        <p className="sust-empty">
          Aucune action durable n'est disponible pour le moment.
        </p>
      )}

      {module.categories.map((category, index) => {
        const localSelected = category.actions.filter((a) => a.selected).length;
        const isOpen = expandedByCategory[category.id] ?? false;
        const panelId = `sust-cat-${category.id}`;

        return (
          <div key={category.id} className={`sust-cat${isOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="sust-cat__head"
              onClick={() => toggleCategory(category.id)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              title={category.description || undefined}
            >
              <span className="fs__num sust-cat__num">{(index + 1).toString().padStart(2, '0')}</span>
              <span className="sust-cat__title">
                <strong>{category.label}</strong>
                {category.description ? <small>{category.description}</small> : null}
              </span>
              <span className="pill-mini sust-cat__count">
                {localSelected} / {category.actions.length}
              </span>
              <span className="sust-cat__chev" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </button>
            {isOpen ? (
              <div id={panelId} className="sust-cat__body">
                <ChipSet>
                  {category.actions.map((action) => (
                    <Chip
                      key={action.id}
                      label={action.label}
                      title={action.description || undefined}
                      on={action.selected}
                      onClick={() => toggleAction(category, action)}
                      sm
                    />
                  ))}
                </ChipSet>
              </div>
            ) : null}
          </div>
        );
      })}

      {module.equivalentLabels.length > 0 && (
        <>
          <div className="chip-group__label" style={{ marginTop: 14 }}>
            Équivalence labels (search expansion)
          </div>
          <p className="sust-equiv-hint">
            Les actions déclarées ci-dessus rendent automatiquement la fiche visible dans les recherches portant sur :
          </p>
          <ChipSet>
            {module.equivalentLabels.map((label) => (
              <Chip key={label.code} label={label.label} on />
            ))}
          </ChipSet>
        </>
      )}
    </Fs>
  );
}
