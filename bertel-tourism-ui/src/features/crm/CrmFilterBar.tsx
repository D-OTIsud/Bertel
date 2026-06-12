"use client";

// Barre de filtres CRM partagée (PO points 6+7) — UNE source de vérité pour l'onglet Acteurs
// ET l'onglet Timeline : sujet (vocabulaire demand_topic complet + « Tous les sujets »),
// statut [Actives | Traitées | Toutes] et période [30 j | 90 j | 12 mois | Tout].
//
// Défauts (les DEUX onglets) : statut = Toutes (→ undefined), période = Tout (→ from undefined,
// AUCUNE borne basse). C'est le fix du bug PO point 7 : « Toutes + Tout » doit rendre
// l'ensemble complet — « Tout » ne doit PAS laisser traîner une borne de période.

import { Seg } from './crm-primitives';

// Statut PO : Actives = interactions `planned` (à traiter), Traitées = `done`, Toutes = libre.
export const STATUS_ITEMS = ['Actives', 'Traitées', 'Toutes'] as const;
export type StatusItem = (typeof STATUS_ITEMS)[number];
export const STATUS_DEFAULT: StatusItem = 'Toutes';
const STATUS_VALUES: Record<StatusItem, 'active' | 'done' | undefined> = {
  Actives: 'active',
  Traitées: 'done',
  Toutes: undefined,
};

/** Code statut serveur (active/done) d'un item — undefined pour « Toutes ». */
export function statusValueOf(item: StatusItem): 'active' | 'done' | undefined {
  return STATUS_VALUES[item];
}

// Période PO : borne basse `from` en jours glissants ; « Tout » = sans borne (null).
export const PERIOD_ITEMS = ['30 j', '90 j', '12 mois', 'Tout'] as const;
export type PeriodItem = (typeof PERIOD_ITEMS)[number];
export const PERIOD_DEFAULT: PeriodItem = 'Tout';
const PERIOD_DAYS: Record<PeriodItem, number | null> = { '30 j': 30, '90 j': 90, '12 mois': 365, Tout: null };

const DAY_MS = 86_400_000;

/**
 * Borne basse ISO d'une période — minuit local (précision jour, queryKey stable) ; « Tout »
 * → undefined (PAS de borne : c'est le cœur du fix point 7). `now` injectable pour les tests.
 */
export function periodFromOf(item: PeriodItem, now: number = Date.now()): string | undefined {
  const days = PERIOD_DAYS[item];
  if (!days) return undefined;
  const date = new Date(now - days * DAY_MS);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export function CrmFilterBar({
  topicCode,
  status,
  period,
  topics,
  onChange,
}: {
  topicCode: string;
  status: StatusItem;
  period: PeriodItem;
  /** Vocabulaire demand_topic (code + libellé) — « Tous les sujets » ajouté en tête. */
  topics: Array<{ code: string; name: string }>;
  onChange: (next: { topicCode: string; status: StatusItem; period: PeriodItem }) => void;
}) {
  return (
    <>
      <select
        className="crm-select"
        aria-label="Sujet"
        value={topicCode}
        onChange={(event) => onChange({ topicCode: event.target.value, status, period })}
      >
        <option value="">Tous les sujets</option>
        {topics.map((topic) => (
          <option key={topic.code} value={topic.code}>
            {topic.name}
          </option>
        ))}
      </select>
      <Seg
        items={[...STATUS_ITEMS]}
        value={status}
        onChange={(item) => onChange({ topicCode, status: item as StatusItem, period })}
      />
      <Seg
        items={[...PERIOD_ITEMS]}
        value={period}
        onChange={(item) => onChange({ topicCode, status, period: item as PeriodItem })}
      />
    </>
  );
}
