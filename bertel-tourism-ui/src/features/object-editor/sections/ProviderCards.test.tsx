import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ProviderCards } from './ProviderCards';
import {
  ACTOR_NOTE_RESTRICTED_REASON,
  ACTOR_NOTE_UNKNOWN_REASON,
  type ObjectWorkspaceActorLinkItem,
  type ObjectWorkspaceRelationshipsModule,
} from '../../../services/object-workspace-parser';

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
    contactsRestricted: false,
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
    actorNoteWriteUnavailableReason: null,
    ...overrides,
  };
}

/**
 * Enveloppe CONTRÔLÉE : ProviderCards est piloté par ses props, donc sans re-rendu le lien
 * qu'on vient de rattacher n'apparaît jamais. Cette enveloppe reproduit ce que fait l'éditeur
 * (`replaceModule('relationships', …)`) pour pouvoir ouvrir la modale du lien NEUF.
 */
function ControlledProviderCards({ initial }: { initial: ObjectWorkspaceRelationshipsModule }) {
  const [module, setModule] = useState(initial);
  return (
    <ProviderCards
      relationships={module}
      canWrite
      onChange={(actors) => setModule((current) => ({ ...current, actors }))}
    />
  );
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

  it('shows a pending-interaction notification badge for an actor with open interactions', () => {
    render(
      <ProviderCards
        relationships={relationships()}
        canWrite
        onChange={() => undefined}
        openCountByActor={{ a1: 2 }}
      />,
    );
    expect(screen.getByLabelText(/2 interaction\(s\) en attente avec Marie Guide/i)).toBeInTheDocument();
  });

  // §208 — LE cas que l'héritage « depuis la ligne 0 » laissait ouvert : sur une fiche SANS
  // aucun prestataire, il n'y avait aucune ligne à échantillonner, donc le lien neuf naissait
  // `contactsRestricted: false` ⇒ champ Note actif ⇒ api.save_object_relations écrivait NULL
  // (lien neuf pour un appelant restreint) sans le moindre signal.
  it('§208 — fiche SANS prestataire : la note du premier rattaché n\'est pas saisissable, motif affiché', () => {
    render(<ControlledProviderCards initial={relationships({ actors: [], actorNoteWriteUnavailableReason: ACTOR_NOTE_UNKNOWN_REASON })} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Rattacher un nouveau prestataire/ })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Choisir Rémi Janisset' })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier Rémi Janisset/ })); });

    const note = screen.getByLabelText('Note sur Rémi Janisset');
    expect(note).toHaveAttribute('readonly');
    expect(screen.getByText(ACTOR_NOTE_UNKNOWN_REASON)).toBeInTheDocument();
    act(() => { fireEvent.change(note, { target: { value: 'référent terrain' } }); });
    expect(note).toHaveValue('');
  });

  it('§208 — fiche dont le serveur a rédigé les liens : la note du prestataire NEUF est réservée elle aussi', () => {
    render(
      <ControlledProviderCards
        initial={relationships({
          actors: [actor({ id: 'a1', displayName: 'Marie Guide', contactsRestricted: true })],
          actorNoteWriteUnavailableReason: ACTOR_NOTE_RESTRICTED_REASON,
        })}
      />,
    );

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Rattacher un nouveau prestataire/ })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Choisir Rémi Janisset' })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier Rémi Janisset/ })); });

    expect(screen.getByLabelText('Note sur Rémi Janisset')).toHaveAttribute('readonly');
    expect(screen.getByText(ACTOR_NOTE_RESTRICTED_REASON)).toBeInTheDocument();
  });

  it('§208 — verdict par fiche à null : la note du prestataire neuf reste saisissable', () => {
    render(<ControlledProviderCards initial={relationships({ actors: [], actorNoteWriteUnavailableReason: null })} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Rattacher un nouveau prestataire/ })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Choisir Rémi Janisset' })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier Rémi Janisset/ })); });

    const note = screen.getByLabelText('Note sur Rémi Janisset');
    expect(note).not.toHaveAttribute('readonly');
    act(() => { fireEvent.change(note, { target: { value: 'référent terrain' } }); });
    expect(note).toHaveValue('référent terrain');
  });

  it('shows no notification badge when the actor has no open interactions', () => {
    render(
      <ProviderCards relationships={relationships()} canWrite onChange={() => undefined} openCountByActor={{}} />,
    );
    expect(screen.queryByLabelText(/en attente/i)).not.toBeInTheDocument();
  });
});
