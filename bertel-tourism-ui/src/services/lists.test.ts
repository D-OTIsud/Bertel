import type { ExplorerFilters, ObjectCard } from '../types/domain';
import { DEFAULT_EXPLORER_FILTERS } from '../utils/facets';
import { itemsToOtiPois } from '../features/lists/OtiTemplate';
import { webHref, webLabel } from '../features/lists/type-meta';
import { getApiClient } from '../lib/supabase';
import { getServiceAvailability } from './service-availability';
import {
  buildDynamicListFilters,
  duplicateList,
  ensureListShareLink,
  listFeaturedLists,
  listItemFromObjectCard,
  listListProposals,
  listsQueryKeys,
  mergeEnrichedListItems,
  moveListItem,
  parseListCard,
  parseListDetail,
  requestListFeature,
  restoreList,
  reviewListFeature,
  sendListByEmail,
  ListEmailUnknownError,
  LIST_EMAIL_PROTECTION_UNAVAILABLE_MESSAGE,
  setListFeatured,
} from './lists';

jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn() }));
jest.mock('./service-availability', () => ({ getServiceAvailability: jest.fn() }));

function mockApiClient(rpc: jest.Mock) {
  (getApiClient as jest.Mock).mockReturnValue({ schema: () => ({ rpc }) });
}

const rawDetail = {
  id: 'L1',
  kind: 'static',
  name: 'Week-end dans le Sud',
  name_en: null,
  recipient_label: 'Camille & Yann',
  intro_fr: 'Bonjour !',
  intro_en: null,
  template: 'carnet',
  accent: 'terra',
  lang: 'fr',
  cover_url: null,
  show_map: false,
  status: 'draft',
  filters: null,
  filters_url: null,
  share_token: null,
  share_enabled: false,
  share_expires_at: null,
  updated_at: '2026-07-01T00:00:00Z',
  resolved_from: 'items',
  items: [
    {
      object_id: 'O1',
      position: 0,
      note_fr: 'Ma table préférée',
      note_en: null,
      card: {
        id: 'O1',
        name: 'Le Manapany',
        type: 'RES',
        image: 'https://img/manapany.jpg',
        description: 'Restaurant gastronomique',
        location: { city: 'Saint-Joseph', lat: -21.379, lon: 55.593 },
      },
      contacts: { phone: '+262 262 56 30 30', web: 'http://lemanapany.re/' },
    },
  ],
};

describe('parseListDetail', () => {
  it('maps metadata, resolved_from and nested card/note', () => {
    const d = parseListDetail(rawDetail);
    expect(d.id).toBe('L1');
    expect(d.kind).toBe('static');
    expect(d.recipientLabel).toBe('Camille & Yann');
    expect(d.template).toBe('carnet');
    expect(d.accent).toBe('terra');
    expect(d.resolvedFrom).toBe('items');
    expect(d.items).toHaveLength(1);
    expect(d.items[0].objectId).toBe('O1');
    expect(d.items[0].noteFr).toBe('Ma table préférée');
    expect(d.items[0].card?.name).toBe('Le Manapany');
    expect(d.items[0].card?.city).toBe('Saint-Joseph');
    expect(d.items[0].card?.type).toBe('RES');
    expect(d.items[0].phone).toBe('+262 262 56 30 30');
    expect(d.items[0].web).toBe('http://lemanapany.re/');
  });

  it('defaults enum-ish fields when absent', () => {
    const d = parseListDetail({ id: 'L2', kind: 'dynamic', name: 'D', items: [] });
    expect(d.template).toBe('carnet');
    expect(d.accent).toBe('teal');
    expect(d.lang).toBe('fr');
    expect(d.resolvedFrom).toBe('items'); // default when field absent
    expect(d.items).toEqual([]);
  });

  it('tolerates items without contacts (older payloads / no public channel)', () => {
    const d = parseListDetail({
      id: 'L3', kind: 'static', name: 'S',
      items: [{ object_id: 'O2', position: 0, card: null }],
    });
    expect(d.items[0].phone).toBeNull();
    expect(d.items[0].web).toBeNull();
  });
});

