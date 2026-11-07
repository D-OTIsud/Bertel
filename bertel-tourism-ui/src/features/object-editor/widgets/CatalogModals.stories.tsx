import type { Meta, StoryObj } from '@storybook/nextjs';
import { ClassificationEditModal } from './ClassificationEditModal';
import { MembershipEditModal } from './MembershipEditModal';
import { DishEditModal } from './DishEditModal';
import { MenuEditModal } from './MenuEditModal';
import { ProviderEditModal } from './ProviderEditModal';
import { createClassificationDraft } from '../sections/classification-edit';
import { createMenuItem } from '../sections/blocks/menu-items';
import type { ObjectWorkspaceDistinctionSchemeOption, ObjectWorkspaceMembershipModule, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';
import '../object-editor.css';

const meta: Meta = { title: 'Editor/Modal models/Catalogues', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;
const noop = () => undefined;
const ref = (code: string, label: string): WorkspaceReferenceOption => ({ id: code, code, label });
const dietary = [ref('vegetarian', 'Végétarien'), ref('vegan', 'Végan'), ref('pescatarian', 'Pescétarien'), ref('flexitarian', 'Flexitarien'), ref('halal', 'Halal'), ref('kosher', 'Casher'), ref('gluten_free', 'Sans gluten'), ref('lactose_free', 'Sans lactose'), ref('sugar_free', 'Sans sucre ajouté'), ref('low_carb', 'Faible en glucides'), ref('local', 'Local'), ref('organic', 'Bio')];
const allergens = ['Gluten', 'Crustacés', 'Œufs', 'Poisson', 'Arachides', 'Soja', 'Lait', 'Fruits à coque', 'Céleri', 'Moutarde', 'Sésame', 'Sulfites', 'Lupin', 'Mollusques'].map((label, index) => ref(`allergen_${index}`, label));
const schemes: ObjectWorkspaceDistinctionSchemeOption[] = [
  { id: 'hotel-stars', code: 'hotel_stars', label: 'Étoiles hôtel', selectionMode: 'single', isAccessibility: false, displayGroup: 'official_classification', valueOptions: [ref('1', '1 étoile'), ref('2', '2 étoiles'), ref('3', '3 étoiles'), ref('4', '4 étoiles'), ref('5', '5 étoiles')] },
  { id: 'rental-stars', code: 'rental_stars', label: 'Étoiles meublé', selectionMode: 'single', isAccessibility: false, displayGroup: 'official_classification', valueOptions: [ref('3', '3 étoiles')] },
  { id: 'gdf', code: 'gdf', label: 'Gîtes de France', selectionMode: 'single', isAccessibility: false, displayGroup: 'graded_label', valueOptions: [ref('granted', 'Accordé')] },
  { id: 'clevacances', code: 'clevacances', label: 'Clévacances', selectionMode: 'single', isAccessibility: false, displayGroup: 'graded_label', valueOptions: [ref('granted', 'Accordé')] },
  { id: 'quality', code: 'quality', label: 'Qualité Tourisme Île de La Réunion', selectionMode: 'single', isAccessibility: false, displayGroup: 'quality_label', valueOptions: [ref('granted', 'Accordé')] },
];
const membershipModule: ObjectWorkspaceMembershipModule = {
  scopeOptions: [{ orgObjectId: 'org-example', label: 'OTI du Sud', isPrimary: true }],
  campaignOptions: [ref('2026', 'Adhésion 2026'), ref('2025', 'Adhésion 2025'), ref('charte', 'Charte d’engagement')],
  tierOptions: [ref('charte', 'Charte (gratuit)'), ref('member', 'Membre'), ref('premium', 'Membre Premium'), ref('partner', 'Partenaire')],
  items: [], unavailableReason: null,
};
const dish = { ...createMenuItem(0, 'main', 'Plats'), recordId: 'dish-example', name: 'Cari poulet', description: 'Poulet péi, riz, grains, rougail tomate', price: '16', dietaryTagCodes: ['local'] };

export const Classement: Story = { render: () => <ClassificationEditModal open mode="add" schemes={schemes} existingItems={[]} draft={createClassificationDraft()} objectId="" onClose={noop} onSave={noop} /> };
export const Adhesion: Story = { render: () => <MembershipEditModal open mode="add" objectId="" module={membershipModule} item={null} onClose={noop} onSave={noop} /> };
export const Plat: Story = { render: () => <DishEditModal open dish={createMenuItem(0, 'main', 'Plats')} sectionLabel="Carte midi · Plats" dietaryOptions={dietary} allergenOptions={allergens} onClose={noop} onSave={noop} /> };
export const Menu: Story = { render: () => <MenuEditModal open menu={{ recordId: 'menu-example', categoryId: '', categoryCode: '', categoryLabel: '', name: 'Carte midi', description: '', active: true, visibility: 'public', position: '1', items: [dish, { ...createMenuItem(1, 'entree', 'Entrées'), recordId: 'dish-starter', name: 'Samoussas (4 pièces)', price: '6', dietaryTagCodes: ['vegetarian'], allergenCodes: ['allergen_0'] }, { ...createMenuItem(2, 'main', 'Plats'), recordId: 'dish-main', name: 'Rougail saucisses', price: '15', allergenCodes: ['allergen_0'] }] }}
  sectionOptions={[ref('entree', 'Entrées'), ref('main', 'Plats'), ref('dessert', 'Desserts'), ref('drinks', 'Boissons'), ref('set', 'Formules')]} dietaryOptions={dietary} allergenOptions={allergens} onClose={noop} onSave={noop} /> };
export const Prestataire: Story = { render: () => <ProviderEditModal open actor={{ id: 'actor-example', displayName: 'Marie Payet', firstName: 'Marie', lastName: 'Payet', gender: '', roleId: 'manager', roleCode: 'manager', roleLabel: 'Gérante', visibility: 'private', isPrimary: true, validFrom: '', validTo: '', note: '', contacts: [], contactsRestricted: false }}
  roleOptions={[ref('owner', 'Propriétaire'), ref('manager', 'Gérant(e)'), ref('operator', 'Exploitant(e)'), ref('sales', 'Contact commercial'), ref('booking', 'Contact réservation')]} noteUnavailableReason={null} onClose={noop} onSave={noop} /> };
