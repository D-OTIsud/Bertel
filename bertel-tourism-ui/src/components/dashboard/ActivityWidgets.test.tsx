import { render, screen, within } from '@testing-library/react';

import { ActivityRhythmChart } from './ActivityRhythmChart';
import { ContributorsTable } from './ContributorsTable';
import { CrmBacklogWidget } from './CrmBacklogWidget';
import { CrmFlowWidget } from './CrmFlowWidget';
import { NetTimeWidget } from './NetTimeWidget';
import type { DashboardCrmActivity, DashboardTeamActivity } from '../../types/dashboard';

/* Fixtures = les valeurs RÉELLES relevées sur la base vive le 2026-08-31, y compris leurs
   irrégularités (la semaine du 06/07 est vide, la tranche d'âge 30–90 j est à zéro). Une
   fixture lissée ferait passer des widgets qui trahissent sur les vraies données. */

const TEAM: DashboardTeamActivity = {
  weeks: [
    { week_start: '2026-06-15', editor_days: 1, editors: 1, objects_touched: 1, created: 0 },
    { week_start: '2026-06-22', editor_days: 1, editors: 1, objects_touched: 2, created: 1 },
    { week_start: '2026-06-29', editor_days: 2, editors: 1, objects_touched: 2, created: 0 },
    { week_start: '2026-07-06', editor_days: 0, editors: 0, objects_touched: 0, created: 0 },
    { week_start: '2026-07-13', editor_days: 2, editors: 1, objects_touched: 482, created: 0 },
    { week_start: '2026-07-20', editor_days: 3, editors: 1, objects_touched: 309, created: 0 },
    { week_start: '2026-07-27', editor_days: 4, editors: 1, objects_touched: 290, created: 0 },
    { week_start: '2026-08-03', editor_days: 3, editors: 2, objects_touched: 3, created: 2 },
    { week_start: '2026-08-10', editor_days: 6, editors: 3, objects_touched: 5, created: 2 },
    { week_start: '2026-08-17', editor_days: 5, editors: 1, objects_touched: 5, created: 3 },
    { week_start: '2026-08-24', editor_days: 3, editors: 2, objects_touched: 2, created: 0 },
    { week_start: '2026-08-31', editor_days: 2, editors: 2, objects_touched: 2, created: 0 },
  ],
  contributors: [
    { user_id: 'u1', display_name: 'David Philippe', active_days: 18, objects_touched: 486, bulk_days: 5, first_at: '2026-06-16T05:51:03Z', last_at: '2026-08-31T07:04:52Z' },
    { user_id: 'u2', display_name: 'cl.metro@otisud.com', active_days: 12, objects_touched: 6, bulk_days: 0, first_at: '2026-08-04T06:10:48Z', last_at: '2026-08-28T04:31:24Z' },
    { user_id: 'u3', display_name: 'm.lallement@otisud.com', active_days: 1, objects_touched: 1, bulk_days: 0, first_at: '2026-08-12T05:02:21Z', last_at: '2026-08-12T05:02:37Z' },
  ],
};

const CRM: DashboardCrmActivity = {
  open_by_age: [
    { bucket: 'lt_30d', count: 3 },
    { bucket: 'd30_90', count: 0 },
    { bucket: 'd90_1y', count: 24 },
    { bucket: 'gt_1y', count: 143 },
  ],
  open_by_topic: [
    { code: 'demande_signaletique', name: 'Demande signalétique', count: 123, oldest: '2018-11-14T00:00:00Z' },
    { code: null, name: 'Sans sujet', count: 8, oldest: '2025-08-14T00:00:00Z' },
  ],
  monthly_flow: [
    { month: '2025-09-01', created: 22, resolved: 8 },
    { month: '2025-10-01', created: 11, resolved: 4 },
    { month: '2025-11-01', created: 20, resolved: 7 },
    { month: '2025-12-01', created: 8, resolved: 2 },
    { month: '2026-01-01', created: 12, resolved: 3 },
    { month: '2026-02-01', created: 27, resolved: 11 },
    { month: '2026-03-01', created: 8, resolved: 4 },
    { month: '2026-04-01', created: 10, resolved: 5 },
    { month: '2026-05-01', created: 0, resolved: 0 },
    { month: '2026-06-01', created: 0, resolved: 0 },
    { month: '2026-07-01', created: 0, resolved: 2 },
    { month: '2026-08-01', created: 3, resolved: 0 },
  ],
  net: { avg_days: null, count: 0 },
};

