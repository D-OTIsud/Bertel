export interface LangTabDef {
  code: string;
  label: string;
  filled: boolean;
}

interface LangTabsProps {
  tabs: LangTabDef[];
  active: string;
  onSelect: (code: string) => void;
}

export function LangTabs({ tabs, active, onSelect }: LangTabsProps) {
  return (
    <div className="lang-tabs">
      {tabs.map((t) => (
        <button
          key={t.code}
          type="button"
          className={active === t.code ? 'is-on' : ''}
          title={t.label}
          aria-label={t.label}
          onClick={() => onSelect(t.code)}
        >
          {t.code.slice(0, 2).toUpperCase()}
          <span className={t.filled ? 'ok' : 'miss'}>{t.filled ? '●' : '○'}</span>
        </button>
      ))}
    </div>
  );
}
