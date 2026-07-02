import {
  humanizeCode,
  resolveArchetype,
  resolveArchetypeAccentClass,
  resolveRoleLabel,
  resolveSchemeLabel,
  resolveTypeLabel,
  buildExplorerTypeFamilies,
} from './labels';
import { TYPE_ARCHETYPES } from '../features/object-editor/archetypes';

describe('humanizeCode', () => {
  it('transforme un code SNAKE/KEBAB en libellé lisible', () => {
    expect(humanizeCode('TYPE_BLOCK')).toBe('Type block');
    expect(humanizeCode('eco-label')).toBe('Eco label');
  });
  it('renvoie une chaîne vide pour une entrée vide', () => {
    expect(humanizeCode('')).toBe('');
    expect(humanizeCode(null)).toBe('');
  });
});

describe('resolveTypeLabel', () => {
  it('résout les codes de type DB en libellés FR', () => {
    expect(resolveTypeLabel('HOT')).toBe('Hôtel');
    expect(resolveTypeLabel('RES')).toBe('Restaurant');
    expect(resolveTypeLabel('LOI')).toBe('Loisir');
    expect(resolveTypeLabel('act')).toBe('Activité encadrée'); // insensible à la casse
  });
  it('humanise un code inconnu plutôt que de l’afficher brut', () => {
    expect(resolveTypeLabel('UNKNOWN_TYPE')).toBe('Unknown type');
  });
});

describe('resolveArchetype', () => {
  it('mappe chaque type vers son archétype canonique', () => {
    expect(resolveArchetype('LOI')).toBe('VIS'); // corrigé : était mal bucketé en ACT
    expect(resolveArchetype('ASC')).toBe('ASC');
    expect(resolveArchetype('ACT')).toBe('ASC');
    expect(resolveArchetype('VIL')).toBe('SRV'); // corrigé : était mal bucketé en VIS
    expect(resolveArchetype('FMA')).toBe('FMA');
  });
  it('renvoie null pour ORG (non mappé) et les inconnus', () => {
    expect(resolveArchetype('ORG')).toBeNull();
    expect(resolveArchetype('ZZZ')).toBeNull();
  });
});

describe('resolveArchetypeAccentClass', () => {
  it('renvoie la classe accent acc-<archétype> (même couleur sur les 3 surfaces)', () => {
    expect(resolveArchetypeAccentClass('HOT')).toBe('acc-heb');
    expect(resolveArchetypeAccentClass('RES')).toBe('acc-res');
    expect(resolveArchetypeAccentClass('LOI')).toBe('acc-vis');
    expect(resolveArchetypeAccentClass('FMA')).toBe('acc-fma');
  });
  it('renvoie une chaîne vide pour un type sans archétype', () => {
    expect(resolveArchetypeAccentClass('ORG')).toBe('');
  });
});

describe('resolveRoleLabel', () => {
  it('utilise le catalogue fourni en priorité', () => {
    expect(resolveRoleLabel('publisher', { publisher: 'Éditeur SIT' })).toBe('Éditeur SIT');
  });
  it('humanise le code à défaut de catalogue', () => {
    expect(resolveRoleLabel('org_admin')).toBe('Org admin');
  });
});

describe('resolveSchemeLabel', () => {
  it('résout les schémas de label V5 connus', () => {
    expect(resolveSchemeLabel('LBL_CLEF_VERTE')).toBe('Clef Verte');
    expect(resolveSchemeLabel('LBL_TOURISME_HANDICAP')).toBe('Tourisme & Handicap');
  });
  it('résout aussi les codes de classement historiques (live)', () => {
    expect(resolveSchemeLabel('hot_stars')).toBe('Classement hôtelier');
    expect(resolveSchemeLabel('green_key')).toBe('Clef Verte');
  });
  it('humanise un schéma inconnu', () => {
    expect(resolveSchemeLabel('STARS_HOTEL')).toBe('Stars hotel');
  });
});

describe('buildExplorerTypeFamilies (taxonomie unique, alignée sur les archétypes)', () => {
  const families = buildExplorerTypeFamilies();

  it('aligne les familles de bucket sur les archétypes (fin du désaccord §2a)', () => {
    expect(families.ACT).toEqual(['ASC', 'ACT']);
    expect(families.VIS).toEqual(['LOI', 'PCU', 'PNA', 'PRD']);
    expect(families.SRV).toEqual(['PSV', 'VIL', 'COM', 'SPU']);
    expect(families.HOT).toEqual(['HOT', 'HPA', 'HLO', 'CAMP', 'RVA']);
    expect(families.EVT).toEqual(['FMA']);
  });

  it('INVARIANT : le bucket Explorer de chaque type correspond à son archétype', () => {
    const BUCKET_FOR_ARCHETYPE: Record<string, string> = {
      HEB: 'HOT', RES: 'RES', ASC: 'ACT', ITI: 'ITI', FMA: 'EVT', VIS: 'VIS', SRV: 'SRV',
    };
    for (const [type, meta] of Object.entries(TYPE_ARCHETYPES)) {
      const expectedBucket = BUCKET_FOR_ARCHETYPE[meta.archetype];
      expect(families[expectedBucket as keyof typeof families]).toContain(type);
    }
  });
});
