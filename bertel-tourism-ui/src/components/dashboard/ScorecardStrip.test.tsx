import { render, screen } from '@testing-library/react';
import { ScorecardStrip } from './ScorecardStrip';
import type { DashboardScorecards, DashboardCrmOpen } from '../../types/dashboard';

const base: DashboardScorecards = {
  total: 359,
  published: 359,
  published_pct: 100,
  avg_completeness: 91.8,
  distinctions: 75,
  distinctions_pct: 20.9,
  pending_changes: 0,
  delta_30d: 0,
  delta_pct: -100,
  avg_processing_days: null,
};

const crmOpen: DashboardCrmOpen = {
  open_interactions: 170, open_tasks: 2, total: 172,
  // recent + arriere = open_interactions : la RPC tient l'invariant par construction
  // (manifeste 17h), la fixture ne doit pas le contredire.
  recent_interactions: 3, backlog_interactions: 167,
};

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

describe('ScorecardStrip', () => {
  it('affiche le delta même à zéro, avec le pourcentage', () => {
    render(<ScorecardStrip data={base} crmOpen={crmOpen} />);
    expect(screen.getByText(/\+0 ce mois/)).toBeInTheDocument();
    expect(screen.getByText(/−100 %/)).toBeInTheDocument();
  });

  it('met en tête ce qui est RÉCENT, et sort l’arriéré du chiffre d’alerte', () => {
    // Le chiffre de tête était `total` (172), arriéré compris : une carte d'alerte qui ne
    // redescend jamais cesse d'être un signal. Il vaut désormais récent + tâches = 5, et les
    // 167 anciennes sont dites à part, sans être comptées deux fois.
    render(<ScorecardStrip data={base} crmOpen={crmOpen} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('éléments à traiter')).toBeInTheDocument();
    expect(screen.getByText(/3 demandes de moins de 90 jours, 2 tâches à faire/)).toBeInTheDocument();
    expect(screen.getByText(/\+ 167 demandes plus anciennes/)).toBeInTheDocument();
    expect(screen.getByText('À traiter')).toBeInTheDocument();
  });

  it('ne nomme JAMAIS « demandes » un total qui contient des tâches', () => {
    // Deux vocabulaires que la base tient séparés (crm_status vs crm_task_status) ne se
    // fondent pas dans un libellé commun à l'écran. Et rien ne borne l'âge d'une tâche :
    // l'appeler « récente » serait faux.
    render(<ScorecardStrip data={base} crmOpen={crmOpen} />);
    expect(screen.queryByText(/demandes récentes/)).not.toBeInTheDocument();
    expect(screen.queryByText(/planifiée/)).not.toBeInTheDocument();
  });

  it('reste « À jour » quand il ne reste QUE de l’arriéré, en le disant', () => {
    // Le vert ne doit pas mentir : la troisième ligne porte l'arriéré restant.
    render(
      <ScorecardStrip
        data={base}
        crmOpen={{ open_interactions: 167, open_tasks: 0, total: 167, recent_interactions: 0, backlog_interactions: 167 }}
      />,
    );
    expect(screen.getByText('À jour')).toBeInTheDocument();
    expect(screen.getByText(/\+ 167 demandes plus anciennes/)).toBeInTheDocument();
  });

  it('dit que le compte CRM est global, pas filtré', () => {
    render(<ScorecardStrip data={base} crmOpen={crmOpen} />);
    expect(screen.getByText(/Tout le périmètre/)).toBeInTheDocument();
  });

  it('passe en état calme quand il ne reste rien à traiter', () => {
    render(<ScorecardStrip data={base} crmOpen={{ open_interactions: 0, open_tasks: 0, total: 0,
                 recent_interactions: 0, backlog_interactions: 0 }} />);
    expect(screen.getByText('À jour')).toBeInTheDocument();
  });

  it('reste rendu quand le compte CRM n’est pas encore chargé', () => {
    render(<ScorecardStrip data={base} />);
    expect(screen.getByText('359')).toBeInTheDocument();
  });

  it('verrouille la distinction inconnu vs sain : sans crmOpen ni « À jour » ni un 0, avec crmOpen à zéro les deux', () => {
    const { unmount } = render(<ScorecardStrip data={base} />);
    // état inconnu (chargement ou erreur) : jamais l'écran « À jour · 0 » restauré à tort
    expect(screen.queryByText('À jour')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Indisponible')).toBeInTheDocument();
    unmount();

    // état sain réel : crmOpen défini ET total === 0, une information vraie
    render(<ScorecardStrip data={base} crmOpen={{ open_interactions: 0, open_tasks: 0, total: 0,
                 recent_interactions: 0, backlog_interactions: 0 }} />);
    expect(screen.getByText('À jour')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
