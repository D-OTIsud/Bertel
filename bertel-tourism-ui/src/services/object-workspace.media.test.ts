import type { ObjectWorkspaceMediaItem, ObjectWorkspaceMediaModule } from './object-workspace-parser';

jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({
  useSessionStore: { getState: () => ({ demoMode: false }) },
}));

import { getSupabaseClient } from '../lib/supabase';
import {
  getObjectWorkspaceMediaModule,
  normalizeWorkspaceMediaItem,
  saveObjectWorkspaceMedia,
} from './object-workspace';
import { parseWorkspaceMediaItem } from './object-workspace-parser';

const mockGetClient = getSupabaseClient as jest.Mock;

function mediaItem(over: Partial<ObjectWorkspaceMediaItem> = {}): ObjectWorkspaceMediaItem {
  return {
    id: 'm1',
    scope: 'object',
    placeId: null,
    scopeLabel: 'Objet principal',
    typeId: 't1',
    typeCode: 'image',
    typeLabel: 'Image',
    title: 'Façade',
    titleTranslations: {},
    description: '',
    descriptionTranslations: {},
    url: 'https://x/y.jpg',
    credit: '',
    visibility: '',
    position: '0',
    width: '',
    height: '',
    rightsExpiresAt: '',
    kind: '',
    isMain: true,
    isPublished: true,
    tags: ['prefere'],
    ...over,
  };
}

function mediaModule(
  items: ObjectWorkspaceMediaItem[],
  over: Partial<ObjectWorkspaceMediaModule> = {},
): ObjectWorkspaceMediaModule {
  return {
    typeOptions: [{ id: 't1', code: 'image', label: 'Image' }],
    tagOptions: [],
    objectItems: items,
    placeItems: [],
    placeScopeUnavailableReason: null,
    unavailableReason: null,
    ...over,
  };
}

type WriteCall = { table: string; method: 'update' | 'insert' | 'delete'; payload?: Record<string, unknown> };

/**
 * Minimal chainable/thenable PostgREST builder. Records every write so tests can
 * assert what actually goes over the wire (visibility widening, media_tag churn).
 */
function makeMockClient(opts: { existingMediaIds?: string[]; failObjectMediaSelect?: boolean } = {}) {
  const writes: WriteCall[] = [];
  const tablesTouched = new Set<string>();

  function from(table: string) {
    tablesTouched.add(table);
    const ctx: {
      action: 'select' | 'update' | 'insert' | 'delete';
      payload?: Record<string, unknown>;
      filters: Record<string, unknown>;
      single?: boolean;
    } = { action: 'select', filters: {} };

    const respond = () => {
      if (ctx.action === 'select') {
        if (table === 'ref_code' && ctx.filters.domain === 'media_type') {
          return { data: [{ id: 't1', code: 'image', name: 'Image' }], error: null };
        }
        if (table === 'ref_code' && ctx.filters.domain === 'media_tag') {
          return { data: [{ id: 'tag1', code: 'prefere', name: 'Préféré' }], error: null };
        }
        if (table === 'media' && 'object_id' in ctx.filters) {
          if (opts.failObjectMediaSelect) {
            return { data: null, error: { message: 'boom' } };
          }
          return { data: (opts.existingMediaIds ?? []).map((id) => ({ id })), error: null };
        }
        return { data: [], error: null };
      }
      if (ctx.action === 'insert' && ctx.single) {
        return { data: { id: 'inserted-1' }, error: null };
      }
      return { data: null, error: null };
    };

    const b: Record<string, unknown> = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        ctx.filters[col] = val;
        return b;
      },
      in: (col: string, val: unknown) => {
        ctx.filters[col] = val;
        return b;
      },
      order: () => b,
      single: () => {
        ctx.single = true;
        return b;
      },
      update: (payload: Record<string, unknown>) => {
        ctx.action = 'update';
        ctx.payload = payload;
        writes.push({ table, method: 'update', payload });
        return b;
      },
      insert: (payload: Record<string, unknown>) => {
        ctx.action = 'insert';
        ctx.payload = payload;
        writes.push({ table, method: 'insert', payload });
        return b;
      },
      delete: () => {
        ctx.action = 'delete';
        writes.push({ table, method: 'delete' });
        return b;
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(respond()).then(resolve, reject),
    };
    return b;
  }

  return { client: { from }, writes, tablesTouched };
}

afterEach(() => {
  mockGetClient.mockReset();
});

/**
 * §05 Médias — the NULL-visibility contract (§04 descriptions fix class):
 * a DB NULL visibility means "extended-scope only" under the 8t read gate;
 * the editor must never silently widen it to 'public'.
 */
