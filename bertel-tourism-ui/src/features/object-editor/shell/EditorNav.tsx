import type { SectionGroup } from '../section-config';

export type EditorNavStatus = 'ok' | 'warn' | 'req';

export interface EditorNavSectionState {
  pct: number;
  status: EditorNavStatus;
  hint?: string;
}

interface EditorNavProps {
  groups: SectionGroup[];
  activeNum: string;
  sectionState?: Record<string, EditorNavSectionState>;
  onSelect: (num: string) => void;
}

const TOOL_ITEMS: Array<{ label: string; stat: string; disabled: boolean; danger?: boolean }> = [
  { label: 'Versions / historique', stat: 'v12', disabled: true },
  { label: 'Import / export', stat: '', disabled: true },
  { label: 'Dupliquer la fiche', stat: '', disabled: true },
  { label: 'Archiver', stat: '', disabled: true, danger: true },
];

/**
 * Presentational grouped section nav. Scroll-spy (tracking `activeNum` from the
 * scroll position) and scroll-into-view on select are owned by ObjectEditPage.
 */
export function EditorNav({ groups, activeNum, sectionState = {}, onSelect }: EditorNavProps) {
  return (
    <nav className="edit-nav">
      <div className="edit-nav__root-title">Sections de la fiche</div>
      {groups.map((g) => (
        <div key={g.group} className="edit-nav__group">
          <div className="edit-nav__title">{g.group}</div>
          {g.items.map((it) => {
            const state = sectionState[it.num];
            const statLabel = state?.hint || (state && state.pct < 100 ? `${state.pct}%` : '');
            return (
              <button
                type="button"
                key={it.num}
                className={`edit-nav__item${activeNum === it.num ? ' is-on' : ''}`}
                onClick={() => onSelect(it.num)}
              >
                <span className={`edit-nav__dot ${state?.status ?? ''}`} />
                <span className="label">
                  <span className="edit-nav__num">{it.num}</span>
                  {it.label}
                </span>
                {statLabel ? (
                  <span className={`edit-nav__stat ${state?.status ?? ''}`}>{statLabel}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
      <div className="edit-nav__group edit-nav__tools">
        <div className="edit-nav__title">Outils</div>
        {TOOL_ITEMS.map((tool) => (
          <button
            type="button"
            key={tool.label}
            className={`edit-nav__item${tool.danger ? ' edit-nav__item--danger' : ''}`}
            disabled={tool.disabled}
            title="Bientôt disponible"
          >
            <span className="edit-nav__dot" />
            <span className="label">{tool.label}</span>
            {tool.stat ? <span className="edit-nav__stat">{tool.stat}</span> : null}
          </button>
        ))}
      </div>
    </nav>
  );
}
