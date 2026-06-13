import {
  deleteActorChannel,
  linkActorToObject,
  listActorCrm,
  listContactKinds,
  listCrmAssignees,
  listCrmDirectory,
  listCrmTimeline,
  listDemandTopics,
  listObjectContactSuggestions,
  parseActorCrmSnapshot,
  parseContactSuggestion,
  parseCrmAssignee,
  parseCrmDirectoryEntry,
  parseCrmInteraction,
  parseCrmTask,
  parseCrmTimelinePage,
  parseObjectCrmSnapshot,
  saveActorChannel,
  saveCrmActor,
  saveCrmInteraction,
  saveCrmTask,
  uploadActorPhoto,
} from './crm';
import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { mockCrmDirectory } from '../data/mock';
import { useSessionStore } from '../store/session-store';

// Rectifs PO §61 : les tests de contrat RPC (paramètres réellement envoyés) mockent le
// client API ; les chemins démo/parse n'y touchent pas (getApiClient → undefined = le
// comportement « non configuré » d'origine).
jest.mock('../lib/supabase', () => ({
  ...jest.requireActual('../lib/supabase'),
  getApiClient: jest.fn(),
  getSupabaseClient: jest.fn(),
}));

const mockedGetApiClient = jest.mocked(getApiClient);
const mockedGetSupabaseClient = jest.mocked(getSupabaseClient);

/** Client API factice : capture les appels .schema('api').rpc(fn, args). */
function fakeRpcClient(result: unknown = null) {
  const rpc = jest.fn(async () => ({ data: result, error: null }));
  mockedGetApiClient.mockReturnValue({ schema: jest.fn(() => ({ rpc })) } as unknown as ReturnType<typeof getApiClient>);
  return rpc;
}

describe('crm parsers', () => {
  it('parse une tâche RPC en CrmTask (snake_case → camelCase, enums DB, rattachement acteur)', () => {
    const task = parseCrmTask({
      id: 't1', object_id: 'HOT123', object_name: 'Hôtel Test', title: 'Rappeler',
      description: null, status: 'in_progress', priority: 'urgent',
      due_at: '2026-06-12T09:00:00Z', owner_name: 'Marie', related_interaction_subject: null,
      actor_id: 'a1', actor_name: 'Mme Marie Hoarau',
    });
    expect(task).toEqual({
      id: 't1', objectId: 'HOT123', objectName: 'Hôtel Test', title: 'Rappeler',
      description: null, status: 'in_progress', priority: 'urgent',
      dueAt: '2026-06-12T09:00:00Z', ownerName: 'Marie', relatedInteractionSubject: null,
      actorId: 'a1', actorName: 'Mme Marie Hoarau',
    });
  });

  it('rattachement acteur optionnel : actor_id/actor_name absents → null', () => {
    const task = parseCrmTask({ id: 't1', object_id: 'o', object_name: 'O', title: 'x', status: 'todo' });
    expect(task.actorId).toBeNull();
    expect(task.actorName).toBeNull();
  });

  it('borne un status inconnu sur todo (défense contre la dérive d enum)', () => {
    const task = parseCrmTask({ id: 't1', object_id: 'o', object_name: 'O', title: 'x', status: 'doing' });
    expect(task.status).toBe('todo');
  });

  it('parse une page timeline { items, has_more }', () => {
    const page = parseCrmTimelinePage({
      items: [{ id: 'i1', object_id: 'o1', object_name: 'Obj', interaction_type: 'note',
        direction: 'internal', status: 'done', subject: 'Note interne', body: 'corps',
        occurred_at: '2026-01-01T00:00:00Z', actor_name: 'A', topic_code: 'boutique',
        topic_name: 'Boutique', sentiment_code: 'positif', sentiment_name: 'Positif',
        owner_name: null, source: 'import_berta2_crm' }],
      has_more: true,
    });
    expect(page.hasMore).toBe(true);
    expect(page.items[0]).toMatchObject({ id: 'i1', objectId: 'o1', topicName: 'Boutique', sentimentCode: 'positif' });
  });

  it('rend une page vide sur payload nul/malformé', () => {
    expect(parseCrmTimelinePage(null)).toEqual({ items: [], hasMore: false });
  });

  // §19 — snapshot objet (list_object_crm) : la forme workspace consommée par
  // l'enrichissement object-workspace ET le refresh post-save de SectionCrm.
  it('parse le payload list_object_crm en snapshot workspace (interactions + topics)', () => {
    const snapshot = parseObjectCrmSnapshot({
      interactions: [{
        id: 'i1', interaction_type: 'call', direction: 'outbound', status: 'done',
        subject: 'Demande de visite', body: 'RDV fixé au 12.',
        occurred_at: '2026-06-01T08:00:00Z', created_at: '2026-06-01T08:05:00Z',
        actor_id: 'a1', actor_name: 'M. Payet', topic_code: 'demande_de_visite', topic_name: 'Demande de visite',
        sentiment_code: 'positif', sentiment_name: 'Positif', owner_name: 'Marie', source: 'bertel_ui',
        interlocutor_email: 'contact@palmistes.re', resolved_at: '2026-06-02T08:00:00Z',
        replies: [{
          id: 'r1', interaction_type: 'note', body: 'Réponse interne.', occurred_at: '2026-06-01T09:00:00Z',
          created_at: '2026-06-01T09:01:00Z', sentiment_code: null, sentiment_name: null,
          owner_name: 'Florence', interlocutor_email: null, source: 'bertel_ui',
        }],
      }],
      tasks: [{ id: 't1', title: 'Rappeler', status: 'todo', priority: 'medium', due_at: null }],
      topics: [{ code: 'demande_de_visite', name: 'Demande de visite', count: 2 }],
    });
    expect(snapshot.interactions).toHaveLength(1);
    // Contrat backend : list_object_crm porte désormais actor_id + interlocutor_email +
    // status + resolved_at + replies[] par interaction (fil de discussion §65/§66, fix
    // « par Système » + chip de statut §66).
    expect(snapshot.interactions[0]).toEqual({
      id: 'i1', interactionType: 'call', subject: 'Demande de visite', body: 'RDV fixé au 12.',
      occurredAt: '2026-06-01T08:00:00Z', actorId: 'a1', actorName: 'M. Payet',
      topicCode: 'demande_de_visite', topicName: 'Demande de visite',
      sentimentCode: 'positif', sentimentName: 'Positif', ownerName: 'Marie', source: 'bertel_ui',
      // §66 — `status` propagé (planned/done) pour la chip de la vue objet (était droppé).
      interlocutorEmail: 'contact@palmistes.re', status: 'done', resolvedAt: '2026-06-02T08:00:00Z',
      replies: [{
        id: 'r1', interactionType: 'note', body: 'Réponse interne.', occurredAt: '2026-06-01T09:00:00Z',
        createdAt: '2026-06-01T09:01:00Z', sentimentCode: null, sentimentName: null,
        ownerName: 'Florence', interlocutorEmail: null, source: 'bertel_ui',
      }],
    });
    expect(snapshot.topics).toEqual([{ code: 'demande_de_visite', name: 'Demande de visite', count: 2 }]);
  });

  // §61 — la vue établissement consomme les legs actors + tasks du même RPC.
  it('parse les acteurs liés et les tâches du payload list_object_crm', () => {
    const snapshot = parseObjectCrmSnapshot({
      interactions: [],
      topics: [],
      actors: [{
        actor_id: 'a1', display_name: 'Mme Jocelyne Lebon', photo_url: 'https://cdn/jl.jpg',
        role_code: 'operator', role_name: 'Exploitant', is_primary: true,
      }],
      tasks: [{ id: 't1', title: 'Rappeler', status: 'todo', priority: 'medium', due_at: '2026-06-15T00:00:00Z' }],
    });
    expect(snapshot.actors).toEqual([{
      actorId: 'a1', displayName: 'Mme Jocelyne Lebon', photoUrl: 'https://cdn/jl.jpg',
      roleCode: 'operator', roleName: 'Exploitant', isPrimary: true,
    }]);
    expect(snapshot.tasks).toEqual([{
      id: 't1', title: 'Rappeler', status: 'todo', priority: 'medium', dueAt: '2026-06-15T00:00:00Z',
    }]);
  });

  it('rend un snapshot vide sur payload nul/malformé', () => {
    expect(parseObjectCrmSnapshot(null)).toEqual({ interactions: [], topics: [], actors: [], tasks: [] });
    expect(parseObjectCrmSnapshot({ interactions: 'oops', topics: 42 })).toEqual({ interactions: [], topics: [], actors: [], tasks: [] });
  });
});

