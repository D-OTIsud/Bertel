import { fireEvent, render, screen } from '@testing-library/react';
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

  it('renders a level select per selected language and writes the chosen level', () => {
    let next: ObjectWorkspaceCharacteristicsModule | null = null;
    render(<SpokenLanguagesField characteristics={characteristics()} onChange={(value) => { next = value; }} />);

    const levelSelect = screen.getByLabelText('Niveau Allemand');
    fireEvent.change(levelSelect, { target: { value: 'l-fluent' } });

    expect(next?.selectedLanguages[0]).toMatchObject({ code: 'de', levelId: 'l-fluent', levelCode: 'fluent', levelLabel: 'Courant' });
  });
});
