import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ExplorerActiveFilters } from './ExplorerActiveFilters';
import { useDashboardExplorerStore, useExplorerStore } from '../../store/explorer-store';
import { useSessionStore } from '../../store/session-store';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

beforeEach(() => {
  act(() => {
    useDashboardExplorerStore.getState().resetAll();
    useExplorerStore.getState().resetAll();
    useSessionStore.setState({ canEditObjects: true, orgId: null });
  });
});

it('conserve la capacité HOT en multi-type puis la réapplique en mono-type', () => {
  act(() => {
    useDashboardExplorerStore.getState().toggleBucket('HOT');
    useDashboardExplorerStore.getState().setHotCapacityFilter('beds', 20, 60);
  });
  render(<ExplorerActiveFilters useStore={useDashboardExplorerStore} contextPage="dashboard" />);
  expect(screen.getByRole('button', { name: /Retirer le filtre.*Capacité héb/ })).not.toHaveClass('active-filter-chip--memorized');
  act(() => useDashboardExplorerStore.getState().toggleBucket('RES'));
  const capacity = screen.getByRole('button', { name: /Retirer le filtre.*Capacité héb.*mémorisée/ });
  expect(capacity).toHaveClass('active-filter-chip--memorized');
  expect(useDashboardExplorerStore.getState().hot.capacityFilters).toEqual([{ code: 'beds', min: 20, max: 60 }]);
  act(() => useDashboardExplorerStore.getState().toggleBucket('RES'));
  expect(screen.getByRole('button', { name: /Retirer le filtre.*Capacité héb/ })).not.toHaveClass('active-filter-chip--memorized');
});

it('restitue le focus à une commande de page après le dernier retrait mémorisé', () => {
  // Aucune catégorie : cette capacité ne participe pas à la requête Dashboard.
  act(() => useDashboardExplorerStore.getState().setHotCapacityFilter('beds', 0, 60));
  const returnFocusRef = createRef<HTMLButtonElement>();
  render(<>
    <button ref={returnFocusRef}>Filtres mobile</button>
    <ExplorerActiveFilters useStore={useDashboardExplorerStore} contextPage="dashboard" returnFocusRef={returnFocusRef} />
  </>);
  const capacity = screen.getByRole('button', { name: /Retirer le filtre.*Capacité héb.*mémorisée/ });
  capacity.focus();
  fireEvent.click(capacity);
  expect(screen.getByRole('button', { name: 'Filtres mobile' })).toHaveFocus();
  expect(useDashboardExplorerStore.getState().hot.capacityFilters).toEqual([]);
});

it('retire une période seule et expose le même reset dès un seul critère', () => {
  const onClearPeriod = jest.fn();
  const onReset = jest.fn();
  render(<ExplorerActiveFilters useStore={useDashboardExplorerStore} contextPage="dashboard"
    period={{ updatedAtFrom: '2026-01-01' }} onClearPeriod={onClearPeriod} onReset={onReset} />);
  fireEvent.click(screen.getByRole('button', { name: 'Retirer le filtre : Fiches mises à jour' }));
  expect(onClearPeriod).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
  expect(onReset).toHaveBeenCalledTimes(1);
});

it('annonce la portée du retrait natif de groupe', () => {
  act(() => {
    useExplorerStore.getState().setEnvironmentTags(['mountain', 'coast']);
  });
  render(<ExplorerActiveFilters />);
  fireEvent.click(screen.getByRole('button', { name: /Retirer le filtre.*Cadre.*retire tout le groupe/ }));
  expect(useExplorerStore.getState().common.environmentTagsAny).toEqual([]);
});

it('rend un groupe partiel une seule fois et garde son retrait complet', () => {
  act(() => {
    useDashboardExplorerStore.getState().toggleBucket('HOT');
    useDashboardExplorerStore.getState().toggleTaxonomy('taxonomy_hot', 'hotel');
    useDashboardExplorerStore.getState().toggleTaxonomy('taxonomy_res', 'pizzeria');
  });
  render(<ExplorerActiveFilters useStore={useDashboardExplorerStore} contextPage="dashboard" />);
  const groups = screen.getAllByRole('button', { name: /Retirer le filtre.*Sous-catégorie.*partiellement appliqué.*retire tout le groupe/ });
  expect(groups).toHaveLength(1);
  expect(groups[0]).toHaveTextContent('1 appliquée, 1 mémorisée');
  fireEvent.click(groups[0]);
  expect(useDashboardExplorerStore.getState().common.taxonomyAny).toEqual([]);
});

it('retire le bon code quand deux capacités ont exactement le même libellé', () => {
  act(() => {
    useExplorerStore.getState().toggleBucket('HOT');
    useExplorerStore.getState().setHotCapacityFilter('beds', 0, 60);
    useExplorerStore.getState().setHotCapacityFilter('bedrooms', 0, 60);
  });
  render(<ExplorerActiveFilters />);
  const capacities = screen.getAllByRole('button', { name: /Retirer le filtre.*Capacité héb/ });
  expect(capacities).toHaveLength(2);
  expect(capacities[0]).toHaveAccessibleName(capacities[1].getAttribute('aria-label')!);
  fireEvent.click(capacities[1]);
  expect(useExplorerStore.getState().hot.capacityFilters).toEqual([{ code: 'beds', min: 0, max: 60 }]);
});
