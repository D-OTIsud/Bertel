import { buildActivityFacts } from './activity-facts';

describe('buildActivityFacts', () => {
  it('renvoie vide sans données d’activité', () => {
    expect(buildActivityFacts({})).toEqual([]);
    expect(buildActivityFacts({ activity: {} })).toEqual([]);
  });

  it('projette les faits présents (durée, participants, âge, niveau, encadrement, équipement)', () => {
    const facts = buildActivityFacts({
      activity: {
        duration_min: '90',
        min_participants: '2',
        max_participants: '8',
        min_age: '12',
        difficulty_level: 'Intermédiaire',
        guide_required: true,
        equipment_provided: 'Casque et baudrier',
      },
    });
    const byLabel = Object.fromEntries(facts.map((f) => [f.label, f.value]));
    expect(byLabel['Durée']).toBe('90 min');
    expect(byLabel['Participants']).toBe('de 2 à 8');
    expect(byLabel['Âge minimum']).toBe('12 ans');
    expect(byLabel['Niveau']).toBe('Intermédiaire');
    expect(byLabel['Encadrement']).toMatch(/guide|encadr/i);
    expect(byLabel['Équipement fourni']).toBe('Casque et baudrier');
  });

  it('omet l’encadrement quand non requis et gère un seul bornage de participants', () => {
    const facts = buildActivityFacts({ activity: { min_participants: '4', guide_required: false } });
    expect(facts.find((f) => f.label === 'Encadrement')).toBeUndefined();
    expect(facts.find((f) => f.label === 'Participants')?.value).toBe('à partir de 4');
  });
});
