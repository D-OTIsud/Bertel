import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSessionStore } from '../../store/session-store';
import type { ObjectDetail } from '../../types/domain';
import { ObjectDetailView } from './ObjectDetailView';

const mockMutateAsync = jest.fn();
const mockUpdateMutateAsync = jest.fn();
const mockDeleteMutateAsync = jest.fn();
const mockPrivateNoteAccess = {
  data: true,
  isSuccess: true,
  isError: false,
};

jest.mock('react-map-gl/maplibre', () => ({
  Map: ({ children }: { children?: ReactNode }) => <div data-testid="detail-map">{children}</div>,
  Marker: ({ children }: { children?: ReactNode }) => <div data-testid="detail-marker">{children}</div>,
  NavigationControl: () => <div data-testid="detail-map-zoom" />,
}));

jest.mock('../../hooks/useExplorerQueries', () => ({
  useAddObjectPrivateNoteMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
  useUpdateObjectPrivateNoteMutation: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
  useDeleteObjectPrivateNoteMutation: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
  }),
  useObjectPrivateNoteWriteAccessQuery: () => mockPrivateNoteAccess,
}));

function renderDetail(data: ObjectDetail) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ObjectDetailView data={data} raw={data.raw} />
    </QueryClientProvider>,
  );
}

describe('ObjectDetailView', () => {
  beforeEach(() => {
    // jsdom n'implémente pas scrollIntoView — le clic d'onglet (§8.5) l'appelle.
    Element.prototype.scrollIntoView = jest.fn();
    mockMutateAsync.mockReset();
    mockUpdateMutateAsync.mockReset();
    mockDeleteMutateAsync.mockReset();
    mockPrivateNoteAccess.data = true;
    mockPrivateNoteAccess.isSuccess = true;
    mockPrivateNoteAccess.isError = false;
    useSessionStore.setState({
      status: 'ready',
      role: 'super_admin',
      userId: 'usr-1',
      email: 'admin@example.com',
      userName: 'Admin',
      avatar: 'AD',
      langPrefs: ['fr'],
      errorMessage: null,
    });
  });

  it('4.1 : affiche le bloc « Prochaines dates » d’un événement (FMA)', () => {
    const data: ObjectDetail = {
      id: 'evt-1',
      name: 'Fete de la vanille',
      type: 'FMA',
      raw: { fma_occurrences: [{ id: 'o1', start_at: '2026-07-14', end_at: '2026-07-18', state: 'scheduled' }] },
    } as ObjectDetail;
    renderDetail(data);
    // §4.1 : la liste complète des dates (occurrences à venir/passées) — le bloc
    // « Prochaine date » séparé (EventNextDateSection) ne s'affiche que si la date est future.
    expect(screen.getByText('Toutes les dates')).toBeInTheDocument();
    expect(screen.getByText(/Du .* au /)).toBeInTheDocument();
  });

  it('4.1 : aucun bloc dates pour un type sans occurrences', () => {
    const data: ObjectDetail = { id: 's-1', name: 'Office de tourisme', type: 'SRV', raw: {} } as ObjectDetail;
    renderDetail(data);
    expect(screen.queryByText('Prochaines dates')).not.toBeInTheDocument();
  });

  it('4.2 : affiche le bloc « Cuisine & carte » d’un restaurant (RES)', () => {
    const data: ObjectDetail = {
      id: 'res-1',
      name: 'Le Vieux Domaine',
      type: 'RES',
      raw: {
        cuisine_types: [{ code: 'creole', name: 'Créole' }],
        menus: [{ name: 'Carte', items: [{ name: 'Cari poulet', price: '14', section: { name: 'Plats', position: 2 } }] }],
      },
    } as ObjectDetail;
    renderDetail(data);
    // §5 : « Cuisine & carte » est désormais un onglet ET un titre de section ⇒ getAllByText.
    expect(screen.getAllByText('Cuisine & carte').length).toBeGreaterThan(0);
    expect(screen.getByText('Créole')).toBeInTheDocument();
    expect(screen.getByText('Cari poulet')).toBeInTheDocument();
    // Prix conscient de la devise (Intl fr-FR) : « 14,00 » + € — l'espace peut être une NBSP fine.
    expect(screen.getByText(/14[.,]00/)).toBeInTheDocument();
  });

  it('4.2 : pas de bloc menu pour un restaurant sans carte', () => {
    const data: ObjectDetail = { id: 'res-2', name: 'Snack', type: 'RES', raw: {} } as ObjectDetail;
    renderDetail(data);
    expect(screen.queryByText('Cuisine & carte')).not.toBeInTheDocument();
  });

  it('4.3 : affiche les étapes RÉELLES d’un itinéraire (object_iti_stage)', () => {
    const data: ObjectDetail = {
      id: 'iti-1',
      name: 'Boucle du Piton',
      type: 'ITI',
      raw: { itinerary_details: { stages: [{ id: 's1', name: 'Cascade Niagara', description: 'Belvédère', extra: { kind: 'viewpoint' } }] } },
    } as ObjectDetail;
    renderDetail(data);
    expect(screen.getByText("Étapes de l'itinéraire")).toBeInTheDocument();
    expect(screen.getByText('Cascade Niagara')).toBeInTheDocument();
    expect(screen.getByText('Belvédère')).toBeInTheDocument();
  });

  it('4.3 : aucune étape fabriquée pour un ITI sans étapes réelles', () => {
    const data: ObjectDetail = { id: 'iti-2', name: 'Sentier', type: 'ITI', raw: {} } as ObjectDetail;
    renderDetail(data);
    expect(screen.queryByText("Étapes de l'itinéraire")).not.toBeInTheDocument();
  });

  it('4.3 : affiche les faits d’une activité encadrée (ASC, object_act)', () => {
    const data: ObjectDetail = {
      id: 'asc-1',
      name: 'Canyoning Fleurs Jaunes',
      type: 'ASC',
      raw: { activity: { duration_min: '180', min_participants: '2', max_participants: '6', guide_required: true } },
    } as ObjectDetail;
    renderDetail(data);
    // §5 : « Fiche activité » est désormais un onglet ET un titre de section ⇒ getAllByText.
    expect(screen.getAllByText('Fiche activité').length).toBeGreaterThan(0);
    expect(screen.getByText('180 min')).toBeInTheDocument();
    expect(screen.getByText('De 2 à 6 personnes')).toBeInTheDocument();
  });

  // Phase 4 — vue pilotée par configuration (ARCHETYPE_SECTIONS) : la dispatch est dérivée
  // de l'archétype (TYPE_ARCHETYPES), et chaque archétype ne rend QUE ses sections. Un type
  // VIS (LOI) ne doit jamais rendre les blocs spécifiques d'un autre archétype (menu RES,
  // faits ASC, dates FMA) — même quand la donnée est présente dans `raw` (la config exclut
  // ces sections). Verrouille les exclusions de l'archétype VIS (chemin sans test avant 4.x).
  it('un objet VIS (LOI) rend l’aperçu mais aucun bloc spécifique menu/activité/dates', () => {
    const data: ObjectDetail = {
      id: 'loi-1',
      name: 'Jardin des Parfums',
      type: 'LOI',
      raw: {
        fma_occurrences: [{ id: 'o1', start_at: '2026-07-14', end_at: '2026-07-18', state: 'scheduled' }],
        activity: { duration_min: '60' },
        cuisine_types: [{ code: 'creole', name: 'Créole' }],
        menus: [{ name: 'Carte', items: [{ name: 'Cari', price: '10', section: { name: 'Plats', position: 1 } }] }],
      },
    } as ObjectDetail;
    renderDetail(data);
    expect(document.getElementById('detail-section-overview')).not.toBeNull();
    expect(screen.queryByText('Cuisine & carte')).not.toBeInTheDocument();
    expect(screen.queryByText('Fiche activité')).not.toBeInTheDocument();
    expect(screen.queryByText('Prochaines dates')).not.toBeInTheDocument();
  });

  // Un type SRV (générique) : aperçu présent, aucun bloc spécifique de type même si raw en porte.
  it('un objet SRV rend l’aperçu sans bloc spécifique de type', () => {
    const data: ObjectDetail = {
      id: 'srv-1',
      name: 'Office de tourisme',
      type: 'SRV',
      raw: {
        activity: { duration_min: '60' },
        cuisine_types: [{ code: 'creole', name: 'Créole' }],
      },
    } as ObjectDetail;
    renderDetail(data);
    expect(document.getElementById('detail-section-overview')).not.toBeNull();
    expect(screen.queryByText('Cuisine & carte')).not.toBeInTheDocument();
    expect(screen.queryByText('Fiche activité')).not.toBeInTheDocument();
  });

  // PLAN 5 — onglets = sections réellement rendues : un objet sans tarifs/horaires/équipements/
  // médias/légal/notes ne doit afficher QUE l'onglet « Aperçu » (fini les onglets « Tarifs (0) »
  // qui mentent et défilent vers une ancre inexistante). L'onglet « Tarifs & horaires » est
  // désormais scindé en « Tarifs » et « Horaires » — les deux absents ici.
  it('omet les onglets vides : un objet sans donnée ne montre que « Aperçu »', () => {
    mockPrivateNoteAccess.data = false; // pas de droit d'écriture → pas d'onglet Notes internes
    const data: ObjectDetail = { id: 'srv-empty', name: 'Bureau d’information', type: 'SRV', raw: {} } as ObjectDetail;
    renderDetail(data);
    expect(screen.getByRole('button', { name: 'Aperçu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tarifs/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Horaires/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Équipements/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Médias/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Notes internes/ })).not.toBeInTheDocument();
  });

  it('renders sustainability actions as compact chips and reveals cleaned prose in a modal (no raw tokens inline)', () => {
    const data: ObjectDetail = {
      id: 'eco-1',
      name: 'Eco Lodge',
      type: 'HOT',
      raw: {
        sustainability_actions: [
          {
            object_action_id: 's-action-1',
            action: { name: 'Relevé eau', category: { name: 'Eau & assainissement' } },
            note: "Old_data D_Durable | L'hôtel limite la consommation. | review_required",
          },
        ],
      },
    } as ObjectDetail;

    renderDetail(data);

    // The raw import/moderation tokens never reach the DOM, even before opening the modal.
    expect(screen.queryByText(/Old_data/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/review_required/i)).not.toBeInTheDocument();

    // The action is a compact chip-button (detail behind a modal), not an always-open card.
    const chip = screen.getByRole('button', { name: /Relevé eau/i });
    fireEvent.click(chip);

    expect(screen.getByText("L'hôtel limite la consommation.")).toBeInTheDocument();
    expect(screen.queryByText(/Old_data|review_required/i)).not.toBeInTheDocument();
  });

  it('renders a refined accommodation preview with collapsed intro, side contacts and protected internal cards', () => {
    const data: ObjectDetail = {
      id: 'hotel-1',
      name: 'Hotel Horizon Basalte',
      type: 'HOT',
      raw: {
        descriptions: [
          {
            description: 'Grand hotel panoramique avec spa, restauration et espaces evenementiels.',
            description_chapo: 'Version courte de la presentation.',
          },
        ],
        private_notes: [
          {
            id: 'private-1',
            body: 'Client VIP a prevenir avant toute fermeture exceptionnelle.',
            created_at: '2026-03-25T09:30:00.000Z',
            audience: 'private',
            category: 'urgent',
            is_pinned: true,
            created_by: {
              id: 'usr-2',
              display_name: 'Sophie Admin',
              avatar_url: null,
            },
          },
        ],
        address: {
          address1: '12 promenade du lagon',
          city: 'Saint-Pierre',
          postcode: '97410',
        },
        location: {
          latitude: -21.3391,
          longitude: 55.4781,
        },
        media: [
          {
            id: 'media-main',
            url: 'https://example.com/hotel-main.jpg',
            title: 'Facade ocean',
            is_main: true,
            credit: 'Studio Ocean',
            tags: ['facade', 'premium'],
          },
          {
            id: 'media-second',
            url: 'https://example.com/hotel-second.jpg',
            title: 'Spa',
            tags: ['spa'],
          },
        ],
        tags: [{ id: 'tag-1', name: 'Vue mer' }],
        labels: [{ id: 'label-1', name: 'Label prestige' }],
        badges: [{ id: 'badge-1', name: 'Signature' }],
        classifications: [
          { id: 'class-1', scheme: 'gites_epics', value: '3' },
          { id: 'class-2', scheme_name: 'Tourisme & Handicap', value_name: '4 handicaps' },
        ],
        sustainability_labels: [
          {
            value_id: 's-label-1',
            scheme_name: 'Clef Verte',
            value_name: 'Obtenu',
          },
        ],
        sustainability_actions: [
          {
            object_action_id: 's-action-1',
            action: { name: 'Reduction plastique', category: { name: 'Dechets' } },
            status: 'En place',
          },
        ],
        sustainability_action_labels: [
          { label: { value_name: 'Clef verte', scheme_name: 'Eco' }, action: { name: 'Gestion eau' } },
        ],
        payment_methods: [{ id: 'pay-1', name: 'CB' }, { id: 'pay-2', name: 'Cheque vacances' }],
        languages: [{ id: 'lang-1', name: 'Francais' }, { id: 'lang-2', name: 'Anglais' }],
        amenities: [
          { amenity: { id: 'amenity-1', name: 'Piscine chauffee', icon_url: 'https://example.com/icons/pool.svg' } },
          { amenity: { id: 'amenity-2', name: 'Spa', icon_url: 'https://example.com/icons/spa.svg' } },
          { amenity: { id: 'amenity-3', name: 'Balcon' } },
          { amenity: { id: 'amenity-4', name: 'Wifi' } },
          { amenity: { id: 'amenity-5', name: 'Parking' } },
        ],
        capacity: [{ code: { name: 'Personnes' }, value: 120 }],
        room_types: [
          { id: 'room-1', name: 'Suite ocean', capacity_adults: 4, beds: '2 queen', quantity: 6, amenities: ['Balcon'] },
        ],
        meeting_rooms: [
          { id: 'meeting-1', name: 'Salle Basalte', capacity_theatre: 80, capacity_classroom: 32, area_m2: 110, equipment: ['Projecteur'] },
        ],
        prices: [{ label: 'Suite ocean', amount: 240, currency: 'EUR', period_label: 'Haute saison' }],
        opening_times: {
          periods_current: [
            {
              label: 'Toute l annee',
              date_start: '2026-01-01',
              date_end: '2026-12-31',
              weekday_slots: {
                monday: [{ start: '07:00', end: '22:00' }],
                tuesday: [{ start: '07:00', end: '22:00' }],
              },
            },
          ],
        },
        contacts: [],
        actors: [{
          id: 'actor-1',
          name: 'Marie Horizon',
          role: 'Direction',
          visibility: 'public',
          contacts: [
            { id: 'actor-contact-1', kind: { code: 'email', name: 'Email' }, value: 'resa@horizon.re', is_primary: true },
            { id: 'actor-contact-2', kind: { code: 'phone', name: 'Telephone' }, value: '+262 262 10 10 10' },
          ],
        }],
        outgoing_relations: [
          {
            id: 'relation-1',
            relation_type: { name: 'A proximite' },
            target: { id: 'poi-1', name: 'Plage centrale', type: 'PNA' },
          },
        ],
        incoming_relations: [
          {
            id: 'relation-2',
            relation_type: { name: 'Dessert' },
            source: { id: 'srv-1', name: 'Navette lagon', type: 'SRV' },
          },
        ],
        organizations: [
          {
            id: 'org-1',
            name: 'Office Sud Premium',
            link_type: 'Commercialisation',
            contacts: [{ kind_code: 'email', value: 'admin@example.com' }],
          },
        ],
        memberships: [
          {
            id: 'membership-1',
            name: 'Club Premium',
            tier: 'Gold',
            status: 'Active',
            invoice_status: 'Payee',
            visibility_impact: 'Boostee',
            expires_at: '2026-12-31',
          },
        ],
        associated_objects: [{ id: 'poi-1', name: 'Plage centrale', type: 'PNA', relation_type: { name: 'A proximite' } }],
      },
    };

    renderDetail(data);

    expect(screen.getByRole('heading', { name: 'Hotel Horizon Basalte' })).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Version courte de la presentation.')).toBeInTheDocument();
    expect(screen.queryByText('Grand hotel panoramique avec spa, restauration et espaces evenementiels.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /lire la suite/i }));
    expect(screen.getByText('Version courte de la presentation.')).toBeInTheDocument();
    expect(screen.getByText('Grand hotel panoramique avec spa, restauration et espaces evenementiels.')).toBeInTheDocument();
    expect(screen.getByText('Distinctions')).toBeInTheDocument();
    expect(screen.getAllByText('Label prestige').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Signature').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Clef Verte · Obtenu').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tourisme & Handicap · 4 handicaps').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reduction plastique').length).toBeGreaterThan(0);
    expect(screen.getByText('Plan d\'acces')).toBeInTheDocument();
    expect(screen.getByText('Informations equipe')).toBeInTheDocument();
    expect(screen.getAllByText('Client VIP a prevenir avant toute fermeture exceptionnelle.').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /actions de la note/i }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /afficher la note complete/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Sophie A.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.getByRole('button', { name: /ajouter une note/i })).toBeInTheDocument();
    expect(screen.getByTestId('detail-map')).toBeInTheDocument();
    expect(screen.getByTestId('detail-map-zoom')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ouvrir dans google maps/i })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps/search'),
    );
    expect(screen.getByRole('link', { name: /itineraire/i })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps/dir'),
    );
    const capacityKpi = screen.getByText('Personnes').closest('.detail-kpi');
    expect(capacityKpi).toHaveTextContent('120');
    expect(screen.getByText('Equipements')).toBeInTheDocument();
    expect(screen.getAllByText('Piscine chauffee').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Spa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Balcon').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Wifi').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Parking').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /voir tous les equipements/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Telephone')).not.toBeInTheDocument();
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
    expect(screen.getByText('+262 262 10 10 10')).toBeInTheDocument();
    expect(screen.getByText('resa@horizon.re')).toBeInTheDocument();
    expect(screen.getByText('Chambres')).toBeInTheDocument();
    expect(screen.getByText('Reunions et evenements')).toBeInTheDocument();
    // §5 : l'onglet combiné « Tarifs & horaires » est scindé en deux — chaque libellé
    // apparaît désormais à la fois comme onglet ET comme titre de section (d'où getAllByText).
    expect(screen.getByRole('button', { name: /Tarifs/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Horaires/ })).toBeInTheDocument();
    expect(screen.getAllByText('Tarifs').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Horaires').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /voir la semaine/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /voir la semaine/i }));
    expect(screen.getAllByText(/07:00/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /toutes les périodes/i }));
    expect(screen.getByRole('button', { name: /semaine en cours/i })).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByText('resa@horizon.re')).toBeInTheDocument();
    expect(screen.getByText('Equipe interne')).toBeInTheDocument();
    expect(screen.getByText('Marie Horizon')).toBeInTheDocument();
    expect(screen.getByText('Reseau')).toBeInTheDocument();
    expect(screen.getByText('Office Sud Premium')).toBeInTheDocument();
    expect(screen.getByText('Navette lagon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ouvrir la galerie photo/i })).toBeInTheDocument();
    expect(screen.getByText('2 photos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Miniature 1 — ouvrir la photo 2 dans la galerie/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /voir le media 2/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Photo Studio Ocean/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ouvrir la galerie photo/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /image suivante dans la galerie/i })).toBeInTheDocument();
    expect(screen.queryByText('En images')).not.toBeInTheDocument();
  });

  it('navigates gallery images with the keyboard when the modal is open', () => {
    const data: ObjectDetail = {
      id: 'hotel-gallery',
      name: 'Hotel clavier',
      type: 'HOT',
      raw: {
        descriptions: {
          description: 'Hotel avec galerie navigable au clavier.',
        },
        address: {
          address1: '4 rue du lagon',
          city: 'Saint-Pierre',
        },
        location: {
          latitude: -21.3391,
          longitude: 55.4781,
        },
        media: [
          {
            id: 'media-main',
            url: 'https://example.com/hotel-main.jpg',
            title: 'Facade ocean',
            is_main: true,
          },
          {
            id: 'media-second',
            url: 'https://example.com/hotel-second.jpg',
            title: 'Spa',
          },
        ],
      },
    };

    renderDetail(data);

    fireEvent.click(screen.getByRole('button', { name: /ouvrir la galerie photo/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Facade ocean')).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(within(dialog).getByText('Spa')).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(within(dialog).getByText('Facade ocean')).toBeInTheDocument();
  });

  it('keeps the placeholder elegant and hides actors for an unauthorized user', () => {
    mockPrivateNoteAccess.data = false;
    useSessionStore.setState({
      role: 'tourism_agent',
      email: 'visitor@example.com',
    });

    const data: ObjectDetail = {
      id: 'hotel-2',
      name: 'Maison des Filaos',
      type: 'HOT',
      raw: {
        descriptions: {
          description: 'Maison d hotes de charme sans galerie photo complete.',
        },
        address: {
          address1: '3 rue des filaos',
          city: 'Etang-Sale',
        },
        location: {
          latitude: -21.2581,
          longitude: 55.3321,
        },
        contacts: [{ id: 'contact-1', label: 'Accueil', kind_code: 'phone', value: '+262 262 00 00 00' }],
        tags: [{ id: 'tag-1', name: 'Maison d hotes' }],
        actors: [{ id: 'actor-1', name: 'Equipe interne', role: 'Direction' }],
        organizations: [
          {
            id: 'org-1',
            name: 'Reseau Sud',
            link_type: 'Reseau',
            contacts: [{ kind_code: 'email', value: 'owner@example.com' }],
          },
        ],
      },
    };

    renderDetail(data);

    expect(screen.getByText(/Pas encore de photo principale/)).toBeInTheDocument();
    expect(screen.getByText('Maison d hotes de charme sans galerie photo complete.')).toBeInTheDocument();
    expect(screen.queryByText('Informations equipe')).not.toBeInTheDocument();
    expect(screen.queryByText('Equipe interne')).not.toBeInTheDocument();
    expect(screen.getByText('Reseau Sud')).toBeInTheDocument();
  });

  it('shows only the three most recent team notes by default and lets the user expand the list', () => {
    const data: ObjectDetail = {
      id: 'hotel-notes',
      name: 'Hotel Notes',
      type: 'HOT',
      raw: {
        descriptions: {
          description: 'Hotel avec carnet interne riche.',
        },
        private_notes: [
          {
            id: 'note-1',
            body: 'Premiere note',
            created_at: '2026-03-20T08:00:00.000Z',
            audience: 'private',
            category: 'general',
            is_pinned: false,
            created_by: {
              id: 'usr-1',
              display_name: 'Alice',
              avatar_url: null,
            },
          },
          {
            id: 'note-2',
            body: 'Deuxieme note',
            created_at: '2026-03-21T08:00:00.000Z',
            audience: 'private',
            category: 'important',
            is_pinned: false,
            created_by: {
              id: 'usr-1',
              display_name: 'Alice',
              avatar_url: null,
            },
          },
          {
            id: 'note-3',
            body: 'Troisieme note',
            created_at: '2026-03-22T08:00:00.000Z',
            audience: 'private',
            category: 'internal',
            is_pinned: false,
            created_by: {
              id: 'usr-1',
              display_name: 'Alice',
              avatar_url: null,
            },
          },
          {
            id: 'note-4',
            body: 'Quatrieme note',
            created_at: '2026-03-23T08:00:00.000Z',
            audience: 'private',
            category: 'followup',
            is_pinned: false,
            created_by: {
              id: 'usr-1',
              display_name: 'Alice',
              avatar_url: null,
            },
          },
          {
            id: 'note-5',
            body: 'Cinquieme note',
            created_at: '2026-03-24T08:00:00.000Z',
            audience: 'private',
            category: 'urgent',
            is_pinned: false,
            created_by: {
              id: 'usr-1',
              display_name: 'Alice',
              avatar_url: null,
            },
          },
        ],
      },
    };

    renderDetail(data);

    expect(screen.getByText('Informations equipe')).toBeInTheDocument();
    expect(screen.getAllByText('Cinquieme note').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quatrieme note').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Troisieme note').length).toBeGreaterThan(0);
    expect(screen.queryByText('Deuxieme note')).not.toBeInTheDocument();
    expect(screen.queryByText('Premiere note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /voir plus \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exporter les notes/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /voir plus \(2\)/i }));

    expect(screen.getAllByText('Deuxieme note').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Premiere note').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /voir moins/i })).toBeInTheDocument();
  });

  it('shows the note author short label in the team notes list', () => {
    const data: ObjectDetail = {
      id: 'hotel-author-note',
      name: 'Hotel Author Note',
      type: 'HOT',
      raw: {
        descriptions: { description: 'Hotel avec auteur de note.' },
        private_notes: [
          {
            id: 'note-author',
            body: 'Rappeler le prestataire avant la saison.',
            created_at: '2026-05-19T08:00:00.000Z',
            audience: 'private',
            category: 'general',
            created_by: {
              id: 'usr-2',
              display_name: 'Sophie Admin',
              avatar_url: null,
              email: 'sophie.admin@oti.re',
            },
          },
        ],
      },
    };

    renderDetail(data);

    expect(screen.getByText('Sophie A.')).toBeInTheDocument();
  });

  it('opens a dialog with the full note body when the user clicks a team note preview', async () => {
    const longBody = `Fiche retiree de la publication SIT - fermeture administrative. ${'Detail complementaire. '.repeat(12)}`.trimEnd();

    const data: ObjectDetail = {
      id: 'hotel-long-note',
      name: 'Hotel Long Note',
      type: 'HOT',
      raw: {
        descriptions: {
          description: 'Hotel avec note longue.',
        },
        private_notes: [
          {
            id: 'note-long',
            body: longBody,
            created_at: '2026-05-19T08:00:00.000Z',
            audience: 'private',
            category: 'important',
            is_pinned: true,
            created_by: {
              id: 'usr-1',
              display_name: 'Alice',
              avatar_url: null,
            },
          },
        ],
      },
    };

    renderDetail(data);

    fireEvent.click(screen.getByRole('button', { name: /afficher la note complete/i }));

    const dialog = await screen.findByRole('dialog');
    expect(screen.getByRole('heading', { name: /note interne/i })).toBeInTheDocument();
    expect(dialog).toHaveTextContent(longBody);
  });

  it('lets an authorized user edit an existing private note', async () => {
    mockUpdateMutateAsync.mockResolvedValue({
      id: 'private-edit',
      body: 'Note mise a jour',
      audience: 'private',
      category: 'important',
      is_pinned: true,
      created_at: '2026-03-24T08:00:00.000Z',
      updated_at: '2026-03-26T08:00:00.000Z',
    });

    const data: ObjectDetail = {
      id: 'hotel-edit-note',
      name: 'Hotel Note Editable',
      type: 'HOT',
      raw: {
        descriptions: {
          description: 'Hotel avec note modifiable.',
        },
        private_notes: [
          {
            id: 'private-edit',
            body: 'Note initiale',
            created_at: '2026-03-24T08:00:00.000Z',
            audience: 'private',
            category: 'important',
            is_pinned: true,
            can_edit: true,
            can_delete: true,
            created_by: {
              id: 'usr-2',
              display_name: 'Sophie Admin',
              avatar_url: null,
            },
          },
        ],
      },
    };

    renderDetail(data);

    fireEvent.click(screen.getByRole('button', { name: /actions de la note/i }));
    fireEvent.click(screen.getByRole('button', { name: /modifier/i }));
    fireEvent.change(screen.getByPlaceholderText(/modifier cette note interne/i), {
      target: { value: 'Note mise a jour' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }));

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
        noteId: 'private-edit',
        body: 'Note mise a jour',
        category: 'important',
        isPinned: true,
        isArchived: false,
      });
    });
  });

  it('renders itinerary stats, practical notes, related objects and map links from nested itinerary payloads', () => {
    const data: ObjectDetail = {
      id: 'iti-1',
      name: 'Sentier des trois remparts',
      type: 'ITI',
      raw: {
        descriptions: {
          description: 'Grande boucle avec belvederes et portions forestieres.',
        },
        address: {
          address1: 'Depart au parking forestier',
          city: 'Cilaos',
        },
        location: {
          latitude: -21.127,
          longitude: 55.471,
        },
        media: [{ id: 'media-1', url: 'https://example.com/iti.jpg', title: 'Belvedere' }],
        tags: [{ id: 'tag-1', name: 'Panorama' }],
        itinerary: {
          distance_km: 12.5,
          duration_min: 252,
          difficulty_level: 'Intermediaire',
          elevation_gain: 540,
          is_loop: true,
          track: 'track-data',
          track_format: 'gpx',
        },
        itinerary_details: {
          practices: [{ id: 'practice-1', name: 'Randonnee' }],
          info: { summary: 'Depart tres tot conseille' },
          associated_objects: [{ id: 'poi-1', name: 'Belvedere des hauts', type: 'PNA', relation_type: { name: 'Etape' } }],
          sections: [{ id: 'section-1' }],
          stages: [{ id: 'stage-1' }],
        },
        relations: {
          out: [{ relation_type: { name: 'Acces' }, target: { id: 'srv-1', name: 'Parking forestier', type: 'SRV' } }],
        },
        contacts: [{ id: 'contact-1', label: 'Info sentier', kind: 'phone', value: '+262 262 11 11 11' }],
      },
    };

    renderDetail(data);

    expect(screen.getByRole('heading', { name: 'Sentier des trois remparts' })).toBeInTheDocument();
    // §5 : « Avant de partir » est désormais un onglet ET un titre de section ⇒ getAllByText.
    expect(screen.getAllByText('Avant de partir').length).toBeGreaterThan(0);
    const distanceKpi = screen.getByText('Distance').closest('.detail-kpi');
    expect(distanceKpi).toHaveTextContent('12.5km');
    expect(screen.getByText('Duree')).toBeInTheDocument();
    expect(screen.getAllByText('Randonnee').length).toBeGreaterThan(0);
    expect(screen.getByText('Disponible (gpx)')).toBeInTheDocument();
    expect(screen.getByText('A voir aussi')).toBeInTheDocument();
    expect(screen.getByText('Belvedere des hauts')).toBeInTheDocument();
    expect(screen.getByText('Parking forestier')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /itineraire/i })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps/dir'),
    );
  });

  it('renders the group policy as a practical fact (the table was parsed then dropped)', () => {
    const data: ObjectDetail = {
      id: 'hotel-groups',
      name: 'Hotel Horizon',
      type: 'HOT',
      raw: {
        group_policies: [{ min_size: 8, max_size: 40, group_only: true, notes: 'Sur réservation' }],
      },
    };
    renderDetail(data);
    expect(screen.getByText('Groupes')).toBeInTheDocument();
    expect(screen.getByText(/8–40 pers\./)).toBeInTheDocument();
    expect(screen.getByText(/Réservé aux groupes/)).toBeInTheDocument();
    expect(screen.getByText(/Sur réservation/)).toBeInTheDocument();
  });

  it('renders a video media with a <video> element in the hero, never a broken <img>', () => {
    const data: ObjectDetail = {
      id: 'hotel-video',
      name: 'Hotel Horizon',
      type: 'HOT',
      raw: {
        media: [
          {
            id: 'm-vid',
            url: 'https://example.com/presentation.mp4',
            title: 'Visite video',
            type_code: 'video',
            is_main: true,
          },
          { id: 'm-photo', url: 'https://example.com/second.jpg', title: 'Spa', type_code: 'photo' },
        ],
      },
    };
    renderDetail(data);
    expect(document.querySelector('video.detail-hero__img')).not.toBeNull();
    expect(document.querySelector('img.detail-hero__img')).toBeNull();
  });

  it('uses the media description as the hero image alt text (fallback: title, then name)', () => {
    const data: ObjectDetail = {
      id: 'hotel-alt',
      name: 'Hotel Horizon',
      type: 'HOT',
      raw: {
        media: [
          {
            id: 'm-1',
            url: 'https://example.com/main.jpg',
            title: 'Facade',
            description: 'Vue de la facade cote ocean',
            is_main: true,
          },
          { id: 'm-2', url: 'https://example.com/second.jpg', title: 'Spa' },
        ],
      },
    };
    renderDetail(data);
    expect(screen.getByAltText('Vue de la facade cote ocean')).toBeInTheDocument();
  });

  it('renders a reservation-platform contact as its platform name with a favicon link', () => {
    const data: ObjectDetail = {
      id: 'hotel-booking',
      name: 'Le Lagon Bleu',
      type: 'HOT',
      raw: {
        descriptions: { description: 'Hotel test.' },
        contacts: [
          {
            id: 'oc-book',
            kind_code: 'booking_engine',
            value: 'https://www.booking.com/hotel/re/lagon.html?aid=1',
            is_public: true,
            position: 1,
          },
        ],
      },
    };

    const { container } = renderDetail(data);

    // The platform name is shown instead of the raw URL.
    expect(screen.getByText('Booking.com')).toBeInTheDocument();
    expect(screen.queryByText(/booking\.com\/hotel\/re\/lagon/)).not.toBeInTheDocument();

    // The link still points to the full URL.
    const link = screen.getByRole('link', { name: /Booking\.com/i });
    expect(link.getAttribute('href')).toContain('booking.com/hotel/re/lagon');

    // The favicon is rendered.
    expect(
      container.querySelector('img[src="https://icons.duckduckgo.com/ip3/booking.com.ico"]'),
    ).toBeInTheDocument();
  });

  it('falls back to a lucide icon when a contact favicon fails to load', () => {
    const data: ObjectDetail = {
      id: 'hotel-fav-error',
      name: 'Le Lagon Bleu',
      type: 'HOT',
      raw: {
        descriptions: { description: 'Hotel test.' },
        contacts: [
          {
            id: 'oc-book',
            kind_code: 'booking_engine',
            value: 'https://www.booking.com/hotel/re/lagon.html?aid=1',
            is_public: true,
            position: 1,
          },
        ],
      },
    };

    const { container } = renderDetail(data);
    const favicon = container.querySelector(
      'img[src="https://icons.duckduckgo.com/ip3/booking.com.ico"]',
    ) as HTMLImageElement;
    expect(favicon).toBeInTheDocument();

    fireEvent.error(favicon);

    // After the image errors, the favicon is gone and the platform name is still shown.
    expect(
      container.querySelector('img[src="https://icons.duckduckgo.com/ip3/booking.com.ico"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Booking.com')).toBeInTheDocument();
  });

  it('renders the overview description as Markdown when the resource carries description_md', () => {
    const data: ObjectDetail = {
      id: 'hotel-md',
      name: 'Hotel Markdown',
      type: 'HOT',
      raw: {
        description: 'Texte simple.',
        description_md: '## Titre vedette\n\nTexte simple.',
      },
    } as ObjectDetail;

    renderDetail(data);

    // The *_md sibling is rendered via MarkdownContent → a real <h2>, not the literal "## Titre".
    expect(screen.getByRole('heading', { name: 'Titre vedette' })).toBeInTheDocument();
    expect(screen.queryByText('## Titre vedette')).not.toBeInTheDocument();
  });

  it('horaires : la pastille est rouge quand le statut affiché est « Fermé » (open_now NULL, hors créneaux)', () => {
    // 2026-07-02 est un jeudi ; 23:30 est après le dernier créneau → libellé « Fermé aujourd'hui ».
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-02T23:30:00'));
    try {
      const data: ObjectDetail = {
        id: 'res-pulse',
        name: 'Table du soir',
        type: 'RES',
        raw: {
          // open_now absent → tri-state null : le libellé retombe sur le calcul local, la pastille doit suivre.
          opening_periods: [
            {
              label: 'Année en cours',
              date_start: '2026-01-01',
              date_end: '2026-12-31',
              opening_schedules: [
                {
                  schedule_type: { name: 'Hebdomadaire' },
                  opening_time_periods: [
                    {
                      opening_time_period_weekdays: [{ weekday: { code: 'thu', name: 'Jeudi' } }],
                      opening_time_frames: [
                        { start_time: '11:30', end_time: '16:00' },
                        { start_time: '17:30', end_time: '21:00' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      } as ObjectDetail;

      const { container } = renderDetail(data);

      expect(screen.getByText(/Fermé aujourd/)).toBeInTheDocument();
      expect(container.querySelector('.detail-opening-hero__pulse')).toHaveClass(
        'detail-opening-hero__pulse--closed',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  const makeObject = (id: string, name: string, type: string, raw: Record<string, unknown>): ObjectDetail =>
    ({ id, name, type, raw } as ObjectDetail);

  // ── PLAN 8.5 — intégrité des onglets : chaque onglet visible expose sa cible via
  //    aria-controls, il existe EXACTEMENT un élément portant cet id, et cliquer
  //    l'onglet appelle scrollIntoView sur cette cible (aucune ancre cassée). ──
  function expectEveryDetailTabToHaveTarget() {
    const nav = screen.getByRole('navigation', { name: /sections de la fiche/i });
    const tabs = within(nav).getAllByRole('button');
    expect(tabs.length).toBeGreaterThan(0);
    const scrollSpy = Element.prototype.scrollIntoView as jest.Mock;
    for (const tab of tabs) {
      const targetId = tab.getAttribute('aria-controls');
      expect(targetId).toBeTruthy();
      const targets = document.querySelectorAll(`[id="${targetId}"]`);
      expect(targets).toHaveLength(1); // une cible unique, jamais d'ancre cassée
      scrollSpy.mockClear();
      fireEvent.click(tab);
      expect(scrollSpy).toHaveBeenCalled();
      expect(scrollSpy.mock.instances).toContain(targets[0]);
    }
  }

  describe('§8.5 intégrité des onglets — chaque onglet visible a exactement une cible', () => {
    const hoursRaw = {
      opening_times: {
        periods_current: [
          {
            label: 'Toute l’année',
            date_start: '2026-01-01',
            date_end: '2026-12-31',
            weekday_slots: {
              monday: [{ start: '09:00', end: '18:00' }],
              tuesday: [{ start: '09:00', end: '18:00' }],
            },
          },
        ],
      },
    };

    const cases: Array<{ name: string; data: ObjectDetail }> = [
      { name: 'objet générique vide', data: makeObject('empty-1', 'Bureau', 'SRV', {}) },
      { name: 'horaires seuls (sans tarifs)', data: makeObject('hours-1', 'Point info', 'SRV', hoursRaw) },
      { name: 'tarifs seuls (sans horaires)', data: makeObject('prices-1', 'Musée', 'SRV', { prices: [{ label: 'Adulte', amount: 12, currency: 'EUR' }] }) },
      { name: 'objet avec médias', data: makeObject('media-1', 'Hôtel', 'HOT', { media: [{ id: 'm1', url: 'https://example.com/a.jpg', title: 'A', is_main: true }, { id: 'm2', url: 'https://example.com/b.jpg', title: 'B' }] }) },
      { name: 'FMA date canonique seule', data: makeObject('fma-canon', 'Fête', 'FMA', { fma: [{ event_start_date: '2099-07-14', event_end_date: '2099-07-18' }] }) },
      { name: 'FMA avec occurrences', data: makeObject('fma-occ', 'Fête', 'FMA', { fma_occurrences: [{ id: 'o1', start_at: '2099-07-14', end_at: '2099-07-18', state: 'scheduled' }] }) },
      { name: 'RES cuisines seules', data: makeObject('res-cui', 'Table', 'RES', { cuisine_types: [{ code: 'creole', name: 'Créole' }] }) },
      { name: 'RES carte complète', data: makeObject('res-menu', 'Table', 'RES', { menus: [{ name: 'Carte', items: [{ name: 'Cari poulet', price: '14', section: { name: 'Plats', position: 1 } }] }] }) },
      { name: 'ASC faits activité', data: makeObject('asc-1', 'Canyoning', 'ASC', { activity: { duration_min: '180', min_participants: '2', max_participants: '6', guide_required: true } }) },
      {
        name: 'ITI étapes + profil + géométrie',
        data: makeObject('iti-1', 'Boucle du Piton', 'ITI', {
          itinerary_details: {
            stages: [{ id: 's1', name: 'Belvédère', description: 'Vue panoramique', extra: { kind: 'viewpoint' } }],
            profiles: [
              { id: 'p1', position_m: 0, elevation_m: 100 },
              { id: 'p2', position_m: 500, elevation_m: 180 },
              { id: 'p3', position_m: 1000, elevation_m: 260 },
            ],
            track_geojson: { type: 'LineString', coordinates: [[55.4, -21.1], [55.5, -21.2]] },
          },
        }),
      },
      { name: 'objet avec notes internes', data: makeObject('notes-1', 'Hôtel Notes', 'HOT', { private_notes: [{ id: 'n1', body: 'Note interne', created_at: '2026-01-05T08:00:00.000Z', audience: 'private', category: 'general', created_by: { id: 'usr-1', display_name: 'Alice', avatar_url: null } }] }) },
    ];

    it.each(cases)('aucune ancre cassée — $name', ({ data }) => {
      renderDetail(data);
      expectEveryDetailTabToHaveTarget();
    });
  });

  // ── PLAN 8.6 — matrice type→sections : chaque fixture reçoit des données ÉTRANGÈRES
  //    (menu + activité + occurrences FMA + étapes ITI) et l'on prouve que seul
  //    l'archétype du type rend ses sections — jamais celles d'un autre. ──
  describe('§8.6 matrice type→sections — la config d’archétype empêche toute fuite inter-type', () => {
    const foreignRaw = {
      cuisine_types: [{ code: 'creole', name: 'Créole' }],
      menus: [{ name: 'Carte', items: [{ name: 'Cari poulet', price: '14', section: { name: 'Plats', position: 1 } }] }],
      activity: { duration_min: '180', min_participants: '2', max_participants: '6', guide_required: true },
      fma_occurrences: [{ id: 'o1', start_at: '2099-07-14', end_at: '2099-07-18', state: 'scheduled' }],
      itinerary_details: { stages: [{ id: 's1', name: 'Cascade', description: 'Belvédère', extra: { kind: 'viewpoint' } }] },
    };

    type SectionExpect = { menu: boolean; activity: boolean; event: boolean; itinerary: boolean };
    const NONE: SectionExpect = { menu: false, activity: false, event: false, itinerary: false };
    const matrix: Array<[string, SectionExpect]> = [
      ['HOT', NONE], ['HPA', NONE], ['HLO', NONE], ['CAMP', NONE], ['RVA', NONE],
      ['RES', { menu: true, activity: false, event: false, itinerary: false }],
      ['ASC', { menu: false, activity: true, event: false, itinerary: false }],
      ['ACT', { menu: false, activity: true, event: false, itinerary: false }],
      ['ITI', { menu: false, activity: false, event: false, itinerary: true }],
      ['FMA', { menu: false, activity: false, event: true, itinerary: false }],
      ['LOI', NONE], ['PCU', NONE], ['PNA', NONE], ['PRD', NONE],
      ['PSV', NONE], ['VIL', NONE], ['COM', NONE], ['SPU', NONE],
    ];

    it.each(matrix)('%s : ne rend que les sections de son archétype', (code, expected) => {
      renderDetail(makeObject(`obj-${code}`, `Fiche ${code}`, code, foreignRaw));

      // L'aperçu (conteneur d'ancre) est toujours présent, quel que soit le type.
      expect(document.getElementById('detail-section-overview')).not.toBeNull();

      // Cuisine & carte (RES uniquement) — libellé partagé onglet + titre ⇒ getAllByText.
      if (expected.menu) {
        expect(screen.getAllByText('Cuisine & carte').length).toBeGreaterThan(0);
      } else {
        expect(screen.queryByText('Cuisine & carte')).not.toBeInTheDocument();
      }

      // Fiche activité (ASC/ACT uniquement).
      if (expected.activity) {
        expect(screen.getAllByText('Fiche activité').length).toBeGreaterThan(0);
      } else {
        expect(screen.queryByText('Fiche activité')).not.toBeInTheDocument();
      }

      // Section de dates (FMA uniquement) — « Prochaine date » et/ou « Toutes les dates ».
      if (expected.event) {
        // « Toutes les dates » n'est qu'un titre de section (l'onglet s'appelle « Dates ») ⇒ 1 seul.
        expect(screen.queryByText('Toutes les dates')).toBeInTheDocument();
      } else {
        expect(screen.queryByText('Toutes les dates')).not.toBeInTheDocument();
        expect(screen.queryByText('Prochaine date')).not.toBeInTheDocument();
      }

      // Étapes de l'itinéraire (ITI uniquement) — titre de section (l'onglet s'appelle « Étapes »).
      if (expected.itinerary) {
        expect(screen.getByText("Étapes de l'itinéraire")).toBeInTheDocument();
      } else {
        expect(screen.queryByText("Étapes de l'itinéraire")).not.toBeInTheDocument();
      }
    });
  });
});
