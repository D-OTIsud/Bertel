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
    <nav className="object-drawer-nav" aria-label="Navigation fiche objet">
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          className={activeSection === section.id ? 'object-drawer-nav__item object-drawer-nav__item--active' : 'object-drawer-nav__item'}
          onClick={() => setActiveSection(section.id)}
        >
          <strong>{section.label}</strong>
          <span>{section.description}</span>
        </button>
      ))}
    </nav>
  );
}
