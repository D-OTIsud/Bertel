"use client";

import Link from 'next/link';
import { Bell, CheckCircle2 } from 'lucide-react';
import type { DashboardScorecards, DashboardCrmOpen } from '../../types/dashboard';

interface Props {
  data: DashboardScorecards;
  /** Compteur CRM GLOBAL. Absent tant que la requête n'a pas répondu. */
  crmOpen?: DashboardCrmOpen;
}

const nf = new Intl.NumberFormat('fr-FR');

/** « +5 ce mois · +25 % vs 30 j préc. » — jamais un blanc : un mois à zéro est une information. */
function deltaLabel(delta30d: number, deltaPct: number | null): string {
  const head = `+${nf.format(delta30d)} ce mois`;
  if (deltaPct === null) return head;
  const sign = deltaPct < 0 ? '−' : '+';
  return `${head} · ${sign}${nf.format(Math.abs(deltaPct))} % vs 30 j préc.`;
}

function deltaTone(delta30d: number, deltaPct: number | null): string {
  if (deltaPct !== null && deltaPct < 0) return ' summary-stat__delta--down';
  if (delta30d > 0) return ' summary-stat__delta--up';
  return ' summary-stat__delta--flat';
}

/**
 * Bandeau résumé du dashboard (impl. 5.1) — remplace les 6 cartes-chiffres au poids
 * identique par une hiérarchie : UNE métrique meneuse (Inscrits SIT, grand format) +
 * deux secondaires (complétude, classés/labellisés) + une carte d'attention dédiée
 * aux demandes en cours qui mène au CRM. Contraste d'échelle = critère d'acceptation.
 */
export function ScorecardStrip({ data, crmOpen }: Props) {
  return (
    <section className="dashboard-summary" aria-label="Résumé du tableau de bord">
      {/* Métrique meneuse — domine par l'échelle (≈44px) et le fond plein. */}
      <article className="summary-stat summary-stat--lead">
        <span className="summary-stat__label">Inscrits SIT</span>
        <strong className="summary-stat__value">{nf.format(data.total)}</strong>
        <span className={`summary-stat__delta${deltaTone(data.delta_30d, data.delta_pct)}`}>
          {deltaLabel(data.delta_30d, data.delta_pct)}
        </span>
      </article>

      {/* Secondaire 1 — complétude moyenne perçue visiteur. */}
      <article className="summary-stat">
        <span className="summary-stat__label">Remplissage moyen</span>
        <strong className="summary-stat__value">
          {data.avg_completeness != null ? `${Math.round(data.avg_completeness)} %` : '—'}
        </strong>
        <span className="summary-stat__sub">tous essentiels présents</span>
      </article>

      {/* Secondaire 2 — fiches classées / labellisées. */}
      <article className="summary-stat">
        <span className="summary-stat__label">Classés / labellisés</span>
        <strong className="summary-stat__value">{nf.format(data.distinctions)}</strong>
        <span className="summary-stat__sub">{Math.round(data.distinctions_pct)} % du corpus</span>
      </article>

      {/* Compteur CRM GLOBAL — il n'obéit pas au panneau de filtres (décision PO 2026-08-30),
          et la carte le dit, parce qu'un chiffre non filtré au milieu de chiffres filtrés
          doit s'annoncer. pending_change n'est plus lu : la table est vide depuis toujours. */}
      <article
        className={`summary-attn${crmOpen && crmOpen.total > 0 ? '' : ' summary-attn--ok'}`}
        role="region"
        aria-label="Demandes à traiter"
      >
        <span className="summary-attn__top">
          {crmOpen && crmOpen.total > 0 ? <Bell aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          {crmOpen && crmOpen.total > 0 ? 'À traiter' : 'À jour'}
        </span>
        <span className="summary-attn__line">
          <span className="summary-attn__big">{nf.format(crmOpen?.total ?? 0)}</span>
          <span className="summary-attn__txt">
            {(crmOpen?.total ?? 0) > 1 ? 'demandes en cours' : 'demande en cours'}
          </span>
        </span>
        {crmOpen && (
          <span className="summary-attn__breakdown">
            Tout le périmètre · {nf.format(crmOpen.open_interactions)} interaction
            {crmOpen.open_interactions > 1 ? 's' : ''} planifiée
            {crmOpen.open_interactions > 1 ? 's' : ''}, {nf.format(crmOpen.open_tasks)} tâche
            {crmOpen.open_tasks > 1 ? 's' : ''} à faire
          </span>
        )}
        <Link href="/crm" className="summary-attn__cta">
          {crmOpen && crmOpen.total > 0 ? 'Ouvrir le suivi CRM' : 'Voir le suivi CRM'}
        </Link>
      </article>
    </section>
  );
}
