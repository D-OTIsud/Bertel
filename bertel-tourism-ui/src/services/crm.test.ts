import { parseCrmTask, parseCrmInteraction, parseCrmTimelinePage } from './crm';

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
});
