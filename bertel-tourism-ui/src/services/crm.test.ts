import { parseCrmTask, parseCrmTimelinePage, parseObjectCrmSnapshot } from './crm';

describe('crm parsers', () => {
  it('parse une tâche RPC en CrmTask (snake_case → camelCase, enums DB)', () => {
    const task = parseCrmTask({
      id: 't1', object_id: 'HOT123', object_name: 'Hôtel Test', title: 'Rappeler',
      description: null, status: 'in_progress', priority: 'urgent',
      due_at: '2026-06-12T09:00:00Z', owner_name: 'Marie', related_interaction_subject: null,
    });
    expect(task).toEqual({
      id: 't1', objectId: 'HOT123', objectName: 'Hôtel Test', title: 'Rappeler',
      description: null, status: 'in_progress', priority: 'urgent',
      dueAt: '2026-06-12T09:00:00Z', ownerName: 'Marie', relatedInteractionSubject: null,
    });
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
        actor_name: 'M. Payet', topic_code: 'demande_de_visite', topic_name: 'Demande de visite',
        sentiment_code: 'positif', sentiment_name: 'Positif', owner_name: 'Marie', source: 'bertel_ui',
      }],
      tasks: [{ id: 't1', title: 'Rappeler', status: 'todo', priority: 'medium', due_at: null }],
      topics: [{ code: 'demande_de_visite', name: 'Demande de visite', count: 2 }],
    });
    expect(snapshot.interactions).toHaveLength(1);
    expect(snapshot.interactions[0]).toEqual({
      id: 'i1', interactionType: 'call', subject: 'Demande de visite', body: 'RDV fixé au 12.',
      occurredAt: '2026-06-01T08:00:00Z', actorName: 'M. Payet',
      topicCode: 'demande_de_visite', topicName: 'Demande de visite',
      sentimentCode: 'positif', sentimentName: 'Positif', ownerName: 'Marie', source: 'bertel_ui',
    });
    expect(snapshot.topics).toEqual([{ code: 'demande_de_visite', name: 'Demande de visite', count: 2 }]);
  });

  it('rend un snapshot vide sur payload nul/malformé', () => {
    expect(parseObjectCrmSnapshot(null)).toEqual({ interactions: [], topics: [] });
    expect(parseObjectCrmSnapshot({ interactions: 'oops', topics: 42 })).toEqual({ interactions: [], topics: [] });
  });
});