describe('parseListCard', () => {
  it('sépare le lien actif du statut, y compris les liens révoqués ou expirés', () => {
    expect(parseListCard({ status: 'draft', has_active_share_link: true }).hasActiveShareLink).toBe(true);
    expect(parseListCard({ status: 'shared', has_active_share_link: false }).hasActiveShareLink).toBe(false);
    expect(parseListCard({ status: 'shared' }).hasActiveShareLink).toBe(true);
  });
  it('maps grid summary incl. item count and type breakdown', () => {
    const c = parseListCard({
      id: 'L1',
      name: 'Le Sud en famille',
      kind: 'static',
      status: 'sent',
      lang: 'fr',
      recipient_label: 'Famille Hoarau',
      cover_url: null,
      updated_at: '2026-07-01T00:00:00Z',
      accent: 'gold',
      item_count: 5,
      type_breakdown: [{ code: 'RES', n: 2 }, { code: 'HOT', n: 1 }],
    });
    expect(c.itemCount).toBe(5);
    expect(c.status).toBe('sent');
    expect(c.accent).toBe('gold');
    expect(c.typeBreakdown).toEqual([{ code: 'RES', n: 2 }, { code: 'HOT', n: 1 }]);
  });

  it('defaults accent to teal when absent (older payloads)', () => {
    const c = parseListCard({ id: 'L9', name: 'X', kind: 'static', status: 'draft', lang: 'fr', item_count: 0, type_breakdown: [] });
    expect(c.accent).toBe('teal');
  });
});

describe('itemsToOtiPois', () => {
  it('resolves the FR note and extracts city/coords from the card', () => {
    const items = parseListDetail(rawDetail).items;
    const pois = itemsToOtiPois(items, 'fr');
    expect(pois).toHaveLength(1);
    expect(pois[0].note).toBe('Ma table préférée');
    expect(pois[0].city).toBe('Saint-Joseph');
    expect(pois[0].typeCode).toBe('RES');
    expect(pois[0].image).toBe('https://img/manapany.jpg');
    expect(pois[0].subtitle).toBe('Restaurant gastronomique');
    expect(pois[0].lat).toBeCloseTo(-21.379);
    expect(pois[0].lon).toBeCloseTo(55.593);
  });

  it('falls back to null note when the requested language has none', () => {
    const items = parseListDetail(rawDetail).items;
    const pois = itemsToOtiPois(items, 'en');
    expect(pois[0].note).toBeNull(); // note_en is null
  });

  it('passes the public contacts (phone/web) through to the POI', () => {
    const items = parseListDetail(rawDetail).items;
    const pois = itemsToOtiPois(items, 'fr');
    expect(pois[0].phone).toBe('+262 262 56 30 30');
    expect(pois[0].web).toBe('http://lemanapany.re/');
  });
});

describe('webHref / webLabel', () => {
  it('keeps full http(s) URLs and prefixes bare domains', () => {
    expect(webHref('http://www.bellile.re/')).toBe('http://www.bellile.re/');
    expect(webHref('https://exemple.re')).toBe('https://exemple.re');
    expect(webHref('exemple-sud.re')).toBe('https://exemple-sud.re');
  });

  it('renders a short label without protocol nor trailing slash', () => {
    expect(webLabel('http://www.bellile.re/')).toBe('www.bellile.re');
    expect(webLabel('exemple-sud.re')).toBe('exemple-sud.re');
  });

  it('trims path, query and hash — the label is the domain only (fbclid & co)', () => {
    expect(
      webLabel('www.lejardindesbestioles.com/?fbclid=IwAR04jmA78U645PZ3zrIYXkoAKno2zD-017iGwEpd7hm2RlJisdlyT7P5Cs4'),
    ).toBe('www.lejardindesbestioles.com');
    expect(webLabel('https://exemple.re/fr/hebergements?utm_source=nl#haut')).toBe('exemple.re');
    expect(webLabel('http://lemanapany.re/')).toBe('lemanapany.re');
  });
});

