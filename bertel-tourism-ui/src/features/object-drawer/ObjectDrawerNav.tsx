import { useObjectDrawerStore } from '../../store/object-drawer-store';
import type { SectionDef } from './object-drawer-sections';

interface ObjectDrawerNavProps {
  sections: SectionDef[];
}

export function ObjectDrawerNav({ sections }: ObjectDrawerNavProps) {
  const activeSection = useObjectDrawerStore((state) => state.activeSection);
  const setActiveSection = useObjectDrawerStore((state) => state.setActiveSection);

  return (
    <nav className="object-drawer-nav flex w-full flex-col gap-2 md:w-72 md:shrink-0" aria-label="Navigation fiche objet">
      {sections.map((section) => {
        const Icon = section.icon;

        return (
        <button
          key={section.id}
          type="button"
          className={activeSection === section.id ? 'object-drawer-nav__item object-drawer-nav__item--active' : 'object-drawer-nav__item'}
          onClick={() => setActiveSection(section.id)}
        >
          <div className="object-drawer-nav__header">
            <span className="object-drawer-nav__icon">
              <Icon size={16} />
            </span>
            <div className="object-drawer-nav__copy">
              <strong>{section.label}</strong>
              <span>{section.description}</span>
            </div>
            <div className="object-drawer-nav__meta">
              {typeof section.count === 'number' && section.count > 0 && (
                <span className="object-drawer-nav__count">{section.count}</span>
              )}
              {section.dirty && <span className="object-drawer-nav__dirty" aria-label="Section modifiee" />}
            </div>
          </div>
        </button>
        );
      })}
    </nav>
  );
}
