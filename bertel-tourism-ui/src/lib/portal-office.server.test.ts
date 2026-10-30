/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('./org-smtp.server', () => ({ readOrgSmtpConfig: jest.fn() }));
jest.mock('./mail.server', () => ({ MailNotConfiguredError: class MailNotConfiguredError extends Error {} }));
import { readOfficeIdentity, readPartnerInvitationContext } from './portal-office.server';
import { readOrgSmtpConfig } from './org-smtp.server';

function database() {
  const calls: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];
  const from = jest.fn((table: string) => {
    const call = { table, filters: [] as Array<[string, string, unknown]> }; calls.push(call);
    const rows: Record<string, Array<Record<string, unknown>>> = {
      object: [{ id: 'ORG-A', name: 'Office A', object_type: 'ORG' }, { id: 'OBJ-A', name: 'Fiche A', object_type: 'RES' }, { id: 'OBJ-B', name: 'Fiche privée B', object_type: 'RES' }],
      actor: [{ id: 'ACTOR', first_name: 'Marie' }], org_branding_settings: [], ref_org_role: [{ id: 'PUB', code: 'publisher' }],
      ref_code_contact_kind: [{ id: 'K-EMAIL', code: 'email' }],
      contact_channel: [{ object_id: 'ORG-A', kind_id: 'K-EMAIL', is_public: false, value: 'private@office.test' },
        { object_id: 'ORG-A', kind_id: 'K-EMAIL', is_public: true, value: 'public@office.test' },
        { object_id: 'ORG-B', kind_id: 'K-EMAIL', is_public: true, value: 'other@office.test' }],
      actor_object_role: [{ actor_id: 'ACTOR', object_id: 'OBJ-A' }, { actor_id: 'ACTOR', object_id: 'OBJ-B' }, { actor_id: 'ACTOR', object_id: 'EXPIRED', valid_to: '2000-01-01' }],
      object_org_link: [{ object_id: 'OBJ-A', org_object_id: 'ORG-A', role_id: 'PUB' }, { object_id: 'OBJ-B', org_object_id: 'ORG-B', role_id: 'PUB' }],
    };
    const result = () => (rows[table] ?? []).filter((row) => call.filters.every(([op, field, value]) => op === 'eq' ? row[field] === value : op === 'neq' ? row[field] !== value : (value as unknown[]).includes(row[field])));
    const node = {
      select: () => node,
      eq: (field: string, value: unknown) => { call.filters.push(['eq', field, value]); return node; },
      neq: (field: string, value: unknown) => { call.filters.push(['neq', field, value]); return node; },
      in: (field: string, value: unknown[]) => { call.filters.push(['in', field, value]); return node; },
      order: () => node,
      maybeSingle: async () => ({ data: result()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: result(), error: null }).then(resolve),
    };
    return node;
  });
  return { client: { from } as never, from, calls };
}

beforeEach(() => { jest.clearAllMocks(); jest.mocked(readOrgSmtpConfig).mockResolvedValue({ orgId: 'ORG-A' } as never); });

test('l’office est résolu avec le JWT et les fiches restent dans le périmètre acteur × office', async () => {
  const db = database();
  const rpc = jest.fn().mockResolvedValue({ data: 'ORG-A', error: null });
  const result = await readPartnerInvitationContext(db.client, { schema: () => ({ rpc }) } as never, 'ACTOR');
  expect(rpc).toHaveBeenCalledWith('current_user_org_id');
  expect(result).toMatchObject({ orgId: 'ORG-A', email: { officeName: 'Office A', recipientName: 'Marie', ficheNames: ['Fiche A'] } });
  expect(db.calls.find((call) => call.table === 'actor_object_role')?.filters).toContainEqual(['eq', 'actor_id', 'ACTOR']);
  expect(db.calls.find((call) => call.table === 'object_org_link')?.filters).toEqual(expect.arrayContaining([
    ['eq', 'org_object_id', 'ORG-A'], ['eq', 'role_id', 'PUB'], ['in', 'object_id', ['OBJ-A', 'OBJ-B']],
  ]));
});

test.each([null, 'ORG-A'])('sans office ou relais actif, aucune métadonnée privilégiée n’est lue (%s)', async (orgId) => {
  const db = database(); jest.mocked(readOrgSmtpConfig).mockResolvedValue(null);
  const rpc = jest.fn().mockResolvedValue({ data: orgId, error: null });
  await expect(readPartnerInvitationContext(db.client, { schema: () => ({ rpc }) } as never, 'ACTOR')).rejects.toThrow();
  expect(db.from).not.toHaveBeenCalled();
});

test('les contacts proviennent du même office que le logo et excluent ses canaux internes', async () => {
  const db = database();
  const office = await readOfficeIdentity(db.client, 'ORG-A');
  expect(office.email).toBe('public@office.test');
  expect(db.calls.find((call) => call.table === 'contact_channel')?.filters).toEqual(expect.arrayContaining([
    ['eq', 'object_id', 'ORG-A'], ['eq', 'is_public', true],
  ]));
});
