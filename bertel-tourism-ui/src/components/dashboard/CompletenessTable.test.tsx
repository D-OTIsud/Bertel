import { render, screen, fireEvent, act } from '@testing-library/react';
import { CompletenessTable, BELOW_80_LIMIT } from './CompletenessTable';
import { useDashboardExplorerStore } from '../../store/explorer-store';
import { activeDrilldownTypes } from '../../lib/dashboard-type-drilldown';
import type { DashboardCompleteness, CompletenessBelowObject } from '../../types/dashboard';

const data: DashboardCompleteness = {
  rows: [
    {
      type: 'HLO',
      total: 171,
      avg_score: 96,
      complete_pct: 63.7,
      missing_top_field: 'photos',
      below_80: [
        { id: 'HLO1', name: 'Gîte des Hauts', score: 63, missing_fields: ['photos', 'type_block'] },
        { id: 'HLO2', name: 'Villa Evilou', score: 50, missing_fields: ['contact', 'photos'] },
      ],
    },
    {
      type: 'HOT',
      total: 7,
      avg_score: 98,
      complete_pct: 100,
      missing_top_field: '',
      below_80: [],
    },
  ],
};

describe('CompletenessTable', () => {
  beforeEach(() => {
    act(() => useDashboardExplorerStore.getState().resetAll());
  });

  it('rend la jauge de complétude (richesse moyenne) et le libellé FR de l’essentiel manquant', () => {
    render(<CompletenessTable data={data} />);
    expect(screen.getByText('96 %')).toBeInTheDocument(); // avg_score HLO
    expect(screen.getByText('98 %')).toBeInTheDocument(); // avg_score HOT
    expect(screen.getByText('Photos')).toBeInTheDocument(); // 'photos' → libellé FR
    expect(screen.getAllByText('—').length).toBeGreaterThan(0); // HOT n'a aucun manque
  });

  it('clic sur la pastille de type filtre sur ce type (drill-down toggle)', () => {
    render(<CompletenessTable data={data} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gîtes, meublés & chambres d’hôtes' }));
    expect(activeDrilldownTypes(useDashboardExplorerStore.getState())).toContain('HLO');
  });

  it('n’affiche pas les fiches à corriger tant que la ligne n’est pas dépliée', () => {
    render(<CompletenessTable data={data} />);
    expect(screen.queryByText('Gîte des Hauts')).not.toBeInTheDocument();
  });

  it('déplie la ligne et liste les fiches sous 80 avec leurs essentiels manquants', () => {
    render(<CompletenessTable data={data} />);
    fireEvent.click(screen.getByRole('button', { name: /2 fiches/ }));

    expect(screen.getByText('Gîte des Hauts')).toBeInTheDocument();
    expect(screen.getByText('Villa Evilou')).toBeInTheDocument();
    expect(screen.getByText('63')).toBeInTheDocument();
    expect(screen.getAllByText('Photos').length).toBeGreaterThan(0);
    expect(screen.getByText('Équipements / type')).toBeInTheDocument();
  });

  it('chaque fiche pointe vers son éditeur', () => {
    render(<CompletenessTable data={data} />);
    fireEvent.click(screen.getByRole('button', { name: /2 fiches/ }));

    // Tri par score croissant : la fiche la plus urgente (score le plus bas, HLO2) sort en premier.
    const lien = screen.getAllByRole('link', { name: /Corriger/ })[0];
    expect(lien).toHaveAttribute('href', '/objects/HLO2/edit');
  });

  it('replie la ligne au second clic', () => {
    render(<CompletenessTable data={data} />);
    const bouton = screen.getByRole('button', { name: /2 fiches/ });
    fireEvent.click(bouton);
    expect(screen.getByText('Gîte des Hauts')).toBeInTheDocument();
    fireEvent.click(bouton);
    expect(screen.queryByText('Gîte des Hauts')).not.toBeInTheDocument();
  });

  it('n’offre aucun dépliant quand le type n’a aucune fiche sous 80', () => {
    render(<CompletenessTable data={data} />);
    expect(screen.queryByRole('button', { name: /0 fiche/ })).not.toBeInTheDocument();
  });

  describe('au plafond serveur (p_below_limit, T3)', () => {
    const belowAtLimit: CompletenessBelowObject[] = Array.from({ length: BELOW_80_LIMIT }, (_, i) => ({
      id: `PLAFOND${i}`,
      name: `Fiche ${i}`,
      score: 40 + i,
      missing_fields: ['photos'],
    }));
    const dataAtLimit: DashboardCompleteness = {
      rows: [
        {
          type: 'HLO',
          total: 500,
          avg_score: 55,
          complete_pct: 10,
          missing_top_field: 'photos',
          below_80: belowAtLimit,
        },
      ],
    };

    it('le bouton ne prétend pas à un total : « 10 plus urgentes », jamais « 10 fiches »', () => {
      render(<CompletenessTable data={dataAtLimit} />);
      expect(screen.getByRole('button', { name: /10 plus urgentes/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^10 fiches$/ })).not.toBeInTheDocument();
    });

    it('le nom accessible du bouton dit le nombre ET l’action', () => {
      render(<CompletenessTable data={dataAtLimit} />);
      const bouton = screen.getByRole('button', { name: /10 plus urgentes à corriger, afficher le détail/ });
      fireEvent.click(bouton);
      expect(
        screen.getByRole('button', { name: /10 plus urgentes à corriger, masquer le détail/ }),
      ).toBeInTheDocument();
    });

    it('la liste dépliée dit « les 10 fiches les plus incomplètes », pas « 10 fiches sous 80 % »', () => {
      render(<CompletenessTable data={dataAtLimit} />);
      fireEvent.click(screen.getByRole('button', { name: /10 plus urgentes/ }));
      expect(screen.getByText('Les 10 fiches les plus incomplètes · triées par score croissant')).toBeInTheDocument();
      expect(screen.queryByText(/^10 fiches sous 80 %/)).not.toBeInTheDocument();
    });

    it('sous le plafond, le libellé exact « N fiche(s) sous 80 % » est conservé', () => {
      render(<CompletenessTable data={data} />);
      fireEvent.click(screen.getByRole('button', { name: /2 fiches/ }));
      expect(screen.getByText('2 fiches sous 80 % · triées par score croissant')).toBeInTheDocument();
    });
  });
});
