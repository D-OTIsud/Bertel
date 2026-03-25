import type {
  AuditQuestion,
  BackendObjectTypeCode,
  ExplorerBucketKey,
  ExplorerFilters,
  ObjectCard,
  ObjectDetail,
  PendingChangeItem,
  PresenceMember,
  PublicationCard,
  CrmTask,
} from '../types/domain';
import { applyFrontendOnlyExplorerFilters, getBackendTypesForBucket, getEffectiveSelectedBuckets, sortExplorerCards } from '../utils/facets';

export const mockCards: ObjectCard[] = [
  {
    id: 'HOTRUN0000000001',
    type: 'HOT',
    name: 'Hotel Basalte & Lagon',
    status: 'published',
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80',
    rating: 4.6,
    review_count: 182,
    min_price: 149,
    open_now: true,
    labels: ['ecolabel', 'prestige', 'vue-mer', 'spa', 'mice', 'nouveau'],
    description: 'Hotel panoramique avec spa, grande capacite et vue sur l ocean.',
    updated_at: '2026-03-10T11:15:00Z',
    location: { lat: -21.349245712362077, lon: 55.48258886392355, city: 'Saint-Pierre', postcode: '97410', address: 'Front de mer, Saint-Pierre' },
    render: { price: '149 EUR / nuit', rating: '4.6 / 5', updated_at: 'Mis a jour le 10 mars 2026' },
  },
  {
    id: 'RESRUN0000000002',
    type: 'RES',
    name: 'Le Comptoir des Epices',
    status: 'published',
    image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
    rating: 4.8,
    review_count: 94,
    min_price: 28,
    open_now: true,
    labels: ['famille', 'local', 'terrasse'],
    description: 'Cuisine locale creative, terrasse, service midi et soir.',
    updated_at: '2026-03-08T17:20:00Z',
    location: { lat: -21.273443388814123, lon: 55.33390803222577, city: 'Etang-Sale', postcode: '97427', address: 'Rue des filaos, Etang-Sale' },
    render: { price: 'Menu a partir de 28 EUR', rating: '4.8 / 5', updated_at: 'Mis a jour le 8 mars 2026' },
  },
  {
    id: 'ITIRUN000000003',
    type: 'ITI',
    name: 'Sentier des Trois Cascades',
    status: 'published',
    image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=900&q=80',
    rating: 4.5,
    review_count: 58,
    min_price: null,
    open_now: true,
    description: 'Itineraire forestier avec denivele moyen et panorama volcanique.',
    updated_at: '2026-03-06T09:00:00Z',
    location: { lat: -21.12931941062737, lon: 55.455478307663036, city: 'Cilaos', postcode: '97413', address: 'Depart au belvedere' },
    render: { rating: '4.5 / 5', updated_at: 'Mis a jour le 6 mars 2026' },
  },
  {
    id: 'ACTRUN000000004',
    type: 'LOI',
    name: 'Kayak des Falaises Noires',
    status: 'published',
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80',
    rating: 4.7,
    review_count: 41,
    min_price: 52,
    open_now: false,
    labels: ['prestige', 'guide', 'petit-groupe', 'aventure', 'photo-spots'],
    description: 'Sortie guidee en petit groupe avec mise a l eau securisee.',
    updated_at: '2026-03-09T07:40:00Z',
    location: { lat: -21.383928154391096, lon: 55.61914342905779, city: 'Saint-Joseph', postcode: '97480', address: 'Anse des remparts' },
    render: { price: '52 EUR / personne', rating: '4.7 / 5', updated_at: 'Mis a jour le 9 mars 2026' },
  },
  {
    id: 'EVTRUN000000005',
    type: 'FMA',
    name: 'Festival des Hauts en Lumiere',
    status: 'published',
    image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=80',
    rating: 4.3,
    review_count: 26,
    min_price: 12,
    open_now: false,
    description: 'Evenement familial avec concerts, marche des producteurs et navettes.',
    updated_at: '2026-03-04T12:30:00Z',
    location: { lat: -21.201013707480357, lon: 55.624340007832835, city: 'Le Tampon', postcode: '97430', address: 'Parvis du theatre' },
    render: { price: 'Billets a partir de 12 EUR', rating: '4.3 / 5', updated_at: 'Mis a jour le 4 mars 2026' },
  },
  {
    id: 'RESRUN0000000101',
    type: 'RES',
    name: 'Bistrot du Port',
    status: 'published',
    image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=80',
    rating: 4.5,
    review_count: 112,
    min_price: 25,
    open_now: true,
    description: 'Poissons frais et vue sur le port de Saint-Pierre.',
    updated_at: '2026-03-10T11:15:00Z',
    location: { lat: -21.348, lon: 55.483, city: 'Saint-Pierre', postcode: '97410', address: 'Port de Saint-Pierre' },
    render: { price: 'Menu a 25 EUR', rating: '4.5 / 5', updated_at: 'Mis a jour le 10 mars 2026' },
  },
  {
    id: 'RESRUN0000000102',
    type: 'RES',
    name: 'La Kaz a Rougail',
    status: 'published',
    image: 'https://images.unsplash.com/photo-1544148103-0773bf10d330?auto=format&fit=crop&w=900&q=80',
    rating: 4.9,
    review_count: 340,
    min_price: 15,
    open_now: true,
    description: 'Specialites creoles traditionnelles.',
    updated_at: '2026-03-10T11:15:00Z',
    location: { lat: -21.3475, lon: 55.481, city: 'Saint-Pierre', postcode: '97410', address: 'Centre ville' },
    render: { price: 'Plats des 15 EUR', rating: '4.9 / 5', updated_at: 'Mis a jour le 10 mars 2026' },
  },
  {
    id: 'ACTRUN0000000103',
    type: 'LOI',
    name: 'Canyoning Fleurs Jaunes',
    status: 'published',
    image: 'https://images.unsplash.com/photo-1587547131116-a0655a526190?auto=format&fit=crop&w=900&q=80',
    rating: 4.8,
    review_count: 88,
    min_price: 65,
    open_now: false,
    description: 'Descente sportive dans le cirque de Cilaos.',
    updated_at: '2026-03-10T11:15:00Z',
    location: { lat: -21.130, lon: 55.456, city: 'Cilaos', postcode: '97413', address: 'Route d Ilet a Cordes' },
    render: { price: '65 EUR / pers', rating: '4.8 / 5', updated_at: 'Mis a jour le 10 mars 2026' },
  },
  {
    id: 'HOTRUN0000000104',
    type: 'HOT',
    name: 'Le Vieux Cep',
    status: 'published',
    image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=900&q=80',
    rating: 4.4,
    review_count: 210,
    min_price: 90,
    open_now: true,
    description: 'Hebergement de charme avec vue sur le Piton des Neiges.',
    updated_at: '2026-03-10T11:15:00Z',
    location: { lat: -21.133, lon: 55.470, city: 'Cilaos', postcode: '97413', address: 'Village de Cilaos' },
    render: { price: 'De 90 a 150 EUR', rating: '4.4 / 5', updated_at: 'Mis a jour le 10 mars 2026' },
  },
];

