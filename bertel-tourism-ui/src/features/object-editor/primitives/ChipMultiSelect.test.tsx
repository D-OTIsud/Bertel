import { render, screen, fireEvent, act, within } from '@testing-library/react';
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

  it('blocks new historical choices while preserving a selected historical choice and its explicit removal', () => {
    const onToggle = jest.fn();
    render(<ChipMultiSelect options={options.map((option) => ({ ...option, disabled: true }))} selected={['wifi']} onToggle={onToggle} />);
    const selected = screen.getByRole('button', { name: 'Wi-Fi — à requalifier' });
    const unavailable = screen.getByRole('button', { name: 'Piscine — indisponible' });
    expect(selected).toBeEnabled();
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(unavailable).toBeDisabled();
    fireEvent.click(unavailable);
    expect(onToggle).not.toHaveBeenCalled();
    fireEvent.click(selected);
    expect(onToggle).toHaveBeenCalledWith('wifi');
  });

  it('keeps an unknown historical selection visible and removable', () => {
    const onToggle = jest.fn();
    render(<ChipMultiSelect options={options} selected={['legacy']} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'legacy — à requalifier' }));
    expect(onToggle).toHaveBeenCalledWith('legacy');
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

  it('preserves a historical selection on validation but prevents reattaching it after removal', () => {
    const onChange = jest.fn();
    render(<ChipMultiSelect options={[{ code: 'old', label: 'Ancien', disabled: true }, ...big]}
      selected={['old']} onChange={onChange} modalTitle="Choisir un cadre" />);
    fireEvent.click(screen.getByRole('button', { name: /Choisir/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(onChange).toHaveBeenLastCalledWith(['old']);
    fireEvent.click(screen.getByRole('button', { name: /Choisir/i }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Ancien — à requalifier' }));
    const historical = dialog.getByRole('button', { name: 'Ancien — indisponible' });
    expect(historical).toBeDisabled();
    fireEvent.click(historical);
    fireEvent.click(dialog.getByRole('button', { name: 'Valider' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('refuses a new choice that becomes unavailable while the picker is open', () => {
    const onChange = jest.fn();
    const { rerender } = render(<ChipMultiSelect options={big} selected={[]} onChange={onChange} modalTitle="Choisir un cadre" />);
    fireEvent.click(screen.getByRole('button', { name: /Choisir/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Montagne' }));
    rerender(<ChipMultiSelect options={big.map((option) => ({ ...option, disabled: option.code === 'mountain' }))}
      selected={[]} onChange={onChange} modalTitle="Choisir un cadre" />);
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
