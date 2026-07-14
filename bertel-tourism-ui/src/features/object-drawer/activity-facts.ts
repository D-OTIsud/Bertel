/**
 * Projection d'AFFICHAGE des faits d'une activité encadrée (ASC/ACT) pour le
 * drawer public (PLAN 3.2). Pure. Lit `raw.activity` (object_act, émis par
 * get_object_resource). Supporte le schéma réel (booléens `guide_required` /
 * `equipment_provided` + `equipment_provided_details`) ET les payloads legacy
 * (chaîne libre). Ne projette que les champs présents et valides — aucune
 * donnée fabriquée. Ordre PLAN 4.2 : durée, niveau, participants, âge, guide,
 * équipement.
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

/** Nombre fini depuis un number ou une chaîne numérique, sinon null. */
function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || Number.isNaN(Number(trimmed))) return null;
    return Number(trimmed);
  }
  return null;
}

/** Booléen tri-état : true / false / null (absent ou chaîne legacy non booléenne). */
function triBool(value: unknown): boolean | null {
  if (value === true || value === 'true' || value === 't') return true;
  if (value === false || value === 'false' || value === 'f') return false;
  return null;
}

export function buildActivityFacts(raw: Record<string, unknown>): ActivityFact[] {
  const activity = (typeof raw.activity === 'object' && raw.activity !== null)
    ? (raw.activity as Record<string, unknown>)
    : {};
  const facts: ActivityFact[] = [];

  // 1) Durée — uniquement si > 0.
  const duration = num(activity.duration_min);
  if (duration !== null && duration > 0) {
    facts.push({ label: 'Durée', value: `${duration} min` });
  }

  // 2) Niveau — nombre 1..5 => « Niveau n/5 », sinon chaîne legacy préservée.
  const difficultyNum = num(activity.difficulty_level);
  if (difficultyNum !== null && difficultyNum >= 1 && difficultyNum <= 5) {
    facts.push({ label: 'Niveau', value: `Niveau ${difficultyNum}/5` });
  } else if (difficultyNum === null) {
    const difficulty = str(activity.difficulty_level);
    if (difficulty) facts.push({ label: 'Niveau', value: difficulty });
  }

  // 3) Participants.
  const minP = num(activity.min_participants);
  const maxP = num(activity.max_participants);
  if (minP !== null && maxP !== null) {
    facts.push({ label: 'Participants', value: `De ${minP} à ${maxP} personnes` });
  } else if (minP !== null) {
    facts.push({ label: 'Participants', value: `À partir de ${minP} personnes` });
  } else if (maxP !== null) {
    facts.push({ label: 'Participants', value: `Jusqu’à ${maxP} personnes` });
  }

  // 4) Âge minimum — uniquement pour un nombre >= 0.
  const age = num(activity.min_age);
  if (age !== null && age >= 0) {
    facts.push({ label: 'Âge minimum', value: `${age} ans` });
  }

  // 5) Encadrement — booléen tri-état ; absent => omis.
  const guide = triBool(activity.guide_required);
  if (guide === true) {
    facts.push({ label: 'Encadrement', value: 'Guide requis' });
  } else if (guide === false) {
    facts.push({ label: 'Encadrement', value: 'Sans guide obligatoire' });
  }

  // 6) Équipement fourni — booléen tri-état (détails surchargent « Fourni »),
  //    chaîne legacy préservée, absent => omis.
  const equipment = triBool(activity.equipment_provided);
  if (equipment === true) {
    const details = str(activity.equipment_provided_details);
    facts.push({ label: 'Équipement fourni', value: details || 'Fourni' });
  } else if (equipment === false) {
    facts.push({ label: 'Équipement fourni', value: 'Non fourni' });
  } else {
    const legacy = str(activity.equipment_provided);
    if (legacy) facts.push({ label: 'Équipement fourni', value: legacy });
  }

  return facts;
}
