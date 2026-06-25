"use client";

import Link from 'next/link';
import { Bell, CheckCircle2 } from 'lucide-react';
import type { DashboardScorecards } from '../../types/dashboard';

interface Props {
  data: DashboardScorecards;
}

const nf = new Intl.NumberFormat('fr-FR');

/**
 * Bandeau résumé du dashboard (impl. 5.1) — remplace les 6 cartes-chiffres au poids
 * identique par une hiérarchie : UNE métrique meneuse (Inscrits SIT, grand format) +
 * deux secondaires (complétude, classés/labellisés) + une carte d'attention dédiée
 * aux demandes en cours qui mène au CRM. Contraste d'échelle = critère d'acceptation.
 */
export function ScorecardStrip({ data }: Props) {
  const pending = data.pending_changes;
  const hasPending = pending > 0;

  return (
    <section className="dashboard-summary" aria-label="Résumé du tableau de bord">
      {/* Métrique meneuse — domine par l'échelle (≈44px) et le fond plein. */}
      <article className="summary-stat summary-stat--lead">
        <span className="summary-stat__label">Inscrits SIT</span>
        <strong className="summary-stat__value">{nf.format(data.total)}</strong>
        {data.delta_30d > 0 && (
          <span className="summary-stat__delta summary-stat__delta--up">
            +{nf.format(data.delta_30d)} ce mois
          </span>
        )}
      </article>

      {/* Secondaire 1 — complétude moyenne perçue visiteur. */}
      <article className="summary-stat">
        <span className="summary-stat__label">Complétude moyenne</span>
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

      {/* Carte d'attention — orange uniquement quand il y a des demandes à traiter ;
          état calme « à jour » sinon. Toujours un accès direct au suivi CRM. */}
      <article
        className={`summary-attn${hasPending ? '' : ' summary-attn--ok'}`}
        role="region"
        aria-label="Demandes à traiter"
      >
        <span className="summary-attn__top">
          {hasPending ? <Bell aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          {hasPending ? 'À traiter' : 'À jour'}
        </span>
        <span className="summary-attn__line">
          <span className="summary-attn__big">{hasPending ? nf.format(pending) : '0'}</span>
          <span className="summary-attn__txt">
            {hasPending
              ? `demande${pending > 1 ? 's' : ''} en cours`
              : 'demande en cours'}
          </span>
        </span>
        <Link href="/crm" className="summary-attn__cta">
          {hasPending ? 'Ouvrir le suivi CRM' : 'Voir le suivi CRM'}
        </Link>
      </article>
    </section>
  );
}