// §61 — annuaire ACTEURS (api.list_crm_directory) : l'entité CRM principale.
describe('parseCrmDirectoryEntry', () => {
  it('parse une entrée annuaire (objets liés, compteurs, dernière interaction, top sujets)', () => {
    const entry = parseCrmDirectoryEntry({
      actor_id: 'a1', display_name: 'Mme Jocelyne Lebon',
      objects: [{ object_id: 'HLORUN00000000QB', object_name: 'Les Palmistes', object_type: 'HLO', role_name: 'Exploitant', is_primary: false }],
      object_count: 1, interaction_count: 10, interactions_12m: 2,
      last_interaction_at: '2026-04-16T00:00:00+00:00', last_interaction_type: 'note',
      last_interaction_subject: 'Note interne', last_interaction_object_name: 'Les Palmistes',
      // Contrat backend : top_topics = `[{code, name}]` (le code pilote la teinte → parité fiche).
      top_topics: [
        { code: 'accompagnement_taxe_sejour', name: 'Accompagnement Taxe de séjour' },
        { code: 'fermeture_provisoire', name: 'Fermeture provisoire' },
      ],
    });
    expect(entry).toEqual({
      actorId: 'a1', displayName: 'Mme Jocelyne Lebon', photoUrl: null,
      objects: [{ objectId: 'HLORUN00000000QB', objectName: 'Les Palmistes', objectType: 'HLO', roleName: 'Exploitant', isPrimary: false }],
      objectCount: 1, interactionCount: 10, interactions12m: 2,
      lastInteractionAt: '2026-04-16T00:00:00+00:00', lastInteractionType: 'note',
      lastInteractionSubject: 'Note interne', lastInteractionObjectName: 'Les Palmistes',
      topTopics: [
        { code: 'accompagnement_taxe_sejour', name: 'Accompagnement Taxe de séjour' },
        { code: 'fermeture_provisoire', name: 'Fermeture provisoire' },
      ],
    });
  });

  // Défense contre un cache obsolète : l'ancienne forme `string[]` est encore acceptée et
  // mappée sur `{code: '', name}` (clé vide → teinte topic--0) — jamais de crash de parse.
  it('tolère l ancienne forme top_topics: string[] (cache obsolète → {code: "", name})', () => {
    const entry = parseCrmDirectoryEntry({
      actor_id: 'a1', display_name: 'X', top_topics: ['Boutique', 'Hébergement'],
    });
    expect(entry.topTopics).toEqual([
      { code: '', name: 'Boutique' },
      { code: '', name: 'Hébergement' },
    ]);
  });

  it('borne les champs absents/malformés (objects/top_topics non-tableaux → [])', () => {
    const entry = parseCrmDirectoryEntry({ actor_id: 'a1', display_name: 'X', objects: 'oops', top_topics: null });
    expect(entry.objects).toEqual([]);
    expect(entry.topTopics).toEqual([]);
    expect(entry.objectCount).toBe(0);
    expect(entry.lastInteractionAt).toBeNull();
  });

  // Photo acteur (PO point 4) : additive photo_url → photoUrl, null quand absent.
  it('lit photo_url → photoUrl (null quand absent)', () => {
    expect(parseCrmDirectoryEntry({ actor_id: 'a1', display_name: 'X', photo_url: 'https://cdn/p.jpg' }).photoUrl).toBe(
      'https://cdn/p.jpg',
    );
    expect(parseCrmDirectoryEntry({ actor_id: 'a1', display_name: 'X' }).photoUrl).toBeNull();
  });
});

