import { render, screen, fireEvent } from '@testing-library/react';
import { SearchSelect } from './SearchSelect';

const options = [
  { code: 'o1', label: 'Hôtel A' },
  { code: 'o2', label: 'Restaurant B' },
  { code: 'o3', label: 'Forêt des Makes' },
];

describe('SearchSelect', () => {
  it('shows the placeholder when nothing is selected', () => {
    render(<SearchSelect value="" options={options} onChange={jest.fn()} placeholder="— Choisir —" aria-label="Cible" />);
    expect(screen.getByRole('combobox', { name: 'Cible' })).toHaveTextContent('— Choisir —');
  });

  it('shows the selected option label on the trigger', () => {
    render(<SearchSelect value="o2" options={options} onChange={jest.fn()} aria-label="Cible" />);
    expect(screen.getByRole('combobox', { name: 'Cible' })).toHaveTextContent('Restaurant B');
  });

  it('opens on click, lists options, selects one and closes (single onChange)', () => {
    const onChange = jest.fn();
    render(<SearchSelect value="" options={options} onChange={onChange} aria-label="Cible" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Cible' }));
    fireEvent.click(screen.getByRole('option', { name: 'Restaurant B' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('o2');
    // panel closed → options gone
    expect(screen.queryByRole('option', { name: 'Restaurant B' })).toBeNull();
  });

  it('filters options diacritic-insensitively', () => {
    render(<SearchSelect value="" options={options} onChange={jest.fn()} aria-label="Cible" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Cible' }));
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'foret' } });
    expect(screen.getByRole('option', { name: 'Forêt des Makes' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Hôtel A' })).toBeNull();
  });

  it('keyboard: ArrowDown then Enter selects the first option', () => {
    const onChange = jest.fn();
    render(<SearchSelect value="" options={options} onChange={onChange} aria-label="Cible" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Cible' }));
    const search = screen.getByLabelText('Rechercher');
    fireEvent.keyDown(search, { key: 'Enter' }); // active row 0 by default
    expect(onChange).toHaveBeenCalledWith('o1');
  });

  it('Escape closes the popover WITHOUT bubbling to a host handler', () => {
    const hostEscape = jest.fn();
    render(
      <div onKeyDown={(e) => { if (e.key === 'Escape') hostEscape(); }}>
        <SearchSelect value="" options={options} onChange={jest.fn()} aria-label="Cible" />
      </div>,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Cible' }));
    fireEvent.keyDown(screen.getByLabelText('Rechercher'), { key: 'Escape' });
    expect(screen.queryByRole('option', { name: 'Hôtel A' })).toBeNull(); // closed
    expect(hostEscape).not.toHaveBeenCalled(); // stopPropagation held
  });

  it('allowClear renders a clear row that emits the empty code', () => {
    const onChange = jest.fn();
    render(<SearchSelect value="o1" options={options} onChange={onChange} allowClear clearLabel="— Aucun —" aria-label="Cible" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Cible' }));
    fireEvent.click(screen.getByRole('option', { name: '— Aucun —' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('renders a stale value (code absent from options) as its own trigger label', () => {
    render(<SearchSelect value="legacy_code" options={options} onChange={jest.fn()} aria-label="Cible" />);
    expect(screen.getByRole('combobox', { name: 'Cible' })).toHaveTextContent('legacy_code');
  });

  it('closes on outside mousedown', () => {
    render(<SearchSelect value="" options={options} onChange={jest.fn()} aria-label="Cible" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Cible' }));
    expect(screen.getByRole('option', { name: 'Hôtel A' })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('option', { name: 'Hôtel A' })).toBeNull();
  });
});
