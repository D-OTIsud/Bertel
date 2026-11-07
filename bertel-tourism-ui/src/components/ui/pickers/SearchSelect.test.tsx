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

const grouped = [
  { code: 'h1', label: 'Hôtel A', group: 'Classements' },
  { code: 'h2', label: 'Camping B', group: 'Classements' },
  { code: 'l1', label: 'Logis', group: 'Labels' },
  { code: 'l2', label: 'Musée de France', group: 'Labels' },
];

describe('SearchSelect (grouped)', () => {
  it('renders collapsible category headers and hides options until a group is expanded', () => {
    render(<SearchSelect value="" options={grouped} onChange={jest.fn()} aria-label="Réf" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Réf' }));
    expect(screen.getByRole('button', { name: /Classements/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Labels/ })).toBeInTheDocument();
    // Nothing selected → all groups collapsed → no options shown yet.
    expect(screen.queryByRole('option', { name: 'Hôtel A' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Classements/ }));
    expect(screen.getByRole('option', { name: 'Hôtel A' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Camping B' })).toBeInTheDocument();
    // The other group stays collapsed.
    expect(screen.queryByRole('option', { name: 'Logis' })).toBeNull();
  });

  it('auto-expands the group containing the selected value', () => {
    render(<SearchSelect value="l2" options={grouped} onChange={jest.fn()} aria-label="Réf" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Réf' }));
    expect(screen.getByRole('option', { name: 'Musée de France' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Hôtel A' })).toBeNull();
  });

  it('searching filters across every group regardless of collapse state', () => {
    render(<SearchSelect value="" options={grouped} onChange={jest.fn()} aria-label="Réf" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Réf' }));
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'musee' } });
    expect(screen.getByRole('option', { name: 'Musée de France' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Hôtel A' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Logis' })).toBeNull();
  });

  it('selects a grouped option and closes', () => {
    const onChange = jest.fn();
    render(<SearchSelect value="" options={grouped} onChange={onChange} aria-label="Réf" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Réf' }));
    fireEvent.click(screen.getByRole('button', { name: /Labels/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Logis' }));
    expect(onChange).toHaveBeenCalledWith('l1');
    expect(screen.queryByRole('option', { name: 'Logis' })).toBeNull();
  });
});
