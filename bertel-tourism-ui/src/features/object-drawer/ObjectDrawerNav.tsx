import { useObjectDrawerStore } from '../../store/object-drawer-store';
import type { SectionDef } from './object-drawer-sections';

interface ObjectDrawerNavProps {
  sections: SectionDef[];
}

export function ObjectDrawerNav({ sections }: ObjectDrawerNavProps) {
  const activeSection = useObjectDrawerStore((state) => state.activeSection);
  const setActiveSection = useObjectDrawerStore((state) => state.setActiveSection);

  return (
    <nav className="object-drawer-nav flex w-full flex-col gap-2 md:w-64 md:shrink-0" aria-label="Navigation fiche objet">
      {sections.map((section, index) => (
        <button
          key={section.id}
          type="button"
          className={activeSection === section.id ? 'object-drawer-nav__item object-drawer-nav__item--active' : 'object-drawer-nav__item'}
          onClick={() => setActiveSection(section.id)}
        >
          <div className="object-drawer-nav__header">
            <span className="object-drawer-nav__index">{String(index + 1).padStart(2, '0')}</span>
            <strong>{section.label}</strong>
          </div>
        </button>
      ))}
    </nav>
  );
}
