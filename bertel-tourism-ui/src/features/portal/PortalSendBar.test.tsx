/**
 * La barre d'envoi — le seul appel à l'action de la page, et il ne ment jamais.
 *
 * Trois choses s'y jouent : les ACCORDS (« 1 rubrique modifiée · enregistrée »), le refus
 * qui reste FOCALISABLE avec sa raison écrite (motif D10), et le cas où le partenaire a
 * remodifié une rubrique déjà partie en vérification — ses nouveaux changements sont au
 * chaud, il faut le lui DIRE.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortalSendBar } from './PortalSendBar';

function setup(over: Partial<React.ComponentProps<typeof PortalSendBar>> = {}) {
  const onSend = jest.fn();
  const onDiscard = jest.fn();
  render(
    <PortalSendBar
      dirtyCount={1}
      heldCount={0}
      savedAt="2026-09-03T10:00:00.000Z"
      verificationOpen={false}
      onSend={onSend}
      onDiscard={onDiscard}
      {...over}
    />,
  );
  return { onSend, onDiscard };
}

describe('PortalSendBar', () => {
  it('n’existe pas tant que rien n’est modifié', () => {
    setup({ dirtyCount: 0, heldCount: 0 });
    expect(screen.queryByRole('button', { name: 'Envoyer à l’office' })).not.toBeInTheDocument();
  });

  it('accorde au SINGULIER — « 1 rubrique modifiée · enregistrée sur cet appareil »', () => {
    setup({ dirtyCount: 1 });
    expect(screen.getByText('1 rubrique modifiée · enregistrée sur cet appareil')).toBeInTheDocument();
  });

  it('accorde au PLURIEL', () => {
    setup({ dirtyCount: 3 });
    expect(screen.getByText('3 rubriques modifiées · enregistrées sur cet appareil')).toBeInTheDocument();
  });

  it('vérification en cours : le bouton reste FOCALISABLE et sa raison lui est rattachée', async () => {
    const { onSend } = setup({ verificationOpen: true });

    const send = screen.getByRole('button', { name: 'Envoyer à l’office' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(send).not.toBeDisabled();
    const reason = screen.getByText(/Vérification en cours/);
    expect(send.getAttribute('aria-describedby')).toBe(reason.id);

    await userEvent.click(send);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('rubrique remodifiée pendant la vérification : la barre EXISTE et dit où sont les changements', () => {
    // Sans ça, « Valider » n'a aucun effet visible : le badge reste « Envoyé — en
    // vérification », aucune barre n'apparaît, et le partenaire croit avoir perdu sa saisie.
    setup({ dirtyCount: 0, heldCount: 2, verificationOpen: true });

    expect(screen.getByRole('button', { name: 'Envoyer à l’office' })).toBeInTheDocument();
    expect(
      screen.getByText(
        '2 rubriques modifiées · gardées sur cet appareil, à envoyer quand l’office aura terminé sa vérification.',
      ),
    ).toBeInTheDocument();
  });

  it('« Annuler mes modifications » demande confirmation, et dit que le message part avec', async () => {
    const { onDiscard } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler mes modifications' }));

    const dialog = await screen.findByRole('dialog', { name: 'Effacer vos modifications ?' });
    expect(dialog).toHaveClass('portal-modal');
    expect(dialog).toHaveTextContent('y compris votre message à l’office');
    expect(onDiscard).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Effacer' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('la sortie sûre de la confirmation est « Garder »', async () => {
    const { onDiscard } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler mes modifications' }));

    await userEvent.click(screen.getByRole('button', { name: 'Garder' }));

    expect(onDiscard).not.toHaveBeenCalled();
  });
});
