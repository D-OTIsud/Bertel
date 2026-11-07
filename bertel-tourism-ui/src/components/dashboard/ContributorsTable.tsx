'use client';

import type { DashboardTeamActivity } from '../../types/dashboard';

const nf = new Intl.NumberFormat('fr-FR');

function frDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/**
 * Qui a édité, sur quoi, à quel rythme.
 *
 * L'ORDRE VIENT DU SERVEUR (`ORDER BY active_days DESC`) et n'est PAS recalculé ici : deux
 * tris parallèles finiraient par diverger. La note de méthode explique le classement, parce
 * qu'un tableau trié par jours quand une colonne « fiches touchées » affiche 486 en deuxième
 * ligne se lit comme un bug tant qu'on n'a pas dit pourquoi.
 *
 * `display_name` est affiché TEL QUE REÇU : il vient de `api.crm_user_label` côté serveur,
 * la même source que le kanban CRM et le journal de transitions. Le dériver ici ferait
 * porter deux noms à la même personne selon l'écran.
 */
export function ContributorsTable({ data }: { data: DashboardTeamActivity }) {
  return (
    <article className="kpi-panel kpi-panel--wide">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Activité</span>
          <h2>Contributeurs</h2>
          <p>Qui a édité, sur quoi, et à quel rythme, sur les douze dernières semaines.</p>
        </div>
      </div>

      <table className="contributors">
        <thead>
          <tr>
            <th scope="col">Éditeur</th>
            <th scope="col" className="contributors__num">Jours actifs</th>
            <th scope="col" className="contributors__num">Fiches touchées</th>
            <th scope="col">Période couverte</th>
          </tr>
        </thead>
        <tbody>
          {data.contributors.map((c) => (
            <tr key={c.user_id}>
              <td>
                {c.display_name}
                {c.bulk_days > 0 && (
                  <span className="contributors__bulk" title="Journées à dix fiches ou plus — reprises en masse, pas du travail éditorial courant">
                    dont {nf.format(c.bulk_days)} passe{c.bulk_days > 1 ? 's' : ''} en masse
                  </span>
                )}
              </td>
              <td className="contributors__num">{nf.format(c.active_days)}</td>
              <td className="contributors__num">{nf.format(c.objects_touched)}</td>
              <td className="contributors__span">
                {frDay(c.first_at)} → {frDay(c.last_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="method-notes">
        <li>
          Le classement se fait sur les <b>jours actifs</b>, pas le volume : sans cela, quelques
          passes en masse placeraient un compte devant des semaines de reprise patiente.
        </li>
      </ul>
    </article>
  );
}
