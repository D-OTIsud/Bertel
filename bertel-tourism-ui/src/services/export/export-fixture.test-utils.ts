import { parseObjectDetail, type ParsedObjectDetail } from '../object-detail-parser';
import type { ExportContext } from './export-columns';

/**
 * Fixture §208 — un extrait de payload get_object_resource, dans les FORMES
 * RÉELLES émises par le RPC (api_views_functions.sql). Passe par le vrai
 * parseObjectDetail : si le parser change de contrat, les tests du registre
 * tombent ici — c'est voulu.
 */
export const FIXTURE_RAW: Record<string, unknown> = {
  id: 'HOTRUN0000000TST', type: 'HOT', status: 'published', commercial_visibility: 'active',
  name: 'Hôtel Témoin', region_code: 'RUN',
  created_at: '2026-01-15T08:00:00Z', updated_at: '2026-07-30T10:00:00Z', published_at: '2026-02-01T08:00:00Z',
  address: { address1: '12 rue des Bois', postcode: '97418', city: 'Le Tampon', lieu_dit: 'La Plaine des Cafres', code_insee: '' },
  location: { latitude: -21.2783, longitude: 55.5187, altitude_m: 1600 },
  description: 'Description propre sans Markdown.',
  description_chapo: 'Accroche témoin.',
  contacts: [
    { id: 'c1', kind: { code: 'phone', name: 'Téléphone' }, value: '0262 27 00 00', is_public: true, is_primary: true },
    { id: 'c2', kind: { code: 'email', name: 'E-mail' }, value: 'contact@temoin.re', is_public: true },
    { id: 'c3', kind: { code: 'website', name: 'Site web' }, value: 'https://temoin.re', is_public: true },
    { id: 'c4', kind: { code: 'phone', name: 'Téléphone' }, value: '0692 00 00 00', is_public: false },
  ],
  languages: [{ code: 'fr', name: 'Français' }, { code: 'en', name: 'Anglais' }],
  amenities: [{ code: 'wifi', name: 'Wi-Fi' }, { code: 'piscine', name: 'Piscine' }],
  payment_methods: [{ code: 'cb', name: 'Carte bancaire' }],
  environment_tags: [{ code: 'montagne', name: 'Montagne' }],
  tags: [{ slug: 'vue_mer', name: 'Vue mer' }],
  taxonomy: [{ code: 'hot_3', name: 'Hôtel 3 étoiles' }],
  classifications: [{ scheme_name: 'Classement hôtelier', value_name: '3 étoiles', status: 'granted' }],
  sustainability_labels: [{ scheme_name: 'Clef Verte', status: 'granted' }],
  capacities: [{ metric_code: 'max_capacity', metric_name: 'Capacité maximale', value: 40 }, { metric_code: 'bedrooms', metric_name: 'Chambres', value: 18 }],
  prices: [
    { label: 'Chambre double', amount: '90', currency: 'EUR', period_label: 'par nuit' },
    { label: 'Petit-déjeuner', amount: 'n/a', currency: 'EUR' },
  ],
  pet_policy: { accepted: true, conditions: 'Petits chiens uniquement' },
  group_policies: [{ min_size: '10', max_size: '30', group_only: false, notes: 'Sur réservation' }],
  media: [
    { id: 'm1', url: 'https://cdn/img1.jpg', title: 'Façade', is_main: true, credit: 'OTI Sud', visibility: 'public' },
    { id: 'm2', url: 'https://cdn/img2.jpg', title: 'Piscine', visibility: 'private' },
  ],
  legal_records: [
    { type: { code: 'siret', name: 'SIRET', is_public: true }, value: '12345678900011', status: 'valide' },
    { type: { code: 'assurance_rc', name: 'Assurance RC', is_public: false }, value: 'POL-99', status: 'valide' },
  ],
  actors: [
    { id: 'a1', display_name: 'Jean Payet', role: { code: 'operator', name: 'Exploitant' }, is_primary: true, visibility: 'partners', contacts: [], contacts_restricted: true },
  ],
  org_links: [{ org_object_id: 'ORGRUN000000000A', name: 'OTI du Sud', role: { code: 'publisher', name: 'Éditeur' }, is_primary: true }],
  external_ids: [{ source: 'berta', external_id: 'B-1234' }],
  outgoing_relations: [{ target: { id: 'PNARUN000000000X', type: 'PNA', name: 'Site du Volcan' }, relation_type: { code: 'based_at_site', name: 'Basé sur le site' } }],
  web_channels: [{ platform: { code: 'facebook', name: 'Facebook' }, url: 'https://fb.example/temoin' }],
};

export function buildFixtureDetail(overrides: Record<string, unknown> = {}): ParsedObjectDetail {
  return parseObjectDetail({ ...FIXTURE_RAW, ...overrides });
}

export const EMPTY_CTX: ExportContext = { actorContacts: null };

export function ctxWithActorContacts(): ExportContext {
  return {
    actorContacts: new Map([[
      'HOTRUN0000000TST',
      [{
        objectId: 'HOTRUN0000000TST', displayName: 'Jean Payet', roleName: 'Exploitant', isPrimary: true,
        note: 'Préférer le matin',
        contacts: [
          { kindCode: 'mobile', kindName: 'Mobile', value: '0692 11 22 33', isPrimary: true },
          { kindCode: 'email', kindName: 'E-mail', value: 'jean.payet@exemple.re', isPrimary: false },
        ],
      }],
    ]]),
  };
}
