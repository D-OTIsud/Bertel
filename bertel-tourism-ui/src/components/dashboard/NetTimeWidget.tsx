'use client';

import type { DashboardCrmActivity } from '../../types/dashboard';

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Les trois segments de la barre d'exemple. Des jours, pas des pourcentages : la barre
 *  illustre une SOUSTRACTION, et ses longueurs doivent être proportionnelles aux durées. */
const EXEMPLE = { avantAttente: 8, attente: 12, apresAttente: 2 };

/**
 * Temps de traitement net : l'écoulé moins l'attente du prestataire.
 *
 * QUAND IL N'Y A RIEN À MONTRER, ON EXPLIQUE LE CALCUL AU LIEU D'AFFICHER UN VIDE. Aucune
 * demande n'a encore bouclé son cycle depuis la bascule du cycle de vie : plutôt qu'un
 * « — » muet, le widget montre la soustraction sur un exemple. Un lecteur qui découvre cet
 * indicateur le comprend avant d'en avoir la moindre valeur, et comprend du même coup
 * pourquoi il est vide.
 *
 * `avg_days === null` veut dire « pas encore mesurable ». L'afficher comme 0 dirait
 * « traitement instantané » — l'exact contraire.
 */
export function NetTimeWidget({ data }: { data: DashboardCrmActivity }) {
  const { avg_days: avgDays, count } = data.net;
  const ecoule = EXEMPLE.avantAttente + EXEMPLE.attente + EXEMPLE.apresAttente;
  const net = ecoule - EXEMPLE.attente;

  return (
    <article className="kpi-panel kpi-panel--wide">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Demandes</span>
          <h2>Temps de traitement net</h2>
          <p>
            Le temps que l’équipe a réellement passé sur une demande, l’attente du prestataire
            déduite.
          </p>
        </div>
        {avgDays !== null && (
          <span className="panel-heading__meta">
            {nf.format(avgDays)} jour{avgDays > 1 ? 's' : ''} en moyenne sur {nf.format(count)}{' '}
            demande{count > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="nettime">
        <span className="nettime__label">Exemple de calcul sur une demande</span>
        <div className="nettime__bar" role="img" aria-label={`Exemple : ${ecoule} jours écoulés dont ${EXEMPLE.attente} jours d’attente prestataire, soit ${net} jours nets`}>
          <span className="nettime__seg nettime__seg--work" style={{ flexGrow: EXEMPLE.avantAttente }}>
            {EXEMPLE.avantAttente} j
          </span>
          <span className="nettime__seg nettime__seg--wait" style={{ flexGrow: EXEMPLE.attente }}>
            {EXEMPLE.attente} j — attente prestataire
          </span>
          <span className="nettime__seg nettime__seg--work" style={{ flexGrow: EXEMPLE.apresAttente }}>
            {EXEMPLE.apresAttente} j
          </span>
        </div>
        <p className="nettime__calc">
          Écoulé {ecoule} j <b>−</b> attente prestataire {EXEMPLE.attente} j <b>=</b> temps net
          équipe {net} j
        </p>
      </div>

      {avgDays === null && (
        <p className="dashboard-widget-state">
          Aucune demande n’a encore parcouru son cycle. La moyenne s’affichera dès la première
          demande résolue.
        </p>
      )}

      <ul className="method-notes">
        <li>
          Le calcul ne vaut que pour les demandes qui vivent leur cycle dans l’application :
          les demandes importées n’ont pas d’historique de transitions et resteront hors
          moyenne. Aucune date n’est inventée pour les y faire entrer.
        </li>
      </ul>
    </article>
  );
}
