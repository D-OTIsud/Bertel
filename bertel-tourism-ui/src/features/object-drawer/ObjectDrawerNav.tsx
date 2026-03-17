import { useObjectDrawerStore, type ObjectDrawerSection } from '../../store/object-drawer-store';

const sections: Array<{ id: ObjectDrawerSection; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'media', label: 'Media' },
  { id: 'legal', label: 'Legal' },
  { id: 'pricing', label: 'Tarifs' },
  { id: 'openings', label: 'Ouvertures' },
  { id: 'rooms', label: 'Chambres' },
  { id: 'mice', label: 'MICE' },
  { id: 'memberships', label: 'Adhesions' },
  { id: 'external-sync', label: 'Sync' },
];

export function ObjectDrawerNav() {
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