// §61 — fiche acteur 360° (api.list_actor_crm) : interactions à contexte objet OPTIONNEL.
describe('parseActorCrmSnapshot', () => {
  it('parse acteur + objets (role_code) + interactions (objectId nullable) + topics', () => {
    const snapshot = parseActorCrmSnapshot({
      actor: { id: 'a1', display_name: 'Mme Jocelyne Lebon', gender: 'Mme', first_name: 'Jocelyne', last_name: 'Lebon' },
      objects: [{ object_id: 'HLORUN00000000QB', object_name: 'Les Palmistes', object_type: 'HLO', role_code: 'operator', role_name: 'Exploitant', is_primary: true }],
      interactions: [
        { id: 'i1', interaction_type: 'note', direction: 'internal', status: 'planned',
          subject: 'Note interne', body: 'corps', occurred_at: '2026-04-16T00:00:00+00:00',
          created_at: '2026-05-01T09:24:21Z', object_id: 'HLORUN00000000QB', object_name: 'Les Palmistes',
          topic_code: 'accompagnement_taxe_sejour', topic_name: 'Accompagnement Taxe de séjour',
          sentiment_code: 'interrogatif', sentiment_name: 'Interrogatif', owner_name: null, source: 'import_berta2_crm' },
        { id: 'i2', interaction_type: 'call', direction: 'outbound', status: 'done',
          subject: 'Vœux annuels', body: null, occurred_at: '2026-01-08T00:00:00+00:00',
          object_id: null, object_name: null, topic_code: null, topic_name: null,
          sentiment_code: null, sentiment_name: null, owner_name: 'Florence', source: 'bertel_ui' },
      ],
      channels: [
        { id: 'c1', kind_code: 'email', kind_name: 'Email', value: 'jocelyne@palmistes.re', is_primary: true },
        { id: 'c2', kind_code: 'phone', kind_name: 'Téléphone', value: '0262 12 34 56', is_primary: false },
      ],
      topics: [{ code: 'accompagnement_taxe_sejour', name: 'Accompagnement Taxe de séjour', count: 2 }],
    });
    expect(snapshot.actor).toEqual({
      id: 'a1',
      displayName: 'Mme Jocelyne Lebon',
      // §66 — civilité (gender) portée par list_actor_crm.actor pour préremplir le select du modal.
      gender: 'Mme',
      firstName: 'Jocelyne',
      lastName: 'Lebon',
      photoUrl: null,
    });
    // Canaux de contact (rectif PO point 4) — PII du périmètre publisher, déjà gated par le RPC.
    expect(snapshot.channels).toEqual([
      { id: 'c1', kindCode: 'email', kindName: 'Email', value: 'jocelyne@palmistes.re', isPrimary: true },
      { id: 'c2', kindCode: 'phone', kindName: 'Téléphone', value: '0262 12 34 56', isPrimary: false },
    ]);
    expect(snapshot.objects).toEqual([{
      objectId: 'HLORUN00000000QB', objectName: 'Les Palmistes', objectType: 'HLO',
      roleCode: 'operator', roleName: 'Exploitant', isPrimary: true,
    }]);
    // Contexte objet optionnel : l'interaction « générale » garde objectId/objectName null.
    expect(snapshot.interactions[0]).toMatchObject({ id: 'i1', objectId: 'HLORUN00000000QB', objectName: 'Les Palmistes' });
    expect(snapshot.interactions[1]).toMatchObject({ id: 'i2', objectId: null, objectName: null, ownerName: 'Florence' });
    expect(snapshot.topics).toEqual([{ code: 'accompagnement_taxe_sejour', name: 'Accompagnement Taxe de séjour', count: 2 }]);
  });

  // Photo acteur (PO point 4) : actor.photo_url → actor.photoUrl.
  it('lit actor.photo_url → actor.photoUrl', () => {
    const snapshot = parseActorCrmSnapshot({
      actor: { id: 'a1', display_name: 'X', photo_url: 'https://cdn/portrait.jpg' },
    });
    expect(snapshot.actor.photoUrl).toBe('https://cdn/portrait.jpg');
  });

  // §66 — civilité : actor.gender → actor.gender (null quand absent/vide ; pas une organisation).
  it('lit actor.gender → actor.gender (null quand absent)', () => {
    expect(parseActorCrmSnapshot({ actor: { id: 'a1', display_name: 'M. Jean Payet', gender: 'M.' } }).actor.gender).toBe('M.');
    expect(parseActorCrmSnapshot({ actor: { id: 'a1', display_name: 'SARL Untel' } }).actor.gender).toBeNull();
  });

  it('rend un snapshot vide sur payload nul/malformé', () => {
    expect(parseActorCrmSnapshot(null)).toEqual({
      actor: { id: '', displayName: '', gender: null, firstName: null, lastName: null, photoUrl: null },
      objects: [], channels: [], interactions: [], topics: [],
    });
  });
});

