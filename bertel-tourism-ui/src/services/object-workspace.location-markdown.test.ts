import { parseMainLocation } from './object-workspace-parser';

const RAW = 'Prenez la **D3** puis suivez les *panneaux*';

describe('§110 direction Markdown round-trip', () => {
  it('loads RAW Markdown from direction_md, not the stripped flat key', () => {
    const raw = { address: { direction: 'Prenez la D3 puis suivez les panneaux', direction_md: RAW, is_main_location: true } };
    const main = parseMainLocation(raw as Record<string, unknown>);
    expect(main.direction).toBe(RAW);
  });

  it('falls back to direction when no _md sibling is present (legacy/plain rows)', () => {
    const main = parseMainLocation({ address: { direction: 'Plain text only', is_main_location: true } } as Record<string, unknown>);
    expect(main.direction).toBe('Plain text only');
  });
});
