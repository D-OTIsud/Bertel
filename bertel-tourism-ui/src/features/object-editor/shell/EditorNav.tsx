import type { SectionGroup } from '../section-config';
import type { EditorToolItem, EditorToolKey } from './editor-tools';

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
  tools?: EditorToolItem[];
  onToolSelect?: (key: EditorToolKey) => void;
}

/**
 * Presentational grouped section nav. Scroll-spy (tracking `activeNum` from the
 * scroll position) and scroll-into-view on select are owned by ObjectEditPage.
 * The OUTILS group is data-driven via `tools` (see shell/editor-tools.ts).
 */
export function EditorNav({
  groups,
  activeNum,
  sectionState = {},
  onSelect,
  tools = [],
  onToolSelect = () => {},
}: EditorNavProps) {
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
      {tools.length > 0 && (
        <div className="edit-nav__group edit-nav__tools">
          <div className="edit-nav__title">Outils</div>
          {tools.map((tool) => (
            <button
              type="button"
              key={tool.key}
              className={`edit-nav__item${tool.danger ? ' edit-nav__item--danger' : ''}`}
              disabled={tool.disabled}
              title={tool.disabledReason}
              onClick={() => { if (!tool.disabled) onToolSelect(tool.key); }}
            >
              <span className="edit-nav__dot" />
              <span className="label">{tool.label}</span>
              {tool.stat ? <span className="edit-nav__stat">{tool.stat}</span> : null}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
