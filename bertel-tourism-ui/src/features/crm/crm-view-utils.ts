// Utilitaires purs du module CRM acteur-centré (§61, design v2 2026-06-11).
// Aucune dépendance service/réseau : tout est testable en isolation
// (crm-view-utils.test.ts). Les composants de vue (CrmAnnuaire, CrmActorFiche,
// CrmObjectView, CrmTaches) consomment ces helpers — ne pas dupliquer les
// mappings dans les vues.

/** Teinte d'avatar / type-tag — palette des 6 accents du design v2 (crm.css PAV_TINT). */
export interface PavTint {
  bg: string;
  fg: string;
}

export const PAV_TINTS: PavTint[] = [
  { bg: 'rgba(23, 107, 106, 0.10)', fg: '#0d4f4e' }, // teal
  { bg: 'rgba(201, 109, 59, 0.12)', fg: '#93501f' }, // orange
  { bg: 'rgba(30, 116, 145, 0.12)', fg: '#0e5872' }, // blue
  { bg: 'rgba(42, 122, 69, 0.12)', fg: '#1a5a30' }, // green
  { bg: 'rgba(108, 79, 138, 0.12)', fg: '#4d3866' }, // plum
  { bg: 'rgba(164, 83, 48, 0.12)', fg: '#7a3b20' }, // rust
];

/**
 * Teinte stable pour une clé (actor_id ou object_type) — hash djb2 % 6.
 * Le prototype mappait des classes acc-* éditoriales ; ici les entités sont
 * réelles, la teinte est donc dérivée déterministiquement de la clé.
 */
export function pavTintOf(key: string): PavTint {
  let hash = 5381;
  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash * 33) ^ key.charCodeAt(i)) >>> 0;
  }
  return PAV_TINTS[hash % PAV_TINTS.length];
}

/** Initiales d'affichage (2 premiers mots, préfixe de forme juridique ignoré). */
export function initialsOf(name: string): string {
  const initials = name
    .replace(/^(SARL|SAS|SCI|EARL|EI)\s+/i, '')
    .split(/[\s'—-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  return initials || '—';
}

export type MoodClass = 'positif' | 'neutre' | 'tendu';

// 6 codes sentiment (ref_code, domaine sentiment) → 3 classes visuelles .mood.*
// Le libellé affiché reste le sentimentName réel ; la classe ne pilote que la couleur.
const MOOD_BY_SENTIMENT: Record<string, MoodClass> = {
  tres_positif: 'positif',
  positif: 'positif',
  interrogatif: 'neutre',
  inquiet: 'neutre',
  mecontent: 'tendu',
  tres_mecontent: 'tendu',
};

export function moodClassOf(sentimentCode: string | null | undefined): MoodClass | null {
  if (!sentimentCode) return null;
  return MOOD_BY_SENTIMENT[sentimentCode] ?? null;
}

export type TaskGroup = 'late' | 'today' | 'week' | 'later';

/**
 * Groupe d'échéance d'une tâche (vue Tâches & relances) :
 * late = jour calendaire passé ; today = jour même ; week = J+1..J+7 ;
 * later = au-delà, sans échéance ou date invalide.
 */
export function taskGroupOf(dueAt: string | null, now: Date = new Date()): TaskGroup {
  if (!dueAt) return 'later';
  const ts = Date.parse(dueAt);
  if (!Number.isFinite(ts)) return 'later';
  const due = new Date(ts);
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((dayStart(due) - dayStart(now)) / 86_400_000);
  if (diffDays < 0) return 'late';
  if (diffDays === 0) return 'today';
  if (diffDays <= 7) return 'week';
  return 'later';
}

/** JJ/MM/AAAA (fr-FR) ; null/invalide → '—' / valeur brute. */
export function formatShort(value: string | null): string {
  if (!value) return '—';
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts));
}

/** Date relative compacte (« il y a 5 sem. ») pour l'annuaire et la fiche. */
export function formatRelative(value: string | null, now: Date = new Date()): string {
  if (!value) return '—';
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  const diffMs = now.getTime() - ts;
  if (diffMs < 60_000) return "à l'instant";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `il y a ${weeks} sem.`;
  const months = Math.floor(days / 30);
  if (months < 12) return `il y a ${months} mois`;
  const years = Math.floor(days / 365);
  return `il y a ${years} an${years > 1 ? 's' : ''}`;
}

/** Libellé de mois pour le groupage timeline (« Juin 2026 ») ; null → 'Sans date'. */
export function monthLabelOf(value: string | null): string {
  if (!value) return 'Sans date';
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return 'Sans date';
  const label = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(ts));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Libellés FR des types d'interaction (enum DB crm_interaction_type) — vocabulaire
// du composer v2 (Appel / E-mail / Visite terrain / Note interne) + les autres types DB.
const INTERACTION_TYPE_LABELS: Record<string, string> = {
  call: 'Appel',
  email: 'E-mail',
  meeting: 'Réunion',
  visit: 'Visite terrain',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  note: 'Note interne',
};

export function interactionTypeLabelOf(interactionType: string): string {
  return INTERACTION_TYPE_LABELS[interactionType] ?? interactionType;
}

export type TlIcoClass = 'call' | 'mail' | 'field' | 'sys';

/** Classe d'icône timeline : call→call, email→mail, visit→field, tout le reste→sys. */
export function tlIcoClassOf(interactionType: string): TlIcoClass {
  if (interactionType === 'call') return 'call';
  if (interactionType === 'email') return 'mail';
  if (interactionType === 'visit') return 'field';
  return 'sys';
}
