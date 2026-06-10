import { render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../../useObjectEditorState';
import { BlockRES } from './BlockRES';
import { allowAll, fullModulesFixture } from '../section-fixture.test-utils';

/**
 * §46 disabled-with-reason gate — when the `menus` module carries an
 * `unavailableReason` (type not enrolled in ref_facet_applicability, or the
 * loader fetch failed), the block must render the notice INSTEAD of the
 * menus controls (cuisine chips edit menus.items — they are part of the
 * module). Non-type-gated modules (capacityPolicies, openings) stay editable.
 */
describe('BlockRES — §46 disabled-with-reason (menus module)', () => {
  it('renders the unavailable notice instead of menu controls when gated', () => {
    const modules = fullModulesFixture();
    modules.menus.unavailableReason = 'Module non applicable au type HOT (référentiel ref_facet_applicability).';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Module non applicable au type HOT/)).toBeInTheDocument();
    // Regex matcher: the Repeater add button renders "+ {addLabel}" as two text
    // nodes, so an exact-string match can never hit it (and would be vacuous).
    expect(screen.queryByText(/Ajouter un menu \/ une carte/)).not.toBeInTheDocument();
    // The cuisine chips edit menus.items — part of the gated module.
    expect(screen.queryByText('Cuisines proposées')).not.toBeInTheDocument();
    // §48: the group policy is owned by §07 — the §05 pointer is NOT part of
    // the gated menus module, so it stays rendered while menus is gated.
    expect(screen.getByText(/Géré dans la section 07/)).toBeInTheDocument();
  });

  it('renders the menu controls when no reason is set', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Ajouter un menu \/ une carte/)).toBeInTheDocument();
  });
});

describe('BlockRES — single-owner surfaces (§48)', () => {
  it('no longer edits the group policy in §05 (owned by §07)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Capacité groupe min')).not.toBeInTheDocument();
    expect(screen.queryByText('Capacité groupe max')).not.toBeInTheDocument();
    expect(screen.queryByText('Groupes uniquement')).not.toBeInTheDocument();
    expect(screen.getByText(/Géré dans la section 07/)).toBeInTheDocument();
  });

  it('no longer edits service hours in §05 (owned by §14)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Copier')).not.toBeInTheDocument(); // ScheduleEditor header gone
    expect(screen.getByText(/Géré dans la section 14/)).toBeInTheDocument();
  });
});
