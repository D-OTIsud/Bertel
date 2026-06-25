import { formatExplorerCardAddress, normalizeExplorerCard, tagChipStyle } from './explorer-card';

function parseHsl(value: string): { h: number; s: number; l: number } {
  const m = value.match(/^hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)$/);
  if (!m) {
    throw new Error(`expected an hsl() string, got: ${value}`);
  }
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

// tagChipStyle renders the house "soft chip" (pale same-hue tint bg + dark same-hue text), mirroring
// the Explorer category chips (bg-*-soft / text-*-2) and the --teal-soft / --teal-2 tokens — NOT a
// loud, fully-saturated solid fill. Derived purely from the stored hex so every tag is calmed with
// no data migration.
describe('tagChipStyle (soft house chip)', () => {
  it('renders a vivid hex as a pale same-hue tint + dark same-hue text, not a loud solid fill', () => {
    const style = tagChipStyle('#14b8a6'); // flashy teal-500
    const bg = parseHsl(style.backgroundColor);
    const text = parseHsl(style.color);
    // A light tint background + dark text => large lightness contrast (legible on any card surface).
    expect(bg.l).toBeGreaterThanOrEqual(90);
    expect(text.l).toBeLessThanOrEqual(36);
    // bg + text share the same hue family (within rounding) so the chip reads as one color.
    expect(Math.abs(bg.h - text.h)).toBeLessThanOrEqual(1);
    // Still legibly colored, not washed to gray.
    expect(bg.s).toBeGreaterThanOrEqual(22);
  });

  it('keeps the neutral slate default calm and low-chroma (reads as a soft gray, not blue)', () => {
    const bg = parseHsl(tagChipStyle('#64748b').backgroundColor);
    expect(bg.l).toBeGreaterThanOrEqual(90);
    expect(bg.s).toBeLessThanOrEqual(14);
  });

  it('falls back to the slate hue family for an invalid hex', () => {
    expect(tagChipStyle('not-a-hex')).toEqual(tagChipStyle('#64748b'));
  });
});

describe('formatExplorerCardAddress', () => {
  it('removes duplicate legacy city, postcode, and lieu-dit suffixes', () => {
    expect(
      formatExplorerCardAddress({
        address: '27 Impasse des Manguiers, 97414 Entre-Deux - centre ville, centre ville, 97414, Entre-Deux',
        city: 'Entre-Deux',
        postcode: '97414',
        lieu_dit: 'centre ville',
      }),
    ).toBe('27 Impasse des Manguiers, centre ville, 97414 Entre-Deux');
  });

  it('keeps structured location context when the street line is bare', () => {
    expect(
      formatExplorerCardAddress({
        address: '27 Impasse des Manguiers, centre ville, 97414, Entre-Deux',
        city: 'Entre-Deux',
        postcode: '97414',
        lieu_dit: 'centre ville',
      }),
    ).toBe('27 Impasse des Manguiers, centre ville, 97414 Entre-Deux');
  });

  it('preserves demo-style city suffixes', () => {
    expect(formatExplorerCardAddress({ address: 'Front de mer, Saint-Pierre', city: 'Saint-Pierre' })).toBe(
      'Front de mer, Saint-Pierre',
    );
  });
});

