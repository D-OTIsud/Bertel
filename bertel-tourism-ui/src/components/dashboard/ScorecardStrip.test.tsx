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

const crmOpen: DashboardCrmOpen = { open_interactions: 170, open_tasks: 2, total: 172 };

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

  it('compte les demandes CRM ouvertes, pas les pending_change', () => {
    render(<ScorecardStrip data={base} crmOpen={crmOpen} />);
    expect(screen.getByText('172')).toBeInTheDocument();
    expect(screen.getByText('À traiter')).toBeInTheDocument();
    expect(screen.getByText(/170 interactions planifiées/)).toBeInTheDocument();
    expect(screen.getByText(/2 tâches à faire/)).toBeInTheDocument();
  });

  it('dit que le compte CRM est global, pas filtré', () => {
    render(<ScorecardStrip data={base} crmOpen={crmOpen} />);
    expect(screen.getByText(/Tout le périmètre/)).toBeInTheDocument();
  });

  it('passe en état calme quand il ne reste rien à traiter', () => {
    render(<ScorecardStrip data={base} crmOpen={{ open_interactions: 0, open_tasks: 0, total: 0 }} />);
    expect(screen.getByText('À jour')).toBeInTheDocument();
  });

  it('reste rendu quand le compte CRM n’est pas encore chargé', () => {
    render(<ScorecardStrip data={base} />);
    expect(screen.getByText('359')).toBeInTheDocument();
  });
});
