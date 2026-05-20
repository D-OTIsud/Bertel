import type { SectionGroup } from '../section-config';

interface EditorNavProps {
  groups: SectionGroup[];
  activeNum: string;
  onSelect: (num: string) => void;
}

/**
 * Presentational grouped section nav. Scroll-spy (tracking `activeNum` from the
 * scroll position) and scroll-into-view on select are owned by ObjectEditPage.
 */
export function EditorNav({ groups, activeNum, onSelect }: EditorNavProps) {
  return (
    <nav className="edit-nav">
      {groups.map((g) => (
        <div key={g.group} className="edit-nav__group">
          <div className="edit-nav__title">{g.group}</div>
          {g.items.map((it) => (
            <button
              type="button"
              key={it.num}
              className={`edit-nav__item${activeNum === it.num ? ' is-on' : ''}`}
              onClick={() => onSelect(it.num)}
            >
              <span className="edit-nav__dot" />
              <span className="label">
                <span className="edit-nav__num">{it.num}</span>
                {it.label}
              </span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
