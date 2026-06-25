'use client';

// Phase 7.1 — rail des paramètres : un panneau visible à la fois, navigation groupée par
// périmètre. Présentationnel pur ; la page possède l'état `activeSection` (synchronisé à l'URL).
// Fidélité maquette p7-01 : railhead « Paramètres », badge de périmètre par groupe, icône par
// section.

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
      <div className="settings-rail__head">Paramètres</div>
      {groups.map((group) => (
        <div key={group.id} className="settings-rail__group">
          <div className="settings-rail__group-label">
            <span>{group.label}</span>
            <span className="settings-rail__scope">
              {group.scope.gated ? (
                <span className="badge badge--info badge--xs">{group.scope.label}</span>
              ) : (
                <span className="muted">{group.scope.label}</span>
              )}
            </span>
          </div>
          <ul className="settings-rail__list">
            {group.sections.map((section) => {
              const isActive = section.id === activeSection;
              const Icon = section.icon;
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    className={isActive ? 'settings-rail__item is-active' : 'settings-rail__item'}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => onSelect(section.id)}
                  >
                    {Icon ? <Icon size={18} aria-hidden /> : null}
                    <span className="settings-rail__item-label">{section.label}</span>
                    {section.isNew ? <span className="badge badge--ok badge--xs">Nouveau</span> : null}
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
