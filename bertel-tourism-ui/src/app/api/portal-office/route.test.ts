/** @jest-environment node */
jest.mock('../_document-auth', () => ({ authenticated: jest.fn(), callerClient: jest.fn() }));
jest.mock('@/lib/portal-office.server', () => ({ readOfficeIdentity: jest.fn() }));
import { authenticated, callerClient } from '../_document-auth';
import { readOfficeIdentity } from '@/lib/portal-office.server';
import { GET } from './route';

const req = (objectId?: string) => ({ url: 'https://app.test/api/portal-office' + (objectId ? '?objectId=' + objectId : '') }) as never;
function setup(fiches: unknown, error: unknown = null, links = [{ object_id: 'OBJ-A', org_object_id: 'ORG-A' }]) {
  const calls: Array<[string, string, unknown]> = [];
  const from = jest.fn((table: string) => {
    const node: Record<string, unknown> = {};
    Object.assign(node, { select: () => node,
      eq: (field: string, value: unknown) => { calls.push([table, field, value]); return node; },
      in: (field: string, value: unknown) => { calls.push([table, field, value]); return node; },
      order: () => node,
      maybeSingle: async () => ({ data: { id: 'PUB' }, error: null }),
      then: (resolve: (data: unknown) => unknown) => Promise.resolve({ data: links, error: null }).then(resolve),
    }); return node;
  });
  jest.mocked(authenticated).mockResolvedValue({ ok: true, jwt: 'actor-jwt', server: { from }, userId: 'ACTOR' } as never);
  const rpc = jest.fn().mockResolvedValue({ data: fiches, error });
  jest.mocked(callerClient).mockReturnValue({ schema: () => ({ rpc }) } as never);
  jest.mocked(readOfficeIdentity).mockResolvedValue({ id: 'ORG-A', name: 'Office A', logoUrl: 'https://office.test/logo.png', email: 'contact@office.test', phone: '0262 00 00 00', theme: {}, secret: 'excluded' } as never);
  return { from, calls, rpc };
}
beforeEach(() => jest.clearAllMocks());

test('une autre persona ou une fiche d’autrui est refusée avant toute lecture service-role', async () => {
  for (const [fiches, error] of [[null, { code: '42501' }], [[{ id: 'OBJ-A' }], null]]) {
    const spies = setup(fiches, error);
    expect((await GET(req('OBJ-B'))).status).toBe(403);
    expect(spies.from).not.toHaveBeenCalled(); expect(readOfficeIdentity).not.toHaveBeenCalled();
  }
});

test('retourne uniquement la marque et les canaux publics de l’office publisher de la fiche autorisée', async () => {
  const spies = setup([{ id: 'OBJ-A', office_email: 'fallback@other-office.test', office_phone: '0262 11 11 11' }]);
  const response = await GET(req('OBJ-A'));
  expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({ office: { id: 'ORG-A', name: 'Office A', logoUrl: 'https://office.test/logo.png', email: 'contact@office.test', phone: '0262 00 00 00' } });
  expect(callerClient).toHaveBeenCalledWith('actor-jwt');
  expect(spies.calls).toContainEqual(['object_org_link', 'object_id', ['OBJ-A']]);
  expect(spies.calls).toContainEqual(['object_org_link', 'role_id', 'PUB']);
});

test('un accueil multi-office ne choisit pas la marque du premier office', async () => {
  setup([{ id: 'OBJ-A' }, { id: 'OBJ-B' }], null, [
    { object_id: 'OBJ-A', org_object_id: 'ORG-A' }, { object_id: 'OBJ-B', org_object_id: 'ORG-B' },
  ]);
  const response = await GET(req());
  expect(await response.json()).toEqual({ office: null }); expect(readOfficeIdentity).not.toHaveBeenCalled();
});
