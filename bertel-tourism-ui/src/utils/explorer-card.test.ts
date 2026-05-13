import { formatExplorerCardAddress, normalizeExplorerCard } from './explorer-card';

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
  it('orders classifications, labels, tags, and service signals for card pills', () => {
    const card = normalizeExplorerCard({
      id: 'obj-1',
      name: 'Chez Frida',
      type: 'HLO',
      labels: ['Clevacances'],
      tags: [{ slug: 'vue-mer', name: 'Vue mer' }],
      badges: [
        { kind: 'quality_label', code: 'qtir', label: 'Qualite Tourisme' },
        { kind: 'classification', code: '3-stars', label: 'Classement meubles · 3 étoiles' },
        { kind: 'accessibility_amenity', code: 'acc-pmr-parking', label: 'Places PMR' },
      ],
      environment_tags: [{ code: 'rural', name: 'Milieu rural' }],
      taxonomy: [{ domain: 'hebergement', code: 'gite', name: 'Gite' }],
      amenity_codes: ['pet_friendly', 'acc_pmr_parking'],
    });

    expect(card.labels).toEqual([
      '3 étoiles',
      'Gite',
      'Clevacances',
      'Qualite Tourisme',
      'Vue mer',
      'Milieu rural',
      'Animaux acceptes',
      'Accessibilite',
    ]);
  });
});
