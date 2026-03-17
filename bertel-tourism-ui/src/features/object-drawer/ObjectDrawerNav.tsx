import { useObjectDrawerStore, type ObjectDrawerSection } from '../../store/object-drawer-store';

const sections: Array<{ id: ObjectDrawerSection; label: string; description: string }> = [
  { id: 'general', label: 'General', description: 'Nom, description, localisation' },
  { id: 'contacts', label: 'Contacts', description: 'Acteurs, organisations, canaux' },
  { id: 'media', label: 'Media', description: 'Photos, tags, visibilite' },
  { id: 'legal', label: 'Legal', description: 'Conformite, documents, alertes' },
  { id: 'pricing', label: 'Tarifs', description: 'Prix, periodes, remises' },
  { id: 'openings', label: 'Ouvertures', description: 'Periodes, horaires, creneaux' },
  { id: 'rooms', label: 'Chambres', description: 'Types, capacites, inventaire' },
  { id: 'mice', label: 'MICE', description: 'Salles, equipements, capacites' },
  { id: 'memberships', label: 'Adhesions', description: 'Cotisations, factures, visibilite' },
  { id: 'external-sync', label: 'Sync', description: 'APIDAE, Tourinsoft, connecteurs' },
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
          <span>{section.description}</span>
        </button>
      ))}
    </nav>
  );
}
