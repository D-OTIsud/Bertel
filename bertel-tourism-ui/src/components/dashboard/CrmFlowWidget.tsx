'use client';

import { BarSeriesChart } from './BarSeriesChart';
import type { DashboardCrmActivity } from '../../types/dashboard';

const nf = new Intl.NumberFormat('fr-FR');

function frMonth(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

/**
 * Flux mensuel : demandes créées et demandes traitées, sur douze mois.
 *
 * ⚠ CE QUE CE WIDGET MONTRE VRAIMENT. `created` compte par `occurred_at`, la date de
 * l'échange — pas la date de saisie. Les demandes importées portent donc leur date
 * d'origine, et les premiers mois de la série décrivent la QUEUE DE L'IMPORT, pas l'usage
 * de l'application. La note de méthode le dit, sans quoi la chute de la courbe au printemps
 * se lirait comme un effondrement de l'activité de l'équipe alors que c'est l'import qui
 * s'est arrêté.
 *
 * L'état « tout à zéro » est testé sur la SOMME et non sur la longueur : la série fait
 * toujours douze entrées, un `length === 0` ne se produit qu'en mode démo.
 */
export function CrmFlowWidget({ data }: { data: DashboardCrmActivity }) {
  const created = data.monthly_flow.reduce((s, m) => s + m.created, 0);
  const resolved = data.monthly_flow.reduce((s, m) => s + m.resolved, 0);
  const allZero = data.monthly_flow.length > 0 && created === 0 && resolved === 0;

  return (
    <article className="kpi-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Demandes</span>
          <h2>Ce qui entre et ce qui sort</h2>
          <p>Demandes créées et demandes traitées, mois par mois sur douze mois.</p>
        </div>
        {/* Muet quand tout est à zéro : le message d'état le dit déjà, et « 0 créée ·
            0 traitée » juste au-dessus ne fait que répéter un vide. */}
        {!allZero && (
          <span className="panel-heading__meta">
            {nf.format(created)} créée{created > 1 ? 's' : ''} · {nf.format(resolved)} traitée
            {resolved > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {allZero ? (
        <p className="dashboard-widget-state">
          Aucune demande créée ni traitée sur les douze derniers mois. Ce widget se remplit avec
          l’usage de l’application.
        </p>
      ) : (
        <BarSeriesChart
          bars={data.monthly_flow.map((m) => ({
            label: frMonth(m.month),
            values: [m.created, m.resolved],
          }))}
          series={[
            { key: 'created', label: 'Créées', color: 'var(--warn)' },
            { key: 'resolved', label: 'Traitées', color: 'var(--teal)' },
          ]}
          ariaLabel="Demandes créées et traitées par mois sur douze mois"
          emptyLabel="Aucun mouvement de demandes sur les douze derniers mois."
        />
      )}

      <ul className="method-notes">
        <li>
          Une demande est comptée au mois de <b>l’échange</b>, pas au mois de sa saisie : les
          demandes importées portent leur date d’origine. Les premiers mois décrivent donc la
          fin de l’import, pas l’activité de l’équipe.
        </li>
      </ul>
    </article>
  );
}
