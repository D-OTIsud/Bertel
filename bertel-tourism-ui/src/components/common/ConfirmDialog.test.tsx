import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog (maison)', () => {
  const base = {
    open: true,
    title: 'Supprimer la valeur ?',
    message: 'Cette action est définitive.',
    onCancel: jest.fn(),
    onConfirm: jest.fn(),
  };

  afterEach(() => jest.clearAllMocks());

  it('ne rend rien quand open=false', () => {
    const { container } = render(<ConfirmDialog {...base} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rend un dialog avec le titre, le message et les actions', () => {
    render(<ConfirmDialog {...base} confirmLabel="Supprimer" />);
    expect(screen.getByRole('dialog', { name: 'Supprimer la valeur ?' })).toBeInTheDocument();
    expect(screen.getByText('Cette action est définitive.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
  });

  it('appelle onConfirm au clic sur Confirmer et onCancel au clic sur Annuler', () => {
    render(<ConfirmDialog {...base} confirmLabel="Supprimer" />);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(base.onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(base.onCancel).toHaveBeenCalledTimes(1);
  });

  it('busy : confirmation bloquée en aria-disabled avec raison « en cours » reliée (D10/A4)', () => {
    render(<ConfirmDialog {...base} busy confirmLabel="Supprimer" />);
    const confirm = screen.getByRole('button', { name: 'Supprimer' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).toHaveAccessibleDescription('Traitement en cours…');
    fireEvent.click(confirm);
    expect(base.onConfirm).not.toHaveBeenCalled();
    // Annuler reste en disabled natif (état transitoire, pas de raison à porter).
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
  });
});

describe('ConfirmDialog — confirmGate (saisie-pour-confirmer)', () => {
  const gated = {
    open: true,
    title: 'Supprimer le sujet ?',
    message: 'Suppression dure en cascade.',
    confirmLabel: 'Supprimer',
    tone: 'danger' as const,
    confirmGate: { expected: ['abc-123', 'SUPPRIMER'], label: "Tapez l'identifiant ou SUPPRIMER" },
    onCancel: jest.fn(),
    onConfirm: jest.fn(),
  };
  afterEach(() => jest.clearAllMocks());

  it('garde le bouton de confirmation bloqué (aria-disabled) tant que la saisie ne correspond pas', () => {
    render(<ConfirmDialog {...gated} />);
    expect(screen.getByRole('button', { name: 'Supprimer' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.change(screen.getByLabelText(/identifiant ou SUPPRIMER/i), { target: { value: 'nope' } });
    expect(screen.getByRole('button', { name: 'Supprimer' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('active le bouton sur correspondance exacte (identifiant ou mot-clé)', () => {
    render(<ConfirmDialog {...gated} />);
    const input = screen.getByLabelText(/identifiant ou SUPPRIMER/i);
    fireEvent.change(input, { target: { value: 'SUPPRIMER' } });
    expect(screen.getByRole('button', { name: 'Supprimer' })).not.toHaveAttribute('aria-disabled');
    fireEvent.change(input, { target: { value: '  abc-123  ' } });
    expect(screen.getByRole('button', { name: 'Supprimer' })).not.toHaveAttribute('aria-disabled');
  });

  it('n\'appelle jamais onConfirm sans correspondance (clic gardé)', () => {
    render(<ConfirmDialog {...gated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(gated.onConfirm).not.toHaveBeenCalled();
  });

  it('est sensible à la casse pour le mot-clé SUPPRIMER', () => {
    render(<ConfirmDialog {...gated} />);
    fireEvent.change(screen.getByLabelText(/identifiant ou SUPPRIMER/i), { target: { value: 'supprimer' } });
    expect(screen.getByRole('button', { name: 'Supprimer' })).toHaveAttribute('aria-disabled', 'true');
  });
});
