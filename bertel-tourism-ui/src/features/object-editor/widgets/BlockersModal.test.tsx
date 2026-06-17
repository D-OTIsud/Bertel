import { render, screen, fireEvent } from '@testing-library/react';
import { BlockersModal } from './BlockersModal';

const sectionLabels = { '02': 'Localisation', '04': 'Descriptions & langues parlées' };

const baseProps = {
  open: true,
  onClose: jest.fn(),
  context: 'publish' as const,
  requiredBlockers: [],
  saveErrors: [],
  warnings: [],
  sectionLabels,
  onGoToSection: jest.fn(),
};

describe('BlockersModal', () => {
  it('titles the modal from the context', () => {
    const { rerender } = render(<BlockersModal {...baseProps} context="publish" />);
    expect(screen.getByText('Publication impossible')).toBeInTheDocument();
    rerender(<BlockersModal {...baseProps} context="save" />);
    expect(screen.getByText('Enregistrement incomplet')).toBeInTheDocument();
  });

  it('groups required blockers by section with their label and navigates on click', () => {
    const onGoToSection = jest.fn();
    render(
      <BlockersModal
        {...baseProps}
        requiredBlockers={[{ section: '02', message: 'La commune est obligatoire.', tone: 'req' }]}
        onGoToSection={onGoToSection}
      />,
    );
    expect(screen.getByText(/Section 02 — Localisation/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('La commune est obligatoire.'));
    expect(onGoToSection).toHaveBeenCalledWith('02');
  });

  it('renders save errors under their own group, labelled by module', () => {
    render(
      <BlockersModal
        {...baseProps}
        context="save"
        saveErrors={[{ section: 'Tarifs, paiement & extras', message: 'Remise invalide.', tone: 'req' }]}
      />,
    );
    expect(screen.getByText("Erreurs d'enregistrement")).toBeInTheDocument();
    expect(screen.getByText('Tarifs, paiement & extras')).toBeInTheDocument();
    expect(screen.getByText('Remise invalide.')).toBeInTheDocument();
  });

  it('lists warnings under a separate non-blocking heading', () => {
    render(
      <BlockersModal
        {...baseProps}
        warnings={[{ section: '04', message: 'Descriptif court.', tone: 'warn' }]}
      />,
    );
    expect(screen.getByText('Alertes non bloquantes')).toBeInTheDocument();
    expect(screen.getByText('Descriptif court.')).toBeInTheDocument();
  });

  it('does not render empty groups', () => {
    render(<BlockersModal {...baseProps} />);
    expect(screen.queryByText("Erreurs d'enregistrement")).not.toBeInTheDocument();
    expect(screen.queryByText('Alertes non bloquantes')).not.toBeInTheDocument();
  });

  it('fires onClose from the footer button', () => {
    const onClose = jest.fn();
    render(<BlockersModal {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalled();
  });
});
