import { fireEvent, render, screen } from '@testing-library/react';
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
        classifications: [{ id: 'class-1', scheme: 'gites_epics', value: '3' }],
        sustainability_labels: [
          {
            value_id: 's-label-1',
            scheme_name: 'Clef Verte',
            value_name: 'Obtenu',
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
    expect(screen.getByText('Grand hotel panoramique avec spa, restauration et espaces evenementiels.')).toBeInTheDocument();
    expect(screen.getByText('Labels et engagements')).toBeInTheDocument();
    expect(screen.getByText('Label prestige')).toBeInTheDocument();
    expect(screen.getByText('Signature')).toBeInTheDocument();
    expect(screen.getAllByText('Clef Verte · Obtenu').length).toBeGreaterThan(0);
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
    expect(screen.getByText('Capacite d\'accueil')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Equipements')).toBeInTheDocument();
    expect(screen.getByText('Piscine chauffee')).toBeInTheDocument();
    expect(screen.getAllByText('Spa').length).toBeGreaterThan(0);
    expect(screen.getByText('Balcon')).toBeInTheDocument();
    expect(screen.queryByText('Wifi')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /voir tous les equipements/i }));
    expect(screen.getByText('Wifi')).toBeInTheDocument();
    expect(screen.getByText('Parking')).toBeInTheDocument();
    expect(screen.queryByText('Telephone')).not.toBeInTheDocument();
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
    expect(screen.getByText('+262 262 10 10 10')).toBeInTheDocument();
    expect(screen.getByText('resa@horizon.re')).toBeInTheDocument();
    expect(screen.getByText('Chambres')).toBeInTheDocument();
    expect(screen.getByText('Reunions et evenements')).toBeInTheDocument();
    expect(screen.getByText('Tarifs et horaires')).toBeInTheDocument();
    expect(screen.getAllByText(/07:00/).length).toBeGreaterThan(0);
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByText('resa@horizon.re')).toBeInTheDocument();
    expect(screen.getByText('Equipe interne')).toBeInTheDocument();
    expect(screen.getByText('Marie Horizon')).toBeInTheDocument();
    expect(screen.getByText('Reseau')).toBeInTheDocument();
    expect(screen.getByText('Office Sud Premium')).toBeInTheDocument();
    expect(screen.getByText('Navette lagon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /image suivante/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /voir le media 2/i })).toBeInTheDocument();
    expect(screen.getByText(/Photo Studio Ocean/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /image suivante/i }));
    expect(screen.queryByText(/Photo Studio Ocean/)).not.toBeInTheDocument();
    expect(screen.queryByText('En images')).not.toBeInTheDocument();
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
    expect(screen.queryByText('Equipe interne')).not.toBeInTheDocument();
    expect(screen.getByText('Reseau Sud')).toBeInTheDocument();
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
