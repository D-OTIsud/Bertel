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
  return (
    <nav className="object-drawer-nav flex w-full flex-col gap-1 md:w-56 md:shrink-0" aria-label="Navigation workspace objet">
      {sections.map((section) => {
        const isActive = activeSection === section.id;
        const isDirty = dirtySections[section.id] === true;

        return (
          <button
            key={section.id}
            type="button"
            className={isActive ? 'object-drawer-nav__item object-drawer-nav__item--active' : 'object-drawer-nav__item'}
            onClick={() => onSelectSection(section.id)}
          >
            <span className="object-drawer-nav__label">{section.label}</span>
            {isDirty && <span className="object-drawer-nav__dirty" aria-label="Modifications non sauvegardées" />}
          </button>
        );
      })}
    </nav>
  );
}