export const mockObjectDetails: Record<string, ObjectDetail> = {
  HOTRUN0000000001: {
    id: 'HOTRUN0000000001',
    name: 'Hotel Basalte & Lagon',
    type: 'HOT',
    raw: {
      description: 'Hotel panoramique avec spa, grande capacite et vue sur l ocean.',
      descriptions: { fr: 'Hotel panoramique avec spa, grande capacite et vue sur l ocean.' },
      location: { lat: -21.135, lon: 55.472, address: 'Front de mer, Saint-Pierre' },
      contacts: [
        { id: 'cnt-1', label: 'Reception', kind: 'phone', value: '+262 262 10 10 10' },
        { id: 'cnt-2', label: 'Reservations', kind: 'email', value: 'resa@basalte-lagon.re' },
      ],
      actors: [
        { id: 'act-1', name: 'Marie Rivage', role: 'Gerante' },
        { id: 'act-2', name: 'Oceane Accueil', role: 'Responsable accueil' },
      ],
      org_links: [
        { id: 'org-1', name: 'Office Sud Premium', link_type: 'Commercialisation' },
      ],
      media: [
        { id: 'med-1', url: mockCards[0].image, title: 'Facade', tags: ['facade', 'public'] },
        { id: 'med-2', url: mockCards[0].image, title: 'Spa', tags: ['spa', 'interne'] },
      ],
      opening_times: [
        { label: 'Haute saison', slots: ['00:00-23:59'], weekdays: ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] },
        { label: 'Navette aeroport', slots: ['07:00-21:00'], weekdays: ['lun', 'mer', 'ven'] },
      ],
      prices: [
        { label: 'Chambre double', amount: 149, currency: 'EUR', period_label: 'Tarif standard' },
        { label: 'Suite ocean', amount: 235, currency: 'EUR', period_label: 'Vacances scolaires' },
      ],
      legal_records: [
        {
          label: 'Licence exploitation',
          status: 'Valide',
          document_id: 'doc-lic-2026',
          validity_mode: 'fixed_end_date',
          days_until_expiry: '294',
          delivered_at: '2026-02-10',
        },
        {
          label: 'Assurance RC Pro',
          status: 'Renouvellement requis',
          document_id: 'doc-ins-2025',
          validity_mode: 'fixed_end_date',
          days_until_expiry: '18',
          delivered_at: '2025-04-02',
        },
      ],
      room_types: [
        { id: 'room-1', name: 'Chambre standard', capacity_adults: 2, beds: '1 queen', quantity: 18 },
        { id: 'room-2', name: 'Suite famille', capacity_adults: 4, beds: '2 queen', quantity: 6 },
      ],
      meeting_rooms: [
        { id: 'meet-1', name: 'Salle Basalte', capacity_theatre: 60, capacity_classroom: 24, equipment: ['wifi', 'projecteur', 'visioconference'] },
      ],
      memberships: [
        {
          id: 'member-1',
          name: 'Club Hebergement Premium',
          tier: 'Gold',
          status: 'Active',
          invoice_status: 'Payee',
          visibility_impact: 'Visibilite boostee',
          expires_at: '2026-12-31',
        },
      ],
      external_ids: [
        {
          id: 'sync-1',
          source: 'APIDAE',
          external_id: 'api-974-HOT-1001',
          status: 'Synced',
          last_sync_at: '2026-03-11 06:20',
          note: 'Derniere publication sans conflit',
        },
        {
          id: 'sync-2',
          source: 'Tourinsoft',
          external_id: 'ts-1001',
          status: 'Pending review',
          last_sync_at: '2026-03-10 22:45',
          note: 'Description en attente de validation',
        },
      ],
    },
  },
  RESRUN0000000002: {
    id: 'RESRUN0000000002',
    name: 'Le Comptoir des Epices',
    type: 'RES',
    raw: {
      description: 'Cuisine locale creative, terrasse, service midi et soir.',
      descriptions: { fr: 'Cuisine locale creative, terrasse, service midi et soir.' },
      location: { lat: -21.283, lon: 55.411, address: 'Rue des filaos, Etang-Sale' },
      contacts: [
        { id: 'cnt-3', label: 'Salle', kind: 'phone', value: '+262 262 22 22 22' },
      ],
      actors: [
        { id: 'act-3', name: 'Claire Epices', role: 'Cheffe proprietaire' },
      ],
      org_links: [
        { id: 'org-2', name: 'Collectif Tables du Sud', link_type: 'Reseau gourmet' },
      ],
      media: [{ id: 'med-3', url: mockCards[1].image, title: 'Salle', tags: ['salle', 'public'] }],
      opening_times: [
        { label: 'Service midi', slots: ['12:00-14:30'], weekdays: ['mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] },
        { label: 'Service soir', slots: ['19:00-22:30'], weekdays: ['jeu', 'ven', 'sam'] },
      ],
      prices: [
        { label: 'Menu signature', amount: 28, currency: 'EUR', period_label: 'Carte toute l annee' },
        { label: 'Accord mets & vins', amount: 44, currency: 'EUR', period_label: 'Soiree degustation' },
      ],
      legal_records: [
        {
          label: 'Licence restaurant',
          status: 'Renouvellement requis',
          document_id: 'doc-rest-2025',
          validity_mode: 'fixed_end_date',
          days_until_expiry: '14',
          delivered_at: '2025-05-12',
        },
      ],
      room_types: [],
      meeting_rooms: [
        { id: 'meet-2', name: 'Salon prive Safran', capacity_theatre: 24, capacity_classroom: 12, equipment: ['ecran', 'wifi'] },
      ],
      memberships: [
        {
          id: 'member-2',
          name: 'Collectif Tables du Sud',
          tier: 'Decouverte',
          status: 'Renewal required',
          invoice_status: 'Paiement en retard',
          visibility_impact: 'Visibilite bientot masquee',
          expires_at: '2026-03-31',
        },
      ],
      external_ids: [
        {
          id: 'sync-3',
          source: 'Google Business Profile',
          external_id: 'gbp-comptoir-epices',
          status: 'Synced',
          last_sync_at: '2026-03-11 05:50',
          note: 'Horaires conformes',
        },
      ],
    },
  },
};

export const mockPendingChanges: PendingChangeItem[] = [
  {
    id: 'chg-1',
    objectName: 'Hotel Basalte & Lagon',
    author: 'Jean Martin',
    field: 'description',
    before: 'Hotel panoramique avec spa.',
    after: 'Hotel panoramique avec spa, navette aeroport et espace famille.',
    submittedAt: '2026-03-11 09:20',
  },
  {
    id: 'chg-2',
    objectName: 'Le Comptoir des Epices',
    author: 'Claire Robert',
    field: 'opening_times',
    before: 'Ferme le lundi.',
    after: 'Ouvert le lundi midi pendant les vacances scolaires.',
    submittedAt: '2026-03-10 16:05',
  },
];

export const mockCrmTasks: CrmTask[] = [
  { id: 'task-1', title: 'Rappeler le directeur', actor: 'Hotel Basalte & Lagon', assignee: 'Marie', status: 'todo', dueLabel: 'Aujourd hui' },
  { id: 'task-2', title: 'Valider le contrat photo', actor: 'Le Comptoir des Epices', assignee: 'Jean', status: 'doing', dueLabel: 'Demain' },
  { id: 'task-3', title: 'Confirmer les horaires d hiver', actor: 'Sentier des Trois Cascades', assignee: 'Luc', status: 'done', dueLabel: 'Termine' },
];

export const mockTimeline = [
  { id: 'evt-1', author: 'Marie', text: 'Appel de suivi avec le proprietaire, besoin d une nouvelle photo facade.', at: '11:12' },
  { id: 'evt-2', author: 'Luc', text: 'Mail envoye pour validation des tarifs 2026.', at: '09:40' },
];

export const mockAuditQuestions: AuditQuestion[] = [
  { id: 'q-1', label: 'Signaletique visible depuis la route', score: 4 },
  { id: 'q-2', label: 'Accessibilite PMR conforme', score: 3 },
  { id: 'q-3', label: 'Photos de controle prises', note: 'Facade et accueil' },
];

export const mockPublicationCards: PublicationCard[] = [
  { id: 'pub-1', title: 'Guide Hebergements Sud', lane: 'brief', page: 12 },
  { id: 'pub-2', title: 'Carnet Restaurants', lane: 'layout', page: 6 },
  { id: 'pub-3', title: 'Top 20 Randonnees', lane: 'ready', page: 18 },
];

export const mockPresence: PresenceMember[] = [
  { userId: 'usr-1', name: 'Marie', avatar: 'MA', color: '#ff7b54' },
  { userId: 'usr-2', name: 'Jean', avatar: 'JE', color: '#4cb3ff' },
  { userId: 'usr-3', name: 'Lina', avatar: 'LI', color: '#78c67a' },
];

function matchesBucket(card: ObjectCard, bucket: ExplorerBucketKey): boolean {
  return getBackendTypesForBucket(bucket).includes(String(card.type).toUpperCase() as BackendObjectTypeCode);
}

export function filterMockCards(filters: ExplorerFilters, bucket?: ExplorerBucketKey): ObjectCard[] {
  const buckets = bucket ? [bucket] : getEffectiveSelectedBuckets(filters.selectedBuckets);
  const search = filters.common.search.trim().toLowerCase();
  const cities = filters.common.cities.map((c) => c.trim().toLowerCase()).filter(Boolean);
  const lieuDit = filters.common.lieuDit.trim().toLowerCase();
  const labelsAny = filters.common.labelsAny.map((label) => String(label).toLowerCase()).filter(Boolean);

  const filtered = mockCards.filter((card) => {
    const bucketMatches = buckets.some((candidate) => matchesBucket(card, candidate));
    const searchMatches =
      search.length === 0 ||
      card.name.toLowerCase().includes(search) ||
      (card.description ?? '').toLowerCase().includes(search) ||
      (card.location?.city ?? '').toLowerCase().includes(search);
    const cityMatches = cities.length === 0 || cities.includes((card.location?.city ?? '').toLowerCase());
    const lieuDitMatches = lieuDit.length === 0 || (card.location?.lieu_dit ?? '').toLowerCase().includes(lieuDit);
    const openMatches = !filters.common.openNow || card.open_now === true;
    const petsMatches = !filters.common.petsAccepted || card.id === 'HOTRUN0000000001';
    const pmrMatches = !filters.common.pmr || ['HOTRUN0000000001', 'RESRUN0000000002'].includes(card.id);
    const labelsMatches =
      labelsAny.length === 0 ||
      (Array.isArray(card.labels) && card.labels.some((label) => labelsAny.includes(String(label).toLowerCase())));

    if (!bucketMatches || !searchMatches || !cityMatches || !lieuDitMatches || !openMatches || !petsMatches || !pmrMatches || !labelsMatches) {
      return false;
    }

    if (bucket === 'ITI') {
      const distance = card.id === 'ITIRUN000000003' ? 8.4 : null;
      const duration = card.id === 'ITIRUN000000003' ? 3.2 : null;
      const difficulty = card.id === 'ITIRUN000000003' ? 3 : null;
      const isLoop = card.id === 'ITIRUN000000003';

      if (filters.iti.isLoop != null && filters.iti.isLoop !== isLoop) {
        return false;
      }
      if (filters.iti.difficultyMin != null && (difficulty == null || difficulty < filters.iti.difficultyMin)) {
        return false;
      }
      if (filters.iti.difficultyMax != null && (difficulty == null || difficulty > filters.iti.difficultyMax)) {
        return false;
      }
      if (filters.iti.distanceMinKm != null && (distance == null || distance < filters.iti.distanceMinKm)) {
        return false;
      }
      if (filters.iti.distanceMaxKm != null && (distance == null || distance > filters.iti.distanceMaxKm)) {
        return false;
      }
      if (filters.iti.durationMinH != null && (duration == null || duration < filters.iti.durationMinH)) {
        return false;
      }
      if (filters.iti.durationMaxH != null && (duration == null || duration > filters.iti.durationMaxH)) {
        return false;
      }
    }

    return true;
  });

  return sortExplorerCards(applyFrontendOnlyExplorerFilters(filtered, filters));
}