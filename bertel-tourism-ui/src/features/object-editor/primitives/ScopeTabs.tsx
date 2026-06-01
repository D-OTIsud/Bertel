export interface ScopeTabDef {
  code: string;
  label: string;
}

interface ScopeTabsProps {
  tabs: ScopeTabDef[];
  active: string;
  onSelect: (code: string) => void;
}

/** Segmented control mirroring LangTabs, but with word labels — the descriptions
 *  "scope" switch (Canonique / Mon organisation). */
export function ScopeTabs({ tabs, active, onSelect }: ScopeTabsProps) {
  return (
    <div className="scope-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.code}
          type="button"
          role="tab"
          aria-selected={active === t.code}
          className={active === t.code ? 'is-on' : ''}
          onClick={() => onSelect(t.code)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