describe('normalizeExplorerCard', () => {
  it('keeps the neutral blend to classifications + labels and drops environment/pet/accessibility', () => {
    const card = normalizeExplorerCard({
      id: 'obj-1',
      name: 'Chez Frida',
      type: 'HLO',
      labels: ['Clevacances'],
      tags: [{ slug: 'vue-mer', name: 'Vue mer', color: '#0ea5e9' }],
      badges: [
        { kind: 'quality_label', code: 'qtir', label: 'Qualite Tourisme' },
        { kind: 'classification', code: '3-stars', label: 'Classement meubles · 3 étoiles' },
        { kind: 'accessibility_amenity', code: 'acc-pmr-parking', label: 'Places PMR' },
      ],
      environment_tags: [{ code: 'rural', name: 'Milieu rural' }],
      taxonomy: [{ domain: 'hebergement', code: 'gite', name: 'Gite' }],
      amenity_codes: ['pet_friendly', 'acc_pmr_parking'],
    });

    // The neutral line keeps ONLY classifications + labels (decision 2026-06-16): the quality label
    // and the classement, then the card.labels field. §09 tags move to tagChips.
    expect(card.labels).toEqual(['Qualite Tourisme', '3 étoiles', 'Clevacances']);
    // Dropped from the line: environment/ambiance tags, accessibility amenities, the pet-friendly +
    // accessibility synthetic chips, and the taxonomy ('Gite', shown on the metadata line).
    expect(card.labels).not.toContain('Milieu rural');
    expect(card.labels).not.toContain('Places PMR');
    expect(card.labels).not.toContain('Animaux acceptes');
    expect(card.labels).not.toContain('Accessibilite');
    expect(card.labels).not.toContain('Gite');
    expect(card.tagChips).toEqual([{ label: 'Vue mer', color: '#0ea5e9', slug: 'vue-mer' }]);
  });

  it('carries the per-tag hex (default for invalid), preserves order, and cross-dedupes vs labels + taxonomy', () => {
    const card = normalizeExplorerCard({
      id: 'obj-2',
      name: 'Order test',
      type: 'HLO',
      // Order here = tag_link.position from the RPC; preserved as-is.
      tags: [
        { slug: 'zebra', name: 'Zebra', color: '#111111' },
        { slug: 'alpha', name: 'Alpha', color: 'not-a-hex' }, // invalid -> default slate
        { slug: 'gite', name: 'Gite' }, // collides with the taxonomy label -> cross-deduped out
      ],
      taxonomy: [{ domain: 'hebergement', code: 'gite', name: 'Gite' }],
    });

    expect(card.tagChips).toEqual([
      { label: 'Zebra', color: '#111111', slug: 'zebra' },
      { label: 'Alpha', color: '#64748b', slug: 'alpha' },
    ]);
    // The 'gite' tag is deduped out (it matches the taxonomy shown on the meta line); the taxonomy
    // itself is NOT a label chip.
    expect(card.labels).not.toContain('Gite');
    expect(card.labels).not.toContain('Zebra');
  });

  it('strips a "· Obtenu" status / "· Titulaire X" repeat from label pills, keeps grades + types', () => {
    const card = normalizeExplorerCard({
      id: 'obj-labels',
      name: 'Labels',
      type: 'HOT',
      badges: [
        { kind: 'classification', code: 'qtir:obtenu', label: 'Qualité Tourisme Île de La Réunion · Obtenu' },
        { kind: 'classification', code: 'hotel:4', label: 'Classement hôtelier · 4 étoiles' },
        { kind: 'classification', code: 'tables:gastro', label: 'Tables & Auberges de France · Gastronomique' },
        { kind: 'sustainability_label', code: 'clef:titulaire', label: 'Clef Verte · Titulaire Clef Verte' },
      ],
    });

    // Binary granted status dropped → name only.
    expect(card.labels).toContain('Qualité Tourisme Île de La Réunion');
    expect(card.labels).not.toContain('Qualité Tourisme Île de La Réunion · Obtenu');
    // "Titulaire X" repeat dropped → scheme name only.
    expect(card.labels).toContain('Clef Verte');
    expect(card.labels).not.toContain('Clef Verte · Titulaire Clef Verte');
    // Graded classement kept (shortened) and a real typed value kept as-is.
    expect(card.labels).toContain('4 étoiles');
    expect(card.labels).toContain('Tables & Auberges de France · Gastronomique');
  });

  it('drops the redundant rating-unit parenthetical from a graded scheme name', () => {
    const card = normalizeExplorerCard({
      id: 'obj-units',
      name: 'Gîte',
      type: 'HLO',
      badges: [
        { kind: 'classification', code: 'gites:3', label: 'Gîtes de France (épis) · 3 épis' },
        { kind: 'classification', code: 'cleva:2', label: 'Clévacances (clés) · 2 clés' },
      ],
    });

    // The "(épis)" / "(clés)" only repeats the unit already in the graded value → stripped.
    expect(card.labels).toContain('Gîtes de France · 3 épis');
    expect(card.labels).toContain('Clévacances · 2 clés');
    expect(card.labels).not.toContain('Gîtes de France (épis) · 3 épis');
    expect(card.labels).not.toContain('Clévacances (clés) · 2 clés');
  });

  it('preserves ranked label metadata and surfaces match distinction pills', () => {
    const certified = normalizeExplorerCard({
      id: 'obj-certified',
      name: 'Hotel certifie',
      type: 'HOT',
      label_match: {
        scheme_code: 'LBL_TOURISME_HANDICAP',
        rank: 0,
        source: 'certified_label',
        evidence_count: 1,
      },
    });
    const evidenceOnly = normalizeExplorerCard({
      id: 'obj-evidence',
      name: 'Hotel accessible',
      type: 'HOT',
      label_match: {
        scheme_code: 'LBL_TOURISME_HANDICAP',
        rank: 1,
        source: 'accessibility_amenity',
        evidence_count: 2,
      },
    });

    expect(certified.label_match?.rank).toBe(0);
    expect(certified.labels).toContain('Label certifié');
    expect(evidenceOnly.label_match?.rank).toBe(1);
    expect(evidenceOnly.labels).toContain('Équipements compatibles');
  });
});