describe('listItemFromObjectCard', () => {
  const card: ObjectCard = {
    id: 'O9',
    type: 'HOT',
    name: 'Grand Air',
    image: 'https://img/grand-air.jpg',
    description: 'Vue mer',
    location: { city: 'Saint-Pierre', lat: -21.3, lon: 55.5 },
  };

  it('builds a list item enriched from the explorer card (image, description, city)', () => {
    const item = listItemFromObjectCard(card, 3);
    expect(item.objectId).toBe('O9');
    expect(item.position).toBe(3);
    expect(item.noteFr).toBeNull();
    expect(item.card?.image).toBe('https://img/grand-air.jpg');
    expect(item.card?.description).toBe('Vue mer');
    expect(item.card?.city).toBe('Saint-Pierre');
    // contacts publics : uniquement côté serveur (list_item_contacts) — arrivent au round-trip
    expect(item.phone).toBeNull();
    expect(item.web).toBeNull();
  });

  it('feeds the OTI template with image/subtitle/coords right away', () => {
    const pois = itemsToOtiPois([listItemFromObjectCard(card, 0)], 'fr');
    expect(pois[0].image).toBe('https://img/grand-air.jpg');
    expect(pois[0].subtitle).toBe('Vue mer');
    expect(pois[0].lat).toBeCloseTo(-21.3);
    expect(pois[0].lon).toBeCloseTo(55.5);
  });
});

describe('mergeEnrichedListItems', () => {
  const local = parseListDetail({
    id: 'L1', kind: 'static', name: 'S',
    items: [
      { object_id: 'A', position: 0, note_fr: 'note locale', card: null },
      { object_id: 'B', position: 1, card: null },
    ],
  }).items;
  const fresh = parseListDetail({
    id: 'L1', kind: 'static', name: 'S',
    items: [
      {
        object_id: 'A', position: 0, note_fr: 'note serveur',
        card: { id: 'A', name: 'Alpha', type: 'RES', image: 'https://img/a.jpg', description: 'desc A', location: { city: 'Le Tampon' } },
        contacts: { phone: '+262 1', web: 'https://a.re' },
      },
    ],
  }).items;

  it('adopts server enrichment (card + contacts) but keeps local membership, order and notes', () => {
    // B n'a jamais été envoyé (ajout en vol après le snapshot) : absent de `sent` ⇒ conservé,
    // même si absent aussi de `fresh`.
    const { items: merged, rejectedIds } = mergeEnrichedListItems(local, fresh, [local[0]]);
    expect(merged.map((i) => i.objectId)).toEqual(['A', 'B']);
    expect(merged[0].card?.image).toBe('https://img/a.jpg');
    expect(merged[0].phone).toBe('+262 1');
    expect(merged[0].web).toBe('https://a.re');
    expect(merged[0].noteFr).toBe('note locale'); // la frappe locale n'est pas écrasée
    expect(merged[1].card).toBeNull(); // pas d'enrichissement serveur pour B → inchangé
    expect(rejectedIds).toEqual([]);
  });

  it('does not resurrect items absent locally (retrait local en attente)', () => {
    const { items: merged } = mergeEnrichedListItems([local[1]], fresh, []);
    expect(merged.map((i) => i.objectId)).toEqual(['B']);
  });

  it('retire un id ENVOYÉ mais absent du résultat (rejeté — ex. brouillon exclu côté SQL), sans toucher un ajout local plus récent', () => {
    const sentA = local[0]; // A : sera accepté (présent dans fresh)
    const sentC: typeof local[number] = { objectId: 'C', position: 1, noteFr: null, noteEn: null, card: null, phone: null, web: null };
    const localD: typeof local[number] = { objectId: 'D', position: 2, noteFr: null, noteEn: null, card: null, phone: null, web: null };
    // C a été envoyé avec A (sent = [A, C]) mais le serveur ne renvoie que A ⇒ C rejeté.
    // D n'a jamais été envoyé (ajouté pendant le round-trip) ⇒ conservé malgré son absence de fresh.
    const { items: merged, rejectedIds } = mergeEnrichedListItems([sentA, sentC, localD], fresh, [sentA, sentC]);
    expect(merged.map((i) => i.objectId)).toEqual(['A', 'D']);
    expect(rejectedIds).toEqual(['C']);
  });
});

