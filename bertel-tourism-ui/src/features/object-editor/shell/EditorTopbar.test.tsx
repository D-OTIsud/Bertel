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
  onSaveDraft: () => {},
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

  it('renders an Enregistrer button that calls onSaveDraft and is disabled when nothing is dirty', () => {
    const onSaveDraft = jest.fn();
    render(<EditorTopbar {...baseProps} dirtyCount={2} onSaveDraft={onSaveDraft} />);
    const btn = screen.getByRole('button', { name: 'Enregistrer' });
    fireEvent.click(btn);
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    render(<EditorTopbar {...baseProps} dirtyCount={0} onSaveDraft={onSaveDraft} />);
    expect(screen.getAllByRole('button', { name: 'Enregistrer' }).at(-1)).toBeDisabled();
  });

  it('keeps Publier clickable even with blockers and calls onPublish', () => {
    const onPublish = jest.fn();
    render(<EditorTopbar {...baseProps} blockerCount={3} onPublish={onPublish} />);
    const publish = screen.getByRole('button', { name: 'Publier' });
    expect(publish).not.toBeDisabled();
    fireEvent.click(publish);
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('6.1 : Enregistrer est l’action primaire, Publier un acte secondaire', () => {
    render(<EditorTopbar {...baseProps} dirtyCount={2} />);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toHaveClass('primary');
    expect(screen.getByRole('button', { name: 'Publier' })).not.toHaveClass('primary');
  });

  it('6.1 : le libellé occupé de Publier est « Publication… »', () => {
    render(<EditorTopbar {...baseProps} publishing />);
    expect(screen.getByRole('button', { name: 'Publication…' })).toBeInTheDocument();
  });

  it('makes the validation chip a button that calls onShowBlockers', () => {
    const onShowBlockers = jest.fn();
    render(<EditorTopbar {...baseProps} blockerCount={2} onShowBlockers={onShowBlockers} />);
    fireEvent.click(screen.getByRole('button', { name: /2 blocages/ }));
    expect(onShowBlockers).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner and "Enregistrement…" while saveFeedback is pending', () => {
    render(<EditorTopbar {...baseProps} saveFeedback="pending" onSaveDraft={() => {}} />);
    expect(screen.getByRole('button', { name: /Enregistrement…/ })).toBeInTheDocument();
  });

  it('shows a check and "Enregistré" for success, never alongside the spinner', () => {
    render(<EditorTopbar {...baseProps} saveFeedback="success" onSaveDraft={() => {}} />);
    const button = screen.getByRole('button', { name: /Enregistré/ });
    expect(button).toBeInTheDocument();
    expect(button.querySelector('[data-icon="spinner"]')).not.toBeInTheDocument();
  });

  it('shows an alert and "Échec — réessayer" for error', () => {
    render(<EditorTopbar {...baseProps} saveFeedback="error" onSaveDraft={() => {}} />);
    expect(screen.getByRole('button', { name: /Échec — réessayer/ })).toBeInTheDocument();
  });

  it('applies the same pending/success/error treatment to Publier via publishFeedback', () => {
    render(<EditorTopbar {...baseProps} publishFeedback="success" />);
    expect(screen.getByRole('button', { name: /Publié/ })).toBeInTheDocument();
  });
});