describe('media visibility NULL handling', () => {
  it('loader normalization keeps a NULL DB visibility as empty (not public)', () => {
    const item = normalizeWorkspaceMediaItem({
      row: { id: 'm1', visibility: null },
      typeById: new Map(),
      tagsByMediaId: new Map(),
      placeLabelById: new Map(),
    });
    expect(item.visibility).toBe('');
  });

  it('loader normalization preserves an explicit visibility value', () => {
    const item = normalizeWorkspaceMediaItem({
      row: { id: 'm1', visibility: 'partners' },
      typeById: new Map(),
      tagsByMediaId: new Map(),
      placeLabelById: new Map(),
    });
    expect(item.visibility).toBe('partners');
  });

  it('RPC parser keeps a NULL visibility as empty (not public)', () => {
    const item = parseWorkspaceMediaItem({
      record: { id: 'm1' },
      index: 0,
      scope: 'object',
      scopeLabel: 'Objet principal',
    });
    expect(item.visibility).toBe('');
  });

  it('UPDATE preserves an undefined visibility as NULL instead of widening to public', async () => {
    const { client, writes } = makeMockClient({ existingMediaIds: ['m1'] });
    mockGetClient.mockReturnValue(client);

    await saveObjectWorkspaceMedia('o1', mediaModule([mediaItem({ visibility: '' })]), { canEditPlaceMedia: false });

    const itemUpdate = writes.find(
      (w) => w.table === 'media' && w.method === 'update' && w.payload != null && 'visibility' in w.payload,
    );
    expect(itemUpdate).toBeDefined();
    expect(itemUpdate?.payload?.visibility).toBeNull();
  });

  it('UPDATE persists an explicit visibility choice', async () => {
    const { client, writes } = makeMockClient({ existingMediaIds: ['m1'] });
    mockGetClient.mockReturnValue(client);

    await saveObjectWorkspaceMedia('o1', mediaModule([mediaItem({ visibility: 'private' })]), {
      canEditPlaceMedia: false,
    });

    const itemUpdate = writes.find(
      (w) => w.table === 'media' && w.method === 'update' && w.payload != null && 'visibility' in w.payload,
    );
    expect(itemUpdate?.payload?.visibility).toBe('private');
  });

  it('INSERT defaults a missing visibility to public (editor-authored rows are public by design)', async () => {
    const { client, writes } = makeMockClient({ existingMediaIds: [] });
    mockGetClient.mockReturnValue(client);

    await saveObjectWorkspaceMedia(
      'o1',
      mediaModule([mediaItem({ id: 'draft-media-1', visibility: '' })]),
      { canEditPlaceMedia: false },
    );

    const insert = writes.find((w) => w.table === 'media' && w.method === 'insert');
    expect(insert).toBeDefined();
    expect(insert?.payload?.visibility).toBe('public');
  });
});

/**
 * media_tag is dead machinery (0 links live, no tag UI, no live consumer):
 * the saver must not churn delete+reinsert on every save — a partial tag load
 * would otherwise wipe links (R2).
 */
describe('media_tag write removal', () => {
  it('never touches media_tag during a save', async () => {
    const { client, tablesTouched } = makeMockClient({ existingMediaIds: ['m1'] });
    mockGetClient.mockReturnValue(client);

    await saveObjectWorkspaceMedia('o1', mediaModule([mediaItem({ tags: ['prefere'] })]), {
      canEditPlaceMedia: false,
    });

    expect(tablesTouched.has('media_tag')).toBe(false);
  });
});

/**
 * R1 no-clobber guard (§28/§40 precedent): a failed media load must surface an
 * unavailableReason; the saver must refuse to reconcile against an empty list
 * born from that failure (the delete reconcile would wipe every media row).
 */
describe('media load-failure no-clobber guard', () => {
  it('loader sets unavailableReason and empties items when the object media select fails', async () => {
    const { client } = makeMockClient({ failObjectMediaSelect: true });
    mockGetClient.mockReturnValue(client);

    const moduleResult = await getObjectWorkspaceMediaModule('o1', mediaModule([mediaItem()]), new Map());

    expect(moduleResult.unavailableReason).toBeTruthy();
    expect(moduleResult.objectItems).toEqual([]);
  });

  it('loader leaves unavailableReason null on a successful load', async () => {
    const { client } = makeMockClient({ existingMediaIds: [] });
    mockGetClient.mockReturnValue(client);

    const moduleResult = await getObjectWorkspaceMediaModule('o1', mediaModule([]), new Map());

    expect(moduleResult.unavailableReason).toBeNull();
  });

  it('saver throws the unavailableReason before writing anything', async () => {
    const { client, writes } = makeMockClient({ existingMediaIds: ['m1'] });
    mockGetClient.mockReturnValue(client);

    await expect(
      saveObjectWorkspaceMedia(
        'o1',
        mediaModule([], { unavailableReason: 'Lecture des médias indisponible.' }),
        { canEditPlaceMedia: false },
      ),
    ).rejects.toThrow('Lecture des médias indisponible.');

    expect(writes).toHaveLength(0);
  });
});
