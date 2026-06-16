import { act, fireEvent, render, screen } from '@testing-library/react';
import { PaymentChips, SpokenLanguagesField } from './commercial-controls';
import type { ObjectWorkspaceCharacteristicsModule } from '../../../services/object-workspace-parser';

function characteristics(over: Partial<ObjectWorkspaceCharacteristicsModule> = {}): ObjectWorkspaceCharacteristicsModule {
  return {
    languageOptions: [
      { id: 'fr', code: 'fr', label: 'Français' },
      { id: 'de', code: 'de', label: 'Allemand' },
    ],
    languageLevelOptions: [
      { id: 'l-basic', code: 'basic', label: 'Débutant' },
      { id: 'l-fluent', code: 'fluent', label: 'Courant' },
    ],
    selectedLanguages: [
      { languageId: 'de', code: 'de', label: 'Allemand', levelId: 'l-basic', levelCode: 'basic', levelLabel: 'Débutant' },
    ],
    paymentOptions: [
      { id: 'card', code: 'card', label: 'CB' },
      { id: 'cash', code: 'cash', label: 'Espèces' },
    ],
    selectedPaymentCodes: ['card'],
    environmentOptions: [],
    selectedEnvironmentCodes: [],
    amenityGroups: [],
    selectedAmenityCodes: [],
    unavailableReason: null,
    ...over,
  };
}

describe('PaymentChips', () => {
  it('shows the unavailable notice when the module failed to load', () => {
    render(<PaymentChips characteristics={characteristics({ unavailableReason: 'KO' })} onChange={() => undefined} />);
    expect(screen.getByText('KO')).toBeInTheDocument();
  });

  it('renders the selected payment chip and a modal trigger', () => {
    render(<PaymentChips characteristics={characteristics()} onChange={() => undefined} />);
    expect(screen.getByText('Modes de paiement acceptés')).toBeInTheDocument();
    expect(screen.getByText('CB')).toBeInTheDocument();
  });
});

describe('SpokenLanguagesField', () => {
  it('shows the unavailable notice when the module failed to load', () => {
    render(<SpokenLanguagesField characteristics={characteristics({ unavailableReason: 'KO' })} onChange={() => undefined} />);
    expect(screen.getByText('KO')).toBeInTheDocument();
  });

  it('does not render inline level selects — levels live behind a modal', () => {
    render(<SpokenLanguagesField characteristics={characteristics()} onChange={() => undefined} />);
    expect(screen.queryByLabelText('Niveau Allemand')).toBeNull();
  });

  it('hides the level button when no language is selected', () => {
    render(<SpokenLanguagesField characteristics={characteristics({ selectedLanguages: [] })} onChange={() => undefined} />);
    expect(screen.queryByRole('button', { name: /niveau/i })).toBeNull();
  });

  it('reveals the assigned level as a tooltip on the language chip', () => {
    render(<SpokenLanguagesField characteristics={characteristics()} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Allemand' })).toHaveAttribute(
      'title',
      expect.stringContaining('Débutant'),
    );
  });

  it('assigns a level through the modal and writes it on Valider (staged until then)', () => {
    let next: ObjectWorkspaceCharacteristicsModule | null = null;
    render(<SpokenLanguagesField characteristics={characteristics()} onChange={(value) => { next = value; }} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /niveau/i })); });
    fireEvent.change(screen.getByLabelText('Niveau Allemand'), { target: { value: 'l-fluent' } });
    expect(next).toBeNull(); // staged — nothing applied yet

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Valider' })); });
    expect(next?.selectedLanguages[0]).toMatchObject({ code: 'de', levelId: 'l-fluent', levelCode: 'fluent', levelLabel: 'Courant' });
  });

  it('clears a level by choosing « Aucun niveau »', () => {
    let next: ObjectWorkspaceCharacteristicsModule | null = null;
    render(<SpokenLanguagesField characteristics={characteristics()} onChange={(value) => { next = value; }} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /niveau/i })); });
    fireEvent.change(screen.getByLabelText('Niveau Allemand'), { target: { value: '' } });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Valider' })); });
    expect(next?.selectedLanguages[0]).toMatchObject({ code: 'de', levelId: '', levelCode: '', levelLabel: '' });
  });
});
