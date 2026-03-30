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
    <nav className="object-drawer-nav flex w-full flex-col gap-2 md:w-64 md:shrink-0" aria-label="Navigation workspace objet">
      {sections.map((section, index) => {
        const isActive = activeSection === section.id;
        const isDirty = dirtySections[section.id] === true;

        return (
          <button
            key={section.id}
            type="button"
            className={isActive ? 'object-drawer-nav__item object-drawer-nav__item--active' : 'object-drawer-nav__item'}
            onClick={() => onSelectSection(section.id)}
          >
            <div className="object-drawer-nav__header">
              <span className="object-drawer-nav__index">{String(index + 1).padStart(2, '0')}</span>
              <strong>{section.label}</strong>
            </div>
            <div className="stack-list">
              <small>{section.eyebrow}</small>
              <small>{section.description}</small>
              {isDirty && <small>Modifications non sauvegardees</small>}
            </div>
          </button>
        );
      })}
    </nav>
  );
}
