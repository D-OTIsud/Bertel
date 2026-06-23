'use client';

// Phase 7.1 — rail des paramètres : un panneau visible à la fois, navigation groupée par
// périmètre. Présentationnel pur ; la page possède l'état `activeSection` (synchronisé à l'URL).

import type { SettingsNavGroup } from './settings-nav';

export function SettingsRail({
  groups,
  activeSection,
  onSelect,
}: {
  groups: SettingsNavGroup[];
  activeSection: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="settings-rail" aria-label="Sections des paramètres">
      {groups.map((group) => (
        <div key={group.id} className="settings-rail__group">
          <div className="settings-rail__group-label">{group.label}</div>
          <ul className="settings-rail__list">
            {group.sections.map((section) => {
              const isActive = section.id === activeSection;
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    className={isActive ? 'settings-rail__item is-active' : 'settings-rail__item'}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => onSelect(section.id)}
                  >
                    {section.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
