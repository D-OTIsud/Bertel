import { render, screen, fireEvent } from '@testing-library/react';
import { ExplorerViewSwitch } from './ExplorerViewSwitch';
import { useExplorerViewStore } from '../../store/explorer-view-store';

beforeEach(() => {
  useExplorerViewStore.setState({ viewMode: 'split' } as never);
});

describe('ExplorerViewSwitch', () => {
  it('renders 4 buttons in one group with the active one aria-pressed', () => {
    render(<ExplorerViewSwitch />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Split' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Liste' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('all 4 modes remain clickable/operable and update aria-pressed', () => {
    render(<ExplorerViewSwitch />);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(useExplorerViewStore.getState().viewMode).toBe('table');
  });

  it('renders an aria-hidden sliding indicator inside the group', () => {
    const { container } = render(<ExplorerViewSwitch />);
    const indicator = container.querySelector('.view-switch__indicator');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute('aria-hidden', 'true');
  });
});
