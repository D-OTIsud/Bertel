import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChipMultiSelect } from './ChipMultiSelect';

const options = [
  { code: 'wifi', label: 'Wi-Fi' },
  { code: 'pool', label: 'Piscine' },
];

const big = [
  { code: 'sea', label: 'Bord de mer' },
  { code: 'mountain', label: 'Montagne' },
  { code: 'forest', label: 'Forêt' },
  { code: 'city', label: 'Centre-ville' },
];

describe('ChipMultiSelect (inline)', () => {
  it('marks selected options and toggles on click', () => {
    const onToggle = jest.fn();
    render(<ChipMultiSelect options={options} selected={['wifi']} onToggle={onToggle} />);
    expect(screen.getByRole('button', { name: 'Wi-Fi' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Piscine' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Piscine' }));
    expect(onToggle).toHaveBeenCalledWith('pool');
  });
});

describe('ChipMultiSelect (modal mode)', () => {
  it('renders selected chips + a trigger button, not the full inline list', () => {
    render(<ChipMultiSelect options={big} selected={['sea']} onChange={jest.fn()} modalTitle="Choisir un cadre" />);
    // selected chip shown in the trigger
    expect(screen.getByRole('button', { name: 'Bord de mer' })).toBeInTheDocument();
    // a non-selected option is NOT inline before opening the modal
    expect(screen.queryByRole('button', { name: 'Montagne' })).toBeNull();
    expect(screen.getByRole('button', { name: /Choisir/i })).toBeInTheDocument();
  });

  it('stages changes in the modal and applies the whole selection on Valider', () => {
    const onChange = jest.fn();
    render(<ChipMultiSelect options={big} selected={['sea']} onChange={onChange} modalTitle="Choisir un cadre" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Choisir/i })); });
    // add Montagne from « Disponibles »
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Montagne' })); });
    expect(onChange).not.toHaveBeenCalled(); // staged, not live
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Valider' })); });
    expect(onChange).toHaveBeenCalledWith(['sea', 'mountain']);
  });

  it('discards staged changes on Annuler', () => {
    const onChange = jest.fn();
    render(<ChipMultiSelect options={big} selected={['sea']} onChange={onChange} modalTitle="Choisir un cadre" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Choisir/i })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Montagne' })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Annuler' })); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('filters available options by a diacritic-insensitive search', () => {
    render(<ChipMultiSelect options={big} selected={[]} onChange={jest.fn()} modalTitle="Choisir un cadre" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Choisir/i })); });
    // « foret » (no accent) must match « Forêt »
    act(() => { fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'foret' } }); });
    expect(screen.getByRole('button', { name: 'Forêt' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Montagne' })).toBeNull();
  });

  it('removes a selected chip live from the trigger (single onChange)', () => {
    const onChange = jest.fn();
    render(<ChipMultiSelect options={big} selected={['sea', 'mountain']} onChange={onChange} modalTitle="Choisir un cadre" />);
    fireEvent.click(screen.getByRole('button', { name: 'Bord de mer' }));
    expect(onChange).toHaveBeenCalledWith(['mountain']);
  });
});
