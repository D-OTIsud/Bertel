import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useSessionStore } from '../../store/session-store';
import type { ObjectDetail } from '../../types/domain';
import { ObjectDetailView } from './ObjectDetailView';

jest.mock('react-map-gl/maplibre', () => ({
  Map: ({ children }: { children?: ReactNode }) => <div data-testid="detail-map">{children}</div>,
  Marker: ({ children }: { children?: ReactNode }) => <div data-testid="detail-marker">{children}</div>,
}));

function renderDetail(data: ObjectDetail) {
  return render(<ObjectDetailView data={data} raw={data.raw} />);
}

describe('ObjectDetailView', () => {
  beforeEach(() => {
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

  it('renders a refined accommodation preview with visible description, map, readable classifications and protected network data', () => {
    const data: ObjectDetail = {
      id: 'hotel-1',
      name: 'Hotel Horizon Basalte',
      type: 'HOT',
      raw: {
        description: 'Grand hotel panoramique avec spa, restauration et espaces evenementiels.',
        description_adapted: 'Version adaptee de la description avec mise en avant de l accessibilite.',
        location: {
          address: '12 promenade du lagon',
          city: 'Saint-Pierre',
          postcode: '97410',
          lat: '-21.3391',
          lon: '55.4781',
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
        classifications: [{ id: 'class-1', scheme: { name: 'Etoiles' }, value: { name: '4' } }],
        sustainability_action_labels: [
          { label: { value_name: 'Clef verte', scheme_name: 'Eco' }, action: { name: 'Gestion eau' } },
        ],
        payment_methods: [{ id: 'pay-1', name: 'CB' }, { id: 'pay-2', name: 'Cheque vacances' }],
        languages: [{ id: 'lang-1', name: 'Francais' }, { id: 'lang-2', name: 'Anglais' }],
        amenities: [{ amenity: { name: 'Piscine chauffee' } }, { amenity: { name: 'Spa' } }],
        capacity: [{ code: { name: 'Personnes' }, value: 120 }],
        room_types: [
          { id: 'room-1', name: 'Suite ocean', capacity_adults: 4, beds: '2 queen', quantity: 6, amenities: ['Balcon'] },
        ],
        meeting_rooms: [
          { id: 'meeting-1', name: 'Salle Basalte', capacity_theatre: 80, capacity_classroom: 32, area_m2: 110, equipment: ['Projecteur'] },
        ],
        prices: [{ label: 'Suite ocean', amount: 240, currency: 'EUR', period_label: 'Haute saison' }],
        openings: [{ label: 'Toute l annee', slots: ['07:00 -> 22:00'], weekdays: ['Lundi', 'Mardi'] }],
        contacts: [
          { id: 'contact-1', label: 'Reservations', kind: 'email', value: 'resa@horizon.re', is_primary: true },
          { id: 'contact-2', label: 'Site officiel', kind_code: 'website', value: 'horizon.re' },
        ],
        actors: [{ id: 'actor-1', name: 'Marie Horizon', role: 'Direction' }],
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
    expect(screen.getByText('En quelques mots')).toBeInTheDocument();
    expect(screen.getByText('Grand hotel panoramique avec spa, restauration et espaces evenementiels.')).toBeInTheDocument();
    expect(screen.getByText('Reperes')).toBeInTheDocument();
    expect(screen.getAllByText('4 etoiles').length).toBeGreaterThan(0);
    expect(screen.getByText('Plan d\'acces')).toBeInTheDocument();
    expect(screen.getByTestId('detail-map')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ouvrir dans google maps/i })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps/search'),
    );
    expect(screen.getByRole('link', { name: /itineraire/i })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps/dir'),
    );
    expect(screen.getByText('Sur place')).toBeInTheDocument();
    expect(screen.getByText('Piscine chauffee')).toBeInTheDocument();
    expect(screen.getByText('Chambres')).toBeInTheDocument();
    expect(screen.getByText('Reunions et evenements')).toBeInTheDocument();
    expect(screen.getByText('Tarifs et horaires')).toBeInTheDocument();
    expect(screen.getByText('Contacter ce lieu')).toBeInTheDocument();
    expect(screen.getByText('resa@horizon.re')).toBeInTheDocument();
    expect(screen.getByText('Organisation')).toBeInTheDocument();
    expect(screen.getByText('Marie Horizon')).toBeInTheDocument();
    expect(screen.getByText(/Photo Studio Ocean/)).toBeInTheDocument();
  });

  it('keeps the placeholder elegant and hides actors for an unauthorized user', () => {
    useSessionStore.setState({
      role: 'tourism_agent',
      email: 'visitor@example.com',
    });

    const data: ObjectDetail = {
      id: 'hotel-2',
      name: 'Maison des Filaos',
      type: 'HOT',
      raw: {
        description: 'Maison d hotes de charme sans galerie photo complete.',
        location: {
          address: '3 rue des filaos',
          city: 'Etang-Sale',
          lat: '-21.2581',
          lon: '55.3321',
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
    expect(screen.getAllByText('Maison d hotes').length).toBeGreaterThan(0);
    expect(screen.queryByText('Equipe interne')).not.toBeInTheDocument();
    expect(screen.getByText('Reseau Sud')).toBeInTheDocument();
  });

  it('renders itinerary stats, practical notes, related objects and map links from nested itinerary payloads', () => {
    const data: ObjectDetail = {
      id: 'iti-1',
      name: 'Sentier des trois remparts',
      type: 'ITI',
      raw: {
        description: 'Grande boucle avec belvederes et portions forestieres.',
        location: {
          address: 'Depart au parking forestier',
          city: 'Cilaos',
          lat: '-21.1270',
          lon: '55.4710',
        },
        media: [{ id: 'media-1', url: 'https://example.com/iti.jpg', title: 'Belvedere' }],
        tags: [{ id: 'tag-1', name: 'Panorama' }],
        itinerary: {
          distance_km: 12.5,
          duration_hours: 4.2,
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
    expect(screen.getByText('Avant de partir')).toBeInTheDocument();
    expect(screen.getByText('12.5 km')).toBeInTheDocument();
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
});
