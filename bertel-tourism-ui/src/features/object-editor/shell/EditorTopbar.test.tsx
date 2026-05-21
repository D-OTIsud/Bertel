import { render, screen, fireEvent } from '@testing-library/react';
import { EditorTopbar } from './EditorTopbar';

const baseProps = {
  objectName: 'Domaine du Bel Air',
  archetypeCodeName: 'Hotel',
  mode: 'complet' as const,
  dirtyCount: 0,
  onModeChange: jest.fn(),
  onPreview: jest.fn(),
  onCancel: jest.fn(),
  onPublish: jest.fn(),
};

describe('EditorTopbar', () => {
  it('renders breadcrumbs without Explorer and shows type code', () => {
    render(<EditorTopbar {...baseProps} />);
    const crumbs = document.querySelector('.edit-top__crumbs');
    expect(crumbs?.textContent).toMatch(/Hotel/);
    expect(crumbs?.textContent).toMatch(/Domaine du Bel Air/);
    expect(crumbs?.textContent).toMatch(/Modifier/);
    expect(crumbs?.textContent).not.toMatch(/Explorer/);
  });

  it('fires onModeChange when the other mode is clicked', () => {
    const onModeChange = jest.fn();
    render(<EditorTopbar {...baseProps} onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Rapide/ }));
    expect(onModeChange).toHaveBeenCalledWith('rapide');
  });

  it('shows last update in edit-top__save when clean', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-20T12:00:00Z'));
    render(<EditorTopbar {...baseProps} lastSavedAt="2026-05-20T11:45:00Z" lastUpdatedSource="manual" />);
    expect(screen.getByText(/Dernière mise à jour · il y a 15 min/)).toBeInTheDocument();
    jest.useRealTimers();
  });
});
