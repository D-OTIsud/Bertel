/* global */
// Sample data for the Bertel Tourism UI redesign
const PHOTOS = {
  zozeff: 'https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=900&q=80',
  zozeff2: 'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=600&q=80',
  zozeff3: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=600&q=80',
  zozeff4: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=600&q=80',
  alicalapa: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600&q=80',
  amarys: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=600&q=80',
  cocoland: 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=600&q=80',
  belair: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=600&q=80',
  surf: 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=600&q=80',
  rando: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=600&q=80',
};

const RESULTS = [
  { id: 'r1', name: 'A la Kaz Ti Zozeff', city: 'Saint-Joseph', type: 'Chambre d\'hôte', cat: 'Hébergement',
    photo: PHOTOS.zozeff, open: true, fav: true, capacity: 8, code: 'HLO',
    tags: [['Hébergement','teal'],['Cuisine','teal'],['Patrimoine','teal'],['Plein air','orange']], more: 9 },
  { id: 'r2', name: 'Alicalapa-Tenon Clément', city: 'Le Tampon', type: 'Chambre d\'hôte', cat: 'Hébergement',
    photo: PHOTOS.alicalapa, open: false, fav: false, capacity: 4, code: 'HLO',
    tags: [['Gîtes de France · 3 épis','outline'],['Hébergement','orange'],['Famille','neutral'],['Patrimoine','teal']], more: 12 },
  { id: 'r3', name: 'Amarys', city: 'Le Tampon', type: 'Gîte & Villa', cat: 'Hébergement',
    photo: PHOTOS.amarys, open: false, fav: false, capacity: 6, code: 'HLO',
    tags: [['Gîtes de France · 3 épis','outline'],['Hébergement','orange'],['Mer et littoral','teal'],['Cuisine','neutral']], more: 8 },
  { id: 'r4', name: 'Cocoland Ti Maison', city: 'Saint-Pierre', type: 'Location saisonnière', cat: 'Hébergement',
    photo: PHOTOS.cocoland, open: true, fav: false, capacity: 4, code: 'HLO',
    tags: [['Gîtes de France · 2 épis','outline'],['Hébergement','teal'],['Plein air','orange']], more: 5 },
  { id: 'r5', name: 'Domaine du Bel Air', city: 'L\'Entre-Deux', type: 'Hôtel', cat: 'Hébergement',
    photo: PHOTOS.belair, open: true, fav: true, capacity: 24, code: 'HOT',
    tags: [['4 étoiles','orange'],['Hébergement','teal'],['Cuisine','neutral'],['Bien-être','teal']], more: 14 },
  { id: 'r6', name: 'Surf School Saint-Pierre', city: 'Saint-Pierre', type: 'Activité', cat: 'Activités',
    photo: PHOTOS.surf, open: true, fav: false, capacity: 12, code: 'ACT',
    tags: [['Activité','teal'],['Mer et littoral','teal'],['Plein air','orange']], more: 3 },
  { id: 'r7', name: 'Sentier des Trois Bassins', city: 'Saint-Joseph', type: 'Randonnée', cat: 'Itinéraires',
    photo: PHOTOS.rando, open: true, fav: false, capacity: null, code: 'ITI',
    tags: [['Itinéraire','teal'],['Difficile','orange'],['Plein air','neutral'],['Patrimoine','teal']], more: 6 },
];

const FILTER_CATEGORIES = [
  { key: 'hebergement', label: 'Hébergements', count: 142, on: true },
  { key: 'restaurants', label: 'Restaurants', count: 87, on: false },
  { key: 'activites', label: 'Activités', count: 56, on: true },
  { key: 'itineraires', label: 'Itinéraires', count: 23, on: false },
  { key: 'evenements', label: 'Événements', count: 18, on: false },
  { key: 'visites', label: 'Visites', count: 14, on: false },
  { key: 'services', label: 'Services', count: 24, on: false },
];

const LOCATIONS = [
  { key: 'sud', label: 'Sud Sauvage', count: 124, on: true },
  { key: 'tampon', label: 'Le Tampon', count: 78, on: true },
  { key: 'spierre', label: 'Saint-Pierre', count: 65, on: false },
  { key: 'sjoseph', label: 'Saint-Joseph', count: 42, on: false },
  { key: 'entre2', label: 'L\'Entre-Deux', count: 28, on: false },
  { key: 'plaine', label: 'Plaine des Cafres', count: 27, on: false },
];

const LABELS = [
  { key: 'gdf', label: 'Gîtes de France', count: 86, on: false },
  { key: 'cv', label: 'Clévacances', count: 34, on: false },
  { key: 'epis3', label: '3 épis', count: 42, on: true },
  { key: 'epis4', label: '4 épis', count: 18, on: false },
  { key: 'tour', label: 'Tourisme & Handicap', count: 12, on: false },
  { key: 'eco', label: 'Éco-label', count: 8, on: false },
];

