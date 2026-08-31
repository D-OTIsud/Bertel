'use client';

import type { DashboardCrmActivity, DashboardCrmAgeBucket } from '../../types/dashboard';

const nf = new Intl.NumberFormat('fr-FR');

/**
 * Libellés et teinte des quatre tranches. La couleur suit l'ANCIENNETÉ, qui a un sens : plus
 * une demande dort, plus elle coûte. Un dégradé neutre dirait « quatre catégories » là où la
 * réalité dit « ça empire vers la droite ».
 */
const BUCKETS: Record<DashboardCrmAgeBucket, { label: string; color: string }> = {
  lt_30d: { label: 'Moins de 30 jours', color: 'var(--teal)' },
  d30_90: { label: 'De 30 à 90 jours', color: 'var(--teal)' },
  d90_1y: { label: 'De 90 jours à 1 an', color: 'var(--warn)' },
  gt_1y: { label: 'Plus d’un an', color: 'var(--danger)' },
};

function frDate(iso: string | null): string {
  if (!iso) return 'date inconnue';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'date inconnue';
  return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

/**
 * Ce qui attend, et depuis quand.
 *
 * LES QUATRE TRANCHES SONT TOUJOURS RENDUES, y compris à zéro — la RPC les émet depuis une
 * liste fermée pour cette raison. N'afficher que les tranches peuplées mentirait par omission
 * sur la FORME de l'arriéré : un arriéré concentré sur « plus d'un an » et un arriéré étalé ne
 * demandent pas le même travail, et c'est justement le trou du milieu qui le dit.
 */
export function CrmBacklogWidget({ data }: { data: DashboardCrmActivity }) {
  const total = data.open_by_age.reduce((sum, b) => sum + b.count, 0);
  const veryOld = data.open_by_age.find((b) => b.bucket === 'gt_1y')?.count ?? 0;
  const veryOldPct = total > 0 ? Math.round((veryOld / total) * 100) : 0;

  return (
    <article className="kpi-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Demandes</span>
          <h2>Ce qui attend, et depuis quand</h2>
          <p>
            {nf.format(total)} demande{total > 1 ? 's' : ''} ouverte{total > 1 ? 's' : ''}, par
            ancienneté puis par sujet.
          </p>
        </div>
      </div>

      <div className="crm-backlog__ages">
        {data.open_by_age.map((b) => (
          <div className="crm-backlog__agerow" key={b.bucket}>
            <span className="crm-backlog__agelab">{BUCKETS[b.bucket].label}</span>
            <span className="crm-backlog__track">
              <i
                style={{
                  width: total > 0 ? `${(b.count / total) * 100}%` : '0%',
                  background: BUCKETS[b.bucket].color,
                }}
              />
            </span>
            <span className="crm-backlog__agecnt">{nf.format(b.count)}</span>
          </div>
        ))}
      </div>

      <ul className="crm-backlog__topics">
        {data.open_by_topic.map((t) => (
          <li className="crm-backlog__topic" key={t.code ?? '(sans-sujet)'}>
            <span className="crm-backlog__topicname">{t.name}</span>
            <span className="crm-backlog__topicmeta">
              {nf.format(t.count)} · depuis {frDate(t.oldest)}
            </span>
          </li>
        ))}
      </ul>

      {/* La note ne s'affiche que si elle a quelque chose à dire : « 0 % de cet arriéré »
          au-dessus de quatre barres vides serait une phrase sans objet. */}
      {veryOld > 0 && (
        <ul className="method-notes">
          <li>
            {veryOldPct} % de cet arriéré a plus d’un an : il vient d’un import, pas de l’usage
            courant. Le lire comme un retard de l’équipe serait une erreur.
          </li>
        </ul>
      )}
    </article>
  );
}