describe('moveListItem', () => {
  it('moves an item forward and backward without mutating the source', () => {
    const src = ['a', 'b', 'c', 'd'];
    expect(moveListItem(src, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveListItem(src, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(src).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is a no-op on same-index or out-of-bounds moves', () => {
    const src = ['a', 'b'];
    expect(moveListItem(src, 1, 1)).toEqual(src);
    expect(moveListItem(src, -1, 0)).toEqual(src);
    expect(moveListItem(src, 0, 5)).toEqual(src);
  });
});

describe('buildDynamicListFilters', () => {
  it('serialises active filters into per-bucket {types, filters, search} entries', () => {
    const filters: ExplorerFilters = {
      ...DEFAULT_EXPLORER_FILTERS,
      selectedBuckets: ['RES'],
      common: { ...DEFAULT_EXPLORER_FILTERS.common, search: 'plage' },
    };
    const payload = buildDynamicListFilters(filters);
    expect(Array.isArray(payload.buckets)).toBe(true);
    expect(payload.buckets.length).toBeGreaterThan(0);
    for (const b of payload.buckets) {
      expect(Array.isArray(b.types)).toBe(true);
      expect((b.types ?? []).length).toBeGreaterThan(0);
      expect(b.search).toBe('plage');
      expect(typeof b.filters).toBe('object');
    }
  });

  it('defaults to all buckets when none selected, and never emits an empty-type bucket', () => {
    const filters: ExplorerFilters = { ...DEFAULT_EXPLORER_FILTERS, selectedBuckets: [] };
    const payload = buildDynamicListFilters(filters);
    // no explicit bucket => Explorer treats it as "all buckets" (getEffectiveSelectedBuckets)
    expect(payload.buckets.length).toBeGreaterThan(0);
    for (const b of payload.buckets) {
      expect((b.types ?? []).length).toBeGreaterThan(0); // the .filter drops empty-type buckets
    }
  });
});

// Cadrage 2026-09-07 (cycle de vie / à la une) — un champ de capacité ABSENT du payload RPC
// (ancien contrat, ou ligne d'une autre organisation) doit rester `false`, jamais un défaut
// permissif : sans ça une carte sans `can_edit` ouvrirait silencieusement des écritures.
describe('parseListCard / parseListDetail — cycle de vie et capacités (§listes 2026-09-07)', () => {
  it('can_edit absent => false, et les autres capacités par défaut aussi', () => {
    const c = parseListCard({ id: 'L1', name: 'X', kind: 'static', status: 'draft', lang: 'fr', item_count: 0, type_breakdown: [] });
    expect(c.canEdit).toBe(false);
    expect(c.canManageFeature).toBe(false);
    expect(c.canProposeFeature).toBe(false);
    expect(c.canRestore).toBe(false);
    expect(c.canManageSharing).toBe(false);
    expect(c.isArchived).toBe(false);
    expect(c.isFeatured).toBe(false);
    expect(c.createdBy).toBeNull();
    expect(c.creatorName).toBeNull();
    expect(c.featureRequestedAt).toBeNull();
  });

  it('mappe le cycle de vie complet sur la carte', () => {
    const c = parseListCard({
      id: 'L1', name: 'X', kind: 'static', status: 'draft', lang: 'fr', item_count: 0, type_breakdown: [],
      created_by: 'user-1', creator_name: 'Camille', org_object_id: 'ORG1',
      last_activity_at: '2026-08-01T00:00:00Z', is_archived: true, is_featured: true,
      feature_requested_at: '2026-07-20T00:00:00Z',
      can_edit: true, can_manage_feature: true, can_propose_feature: false,
      can_restore: true, can_manage_sharing: true,
    });
    expect(c.createdBy).toBe('user-1');
    expect(c.creatorName).toBe('Camille');
    expect(c.orgObjectId).toBe('ORG1');
    expect(c.lastActivityAt).toBe('2026-08-01T00:00:00Z');
    expect(c.isArchived).toBe(true);
    expect(c.isFeatured).toBe(true);
    expect(c.featureRequestedAt).toBe('2026-07-20T00:00:00Z');
    expect(c.canEdit).toBe(true);
    expect(c.canManageFeature).toBe(true);
    expect(c.canProposeFeature).toBe(false);
    expect(c.canRestore).toBe(true);
    expect(c.canManageSharing).toBe(true);
  });

  it('détail : effective_cover_url distinct de cover_url ; repli sur cover_url si absent', () => {
    const withExplicit = parseListDetail({
      id: 'L1', kind: 'static', name: 'S', items: [], cover_url: 'https://img/explicit.jpg',
      effective_cover_url: 'https://img/explicit.jpg',
    });
    expect(withExplicit.coverUrl).toBe('https://img/explicit.jpg');
    expect(withExplicit.effectiveCoverUrl).toBe('https://img/explicit.jpg');

    const withFallback = parseListDetail({
      id: 'L2', kind: 'static', name: 'S', items: [], cover_url: null,
      effective_cover_url: 'https://img/first-place.jpg',
    });
    expect(withFallback.coverUrl).toBeNull();
    expect(withFallback.effectiveCoverUrl).toBe('https://img/first-place.jpg');

    const legacyPayload = parseListDetail({ id: 'L3', kind: 'static', name: 'S', items: [], cover_url: null });
    expect(legacyPayload.effectiveCoverUrl).toBeNull();
  });

  it('détail : can_edit absent => false (repli fail-closed identique à la carte)', () => {
    const d = parseListDetail({ id: 'L4', kind: 'static', name: 'S', items: [] });
    expect(d.canEdit).toBe(false);
    expect(d.canManageSharing).toBe(false);
  });
});

describe('listFeaturedLists / listListProposals', () => {
  it('appelle list_featured_lists et mappe chaque ligne en carte', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ id: 'L1', name: 'Une', kind: 'static', status: 'draft', lang: 'fr', item_count: 0, type_breakdown: [], is_featured: true }], error: null });
    mockApiClient(rpc);
    const rows = await listFeaturedLists();
    expect(rpc).toHaveBeenCalledWith('list_featured_lists');
    expect(rows).toHaveLength(1);
    expect(rows[0].isFeatured).toBe(true);
  });

  it('appelle list_list_proposals et mappe chaque ligne en carte', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ id: 'L2', name: 'Proposée', kind: 'static', status: 'draft', lang: 'fr', item_count: 0, type_breakdown: [], feature_requested_at: '2026-08-01T00:00:00Z' }], error: null });
    mockApiClient(rpc);
    const rows = await listListProposals();
    expect(rpc).toHaveBeenCalledWith('list_list_proposals');
    expect(rows[0].featureRequestedAt).toBe('2026-08-01T00:00:00Z');
  });

  it('rend un tableau vide sans client Supabase configuré (repli, pas de throw)', async () => {
    (getApiClient as jest.Mock).mockReturnValue(null);
    await expect(listFeaturedLists()).resolves.toEqual([]);
    await expect(listListProposals()).resolves.toEqual([]);
  });
});

