import { cardTypeDisplay, cardClassementRating, cardLabelLogos } from './explorer-card-display';
import type { ObjectCard } from '../types/domain';

function card(partial: Partial<ObjectCard>): ObjectCard {
  return { id: '1', type: 'HOT', name: 'X', ...partial };
}

describe('cardTypeDisplay', () => {
  it('rend le libellé de type FR + la classe accent de l’archétype', () => {
    const d = cardTypeDisplay(card({ type: 'PNA' }));
    expect(d.typeLabel).toBe('Site naturel');
    expect(d.accentClass).toBe('acc-vis');
    expect(d.archetype).toBe('VIS');
  });
  it('ne porte plus de porte « pastille ouvert » par type (pilotée par la donnée open_now, §128)', () => {
    // La projection d'affichage ne décide plus de la pastille : c'est open_now (tri-état) qui la pilote,
    // pour TOUS les types (cf. ResultCardView.test.tsx). Le champ showOpenStatus a été retiré du contrat.
    const d = cardTypeDisplay(card({ type: 'HOT' })) as Record<string, unknown>;
    expect('showOpenStatus' in d).toBe(false);
  });
});

describe('cardClassementRating (cocarde réservée aux HEB)', () => {
  it('extrait le nombre ET l’unité « étoile » d’un badge de classement pour un HEB', () => {
    const c = card({ type: 'HOT', badges: [{ kind: 'classification', label: '3 étoiles' }] });
    expect(cardClassementRating(c)).toEqual({ count: 3, unit: 'etoile' });
  });
  it('reconnaît l’unité « épi » (Gîtes de France) et la distingue des étoiles', () => {
    const c = card({ type: 'HLO', badges: [{ kind: 'classification', label: 'Gîtes de France · 3 épis' }] });
    expect(cardClassementRating(c)).toEqual({ count: 3, unit: 'epi' });
  });
  it('reconnaît l’unité « clé » (Clévacances)', () => {
    const c = card({ type: 'HLO', badges: [{ kind: 'classification', label: 'Clévacances · 2 clés' }] });
    expect(cardClassementRating(c)).toEqual({ count: 2, unit: 'cle' });
  });
  it('renvoie null pour un non-HEB même avec un badge étoilé', () => {
    const c = card({ type: 'RES', badges: [{ kind: 'classification', label: '2 étoiles' }] });
    expect(cardClassementRating(c)).toBeNull();
  });
  it('renvoie null quand aucun badge de classement', () => {
    expect(cardClassementRating(card({ type: 'HOT', badges: [{ kind: 'label', label: 'Clef Verte' }] }))).toBeNull();
  });
});

describe('cardLabelLogos (pastilles-logo de label)', () => {
  it('mappe les labels connus vers leur pastille colorée', () => {
    const c = card({
      type: 'HOT',
      badges: [
        { kind: 'label', label: 'Clef Verte' },
        { kind: 'label', label: 'Tourisme & Handicap' },
      ],
    });
    const logos = cardLabelLogos(c);
    expect(logos.map((l) => l.logoClass)).toEqual(['lbl-clef-verte', 'lbl-th']);
  });
  it('reconnaît aussi les labels portés par card.labels (accent-insensible)', () => {
    const logos = cardLabelLogos(card({ type: 'RES', labels: ['Qualite Tourisme'] }));
    expect(logos.map((l) => l.logoClass)).toEqual(['lbl-qualite']);
  });
  it('ignore les valeurs non-label (classement, tags)', () => {
    expect(cardLabelLogos(card({ type: 'HOT', badges: [{ kind: 'classification', label: '3 étoiles' }] }))).toEqual([]);
  });
  it('dédoublonne un label présent dans badges ET labels', () => {
    const c = card({ type: 'HOT', badges: [{ kind: 'label', label: 'Clef Verte' }], labels: ['Clef Verte'] });
    expect(cardLabelLogos(c)).toHaveLength(1);
  });
});
