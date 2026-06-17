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

  it('renders a chip per selected language with its level shown inline', () => {
    render(<SpokenLanguagesField characteristics={characteristics()} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Allemand · Débutant' })).toBeInTheDocument();
  });

  it('shows the bare language label when no level is set', () => {
    const data = characteristics({
      selectedLanguages: [{ languageId: 'de', code: 'de', label: 'Allemand', levelId: '', levelCode: '', levelLabel: '' }],
    });
    render(<SpokenLanguagesField characteristics={data} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Allemand' })).toBeInTheDocument();
  });

  it('no longer shows a separate « Ajouter un niveau » button', () => {
    render(<SpokenLanguagesField characteristics={characteristics()} onChange={() => undefined} />);
    expect(screen.queryByRole('button', { name: /ajouter un niveau/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /modifier les niveaux/i })).toBeNull();
  });

  it('does not render the level selects until a modal is opened', () => {
    render(<SpokenLanguagesField characteristics={characteristics()} onChange={() => undefined} />);
    expect(screen.queryByLabelText('Niveau Allemand')).toBeNull();
  });

  it('opens the level modal centred on a language when its chip is clicked', () => {
    render(<SpokenLanguagesField characteristics={characteristics()} onChange={() => undefined} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Allemand · Débutant' })); });
    expect(screen.getByLabelText('Niveau Allemand')).toBeInTheDocument();
  });

  it('removes a language immediately via its remove button', () => {
    let next = null as ObjectWorkspaceCharacteristicsModule | null;
    render(<SpokenLanguagesField characteristics={characteristics()} onChange={(value) => { next = value; }} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Retirer Allemand' })); });
    expect(next?.selectedLanguages).toEqual([]);
  });

  it('assigns a level through the combined modal and writes it on Valider (staged until then)', () => {
    let next = null as ObjectWorkspaceCharacteristicsModule | null;
    render(<SpokenLanguagesField characteristics={characteristics()} onChange={(value) => { next = value; }} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /choisir \/ modifier les langues/i })); });
    fireEvent.change(screen.getByLabelText('Niveau Allemand'), { target: { value: 'l-fluent' } });
    expect(next).toBeNull(); // staged — nothing applied yet

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Valider' })); });
    expect(next?.selectedLanguages[0]).toMatchObject({ code: 'de', levelId: 'l-fluent', levelCode: 'fluent', levelLabel: 'Courant' });
  });

  it('clears a level by choosing « Aucun niveau »', () => {
    let next = null as ObjectWorkspaceCharacteristicsModule | null;
    render(<SpokenLanguagesField characteristics={characteristics()} onChange={(value) => { next = value; }} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /choisir \/ modifier les langues/i })); });
    fireEvent.change(screen.getByLabelText('Niveau Allemand'), { target: { value: '' } });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Valider' })); });
    expect(next?.selectedLanguages[0]).toMatchObject({ code: 'de', levelId: '', levelCode: '', levelLabel: '' });
  });

  it('adds a language from the modal and seeds it without a level, keeping existing ones', () => {
    let next = null as ObjectWorkspaceCharacteristicsModule | null;
    render(<SpokenLanguagesField characteristics={characteristics()} onChange={(value) => { next = value; }} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /choisir \/ modifier les langues/i })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Français' })); }); // « Disponibles » chip
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Valider' })); });

    expect(next?.selectedLanguages.find((item) => item.code === 'fr')).toMatchObject({
      code: 'fr', levelId: '', levelCode: '', levelLabel: '',
    });
    expect(next?.selectedLanguages.some((item) => item.code === 'de')).toBe(true);
  });

  it('shows only the picker trigger when no language is selected', () => {
    render(<SpokenLanguagesField characteristics={characteristics({ selectedLanguages: [] })} onChange={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Retirer Allemand' })).toBeNull();
    expect(screen.getByRole('button', { name: /choisir/i })).toBeInTheDocument();
  });
});
