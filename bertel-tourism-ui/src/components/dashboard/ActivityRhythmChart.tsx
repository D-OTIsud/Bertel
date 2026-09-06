'use client';

import { BarSeriesChart } from './BarSeriesChart';
import type { DashboardTeamActivity } from '../../types/dashboard';

const nf = new Intl.NumberFormat('fr-FR');

function frWeek(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Rythme de saisie de l'équipe sur douze semaines.
 *
 * ON COMPTE DES JOURS, PAS DES FICHES. La note de méthode n'est pas une décoration : sans
 * elle, un lecteur suppose que la hauteur mesure du volume et lit ce graphique à l'envers.
 *
 * Les notes reprennent l'ARGUMENT de la maquette sans ses chiffres (« 58 % », « 58 à 482
 * fiches ») : ce sont des relevés du 31/08 qui vieilliront dans un texte figé, alors que le
 * raisonnement, lui, reste vrai. Le même interdit est écrit noir sur blanc côté SQL.
 */
export function ActivityRhythmChart({ data }: { data: DashboardTeamActivity }) {
  const totalDays = data.weeks.reduce((sum, w) => sum + w.editor_days, 0);
  const editors = data.contributors.length;

  return (
    <article className="kpi-panel kpi-panel--wide">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Activité</span>
          <h2>Rythme de saisie</h2>
          <p>
            Jours où quelqu’un a réellement édité, par semaine. Une journée compte pour une,
            qu’on ait repris une fiche ou trois cents.
          </p>
        </div>
        <span className="panel-heading__meta">
          {nf.format(totalDays)} jour{totalDays > 1 ? 's' : ''} de saisie sur 12 semaines ·{' '}
          {nf.format(editors)} éditeur{editors > 1 ? 's' : ''}
        </span>
      </div>

      <BarSeriesChart
        bars={data.weeks.map((w) => ({
          label: frWeek(w.week_start),
          values: [w.editor_days, w.created],
        }))}
        series={[
          { key: 'editor_days', label: 'Jours de saisie', color: 'var(--teal)' },
          { key: 'created', label: 'Fiches créées', color: 'var(--warn)' },
        ]}
        ariaLabel="Jours de saisie et fiches créées par semaine sur 12 semaines"
        emptyLabel="Aucune saisie sur les douze dernières semaines."
      />

      <ul className="method-notes">
        <li>
          <b>Pourquoi des jours et non des fiches :</b> une journée de reprise en masse porte
          plusieurs centaines de fiches là où une journée de travail éditorial en porte moins de
          dix. Compter les fiches ferait de cette courbe un graphique d’imports.
        </li>
        <li>
          Les opérations système sont exclues : les versions sans auteur (imports, écritures
          automatiques) ne comptent pas dans le rythme de l’équipe.
        </li>
      </ul>
    </article>
  );
}
