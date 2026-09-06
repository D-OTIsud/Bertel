import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CrmStatusModal } from './CrmStatusModal';
import { INTERACTION_STATUSES, interactionStatusLabel } from './crm-status';

/**
 * Sélecteur de statut à six états (spec §6.6, cycle de vie §6.1).
 *
 * La date d'entrée en attente arrive par PROP, jamais par une requête interne : la modale
 * reste présentationnelle, l'hôte porte le `useQuery` et l'invalidation du cache après
 * écriture. C'est aussi ce qui rend ces tests écrivables (le plan demandait de tester
 * l'encart AVANT de créer le service qui l'alimente).
 */
describe('CrmStatusModal', () => {
  function setup(overrides: Partial<Parameters<typeof CrmStatusModal>[0]> = {}) {
    const onChangeStatus = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    render(
      <CrmStatusModal
        rootId="int-1"
        status="new"
        canWrite
        awaitingSince={null}
        onChangeStatus={onChangeStatus}
        onClose={onClose}
        {...overrides}
      />,
    );
    return { onChangeStatus, onClose };
  }

  it('rend les six libellés du cycle de vie, et aucun code technique', () => {
    setup();
    for (const code of INTERACTION_STATUSES) {
      expect(screen.getByRole('button', { name: interactionStatusLabel(code)! })).toBeInTheDocument();
    }
    // Les codes de la base ne sont pas une langue d'interface.
    expect(screen.queryByText('awaiting_provider')).not.toBeInTheDocument();
  });

  it('marque le statut courant, et lui seul, comme sélectionné', () => {
    setup({ status: 'awaiting_provider' });
    expect(screen.getByRole('button', { name: 'Attente prestataire' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'En cours' })).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(1);
  });

  it('un statut hors registre ne présélectionne RIEN — il ne se fait passer pour aucun des six', () => {
    // Régression du commit 0f036b6 portée sur la nouvelle surface : un code inconnu ne doit
    // jamais être traité comme « traitée ». Ici il ne doit surtout pas non plus être
    // silencieusement assimilé au premier état de la liste.
    setup({ status: 'draft' });
    expect(
      screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(0);
  });

  it('n’affiche l’encart d’attente que pour « Attente prestataire »', () => {
    const { onClose } = setup({ status: 'in_progress', awaitingSince: '2026-08-21T10:00:00.000Z' });
    expect(screen.queryByText(/attente du prestataire depuis/i)).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('compte les jours d’attente depuis la date fournie et dit que ce temps est déduit', () => {
    setup({
      status: 'awaiting_provider',
      awaitingSince: '2026-08-21T10:00:00.000Z',
      now: new Date('2026-08-31T10:00:00.000Z'),
    });
    const encart = screen.getByText(/attente du prestataire depuis/i);
    expect(encart).toHaveTextContent('10 jours');
    expect(encart).toHaveTextContent(/déduit/i);
  });

  it('accorde le singulier au bout d’un jour', () => {
    setup({
      status: 'awaiting_provider',
      awaitingSince: '2026-08-30T10:00:00.000Z',
      now: new Date('2026-08-31T10:00:00.000Z'),
    });
    expect(screen.getByText(/attente du prestataire depuis/i)).toHaveTextContent('1 jour');
  });

  it('en attente SANS date connue, le dit au lieu d’inventer un compte', () => {
    // Une demande née AVANT la bascule 17g n’a pas d’événement de création au journal : la
    // date d’entrée en attente peut manquer. Afficher « 0 jour » serait un chiffre faux.
    setup({ status: 'awaiting_provider', awaitingSince: null });
    const encart = screen.getByText(/attente du prestataire/i);
    expect(encart).toHaveTextContent(/depuis une date inconnue|date d’entrée en attente inconnue/i);
    expect(encart).not.toHaveTextContent(/0 jour/);
  });

  it('« Enregistrer » envoie le choix puis ferme', async () => {
    const user = userEvent.setup();
    const { onChangeStatus, onClose } = setup({ status: 'new' });

    await user.click(screen.getByRole('button', { name: 'Attente prestataire' }));
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(onChangeStatus).toHaveBeenCalledWith('int-1', 'awaiting_provider'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('n’écrit pas quand le statut choisi est déjà le statut courant', async () => {
    const user = userEvent.setup();
    const { onChangeStatus, onClose } = setup({ status: 'new' });

    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(onChangeStatus).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('en lecture seule, les six états sont RENDUS mais désactivés, avec la raison', () => {
    // Doctrine no-write-trap : on ne masque pas un contrôle interdit, on le désactive en
    // disant pourquoi — sinon l’utilisateur cherche une action qui n’apparaît jamais.
    setup({ canWrite: false, readOnlyReason: 'Vous n’avez pas le droit d’écrire sur ce CRM.' });

    const chip = screen.getByRole('button', { name: 'Traitée' });
    expect(chip).toBeDisabled();
    expect(chip).toHaveAttribute('title', 'Vous n’avez pas le droit d’écrire sur ce CRM.');
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
  });

  it('affiche l’échec de l’écriture au lieu de fermer sur une erreur avalée', async () => {
    const user = userEvent.setup();
    const onChangeStatus = jest.fn().mockRejectedValue(new Error('Écriture refusée'));
    const onClose = jest.fn();
    render(
      <CrmStatusModal
        rootId="int-1"
        status="new"
        canWrite
        awaitingSince={null}
        onChangeStatus={onChangeStatus}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Clôturée' }));
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(await screen.findByText('Écriture refusée')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('câblage de la date d’attente — le journal est-il réellement lu ?', () => {
  /* Ce bloc existe parce que le service `listCrmStatusEvents` a bien failli rester du CODE
     MORT : il était écrit, testé, et AUCUN hôte ne le branchait. L'encart aurait alors dit
     « depuis une date inconnue » pour toujours, sans qu'aucun test ne rougisse — tous les
     tests de la modale passent la date en prop.
     La garde porte donc sur le CÂBLAGE lui-même, au niveau du fichier source. */
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');

  it.each(['CrmActorFiche.tsx', 'CrmObjectView.tsx', 'CrmTimelineView.tsx'])(
    '%s passe loadAwaitingSince à la timeline',
    (fichier) => {
      const src = readFileSync(join(__dirname, fichier), 'utf8');
      // Le passage à la timeline…
      expect(src).toMatch(/loadAwaitingSince=\{loadAwaitingSince\}/);
      // …et son import depuis le service : sans lui, le passage ne compilerait pas, mais
      // l'assertion le dit explicitement plutôt que de s'en remettre à tsc.
      expect(src).toMatch(/^\s*loadAwaitingSince,$/m);
    },
  );
});
