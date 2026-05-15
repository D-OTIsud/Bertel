import { Fragment } from 'react';
import type { WorkspaceModuleId } from '../../services/object-workspace';
import type { SectionDef } from './object-drawer-sections';

interface ObjectDrawerNavProps {
  sections: SectionDef[];
  activeSection: WorkspaceModuleId;
  dirtySections: Partial<Record<WorkspaceModuleId, boolean>>;
  onSelectSection: (section: WorkspaceModuleId) => void;
}

export function ObjectDrawerNav({
  sections,
  activeSection,
  dirtySections,
  onSelectSection,
}: ObjectDrawerNavProps) {
  let lastGroup: string | null = null;

  return (
    <nav className="object-drawer-nav flex w-full flex-col md:w-56 md:shrink-0" aria-label="Navigation workspace objet">
      {sections.map((section) => {
        const isActive = activeSection === section.id;
        const isDirty = dirtySections[section.id] === true;
        const showGroup = section.group !== lastGroup;
        lastGroup = section.group;

        return (
          <Fragment key={section.id}>
            {showGroup && <p className="object-drawer-nav__sect">{section.group}</p>}
            <button
              type="button"
              className={isActive ? 'object-drawer-nav__item object-drawer-nav__item--active' : 'object-drawer-nav__item'}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => onSelectSection(section.id)}
            >
              <span className="object-drawer-nav__label">{section.label}</span>
              {isDirty && (
                <span
                  className="object-drawer-nav__stat object-drawer-nav__stat--warn"
                  aria-label="Modifications non sauvegardées"
                >
                  Modifié
                </span>
              )}
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}