describe('ActivityRhythmChart', () => {
  it('totalise les jours de saisie et le nombre d’éditeurs, accordés', () => {
    render(<ActivityRhythmChart data={TEAM} />);
    // 1+1+2+0+2+3+4+3+6+5+3+2 = 32
    expect(screen.getByText(/32 jours de saisie sur 12 semaines · 3 éditeurs/)).toBeInTheDocument();
  });

  it('porte la note « pourquoi des jours et non des fiches » — sans elle le graphique se lit à l’envers', () => {
    render(<ActivityRhythmChart data={TEAM} />);
    expect(screen.getByText(/Pourquoi des jours et non des fiches/)).toBeInTheDocument();
    expect(screen.getByText(/graphique d’imports/)).toBeInTheDocument();
  });

  it('dit que les opérations système sont exclues', () => {
    render(<ActivityRhythmChart data={TEAM} />);
    expect(screen.getByText(/opérations système sont exclues/)).toBeInTheDocument();
  });

  it('rend les DOUZE semaines, la semaine vide comprise', () => {
    render(<ActivityRhythmChart data={TEAM} />);
    // 12 semaines × 2 séries. La semaine du 06/07 est à zéro : elle doit occuper sa place.
    expect(screen.getByRole('img').querySelectorAll('rect.bar-series__bar')).toHaveLength(24);
    expect(screen.getByText('6 juil. — Jours de saisie : 0')).toBeInTheDocument();
  });

  it('ne se laisse pas dominer par les fiches touchées — la série tracée est celle des JOURS', () => {
    // 482 objets touchés une semaine ne doivent pas écraser l'échelle : ils ne sont pas tracés.
    render(<ActivityRhythmChart data={TEAM} />);
    expect(screen.queryByText(/482/)).not.toBeInTheDocument();
  });
});

describe('ContributorsTable', () => {
  it('conserve l’ordre du serveur (jours actifs) et n’en invente pas un autre', () => {
    render(<ContributorsTable data={TEAM} />);
    const lignes = screen.getAllByRole('row').slice(1);
    expect(within(lignes[0]).getByText('David Philippe')).toBeInTheDocument();
    expect(within(lignes[2]).getByText('m.lallement@otisud.com')).toBeInTheDocument();
  });

  it('signale les passes en masse, et seulement pour qui en a', () => {
    render(<ContributorsTable data={TEAM} />);
    expect(screen.getByText(/dont 5 passes en masse/)).toBeInTheDocument();
    expect(screen.queryByText(/dont 0 passe/)).not.toBeInTheDocument();
  });

  it('explique le classement — sans quoi 486 fiches en deuxième ligne se lit comme un bug', () => {
    render(<ContributorsTable data={TEAM} />);
    expect(screen.getByText(/classement se fait sur les/)).toBeInTheDocument();
    expect(screen.getByText(/reprise patiente/)).toBeInTheDocument();
  });

  it('affiche le nom TEL QUE REÇU, adresse comprise — la source est le serveur', () => {
    render(<ContributorsTable data={TEAM} />);
    expect(screen.getByText('cl.metro@otisud.com')).toBeInTheDocument();
  });
});

