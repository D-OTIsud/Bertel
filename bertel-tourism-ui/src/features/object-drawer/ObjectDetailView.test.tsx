import { render, screen } from '@testing-library/react';
import type { ObjectDetail } from '../../types/domain';
import { ObjectDetailView } from './ObjectDetailView';

function renderDetail(data: ObjectDetail) {
  return render(<ObjectDetailView data={data} raw={data.raw} />);
}

describe('ObjectDetailView', () => {
  it('renders a rich accommodation preview with taxonomies, rooms, MICE and network data', () => {
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
        classifications: [{ id: 'class-1', scheme: { name: 'Etoiles' }, value: { name: '4 etoiles' } }],
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
        contacts: [{ id: 'contact-1', label: 'Reservations', kind: 'email', value: 'resa@horizon.re', is_primary: true }],
        actors: [{ id: 'actor-1', name: 'Marie Horizon', role: 'Direction' }],
        organizations: [{ id: 'org-1', name: 'Office Sud Premium', link_type: 'Commercialisation' }],
        memberships: [{ id: 'membership-1', name: 'Club Premium', tier: 'Gold', status: 'Active', invoice_status: 'Payee', visibility_impact: 'Boostee', expires_at: '2026-12-31' }],
        associated_objects: [{ id: 'poi-1', name: 'Plage centrale', type: 'PNA', relation_type: { name: 'A proximite' } }],
      },
    };

    renderDetail(data);

    expect(screen.getByRole('heading', { name: 'Hotel Horizon Basalte' })).toBeInTheDocument();
    expect(screen.getByText('Tags, labels et taxonomies')).toBeInTheDocument();
    expect(screen.getAllByText('Label prestige')).toHaveLength(2);
    expect(screen.getAllByText('Clef verte')).toHaveLength(2);
    expect(screen.getByText('Capacites et equipements')).toBeInTheDocument();
    expect(screen.getByText('Piscine chauffee')).toBeInTheDocument();
    expect(screen.getByText('Chambres et typologies')).toBeInTheDocument();
    expect(screen.getAllByText('Suite ocean').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Salles MICE')).toBeInTheDocument();
    expect(screen.getByText('Salle Basalte')).toBeInTheDocument();
    expect(screen.getByText('Tarifs et ouvertures')).toBeInTheDocument();
    expect(screen.getByText('Contacts')).toBeInTheDocument();
    expect(screen.getByText('Reseau et gouvernance')).toBeInTheDocument();
    expect(screen.getByText('Objets lies')).toBeInTheDocument();
    expect(screen.getByText(/Credit Studio Ocean/)).toBeInTheDocument();
  });

  it('renders an intentional placeholder when no media is available', () => {
    const data: ObjectDetail = {
      id: 'hotel-2',
      name: 'Maison des Filaos',
      type: 'HOT',
      raw: {
        description: 'Maison d hotes de charme sans galerie photo complete.',
        location: { address: '3 rue des filaos', city: 'Etang-Sale' },
        contacts: [{ id: 'contact-1', label: 'Accueil', kind: 'phone', value: '+262 262 00 00 00' }],
        tags: [{ id: 'tag-1', name: 'Maison d hotes' }],
      },
    };

    renderDetail(data);

    expect(screen.getByRole('heading', { name: 'Maison des Filaos' })).toBeInTheDocument();
    expect(screen.getByText(/Aucun media principal disponible/)).toBeInTheDocument();
    expect(screen.getByText('Tags, labels et taxonomies')).toBeInTheDocument();
  });

  it('renders itinerary stats, practical info and related objects from nested itinerary payloads', () => {
    const data: ObjectDetail = {
      id: 'iti-1',
      name: 'Sentier des trois remparts',
      type: 'ITI',
      raw: {
        description: 'Grande boucle avec belvederes et portions forestieres.',
        location: { address: 'Depart au parking forestier', city: 'Cilaos' },
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
          associated_objects: [{ id: 'poi-1', name: 'Belvedere des hauts', type: 'POI', relation_type: { name: 'Etape' } }],
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
    expect(screen.getByText('Bloc pratique itineraire')).toBeInTheDocument();
    expect(screen.getByText('12.5 km')).toBeInTheDocument();
    expect(screen.getByText('Duree')).toBeInTheDocument();
    expect(screen.getByText(/Pratiques: Randonnee/)).toBeInTheDocument();
    expect(screen.getByText(/Trace disponible \(gpx\)/)).toBeInTheDocument();
    expect(screen.getByText('Objets lies')).toBeInTheDocument();
    expect(screen.getByText('Belvedere des hauts')).toBeInTheDocument();
    expect(screen.getByText('Parking forestier')).toBeInTheDocument();
    expect(screen.getByText('Infos pratiques')).toBeInTheDocument();
  });
});
