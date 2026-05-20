import { Chip, ChipSet, Fs, StatCard } from '../primitives';
import type { SectionProps } from './section-types';
import type {
  ObjectWorkspaceSustainabilityAction,
  ObjectWorkspaceSustainabilityCategory,
  ObjectWorkspaceSustainabilityModule,
} from '../../../services/object-workspace-parser';

/**
 * Plan 4 — Section 11 "Démarche durable".
 *
 * Mirrors `docs/Bertel_design_exemple/edit-extensions.jsx → SectionSustainability`.
 * The list of actions is read from `editor.draft.sustainability`. Toggling a
 * chip flips the `selected` flag; the save bar persists via the
 * `save_object_workspace_sustainability` RPC.
 *
 * Architectural note: the action ⇄ category structure is fully driven by the
 * V5 sustainability seeds (see `migration_sustainability_v5.sql`). No business
 * logic about labels lives here — equivalent-label hints stay read-only.
 */
export function SectionSustainability({ editor, folded }: SectionProps) {
  const module = editor.draft.sustainability;

  const totalActions = module.categories.reduce((sum, cat) => sum + cat.actions.length, 0);
  const selectedActions = module.categories.reduce(
    (sum, cat) => sum + cat.actions.filter((a) => a.selected).length,
    0,
  );
  const categoriesWithSelection = module.categories.filter(
    (cat) => cat.actions.some((a) => a.selected),
  ).length;
  // Stub score: 100 * selected / total — replace with the server-side score
  // once `api.get_object_resource` exposes a sustainability_score field.
  const bertelScore = totalActions > 0 ? Math.round((100 * selectedActions) / totalActions) : 0;

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
      sub="object_sustainability_action — actions concrètes déclarées par l'établissement, distinctes des labels officiels (§ Labels)"
      folded={folded}
      pill={{ tone: selectedActions > 0 ? 'ok' : 'warn', label: `${selectedActions} action(s)` }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatCard label="Actions déclarées" value={String(selectedActions)} suffix={`/ ${totalActions || '—'}`} />
        <StatCard label="Catégories couvertes" value={String(categoriesWithSelection)} suffix={`/ ${module.categories.length || '—'}`} />
        <StatCard label="Score Bertel" value={String(bertelScore)} suffix="/ 100" />
      </div>

      {module.categories.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>
          Aucune action durable disponible dans le référentiel pour ce profil. Charger les seeds V5
          (<code>migration_sustainability_v5.sql</code>) pour activer la sélection d'actions.
        </p>
      )}

      {module.categories.map((category, index) => {
        const localSelected = category.actions.filter((a) => a.selected).length;
        return (
          <div key={category.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="fs__num" style={{ width: 22, height: 22, fontSize: 9 }}>
                {(index + 1).toString().padStart(2, '0')}
              </span>
              <strong style={{ fontFamily: 'var(--font-display)', fontSize: 13 }}>{category.label}</strong>
              <span className="pill-mini" style={{ marginLeft: 'auto' }}>
                {localSelected} / {category.actions.length}
              </span>
            </div>
            <ChipSet>
              {category.actions.map((action) => (
                <Chip
                  key={action.id}
                  label={action.label}
                  on={action.selected}
                  onClick={() => toggleAction(category, action)}
                  sm
                />
              ))}
            </ChipSet>
          </div>
        );
      })}

      {module.equivalentLabels.length > 0 && (
        <>
          <div className="chip-group__label" style={{ marginTop: 14 }}>
            Équivalence labels (search expansion)
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--ink-3)', margin: '0 0 8px' }}>
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
