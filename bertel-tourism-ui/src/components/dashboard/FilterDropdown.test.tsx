import { render, screen, fireEvent } from '@testing-library/react';
import { FilterDropdown } from './FilterDropdown';

const OPTIONS = [
  { code: 'HOT', label: 'Hôtels' },
  { code: 'RES', label: 'Restaurants' },
  { code: 'ITI', label: 'Itinéraires' },
] as const;

// ── Trigger label logic ────────────────────────────────────────────────────

describe('trigger label', () => {
  it('shows placeholder when nothing selected', () => {
    render(
      <FilterDropdown
        options={OPTIONS}
        selected={[]}
        onChange={() => {}}
        mode="multi"
        placeholder="Tous les types"
      />,
    );
    expect(screen.getByRole('button')).toHaveTextContent('Tous les types');
  });

  it('shows item label when one item selected', () => {
    render(
      <FilterDropdown
        options={OPTIONS}
        selected={['HOT']}
        onChange={() => {}}
        mode="multi"
        placeholder="Tous les types"
      />,
    );
    expect(screen.getByRole('button')).toHaveTextContent('Hôtels');
  });

  it('shows "N sélectionnés" when 2+ items selected (multi)', () => {
    render(
      <FilterDropdown
        options={OPTIONS}
        selected={['HOT', 'RES']}
        onChange={() => {}}
        mode="multi"
        placeholder="Tous les types"
      />,
    );
    expect(screen.getByRole('button')).toHaveTextContent('2 sélectionnés');
  });
});

// ── Open / close ───────────────────────────────────────────────────────────

describe('open/close', () => {
  it('menu is not visible before trigger click', () => {
    render(
      <FilterDropdown
        options={OPTIONS}
        selected={[]}
        onChange={() => {}}
        mode="multi"
        placeholder="Tous les types"
      />,
    );
    expect(document.body.querySelector('.filter-dropdown__menu')).toBeNull();
  });

  it('menu opens on trigger click', () => {
    render(
      <FilterDropdown
        options={OPTIONS}
        selected={[]}
        onChange={() => {}}
        mode="multi"
        placeholder="Tous les types"
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(document.body.querySelector('.filter-dropdown__menu')).not.toBeNull();
  });

  it('menu closes on second trigger click', () => {
    render(
      <FilterDropdown
        options={OPTIONS}
        selected={[]}
        onChange={() => {}}
        mode="multi"
        placeholder="Tous les types"
      />,
    );
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(document.body.querySelector('.filter-dropdown__menu')).toBeNull();
  });

  it('closes the menu on Escape key', () => {
    render(
      <FilterDropdown
        options={OPTIONS}
        selected={[]}
        onChange={() => {}}
        mode="multi"
        placeholder="Tous les types"
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    // menu is open
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes the menu when clicking outside', () => {
    render(
      <div>
        <FilterDropdown
          options={OPTIONS}
          selected={[]}
          onChange={() => {}}
          mode="multi"
          placeholder="Tous les types"
        />
        <button data-testid="outside">outside</button>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /tous les types/i }));
    // menu is open
    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

// ── Multi mode ─────────────────────────────────────────────────────────────

describe('multi mode', () => {
  it('clicking unselected item adds it to selection', () => {
    const onChange = jest.fn();
    render(
      <FilterDropdown
        options={OPTIONS}
        selected={[]}
        onChange={onChange}
        mode="multi"
        placeholder="Tous les types"
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(document.body.querySelector('[data-code="HOT"]')!);
    expect(onChange).toHaveBeenCalledWith(['HOT']);
  });

  it('clicking selected item removes it from selection', () => {
    const onChange = jest.fn();
    render(
      <FilterDropdown
        options={OPTIONS}
        selected={['HOT', 'RES']}
        onChange={onChange}
        mode="multi"
        placeholder="Tous les types"
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(document.body.querySelector('[data-code="HOT"]')!);
    expect(onChange).toHaveBeenCalledWith(['RES']);
  });

  it('clicking last selected item calls onChange with []', () => {
    const onChange = jest.fn();
    render(
      <FilterDropdown
        options={OPTIONS}
        selected={['HOT']}
        onChange={onChange}
        mode="multi"
        placeholder="Tous les types"
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(document.body.querySelector('[data-code="HOT"]')!);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('menu stays open after multi item click', () => {
    render(
      <FilterDropdown
        options={OPTIONS}
        selected={[]}
        onChange={() => {}}
        mode="multi"
        placeholder="Tous les types"
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(document.body.querySelector('[data-code="HOT"]')!);
    expect(document.body.querySelector('.filter-dropdown__menu')).not.toBeNull();
  });
});

// ── Single mode ────────────────────────────────────────────────────────────

describe('single mode', () => {
  it('clicking item calls onChange with [code]', () => {
    const onChange = jest.fn();
    render(
      <FilterDropdown
        options={OPTIONS}
        selected={[]}
        onChange={onChange}
        mode="single"
        placeholder="Tous les statuts"
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(document.body.querySelector('[data-code="HOT"]')!);
    expect(onChange).toHaveBeenCalledWith(['HOT']);
  });

  it('clicking currently selected item calls onChange with []', () => {
    const onChange = jest.fn();
    render(
      <FilterDropdown
        options={OPTIONS}
        selected={['HOT']}
        onChange={onChange}
        mode="single"
        placeholder="Tous les statuts"
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(document.body.querySelector('[data-code="HOT"]')!);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('menu closes after single item click', () => {
    render(
      <FilterDropdown
        options={OPTIONS}
        selected={[]}
        onChange={() => {}}
        mode="single"
        placeholder="Tous les statuts"
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(document.body.querySelector('[data-code="HOT"]')!);
    expect(document.body.querySelector('.filter-dropdown__menu')).toBeNull();
  });
});

// ── Portal behaviour ───────────────────────────────────────────────────────

describe('portal', () => {
  it('menu is rendered into document.body, not inside component root', () => {
    const { container } = render(
      <FilterDropdown
        options={OPTIONS}
        selected={[]}
        onChange={() => {}}
        mode="multi"
        placeholder="Tous les types"
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(container.querySelector('.filter-dropdown__menu')).toBeNull();
    expect(document.body.querySelector('.filter-dropdown__menu')).not.toBeNull();
  });
});

// ── Load error ─────────────────────────────────────────────────────────────

describe('loadError', () => {
  it('shows error text when loadError is non-null', () => {
    render(
      <FilterDropdown
        options={[]}
        selected={[]}
        onChange={() => {}}
        mode="single"
        placeholder="Tous les lieux-dits"
        loadError="Impossible de charger"
      />,
    );
    expect(screen.getByText(/Impossible de charger/)).toBeInTheDocument();
  });

  it('shows nothing extra when loadError is null', () => {
    render(
      <FilterDropdown
        options={[]}
        selected={[]}
        onChange={() => {}}
        mode="single"
        placeholder="Tous les lieux-dits"
        loadError={null}
      />,
    );
    expect(screen.queryByText(/Impossible/)).toBeNull();
  });
});
