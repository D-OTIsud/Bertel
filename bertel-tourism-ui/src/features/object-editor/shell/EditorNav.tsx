import type { SectionGroup } from '../section-config';

export type EditorNavStatus = 'ok' | 'warn' | 'req';

export interface EditorNavSectionState {
  pct: number;
  status: EditorNavStatus;
}

interface EditorNavProps {
  groups: SectionGroup[];
  activeNum: string;
  sectionState?: Record<string, EditorNavSectionState>;
  onSelect: (num: string) => void;
}

/**
 * Presentational grouped section nav. Scroll-spy (tracking `activeNum` from the
 * scroll position) and scroll-into-view on select are owned by ObjectEditPage.
 */
export function EditorNav({ groups, activeNum, sectionState = {}, onSelect }: EditorNavProps) {
  return (
    <nav className="edit-nav">
      {groups.map((g) => (
        <div key={g.group} className="edit-nav__group">
          <div className="edit-nav__title">{g.group}</div>
          {g.items.map((it) => {
            const state = sectionState[it.num];
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
                {state && <span className="edit-nav__pct">{state.pct}%</span>}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