describe('parseCrmInteraction — contexte objet nullable (§61)', () => {
  it('une interaction sans objet (générale) garde objectId/objectName null', () => {
    const interaction = parseCrmInteraction({
      id: 'i1', object_id: null, object_name: null, interaction_type: 'call',
      direction: 'outbound', status: 'done', subject: 'Vœux', body: null,
      occurred_at: '2026-01-08T00:00:00Z',
    });
    expect(interaction.objectId).toBeNull();
    expect(interaction.objectName).toBeNull();
  });

  // Rectif PO v5 point 5 : la timeline porte actor_id (clic carte → fiche acteur).
  it('lit actor_id → actorId (null quand absent)', () => {
    const withActor = parseCrmInteraction({
      id: 'i1', interaction_type: 'note', subject: 'Note', actor_id: 'a1',
    });
    expect(withActor.actorId).toBe('a1');
    const withoutActor = parseCrmInteraction({ id: 'i2', interaction_type: 'note', subject: 'Note' });
    expect(withoutActor.actorId).toBeNull();
  });

  // §65/§66 — fil de discussion : interlocutor_email + resolved_at + replies[] nichées.
  it('lit interlocutor_email / resolved_at + niche les réponses (replies[])', () => {
    const root = parseCrmInteraction({
      id: 'i1', interaction_type: 'email', subject: 'Demande', body: 'corps',
      occurred_at: '2026-06-01T08:00:00Z', interlocutor_email: 'demande@etab.re', resolved_at: '2026-06-03T00:00:00Z',
      replies: [
        { id: 'r1', interaction_type: 'note', body: 'Réponse 1', occurred_at: '2026-06-02T08:00:00Z',
          created_at: '2026-06-02T08:01:00Z', sentiment_code: 'positif', sentiment_name: 'Positif',
          owner_name: 'Florence', interlocutor_email: null, source: 'bertel_ui' },
      ],
    });
    expect(root.interlocutorEmail).toBe('demande@etab.re');
    expect(root.resolvedAt).toBe('2026-06-03T00:00:00Z');
    expect(root.replies).toEqual([
      { id: 'r1', interactionType: 'note', body: 'Réponse 1', occurredAt: '2026-06-02T08:00:00Z',
        createdAt: '2026-06-02T08:01:00Z', sentimentCode: 'positif', sentimentName: 'Positif',
        ownerName: 'Florence', interlocutorEmail: null, source: 'bertel_ui' },
    ]);
  });

  it('replies absentes/malformées → [] (défensif), interlocutor/resolved absents → null', () => {
    const a = parseCrmInteraction({ id: 'i1', interaction_type: 'note', subject: 'Note' });
    expect(a.replies).toEqual([]);
    expect(a.interlocutorEmail).toBeNull();
    expect(a.resolvedAt).toBeNull();
    const b = parseCrmInteraction({ id: 'i2', interaction_type: 'note', subject: 'Note', replies: 'oops' });
    expect(b.replies).toEqual([]);
  });
});

describe('listCrmDirectory / listActorCrm — chemins démo', () => {
  const initialDemoMode = useSessionStore.getState().demoMode;

  afterEach(() => {
    useSessionStore.setState({ demoMode: initialDemoMode });
  });

  it('mode démo : listCrmDirectory renvoie les 3 acteurs mock', async () => {
    useSessionStore.setState({ demoMode: true });
    await expect(listCrmDirectory()).resolves.toEqual(mockCrmDirectory);
    expect(mockCrmDirectory).toHaveLength(3);
  });

  it('mode démo : listActorCrm renvoie un snapshot cohérent avec l annuaire mock', async () => {
    useSessionStore.setState({ demoMode: true });
    const snapshot = await listActorCrm(mockCrmDirectory[0].actorId);
    expect(snapshot.actor.id).toBe(mockCrmDirectory[0].actorId);
    expect(snapshot.actor.displayName).toBe(mockCrmDirectory[0].displayName);
    expect(snapshot.objects.map((o) => o.objectId)).toEqual(mockCrmDirectory[0].objects.map((o) => o.objectId));
  });
});

// Vocabulaire complet demand_topic (fix cold-start §19) — lecture PostgREST directe de
// ref_code (pub_ref_code_read), PAS une table crm_* : le pattern maison des vocabulaires ref.
describe('listDemandTopics', () => {
  const initialDemoMode = useSessionStore.getState().demoMode;

  afterEach(() => {
    useSessionStore.setState({ demoMode: initialDemoMode });
  });

  it('mode démo : renvoie le vocabulaire mock sans appel réseau', async () => {
    useSessionStore.setState({ demoMode: true });
    await expect(listDemandTopics()).resolves.toEqual([
      { code: 'demande_de_visite', name: 'Demande de visite' },
      { code: 'modification_infos_bdd', name: 'Modification infos BDD' },
    ]);
  });

  it('hors démo sans client Supabase configuré : renvoie [] (le select retombe sur la distribution objet)', async () => {
    useSessionStore.setState({ demoMode: false });
    await expect(listDemandTopics()).resolves.toEqual([]);
  });
});

/* ===== Rectifs PO §61 — contrats RPC (paramètres réellement envoyés) ============= */

