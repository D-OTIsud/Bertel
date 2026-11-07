import { buildActivityFacts } from './activity-facts';

function byLabel(raw: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(buildActivityFacts(raw).map((f) => [f.label, f.value]));
}

describe('buildActivityFacts', () => {
  it('renvoie vide sans données d’activité', () => {
    expect(buildActivityFacts({})).toEqual([]);
    expect(buildActivityFacts({ activity: {} })).toEqual([]);
  });

  it('projette les faits présents (schéma réel)', () => {
    const map = byLabel({
      activity: {
        duration_min: 90,
        difficulty_level: 3,
        min_participants: 2,
        max_participants: 8,
        min_age: 12,
        guide_required: true,
        equipment_provided: true,
        equipment_provided_details: 'Casque et baudrier',
      },
    });
    expect(map['Durée']).toBe('90 min');
    expect(map['Niveau']).toBe('Niveau 3/5');
    expect(map['Participants']).toBe('De 2 à 8 personnes');
    expect(map['Âge minimum']).toBe('12 ans');
    expect(map['Encadrement']).toBe('Guide requis');
    expect(map['Équipement fourni']).toBe('Casque et baudrier');
  });

  it('respecte l’ordre PLAN 4.2 (durée, niveau, participants, âge, guide, équipement)', () => {
    const labels = buildActivityFacts({
      activity: {
        duration_min: 60,
        difficulty_level: 2,
        min_participants: 1,
        min_age: 8,
        guide_required: false,
        equipment_provided: false,
      },
    }).map((f) => f.label);
    expect(labels).toEqual(['Durée', 'Niveau', 'Participants', 'Âge minimum', 'Encadrement', 'Équipement fourni']);
  });

  it('guide_required: true => « Guide requis »', () => {
    expect(byLabel({ activity: { guide_required: true } })['Encadrement']).toBe('Guide requis');
  });

  it('guide_required: false => « Sans guide obligatoire »', () => {
    expect(byLabel({ activity: { guide_required: false } })['Encadrement']).toBe('Sans guide obligatoire');
  });

  it('guide absent => omis', () => {
    expect(byLabel({ activity: {} })['Encadrement']).toBeUndefined();
  });

  it('equipment_provided: true sans détails => « Fourni »', () => {
    expect(byLabel({ activity: { equipment_provided: true } })['Équipement fourni']).toBe('Fourni');
  });

  it('equipment_provided: false => « Non fourni »', () => {
    expect(byLabel({ activity: { equipment_provided: false } })['Équipement fourni']).toBe('Non fourni');
  });

  it('equipment_provided chaîne legacy préservée', () => {
    expect(byLabel({ activity: { equipment_provided: 'Prêt de raquettes' } })['Équipement fourni']).toBe('Prêt de raquettes');
  });

  it('equipment absent => omis', () => {
    expect(byLabel({ activity: {} })['Équipement fourni']).toBeUndefined();
  });

  it('difficulté numérique 1 et 5 => « Niveau n/5 »', () => {
    expect(byLabel({ activity: { difficulty_level: 1 } })['Niveau']).toBe('Niveau 1/5');
    expect(byLabel({ activity: { difficulty_level: 5 } })['Niveau']).toBe('Niveau 5/5');
    expect(byLabel({ activity: { difficulty_level: '4' } })['Niveau']).toBe('Niveau 4/5');
  });

  it('difficulté legacy (chaîne) préservée, hors-borne numérique omise', () => {
    expect(byLabel({ activity: { difficulty_level: 'Intermédiaire' } })['Niveau']).toBe('Intermédiaire');
    expect(byLabel({ activity: { difficulty_level: 7 } })['Niveau']).toBeUndefined();
  });

  it('durée <= 0 omise', () => {
    expect(byLabel({ activity: { duration_min: 0 } })['Durée']).toBeUndefined();
    expect(byLabel({ activity: { duration_min: -5 } })['Durée']).toBeUndefined();
  });

  it('âge minimum négatif omis', () => {
    expect(byLabel({ activity: { min_age: -1 } })['Âge minimum']).toBeUndefined();
    expect(byLabel({ activity: { min_age: 0 } })['Âge minimum']).toBe('0 ans');
  });

  it('participants : bornage unique', () => {
    expect(byLabel({ activity: { min_participants: 4 } })['Participants']).toBe('À partir de 4 personnes');
    expect(byLabel({ activity: { max_participants: 20 } })['Participants']).toBe('Jusqu’à 20 personnes');
  });
});
