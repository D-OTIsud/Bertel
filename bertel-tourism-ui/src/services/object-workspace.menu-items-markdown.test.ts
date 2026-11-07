import { readString } from './object-workspace-parser';

const RAW = 'Poulet **mariné** au [gingembre](https://x) et _combava_';

describe('dish description Markdown round-trip (D2 phase D)', () => {
  it('loader keeps raw Markdown (no strip on the editor leg)', () => {
    const row = { id: 'i1', menu_id: 'm1', name: 'Cari poulet', description: RAW, is_available: true };
    expect(readString(row.description)).toBe(RAW);
  });
});