describe('actions de cycle de vie — signatures RPC exactes', () => {
  it('requestListFeature appelle request_list_feature avec p_list_id', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { id: 'L1', kind: 'static', name: 'X', items: [] }, error: null });
    mockApiClient(rpc);
    await requestListFeature('L1');
    expect(rpc).toHaveBeenCalledWith('request_list_feature', { p_list_id: 'L1' });
  });

  it('reviewListFeature appelle review_list_feature avec p_accept, et tolère un détail null (accès perdu après refus)', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    mockApiClient(rpc);
    const result = await reviewListFeature('L1', false);
    expect(rpc).toHaveBeenCalledWith('review_list_feature', { p_list_id: 'L1', p_accept: false });
    expect(result).toBeNull();
  });

  it('setListFeatured appelle set_list_featured avec p_featured', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { id: 'L1', kind: 'static', name: 'X', items: [], is_featured: true }, error: null });
    mockApiClient(rpc);
    const result = await setListFeatured('L1', true);
    expect(rpc).toHaveBeenCalledWith('set_list_featured', { p_list_id: 'L1', p_featured: true });
    expect(result?.isFeatured).toBe(true);
  });

  it('restoreList appelle restore_list avec p_list_id', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { id: 'L1', kind: 'static', name: 'X', items: [], is_archived: false }, error: null });
    mockApiClient(rpc);
    const result = await restoreList('L1');
    expect(rpc).toHaveBeenCalledWith('restore_list', { p_list_id: 'L1' });
    expect(result?.isArchived).toBe(false);
  });

  it('duplicateList appelle duplicate_list et renvoie le nouvel id (contrat identique à create_list)', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 'L2', error: null });
    mockApiClient(rpc);
    await expect(duplicateList('L1')).resolves.toBe('L2');
    expect(rpc).toHaveBeenCalledWith('duplicate_list', { p_list_id: 'L1' });
  });

  it('duplicateList rejette si le RPC ne renvoie pas un id (réponse inattendue)', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    mockApiClient(rpc);
    await expect(duplicateList('L1')).rejects.toThrow('Réponse RPC sans id.');
  });
});

