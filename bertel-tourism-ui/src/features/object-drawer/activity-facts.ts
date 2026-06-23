/**
 * Projection d'AFFICHAGE des faits d'une activité encadrée (ASC/ACT) pour le
 * drawer public (impl. 4.3). Pure. Lit `raw.activity` (object_act, émis par
 * get_object_resource §101 : duration_min, participants, min_age, difficulty,
 * guide_required, equipment_provided). Ne projette que les champs présents —
 * aucune donnée fabriquée.
 */
export interface ActivityFact {
  label: string;
  value: string;
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function bool(value: unknown): boolean {
  return value === true || value === 'true' || value === 't';
}

export function buildActivityFacts(raw: Record<string, unknown>): ActivityFact[] {
  const activity = (typeof raw.activity === 'object' && raw.activity !== null)
    ? (raw.activity as Record<string, unknown>)
    : {};
  const facts: ActivityFact[] = [];

  const duration = str(activity.duration_min);
  if (duration) {
    facts.push({ label: 'Durée', value: `${duration} min` });
  }

  const minP = str(activity.min_participants);
  const maxP = str(activity.max_participants);
  if (minP && maxP) {
    facts.push({ label: 'Participants', value: `de ${minP} à ${maxP}` });
  } else if (minP) {
    facts.push({ label: 'Participants', value: `à partir de ${minP}` });
  } else if (maxP) {
    facts.push({ label: 'Participants', value: `jusqu’à ${maxP}` });
  }

  const age = str(activity.min_age);
  if (age) {
    facts.push({ label: 'Âge minimum', value: `${age} ans` });
  }

  const difficulty = str(activity.difficulty_level);
  if (difficulty) {
    facts.push({ label: 'Niveau', value: difficulty });
  }

  if (bool(activity.guide_required)) {
    facts.push({ label: 'Encadrement', value: 'Encadré (guide requis)' });
  }

  const equipment = str(activity.equipment_provided);
  if (equipment) {
    facts.push({ label: 'Équipement fourni', value: equipment });
  }

  return facts;
}
