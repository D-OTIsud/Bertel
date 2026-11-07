'use client';

// Phase 7.1 — rail des paramètres : un panneau visible à la fois, navigation groupée par
// périmètre. La page possède l'état `activeSection` (synchronisé à l'URL).
// Fidélité maquette p7-01 : railhead « Paramètres », badge de périmètre par groupe, icône par
// section.

import { useEffect, useState } from 'react';
import { isSettingsSectionNew, SETTINGS_NEW_BADGE_DURATION_MS, type SettingsNavGroup } from './settings-nav';

export function SettingsRail({
  groups,
  activeSection,
  onSelect,
}: {
  groups: SettingsNavGroup[];
  activeSection: string;
  onSelect: (id: string) => void;
}) {
  // No time-dependent badges during SSR or the first hydration render. Once mounted,
  // wake only at the next introduction/expiry, including when this tab stays open.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function refresh() {
      const current = Date.now();
      setNow(current);
      clearTimeout(timer);
      let nextChange = Infinity;
      for (const group of groups) {
        for (const section of group.sections) {
          const start = section.introducedAt ? Date.parse(section.introducedAt) : NaN;
          if (!Number.isFinite(start)) continue;
          const end = start + SETTINGS_NEW_BADGE_DURATION_MS;
          if (start > current) nextChange = Math.min(nextChange, start);
          else if (end > current) nextChange = Math.min(nextChange, end);
        }
      }
      if (Number.isFinite(nextChange)) {
        // Browsers clamp longer delays to a signed 32-bit integer.
        timer = setTimeout(refresh, Math.min(nextChange - current, 2_147_483_647));
      }
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') refresh();
    }
    refresh();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [groups]);

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
                    {now !== null && isSettingsSectionNew(section, now) ? <span className="badge badge--ok badge--xs">Nouveau</span> : null}
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