describe('ensureListShareLink', () => {
  it('mappe le ShareInfo au succès (même forme que shareList)', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { share_token: 'tok', share_url_path: '/l/tok', share_enabled: true, share_expires_at: null },
      error: null,
    });
    mockApiClient(rpc);
    const info = await ensureListShareLink('L1');
    expect(rpc).toHaveBeenCalledWith('ensure_list_share_link', { p_list_id: 'L1' });
    expect(info).toEqual({ shareToken: 'tok', shareUrlPath: '/l/tok', shareEnabled: true, shareExpiresAt: null });
  });

  it('traduit SHARE_NOT_AVAILABLE en message FR (un lecteur ne peut pas réactiver un lien coupé)', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'SHARE_NOT_AVAILABLE: link disabled', code: 'P0001' } });
    mockApiClient(rpc);
    await expect(ensureListShareLink('L1')).rejects.toThrow(/éditeur peut le réactiver/);
  });

  it('retombe sur le message générique pour une autre erreur', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom', code: '' } });
    mockApiClient(rpc);
    await expect(ensureListShareLink('L1')).rejects.toThrow('Partage indisponible.');
  });
});

describe('listsQueryKeys — clés partagées ListsManageView / ListComposeView (revue architecte)', () => {
  it('les trois grilles incluent orgId ET userId', () => {
    expect(listsQueryKeys.myLists('org-1', 'user-A')).toEqual(['my-lists', 'org-1', 'user-A']);
    expect(listsQueryKeys.featured('org-1', 'user-A')).toEqual(['featured-lists', 'org-1', 'user-A']);
    expect(listsQueryKeys.proposals('org-1', 'user-A')).toEqual(['list-proposals', 'org-1', 'user-A']);
  });

  it('le détail inclut listId, userId ET orgId — deux identités sur le même id donnent des clés distinctes', () => {
    expect(listsQueryKeys.detail('L1', 'user-A', 'org-1')).toEqual(['list', 'L1', 'user-A', 'org-1']);
    const keyA = listsQueryKeys.detail('L1', 'user-A', 'org-1');
    const keyB = listsQueryKeys.detail('L1', 'user-B', 'org-1');
    expect(keyA).not.toEqual(keyB);
  });
});

const MAIL_OPERATION = 'd2000000-0000-4000-8000-000000000001';
const MAIL_PERMIT = 'd2000000-0000-4000-8000-000000000099';
const MAIL_PROOF = 'a'.repeat(64);
const mailReply = (status: number, body?: unknown) => ({ ok: status >= 200 && status < 300, status,
  json: async () => { if (body === undefined) throw new SyntaxError('synthetic opaque reply'); return body; } });
