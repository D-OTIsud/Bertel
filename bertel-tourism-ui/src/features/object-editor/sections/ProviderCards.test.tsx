import { act, fireEvent, render, screen } from '@testing-library/react';
import { ProviderCards } from './ProviderCards';
import type { ObjectWorkspaceActorLinkItem, ObjectWorkspaceRelationshipsModule } from '../../../services/object-workspace-parser';

// The ActorPicker has its own spec (debounce + api.search_actors). Here it is stubbed so the
// attach-modal pick wiring is exercised without the network search.
jest.mock('../widgets/ActorPicker', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  return {
    ActorPicker: ({ onPick }: { onPick: (actor: { id: string; displayName: string; firstName: string; lastName: string }) => void }) =>
      mockReact.createElement(
        'button',
        { type: 'button', onClick: () => onPick({ id: 'act-9', displayName: 'Rémi Janisset', firstName: 'Rémi', lastName: 'Janisset' }) },
        'Choisir Rémi Janisset',
      ),
  };
});

function actor(partial: Partial<ObjectWorkspaceActorLinkItem> & { id: string }): ObjectWorkspaceActorLinkItem {
  return {
    displayName: partial.id, firstName: '', lastName: '', gender: '',
    roleId: 'operator', roleCode: 'operator', roleLabel: 'Exploitant',
    visibility: 'public', isPrimary: false, validFrom: '', validTo: '', note: '', contacts: [],
    ...partial,
  };
}

function relationships(overrides: Partial<ObjectWorkspaceRelationshipsModule> = {}): ObjectWorkspaceRelationshipsModule {
  return {
    organizationLinks: [],
    actors: [actor({ id: 'a1', displayName: 'Marie Guide', roleCode: 'operator', roleLabel: 'Exploitant', isPrimary: true })],
    relatedObjects: [],
    orgRoleOptions: [],
    orgOptions: [],
    actorRoleOptions: [
      { id: 'operator', code: 'operator', label: 'Exploitant' },
      { id: 'guide', code: 'guide', label: 'Guide' },
    ],
    organizationLinkWriteUnavailableReason: null,
    actorWriteUnavailableReason: null,
    actorConsentUnavailableReason: null,
    relatedObjectWriteUnavailableReason: null,
    ...overrides,
  };
}

describe('ProviderCards — §19 prestataire authoring', () => {
  it('renders a card per attached prestataire', () => {
    render(<ProviderCards relationships={relationships()} canWrite onChange={() => undefined} />);
    expect(screen.getByText('Marie Guide')).toBeInTheDocument();
    expect(screen.getByText('Prestataires rattachés')).toBeInTheDocument();
  });

  it('changes a prestataire role through the edit modal', () => {
    const onChange = jest.fn();
    render(<ProviderCards relationships={relationships()} canWrite onChange={onChange} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier Marie Guide/ })); });
    act(() => {
      fireEvent.change(screen.getByLabelText('Rôle de Marie Guide'), { target: { value: 'guide' } });
    });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ roleCode: 'guide', roleId: 'guide', roleLabel: 'Guide' });
  });

  it('detaches a prestataire only after confirming in the dialog', () => {
    const onChange = jest.fn();
    render(<ProviderCards relationships={relationships()} canWrite onChange={onChange} />);

    // The card button opens the confirm; it does NOT detach immediately.
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Détacher Marie Guide/ })); });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Voulez-vous vraiment détacher/)).toBeInTheDocument();

    // Confirm button (exact "Détacher") performs the detach.
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Détacher' })); });
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('does not detach when the confirm dialog is cancelled', () => {
    const onChange = jest.fn();
    render(<ProviderCards relationships={relationships()} canWrite onChange={onChange} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Détacher Marie Guide/ })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Annuler' })); });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('attaches a prestataire from the search modal, primary when first for that role', () => {
    const onChange = jest.fn();
    render(<ProviderCards relationships={relationships({ actors: [] })} canWrite onChange={onChange} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Rattacher un nouveau prestataire/ })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Choisir Rémi Janisset' })); });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: 'act-9', roleCode: 'operator', isPrimary: true, visibility: 'public' });
  });

  it('a picked prestataire is not primary when the role already has a primary', () => {
    const onChange = jest.fn();
    render(<ProviderCards relationships={relationships()} canWrite onChange={onChange} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Rattacher un nouveau prestataire/ })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Choisir Rémi Janisset' })); });

    const next = onChange.mock.calls[0][0];
    expect(next).toHaveLength(2);
    expect(next[1].isPrimary).toBe(false);
  });

  it('is read-only when not writable (no attach / detach affordances)', () => {
    render(<ProviderCards relationships={relationships()} canWrite={false} onChange={() => undefined} />);
    expect(screen.getByText('Marie Guide')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rattacher un nouveau prestataire/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Détacher/ })).not.toBeInTheDocument();
  });

  it('is read-only when the actor links could not be loaded (anti-clobber)', () => {
    render(
      <ProviderCards
        relationships={relationships({ actorWriteUnavailableReason: 'load failed' })}
        canWrite
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText(/Lecture seule/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rattacher un nouveau prestataire/ })).not.toBeInTheDocument();
  });

  it('opens a prestataire CRM fiche via onOpenActor', () => {
    const onOpenActor = jest.fn();
    render(<ProviderCards relationships={relationships()} canWrite onChange={() => undefined} onOpenActor={onOpenActor} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Fiche CRM/ })); });

    expect(onOpenActor).toHaveBeenCalledWith('a1');
  });
});