describe('listCrmDirectory — filtres serveur (sujet / statut / période, KPIs réactifs)', () => {
  const initialDemoMode = useSessionStore.getState().demoMode;

  afterEach(() => {
    useSessionStore.setState({ demoMode: initialDemoMode });
    mockedGetApiClient.mockReset();
  });

  it('passe topicCode/status/from en paramètres RPC (le serveur filtre TOUS les agrégats)', async () => {
    useSessionStore.setState({ demoMode: false });
    const rpc = fakeRpcClient([]);
    await listCrmDirectory({ topicCode: 'boutique', status: 'active', from: '2026-03-14T00:00:00.000Z' });
    expect(rpc).toHaveBeenCalledWith('list_crm_directory', {
      p_topic_code: 'boutique',
      p_status: 'active',
      p_from: '2026-03-14T00:00:00.000Z',
      p_to: null,
    });
  });

  it('sans filtre : tous les paramètres RPC sont null (annuaire complet)', async () => {
    useSessionStore.setState({ demoMode: false });
    const rpc = fakeRpcClient([]);
    await listCrmDirectory();
    expect(rpc).toHaveBeenCalledWith('list_crm_directory', {
      p_topic_code: null, p_status: null, p_from: null, p_to: null,
    });
  });
});

describe('saveCrmActor / saveActorChannel / deleteActorChannel (rectifs PO points 4+5)', () => {
  const initialDemoMode = useSessionStore.getState().demoMode;

  beforeEach(() => {
    useSessionStore.setState({ demoMode: false });
  });
  afterEach(() => {
    useSessionStore.setState({ demoMode: initialDemoMode });
    mockedGetApiClient.mockReset();
  });

  it('INSERT acteur : display_name + object_id (requis — le lien objet le met en périmètre) + identité', async () => {
    const rpc = fakeRpcClient({ id: 'new-actor' });
    await expect(
      saveCrmActor({ displayName: 'M. Jean Payet', firstName: 'Jean', lastName: 'Payet', objectId: 'HOT123' }),
    ).resolves.toBe('new-actor');
    expect(rpc).toHaveBeenCalledWith('save_crm_actor', {
      p_payload: { display_name: 'M. Jean Payet', first_name: 'Jean', last_name: 'Payet', object_id: 'HOT123' },
    });
  });

  it('UPDATE acteur : id + identité seulement (pas de clés objet/role parasites)', async () => {
    const rpc = fakeRpcClient({ id: 'a1' });
    await saveCrmActor({ id: 'a1', displayName: 'Mme Marie Hoarau', firstName: 'Marie' });
    expect(rpc).toHaveBeenCalledWith('save_crm_actor', {
      p_payload: { id: 'a1', display_name: 'Mme Marie Hoarau', first_name: 'Marie' },
    });
  });

  it('INSERT canal : actor_id + kind_code + value (+ is_primary)', async () => {
    const rpc = fakeRpcClient({ id: 'c1' });
    await expect(
      saveActorChannel({ actorId: 'a1', kindCode: 'email', value: 'jean@payet.re', isPrimary: true }),
    ).resolves.toBe('c1');
    expect(rpc).toHaveBeenCalledWith('save_actor_channel', {
      p_payload: { actor_id: 'a1', kind_code: 'email', value: 'jean@payet.re', is_primary: true },
    });
  });

  it('UPDATE canal : id + champs modifiés seulement', async () => {
    const rpc = fakeRpcClient({ id: 'c1' });
    await saveActorChannel({ id: 'c1', value: '0692 11 22 33' });
    expect(rpc).toHaveBeenCalledWith('save_actor_channel', { p_payload: { id: 'c1', value: '0692 11 22 33' } });
  });

  it('deleteActorChannel passe p_id', async () => {
    const rpc = fakeRpcClient(null);
    await deleteActorChannel('c1');
    expect(rpc).toHaveBeenCalledWith('delete_actor_channel', { p_id: 'c1' });
  });

  // Photo acteur (PO point 4) : photo_url partiel — clé présente écrite, '' = effacement.
  it('UPDATE acteur avec photoUrl : photo_url passé en payload (URL posée par la route d upload)', async () => {
    const rpc = fakeRpcClient({ id: 'a1' });
    await saveCrmActor({ id: 'a1', photoUrl: 'https://cdn/portrait.jpg' });
    expect(rpc).toHaveBeenCalledWith('save_crm_actor', { p_payload: { id: 'a1', photo_url: 'https://cdn/portrait.jpg' } });
  });

  it('UPDATE acteur avec photoUrl vide : photo_url = "" (effacement explicite)', async () => {
    const rpc = fakeRpcClient({ id: 'a1' });
    await saveCrmActor({ id: 'a1', photoUrl: '' });
    expect(rpc).toHaveBeenCalledWith('save_crm_actor', { p_payload: { id: 'a1', photo_url: '' } });
  });

  // §66 — civilité : gender partiel (clé présente écrite ; '' efface côté serveur). Le
  // display_name est COMPOSÉ côté client (civilité + prénom + nom) et envoyé tel quel.
  it('INSERT acteur : gender + display_name composé partent en payload', async () => {
    const rpc = fakeRpcClient({ id: 'new-actor' });
    await saveCrmActor({
      displayName: 'Mme Jocelyne Lebon', gender: 'Mme', firstName: 'Jocelyne', lastName: 'Lebon', objectId: 'HOT123',
    });
    expect(rpc).toHaveBeenCalledWith('save_crm_actor', {
      p_payload: {
        display_name: 'Mme Jocelyne Lebon', gender: 'Mme', first_name: 'Jocelyne', last_name: 'Lebon', object_id: 'HOT123',
      },
    });
  });

  it('UPDATE acteur avec gender vide : gender = "" (effacement explicite, organisation)', async () => {
    const rpc = fakeRpcClient({ id: 'a1' });
    await saveCrmActor({ id: 'a1', gender: '', displayName: 'SARL Untel', lastName: 'SARL Untel' });
    expect(rpc).toHaveBeenCalledWith('save_crm_actor', {
      p_payload: { id: 'a1', gender: '', display_name: 'SARL Untel', last_name: 'SARL Untel' },
    });
  });

  it('échec RPC → throw (l erreur PostgREST brute survit, .code 42501 compris)', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: Object.assign(new Error('denied'), { code: '42501' }) }));
    mockedGetApiClient.mockReturnValue({ schema: jest.fn(() => ({ rpc })) } as unknown as ReturnType<typeof getApiClient>);
    await expect(saveCrmActor({ displayName: 'X', objectId: 'o1' })).rejects.toMatchObject({ code: '42501' });
  });
});

