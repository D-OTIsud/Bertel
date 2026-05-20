import { render, screen, fireEvent } from '@testing-library/react';
import { EditorTopbar } from './EditorTopbar';

const baseProps = {
  objectName: 'Domaine du Bel Air',
  typeCode: 'HOT',
  archetypeCodeName: 'Hotel',
  refId: 'HOTRUN000001',
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
    expect(screen.getByText('HOT')).toBeInTheDocument();
  });

  it('fires onModeChange when the other mode is clicked', () => {
    const onModeChange = jest.fn();
    render(<EditorTopbar {...baseProps} onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Rapide/ }));
    expect(onModeChange).toHaveBeenCalledWith('rapide');
  });
});
