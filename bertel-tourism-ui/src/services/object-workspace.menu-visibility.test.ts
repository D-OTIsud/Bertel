jest.mock('./notification-delivery', () => ({ pingNotifyDrain: jest.fn() }));
jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({ useSessionStore: { getState: () => ({ demoMode: false }) } }));

import { getSupabaseClient } from '../lib/supabase';
import { parseObjectWorkspace } from './object-workspace-parser';
import { saveObjectWorkspaceMenus } from './object-workspace';

describe('a menu with initially NULL visibility', () => {
  it.each([['', null], ['private', 'private'], ['partners', 'partners'], ['public', 'public']])(
    'saves the explicit value %p as %p while preserving an untouched NULL', async (visibility, expected) => {
      const writes: Record<string, unknown>[] = [];
      const from = jest.fn((table: string) => {
        let inserted = false;
        const chain = {
          select: () => chain, eq: () => chain, delete: () => chain,
          insert(payload: Record<string, unknown>) {
            inserted = true;
            if (table === 'object_menu') writes.push(payload);
            return chain;
          },
          single: () => chain,
          then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
            return Promise.resolve({ data: inserted ? { id: 'saved-menu' } : [], error: null }).then(resolve, reject);
          },
        };
        return chain;
      });
      (getSupabaseClient as jest.Mock).mockReturnValue({ from });
      const module = parseObjectWorkspace({ id: 'o1', name: 'Test', raw: {
        menus: [{ id: 'menu-1', name: 'Menu', visibility: null, items: [] }],
      } }, ['fr']).menus;
      expect(module.items[0].visibility).toBe('');
      expect(module.items[0].rawVisibility).toBeNull();
      module.items[0].visibility = visibility!;
      await saveObjectWorkspaceMenus('o1', module);
      expect(writes).toHaveLength(1);
      expect(writes[0].visibility).toBe(expected);
    },
  );
});