// §66 — affecter un établissement existant à un acteur depuis sa fiche (api.link_actor_to_object).
// Gate = write-CRM sur l'OBJET (42501 sinon). Rôle par défaut serveur 'operator' (seul seedé).
describe('linkActorToObject', () => {
  const initialDemoMode = useSessionStore.getState().demoMode;

  afterEach(() => {
    useSessionStore.setState({ demoMode: initialDemoMode });
    mockedGetApiClient.mockReset();
  });

  it('appelle link_actor_to_object(p_payload {actor_id, object_id}) et renvoie { linked }', async () => {
    useSessionStore.setState({ demoMode: false });
    const rpc = fakeRpcClient({ actor_id: 'a1', object_id: 'HOT123', role_code: 'operator', linked: true });
    await expect(linkActorToObject('a1', 'HOT123')).resolves.toEqual({ linked: true });
    expect(rpc).toHaveBeenCalledWith('link_actor_to_object', {
      p_payload: { actor_id: 'a1', object_id: 'HOT123', role_code: undefined },
    });
  });

  it('passe role_code quand fourni', async () => {
    useSessionStore.setState({ demoMode: false });
    const rpc = fakeRpcClient({ actor_id: 'a1', object_id: 'HOT123', role_code: 'operator', linked: true });
    await linkActorToObject('a1', 'HOT123', 'operator');
    expect(rpc).toHaveBeenCalledWith('link_actor_to_object', {
      p_payload: { actor_id: 'a1', object_id: 'HOT123', role_code: 'operator' },
    });
  });

  it('linked=false (lien déjà existant) est propagé', async () => {
    useSessionStore.setState({ demoMode: false });
    fakeRpcClient({ actor_id: 'a1', object_id: 'HOT123', role_code: 'operator', linked: false });
    await expect(linkActorToObject('a1', 'HOT123')).resolves.toEqual({ linked: false });
  });

  it('échec RPC → throw (42501 = pas de write-CRM sur l objet, .code survit)', async () => {
    useSessionStore.setState({ demoMode: false });
    const rpc = jest.fn(async () => ({ data: null, error: Object.assign(new Error('denied'), { code: '42501' }) }));
    mockedGetApiClient.mockReturnValue({ schema: jest.fn(() => ({ rpc })) } as unknown as ReturnType<typeof getApiClient>);
    await expect(linkActorToObject('a1', 'HOT123')).rejects.toMatchObject({ code: '42501' });
  });

  it('mode démo : renvoie { linked: true } sans appel réseau', async () => {
    useSessionStore.setState({ demoMode: true });
    await expect(linkActorToObject('a1', 'HOT123')).resolves.toEqual({ linked: true });
  });
});

// Suggestions de contacts (PO point 2) — pré-remplissage de l'authoring acteur depuis les
// contacts de l'établissement de rattachement (api.list_object_contact_suggestions).
describe('parseContactSuggestion / listObjectContactSuggestions', () => {
  it('parse une suggestion (snake_case → camelCase, is_primary booléen)', () => {
    expect(
      parseContactSuggestion({
        kind_code: 'email', kind_name: 'Email', value: 'contact@hotel.re', is_primary: true, source: 'établissement',
      }),
    ).toEqual({ kindCode: 'email', kindName: 'Email', value: 'contact@hotel.re', isPrimary: true, source: 'établissement' });
  });

  const initialDemoMode = useSessionStore.getState().demoMode;
  afterEach(() => {
    useSessionStore.setState({ demoMode: initialDemoMode });
    mockedGetApiClient.mockReset();
  });

  it('hors démo : appelle list_object_contact_suggestions(p_object_id) et parse le tableau', async () => {
    useSessionStore.setState({ demoMode: false });
    const rpc = fakeRpcClient([
      { kind_code: 'email', kind_name: 'Email', value: 'contact@hotel.re', is_primary: true, source: 'établissement' },
      { kind_code: 'phone', kind_name: 'Téléphone', value: '0262 00 00 00', is_primary: false, source: 'acteur lié' },
    ]);
    await expect(listObjectContactSuggestions('HOT123')).resolves.toEqual([
      { kindCode: 'email', kindName: 'Email', value: 'contact@hotel.re', isPrimary: true, source: 'établissement' },
      { kindCode: 'phone', kindName: 'Téléphone', value: '0262 00 00 00', isPrimary: false, source: 'acteur lié' },
    ]);
    expect(rpc).toHaveBeenCalledWith('list_object_contact_suggestions', { p_object_id: 'HOT123' });
  });

  it('42501 (hors périmètre / non autorisé) → [] (le bloc se masque, le modal ne casse pas)', async () => {
    useSessionStore.setState({ demoMode: false });
    const rpc = jest.fn(async () => ({ data: null, error: Object.assign(new Error('denied'), { code: '42501' }) }));
    mockedGetApiClient.mockReturnValue({ schema: jest.fn(() => ({ rpc })) } as unknown as ReturnType<typeof getApiClient>);
    await expect(listObjectContactSuggestions('HOT123')).resolves.toEqual([]);
  });

  it('mode démo : renvoie quelques suggestions mock sans appel réseau', async () => {
    useSessionStore.setState({ demoMode: true });
    const suggestions = await listObjectContactSuggestions('obj-1');
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0]).toHaveProperty('kindCode');
    expect(suggestions[0]).toHaveProperty('value');
  });
});