const permitted = () => mailReply(200, { ok: true, phase: 'prepared', operationId: MAIL_OPERATION, dispatchToken: MAIL_PERMIT });
function positiveMailFetch() {
  return jest.fn(async (_path: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    if (body.phase === 'prepare') return permitted();
    if (body.phase === 'dispatch') return mailReply(200, { ok: true, phase: 'accepted', operationId: MAIL_OPERATION, resultToken: MAIL_PROOF, trackingUpdated: true });
    return mailReply(200, { ok: true, phase: 'acknowledged', operationId: MAIL_OPERATION, acknowledged: true });
  });
}
function testSend(toEmail = 'recipient@example.invalid', extra: Partial<NonNullable<Parameters<typeof sendListByEmail>[2]>> = {}) {
  return sendListByEmail('L1', toEmail, { operationId: MAIL_OPERATION, context: { generations: {} }, ...extra });
}
describe('sendListByEmail — existing mail errors and exact structured phases', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    // These are real digest bytes, not a hash stub or a provider call.
    Object.defineProperty(global.crypto, 'subtle', { configurable: true, value: require('node:crypto').webcrypto.subtle });
    global.TextEncoder = require('node:util').TextEncoder;
    jest.mocked(getServiceAvailability).mockResolvedValue({ translation: false, imageAnalysis: false, email: true });
    (getApiClient as jest.Mock).mockReturnValue({ auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-token' } } }) } });
  });
  afterEach(() => { global.fetch = originalFetch; });
  it('retains the useful revoked-share-link message', async () => {
    global.fetch = jest.fn().mockResolvedValue(mailReply(403, { error: 'forbidden', detail: 'SHARE_NOT_AVAILABLE: link disabled' }));
    await expect(testSend()).rejects.toThrow(/éditeur peut le réactiver/);
  });
  it('retains the current-rights message for a structured forbidden', async () => {
    global.fetch = jest.fn().mockResolvedValue(mailReply(403, { error: 'forbidden', detail: 'not your list' }));
    await expect(testSend()).rejects.toThrow("n'est pas autorisée avec vos droits actuels");
  });
  it('retains SMTP-not-configured only for its exact pre-effect code', async () => {
    global.fetch = jest.fn().mockResolvedValue(mailReply(503, { error: 'smtp_not_configured' }));
    await expect(testSend()).rejects.toThrow(/SMTP/);
  });
  it('returns success only after a structured accepted response, then ACKs the result proof', async () => {
    global.fetch = positiveMailFetch() as unknown as typeof fetch;
    await expect(testSend()).resolves.toEqual({ trackingUpdated: true });
    expect((global.fetch as jest.Mock).mock.calls.map(([, opts]) => JSON.parse(opts.body).phase)).toEqual(['prepare','dispatch','ack']);
  });
  it('keeps exact case, stable identity and explicit predecessor confirmation', async () => {
    const previous = 'd2000000-0000-4000-8000-000000000002'; global.fetch = positiveMailFetch() as unknown as typeof fetch;
    await testSend('ExactCase@example.invalid', { confirmedPreviousOperationId: previous, confirmResend: true });
    const opts = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(opts.headers['Idempotency-Key']).toBe(MAIL_OPERATION);
    expect(JSON.parse(opts.body)).toMatchObject({ phase: 'prepare', listId: 'L1', toEmail: 'ExactCase@example.invalid', expectedGeneration: '0', confirmResend: true, confirmedPreviousOperationIds: [previous] });
  });
  it('lost dispatch HTTP reply remains unknown with the same operation and no second dispatch/ACK', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(permitted()).mockRejectedValueOnce(new TypeError('synthetic network loss'));
    await expect(testSend()).rejects.toMatchObject({ name: 'ListEmailUnknownError', operationId: MAIL_OPERATION });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
  it('lost prepare HTTP reply cannot trigger dispatch and reports protection unavailable', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new TypeError('synthetic network loss'));
    await expect(testSend()).rejects.toThrow(LIST_EMAIL_PROTECTION_UNAVAILABLE_MESSAGE); expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it('reads durable unknown discovered without client IDs and preserves the protection error', async () => {
    const previous = 'd2000000-0000-4000-8000-000000000002';
    global.fetch = jest.fn().mockResolvedValueOnce(mailReply(409, { error: 'email_delivery_unknown', operationId: previous, operationIds: [previous] }))
      .mockResolvedValueOnce(mailReply(503, { error: 'email_protection_unavailable' }));
    await expect(testSend()).rejects.toEqual(new ListEmailUnknownError(previous));
    await expect(testSend()).rejects.toThrow(LIST_EMAIL_PROTECTION_UNAVAILABLE_MESSAGE);
  });
  it('a session JWT belonging to another account cannot prepare under a captured account scope', async () => {
    global.fetch = jest.fn();
    (getApiClient as jest.Mock).mockReturnValue({ auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-B', user: { id: 'user-B' } } } }) } });
    await expect(testSend(undefined, { expectedUserId: 'user-A' })).rejects.toMatchObject({ name: 'AbortError' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('obsolete scope during availability cannot read a replacement JWT or POST', async () => {
    let resolve!: (value: { translation: boolean; imageAnalysis: boolean; email: boolean }) => void;
    jest.mocked(getServiceAvailability).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    let current = true; global.fetch = jest.fn(); const pending = testSend(undefined, { isCurrent: () => current });
    const outcome = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    current = false; resolve({ translation: false, imageAnalysis: false, email: true }); await outcome; expect(global.fetch).not.toHaveBeenCalled();
  });
  it.each([
    [503, {}], [503, null], [503, 'proxy'], [503, []], [503, undefined],
    [200, {}], [200, null], [200, { ok: false }], [200, undefined], [204, undefined],
  ])('opaque HTTP%s after dispatch cannot announce sent or ACK (%j)', async (status, body) => {
    global.fetch = jest.fn().mockResolvedValueOnce(permitted()).mockResolvedValueOnce(mailReply(status, body));
    await expect(testSend()).rejects.toMatchObject({ name: 'ListEmailUnknownError', operationId: MAIL_OPERATION });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