describe('CrmBacklogWidget', () => {
  it('rend les QUATRE tranches, y compris celle qui est vide', () => {
    render(<CrmBacklogWidget data={CRM} />);
    for (const label of ['Moins de 30 jours', 'De 30 à 90 jours', 'De 90 jours à 1 an', 'Plus d’un an']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // La tranche vide affiche son zéro : c'est le creux qui décrit la forme de l'arriéré.
    const vide = screen.getByText('De 30 à 90 jours').closest('.crm-backlog__agerow') as HTMLElement;
    expect(within(vide).getByText('0')).toBeInTheDocument();
  });

  it('calcule la part de l’arriéré de plus d’un an et dit d’où elle vient', () => {
    render(<CrmBacklogWidget data={CRM} />);
    // 143 / 170 = 84 %
    expect(screen.getByText(/84 % de cet arriéré a plus d’un an/)).toBeInTheDocument();
    expect(screen.getByText(/vient d’un import, pas de l’usage courant/)).toBeInTheDocument();
  });

  it('donne un libellé aux demandes sans sujet, jamais une case vide', () => {
    render(<CrmBacklogWidget data={CRM} />);
    expect(screen.getByText('Sans sujet')).toBeInTheDocument();
  });

  it('supporte une date de plus ancienne demande ABSENTE sans afficher « Invalid Date »', () => {
    // `occurred_at` est nullable au schéma : `min()` peut rendre null sur un groupe entier.
    const sansDate: DashboardCrmActivity = {
      ...CRM,
      open_by_topic: [{ code: 'x', name: 'Sujet X', count: 2, oldest: null }],
    };
    render(<CrmBacklogWidget data={sansDate} />);
    expect(screen.getByText(/depuis date inconnue/)).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });
});

describe('CrmFlowWidget', () => {
  it('totalise les créées et les traitées sur douze mois', () => {
    render(<CrmFlowWidget data={CRM} />);
    expect(screen.getByText(/121 créées · 46 traitées/)).toBeInTheDocument();
  });

  it('avertit que le mois compté est celui de l’ÉCHANGE, pas de la saisie', () => {
    // Sans cette note, la chute de la courbe au printemps se lit comme un effondrement de
    // l'activité de l'équipe, alors que c'est l'import qui s'est arrêté.
    render(<CrmFlowWidget data={CRM} />);
    expect(screen.getByText(/demandes importées portent leur date d’origine/)).toBeInTheDocument();
  });

  it('n’affiche l’état vide explicatif que si TOUT est à zéro — pas quand un seul mois l’est', () => {
    render(<CrmFlowWidget data={CRM} />);
    expect(screen.queryByText(/Aucune demande créée ni traitée/)).not.toBeInTheDocument();

    const zero: DashboardCrmActivity = {
      ...CRM,
      monthly_flow: CRM.monthly_flow.map((m) => ({ ...m, created: 0, resolved: 0 })),
    };
    render(<CrmFlowWidget data={zero} />);
    expect(screen.getByText(/Aucune demande créée ni traitée sur les douze derniers mois/)).toBeInTheDocument();
  });
});

describe('NetTimeWidget', () => {
  it('sans aucune demande bouclée, explique le calcul au lieu d’afficher un vide', () => {
    render(<NetTimeWidget data={CRM} />);
    expect(screen.getByText(/Aucune demande n’a encore parcouru son cycle/)).toBeInTheDocument();
    expect(screen.getByText(/Exemple de calcul sur une demande/)).toBeInTheDocument();
    expect(screen.getByText(/Écoulé 22 j/)).toBeInTheDocument();
  });

  it('n’affiche JAMAIS zéro à la place de « pas encore mesurable »', () => {
    // Zéro dirait « traitement instantané » — l'exact contraire de « on ne sait pas encore ».
    render(<NetTimeWidget data={CRM} />);
    expect(screen.queryByText(/0 jour en moyenne/)).not.toBeInTheDocument();
  });

  it('affiche la moyenne dès qu’une demande a bouclé, accordée au singulier', () => {
    render(<NetTimeWidget data={{ ...CRM, net: { avg_days: 1, count: 1 } }} />);
    expect(screen.getByText(/1 jour en moyenne sur 1 demande/)).toBeInTheDocument();
    expect(screen.queryByText(/Aucune demande n’a encore parcouru/)).not.toBeInTheDocument();
  });

  it('accorde le pluriel et garde la décimale de la moyenne', () => {
    render(<NetTimeWidget data={{ ...CRM, net: { avg_days: 7.25, count: 4 } }} />);
    expect(screen.getByText(/7,3 jours en moyenne sur 4 demandes/)).toBeInTheDocument();
  });
});