// Timeline filtrable (PO points 6+7) — signature 7→9 args : p_status (active=planned/done) +
// p_from en ARGUMENTS NOMMÉS. Toutes + Tout (status/from absents) = timeline complète.
describe('listCrmTimeline — filtres statut/période (args nommés)', () => {
  const initialDemoMode = useSessionStore.getState().demoMode;
  afterEach(() => {
    useSessionStore.setState({ demoMode: initialDemoMode });
    mockedGetApiClient.mockReset();
  });

  it('sans filtre : status/from null (Toutes + Tout = ensemble complet, PAS de borne période)', async () => {
    useSessionStore.setState({ demoMode: false });
    const rpc = fakeRpcClient({ items: [], has_more: false });
    await listCrmTimeline();
    expect(rpc).toHaveBeenCalledWith('list_crm_timeline', {
      p_object_id: null,
      p_topic_code: null,
      p_interaction_type: null,
      p_sentiment_code: null,
      p_status: null,
      p_from: null,
      p_before: null,
      p_before_id: null,
      p_limit: 50,
    });
  });

  it('passe topicCode/status/from + le curseur keyset (before/before_id)', async () => {
    useSessionStore.setState({ demoMode: false });
    const rpc = fakeRpcClient({ items: [], has_more: false });
    await listCrmTimeline({
      topicCode: 'boutique',
      status: 'active',
      from: '2026-03-14T00:00:00.000Z',
      before: '2026-06-01T00:00:00Z',
      beforeId: 'evt-9',
    });
    expect(rpc).toHaveBeenCalledWith('list_crm_timeline', {
      p_object_id: null,
      p_topic_code: 'boutique',
      p_interaction_type: null,
      p_sentiment_code: null,
      p_status: 'active',
      p_from: '2026-03-14T00:00:00.000Z',
      p_before: '2026-06-01T00:00:00Z',
      p_before_id: 'evt-9',
      p_limit: 50,
    });
  });
});

describe('saveCrmTask — rattachement acteur (rectif PO point 3)', () => {
  const initialDemoMode = useSessionStore.getState().demoMode;

  afterEach(() => {
    useSessionStore.setState({ demoMode: initialDemoMode });
    mockedGetApiClient.mockReset();
  });

  it('passe actor_id quand actorId est fourni (tâche créée depuis la fiche acteur)', async () => {
    useSessionStore.setState({ demoMode: false });
    const rpc = fakeRpcClient({ id: 't1' });
    await saveCrmTask({ objectId: 'HOT123', actorId: 'a1', title: 'Rappeler', dueAt: '2026-06-20' });
    expect(rpc).toHaveBeenCalledWith('save_crm_task', {
      p_payload: { object_id: 'HOT123', actor_id: 'a1', title: 'Rappeler', due_at: '2026-06-20' },
    });
  });

  // Assignation (PO point 4) : `owner` passe en clé payload (validé serveur — membre de
  // l'ORG du caller, sinon 22023). Omis = défaut serveur (self).
  it('passe owner quand fourni (assignation explicite à un membre de l ORG)', async () => {
    useSessionStore.setState({ demoMode: false });
    const rpc = fakeRpcClient({ id: 't1' });
    await saveCrmTask({ objectId: 'HOT123', title: 'Rappeler', dueAt: '2026-06-20', owner: 'usr-jean' });
    expect(rpc).toHaveBeenCalledWith('save_crm_task', {
      p_payload: { object_id: 'HOT123', title: 'Rappeler', due_at: '2026-06-20', owner: 'usr-jean' },
    });
  });
});

// §65/§66 — réponses + bascule traité/rouvert (le composer de fil + le bouton « Marquer traitée »).
describe('saveCrmInteraction — réponse (parentInteractionId) + bascule de statut', () => {
  const initialDemoMode = useSessionStore.getState().demoMode;

  afterEach(() => {
    useSessionStore.setState({ demoMode: initialDemoMode });
    mockedGetApiClient.mockReset();
  });

  // Une RÉPONSE : on passe parent_interaction_id + body (+ sentiment optionnel) ; PAS d'actorId
  // ni d'objectId (le backend hérite le contexte de la racine — ne pas le re-passer).
  it('passe parent_interaction_id (réponse) sans ré-ancrer actor/object', async () => {
    useSessionStore.setState({ demoMode: false });
    const rpc = fakeRpcClient({ id: 'r1' });
    await saveCrmInteraction({ parentInteractionId: 'root-1', body: 'Ma réponse', sentimentCode: 'positif' });
    expect(rpc).toHaveBeenCalledWith('save_crm_interaction', {
      p_payload: { parent_interaction_id: 'root-1', body: 'Ma réponse', sentiment_code: 'positif' },
    });
  });

  // « Marquer traitée » : save({id, status:'done'}) — le serveur pose resolved_at.
  it('bascule « traitée » → { id, status: done }', async () => {
    useSessionStore.setState({ demoMode: false });
    const rpc = fakeRpcClient({ id: 'root-1' });
    await saveCrmInteraction({ id: 'root-1', status: 'done' });
    expect(rpc).toHaveBeenCalledWith('save_crm_interaction', { p_payload: { id: 'root-1', status: 'done' } });
  });

  // « Rouvrir » : save({id, status:'planned'}) — le serveur efface resolved_at.
  it('bascule « rouvrir » → { id, status: planned }', async () => {
    useSessionStore.setState({ demoMode: false });
    const rpc = fakeRpcClient({ id: 'root-1' });
    await saveCrmInteraction({ id: 'root-1', status: 'planned' });
    expect(rpc).toHaveBeenCalledWith('save_crm_interaction', { p_payload: { id: 'root-1', status: 'planned' } });
  });
});

