import { cardTypeDisplay, cardClassementStars, cardLabelLogos } from './explorer-card-display';
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
  it('affiche le statut ouvert UNIQUEMENT pour HEB et RES', () => {
    expect(cardTypeDisplay(card({ type: 'HOT' })).showOpenStatus).toBe(true);
    expect(cardTypeDisplay(card({ type: 'RES' })).showOpenStatus).toBe(true);
    expect(cardTypeDisplay(card({ type: 'ITI' })).showOpenStatus).toBe(false);
    expect(cardTypeDisplay(card({ type: 'FMA' })).showOpenStatus).toBe(false);
    expect(cardTypeDisplay(card({ type: 'PNA' })).showOpenStatus).toBe(false); // VIS
    expect(cardTypeDisplay(card({ type: 'SPU' })).showOpenStatus).toBe(false); // SRV
  });
});

describe('cardClassementStars (cocarde réservée aux HEB)', () => {
  it('extrait le nombre d’étoiles d’un badge de classement pour un HEB', () => {
    const c = card({ type: 'HOT', badges: [{ kind: 'classification', label: '3 étoiles' }] });
    expect(cardClassementStars(c)).toBe(3);
  });
  it('renvoie null pour un non-HEB même avec un badge étoilé', () => {
    const c = card({ type: 'RES', badges: [{ kind: 'classification', label: '2 étoiles' }] });
    expect(cardClassementStars(c)).toBeNull();
  });
  it('renvoie null quand aucun badge de classement', () => {
    expect(cardClassementStars(card({ type: 'HOT', badges: [{ kind: 'label', label: 'Clef Verte' }] }))).toBeNull();
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
