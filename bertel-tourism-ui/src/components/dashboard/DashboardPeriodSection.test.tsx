import { render, screen, fireEvent, act } from '@testing-library/react';
import { DashboardPeriodSection } from './DashboardPeriodSection';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';

beforeEach(() => act(() => useDashboardFilterStore.getState().clearPeriod()));

it('la plage personnalisée écrit la période dans le store', () => {
  render(<DashboardPeriodSection />);
  fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-03-01' } });
  expect(useDashboardFilterStore.getState().updatedAtFrom).toBe('2026-03-01');
});