// Assignation (PO point 4) — annuaire des assignables : membres actifs de l'ORG du caller.
describe('parseCrmAssignee / listCrmAssignees', () => {
  it('parse un assignable (user_id → userId, display_name → displayName)', () => {
    expect(parseCrmAssignee({ user_id: 'usr-jean', display_name: 'Jean P.' })).toEqual({
      userId: 'usr-jean',
      displayName: 'Jean P.',
    });
  });

  const initialDemoMode = useSessionStore.getState().demoMode;
  afterEach(() => {
    useSessionStore.setState({ demoMode: initialDemoMode });
    mockedGetApiClient.mockReset();
  });

  it('mode démo : renvoie une liste mock non vide (au moins 1 personne)', async () => {
    useSessionStore.setState({ demoMode: true });
    const assignees = await listCrmAssignees();
    expect(assignees.length).toBeGreaterThanOrEqual(1);
    expect(assignees[0]).toHaveProperty('userId');
    expect(assignees[0]).toHaveProperty('displayName');
  });

  it('hors démo : appelle list_crm_assignees et parse le tableau (1 entrée fonctionne)', async () => {
    useSessionStore.setState({ demoMode: false });
    const rpc = fakeRpcClient([{ user_id: 'usr-marie', display_name: 'Marie D.' }]);
    await expect(listCrmAssignees()).resolves.toEqual([{ userId: 'usr-marie', displayName: 'Marie D.' }]);
    expect(rpc).toHaveBeenCalledWith('list_crm_assignees', {});
  });
});

// Vocabulaire des canaux de contact (ref_code, domaine contact_kind) — même pattern de
// lecture PostgREST directe que listDemandTopics (pas une table crm_*).
describe('listContactKinds', () => {
  const initialDemoMode = useSessionStore.getState().demoMode;

  afterEach(() => {
    useSessionStore.setState({ demoMode: initialDemoMode });
  });

  it('mode démo : renvoie le vocabulaire mock sans appel réseau', async () => {
    useSessionStore.setState({ demoMode: true });
    await expect(listContactKinds()).resolves.toEqual([
      { code: 'phone', name: 'Téléphone' },
      { code: 'mobile', name: 'Mobile' },
      { code: 'email', name: 'Email' },
      { code: 'website', name: 'Site web' },
    ]);
  });

  it('hors démo sans client Supabase configuré : renvoie [] (fail-soft)', async () => {
    useSessionStore.setState({ demoMode: false });
    await expect(listContactKinds()).resolves.toEqual([]);
  });
});

// Upload portrait acteur (PO point 4) — POST /api/actor-photo/upload (FormData + bearer de
// session). La route autorise AS THE CALLER, strippe l'EXIF et écrit en service-role ;
// le helper client ne fait QUE poster et lire { url }. Démo : pas d'appel réseau.
describe('uploadActorPhoto', () => {
  const initialDemoMode = useSessionStore.getState().demoMode;
  const realFetch = global.fetch;

  afterEach(() => {
    useSessionStore.setState({ demoMode: initialDemoMode });
    mockedGetSupabaseClient.mockReset();
    global.fetch = realFetch;
  });

  function makeFile(): File {
    return new File([new Uint8Array([1, 2, 3])], 'portrait.jpg', { type: 'image/jpeg' });
  }

  it('poste FormData (actorId + file) avec le bearer de session et renvoie l URL', async () => {
    useSessionStore.setState({ demoMode: false });
    mockedGetSupabaseClient.mockReturnValue({
      auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-123' } } }) },
    } as unknown as ReturnType<typeof getSupabaseClient>);
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ url: 'https://cdn/actors/a1/x.jpg' }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(uploadActorPhoto('a1', makeFile())).resolves.toBe('https://cdn/actors/a1/x.jpg');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/actor-photo/upload');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-123');
    const body = init.body as FormData;
    expect(body.get('actorId')).toBe('a1');
    expect(body.get('file')).toBeInstanceOf(File);
  });

  it('non-2xx → throw avec le détail serveur (pas d échec silencieux)', async () => {
    useSessionStore.setState({ demoMode: false });
    mockedGetSupabaseClient.mockReturnValue({
      auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-123' } } }) },
    } as unknown as ReturnType<typeof getSupabaseClient>);
    global.fetch = (async () => ({
      ok: false,
      status: 403,
      json: async () => ({ detail: 'caller cannot edit this actor' }),
    })) as unknown as typeof fetch;
    await expect(uploadActorPhoto('a1', makeFile())).rejects.toThrow(/caller cannot edit this actor/);
  });

  it('mode démo : renvoie une URL locale sans appel réseau', async () => {
    useSessionStore.setState({ demoMode: true });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(uploadActorPhoto('a1', makeFile())).resolves.toEqual(expect.any(String));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
