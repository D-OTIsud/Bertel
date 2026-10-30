import { QueryClient } from '@tanstack/react-query';
import { crmQueryKeys } from './crm-query-keys';

describe('CRM cache compatibility', () => {
  it('reads entries written with the existing keys, including filtered and paginated data', () => {
    const client = new QueryClient();
    const filters = { search: 'Réunion' };
    const entries = [
      { legacy: ['crm-directory'], key: crmQueryKeys.directory() },
      { legacy: ['crm-directory', filters], key: crmQueryKeys.directory(filters) },
      { legacy: ['crm-actor', 'actor-1'], key: crmQueryKeys.actor('actor-1') },
      { legacy: ['crm-object', 'object-1'], key: crmQueryKeys.object('object-1') },
      { legacy: ['crm-timeline', '{}', null], key: crmQueryKeys.timeline('{}', null) },
      { legacy: ['crm-timeline', '{}', 'older-1'], key: crmQueryKeys.timeline('{}', 'older-1') },
      { legacy: ['crm-actor-portal-permission', 'user-1', 'org-1'], key: crmQueryKeys.portalPermission('user-1', 'org-1') },
    ];
    entries.forEach(({ legacy }, index) => client.setQueryData(legacy, { index }));
    entries.forEach(({ key }, index) => expect(client.getQueryData(key)).toEqual({ index }));
    client.clear();
  });

  it('invalidates all directory variants while leaving actor data available', async () => {
    const client = new QueryClient();
    const keys = [crmQueryKeys.directory(), crmQueryKeys.directory({ search: 'Hôtel' }), crmQueryKeys.directory({ search: 'Gîte' })];
    keys.forEach((key) => client.setQueryData(key, []));
    client.setQueryData(crmQueryKeys.actor('actor-1'), { name: 'Réunion' });
    await client.invalidateQueries({ queryKey: crmQueryKeys.directory(), refetchType: 'none' });
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    expect(client.getQueryState(crmQueryKeys.actor('actor-1'))?.isInvalidated).toBe(false);
    client.clear();
  });

  it('invalidates every cached timeline page through the original prefix', async () => {
    const client = new QueryClient();
    const keys = [crmQueryKeys.timeline('{}', null), crmQueryKeys.timeline('{}', 'older-1'), crmQueryKeys.timeline('{"status":"open"}', null)];
    keys.forEach((key) => client.setQueryData(key, { items: [] }));
    await client.invalidateQueries({ queryKey: crmQueryKeys.timelines, refetchType: 'none' });
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    client.clear();
  });
});