const DETAIL = {
  name: 'A la Kaz Ti Zozeff',
  type: 'Hébergement loisir',
  code: 'HLO',
  status: 'Publié',
  live: 1,
  photos: [PHOTOS.zozeff, PHOTOS.zozeff2, PHOTOS.zozeff3, PHOTOS.zozeff4],
  tags: [
    ['Atelier','teal'],['Bien-être','orange'],['Boutique','neutral'],
    ['Cuisine','teal'],['Hébergement','teal'],['Patrimoine','orange']
  ],
  description: `Une jolie maison récemment ouverte de trois chambres dans un quartier charmant de Saint-Joseph. Trois chambres à la location appelées "Savane", "Bélouve" et "Hermitage". De là vous pourrez découvrir toutes les richesses du Sud Sauvage : volcan, plages secrètes, sentiers de randonnée et marchés créoles.

L'accueil familial et la cuisine maison font la réputation de la maison. Petit-déjeuner inclus avec produits locaux : confitures, fruits du jardin et viennoiseries fraîches.`,
  address: '45 Rue Henri Mussard, Les Jacques, 97480 Saint-Joseph',
  coords: '-21.377332, 55.628389',
  contact: {
    email: 'flo.girard123@gmail.com',
    phone: '+262 692 14 22 80',
    web: 'kazzozeff.re',
  },
  capacity: { total: 8, rooms: 3, beds: 5 },
  prices: { from: 85, currency: '€', unit: '/ nuit' },
  equipments: [
    ['Climatisation', 'ac'], ['Wi-Fi gratuit', 'wifi'], ['Piscine privée', 'pool'],
    ['Petit-déjeuner inclus', 'coffee'], ['Salle à manger', 'bed'], ['Terrasse', 'pool'],
  ],
  langs: ['Français', 'Anglais', 'Créole'],
  payments: ['Espèces', 'Chèque', 'Virement', 'Carte bancaire'],
  setting: ['Centre-ville', 'Jardin', 'Montagne', 'Rural', 'Site patrimonial', 'Terrasse'],
  orgs: [
    { name: 'OTI du Sud', sub: 'Office de tourisme intercommunal', role: 'Publisher', logo: 'OS' },
    { name: 'Région Réunion', sub: 'Direction du tourisme', role: 'Partenaire', logo: 'RR' },
  ],
};

const TAXONOMY_NODES = [
  { key: 'auberge', label: 'Auberge', count: 4, sub: [] },
  { key: 'chambre', label: 'Chambre d\'hôte', count: 86, sub: [
    { key: 'bulle', label: 'Bulle', count: 3 },
    { key: 'standard', label: 'Chambre d\'hôte', count: 72, selected: true },
    { key: 'insolite', label: 'Hébergement insolite', count: 8 },
    { key: 'lodge', label: 'Lodges', count: 6 },
    { key: 'table', label: 'Table d\'hôte', count: 4 },
  ]},
  { key: 'gite_etape', label: 'Gîte d\'étape et de randonnée', count: 18, sub: [
    { key: 'groupe', label: 'Gîte de groupe', count: 12 },
    { key: 'rando', label: 'Gîte de randonnée', count: 6 },
  ]},
  { key: 'loc_sais', label: 'Location saisonnière', count: 142, sub: [
    { key: 'appart', label: 'Appartement', count: 38 },
    { key: 'bungalow', label: 'Bungalow & Chalet', count: 22 },
    { key: 'chambre2', label: 'Chambre', count: 11 },
    { key: 'cottage', label: 'Cottage', count: 5 },
    { key: 'gv', label: 'Gîte & Villa', count: 28 },
    { key: 'rural', label: 'Gîte rural', count: 14 },
    { key: 'maison', label: 'Maison', count: 18 },
    { key: 'rdc', label: 'Rez de chaussée d\'une maison', count: 4 },
    { key: 'roulotte', label: 'Roulotte', count: 2 },
    { key: 'studio', label: 'Studio', count: 6 },
  ]},
  { key: 'hotel', label: 'Hôtel', count: 24, sub: [] },
];

const EDIT_NAV = [
  { group: 'Identité', items: [
    { key: 'infos', label: 'Informations générales', stat: 'ok' },
    { key: 'tax', label: 'Taxonomie', stat: 'ok' },
    { key: 'desc', label: 'Descriptions', stat: 'warn', statText: '2 lang.' },
  ]},
  { group: 'Localisation & contact', items: [
    { key: 'loc', label: 'Localisation', stat: 'ok' },
    { key: 'contacts', label: 'Contacts', stat: 'ok' },
    { key: 'medias', label: 'Médias', stat: 'warn', statText: '4 / 6' },
  ]},
  { group: 'Caractéristiques', items: [
    { key: 'equip', label: 'Équipements & services', stat: 'ok' },
    { key: 'lbls', label: 'Labels & certifications', stat: 'ok' },
    { key: 'cap', label: 'Capacités', stat: 'ok' },
    { key: 'prix', label: 'Tarifs', stat: 'req', statText: 'requis' },
    { key: 'horaires', label: 'Horaires', stat: 'ok' },
  ]},
  { group: 'Gestion', items: [
    { key: 'suivi', label: 'Suivi prestataire', stat: '' },
    { key: 'rattach', label: 'Rattachements', stat: '' },
    { key: 'docs', label: 'Documents légaux', stat: '' },
    { key: 'pub', label: 'Publication', stat: '' },
    { key: 'sync', label: 'Synchronisation', stat: '' },
  ]},
];

window.DATA = { RESULTS, FILTER_CATEGORIES, LOCATIONS, LABELS, DETAIL, TAXONOMY_NODES, EDIT_NAV, PHOTOS };
