/**
 * « Vérifiez ces informations » — et le seul message que le partenaire peut laisser.
 *
 * CE MESSAGE PEUT ÊTRE LA SEULE CHOSE QU'IL A SAISIE. Sans rubrique modifiée il n'y a ni
 * barre d'envoi ni fenêtre : cette carte est alors le SEUL endroit où son texte s'affiche.
 * Un état figé au premier rendu — la note arrive par un effet, donc vide au montage — le
 * rendait invisible, puis un simple clic ailleurs (`onBlur`) l'effaçait.
 *
 * Et la note est PARTAGÉE avec la fenêtre d'envoi : chacun ne touche que sa part.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortalVerifyCard } from './PortalVerifyCard';

const BASE = {
  ficheName: 'Le Longanis',
  typeLabel: 'Restaurant',
  address: '12 rue des Bons-Enfants, 97410 Saint-Pierre',
  publicPhone: '0692 45 12 30',
  officeEmail: 'contact@oti.re',
  officePhone: '0262 00 00 00',
  hasPendingChanges: false,
};

function setup(over: Partial<React.ComponentProps<typeof PortalVerifyCard>> = {}) {
  const onNoteChange = jest.fn();
  const props = { ...BASE, note: '', onNoteChange, ...over };
  const view = render(<PortalVerifyCard {...props} />);
  return { onNoteChange, view, props };
}

describe('PortalVerifyCard', () => {
  it('affiche les informations tenues par l’office, en lecture seule', () => {
    setup();
    expect(screen.getByText('Le Longanis')).toBeInTheDocument();
    expect(screen.getByText('12 rue des Bons-Enfants, 97410 Saint-Pierre')).toBeInTheDocument();
    expect(screen.getByText('0692 45 12 30')).toBeInTheDocument();
  });

  it('un signalement DÉJÀ enregistré est visible SANS avoir à recliquer', () => {
    // Le cas qui perdait tout : le partenaire revient le lendemain, aucune rubrique
    // modifiée, donc aucune barre d'envoi. Si la carte ne montre pas son texte, il n'existe
    // nulle part à l'écran.
    setup({ note: 'Erreur signalée : mon adresse est fausse.' });

    expect(screen.getByLabelText('Dites-nous ce qui est faux')).toHaveValue('mon adresse est fausse.');
  });

  it('se resynchronise quand la note arrive APRÈS le premier rendu (restauration du brouillon)', () => {
    const { view, props } = setup({ note: '' });
    expect(screen.queryByLabelText('Dites-nous ce qui est faux')).not.toBeInTheDocument();

    // `usePortalDraft` restaure la note dans un effet : au premier rendu elle vaut ''.
    view.rerender(<PortalVerifyCard {...props} note="Erreur signalée : le nom est mal écrit." />);

    expect(screen.getByLabelText('Dites-nous ce qui est faux')).toHaveValue('le nom est mal écrit.');
  });

  it('quitter le champ N’EFFACE PAS un signalement enregistré', async () => {
    const { onNoteChange } = setup({ note: 'Erreur signalée : mon adresse est fausse.' });

    const field = screen.getByLabelText('Dites-nous ce qui est faux');
    await userEvent.click(field);
    await userEvent.tab();

    // Au pire il réécrit la même chose ; jamais une chaîne vide.
    for (const call of onNoteChange.mock.calls) {
      expect(call[0]).toContain('mon adresse est fausse.');
    }
  });

  it('ne DÉTRUIT PAS le message libre écrit dans la fenêtre d’envoi', async () => {
    const { onNoteChange } = setup({ note: 'Nouveaux horaires d’été' });

    await userEvent.click(screen.getByRole('button', { name: 'Signaler une erreur' }));
    await userEvent.type(screen.getByLabelText('Dites-nous ce qui est faux'), 'le nom est faux');
    await userEvent.click(screen.getByRole('button', { name: 'Garder ce signalement' }));

    const written = onNoteChange.mock.calls.at(-1)?.[0] as string;
    expect(written).toContain('le nom est faux');
    expect(written).toContain('Nouveaux horaires d’été');
  });

  it('sans aucune rubrique modifiée : dit que le message attendra, et donne les DEUX voies immédiates', async () => {
    setup({ note: 'Erreur signalée : test', hasPendingChanges: false });

    expect(screen.getByText(/Ce message partira avec votre prochain envoi/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'contact@oti.re' })).toHaveAttribute('href', 'mailto:contact@oti.re');
    // Le téléphone n'est pas décoratif : un mailto: échoue en silence sur un téléphone
    // sans application de courrier.
    expect(screen.getByRole('link', { name: '0262 00 00 00' })).toHaveAttribute('href', 'tel:0262000000');
    expect(screen.getByRole('button', { name: /Copier l’adresse e-mail/ })).toBeInTheDocument();
  });

  it('sans e-mail NI téléphone d’office : une phrase, jamais un bouton mort', () => {
    setup({ note: 'Erreur signalée : test', officeEmail: null, officePhone: null });

    expect(screen.getByText(/Contactez votre office de tourisme\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copier/ })).not.toBeInTheDocument();
  });

  it('avec des rubriques modifiées : le message part avec l’envoi, pas de repli d’urgence', () => {
    setup({ note: 'Erreur signalée : test', hasPendingChanges: true });

    expect(screen.queryByText(/Ce message partira avec votre prochain envoi/)).not.toBeInTheDocument();
  });

  it('un signalement à DEUX paragraphes ne perd pas le second après un blur', async () => {
    // Le second paragraphe migrait dans la moitié « message libre », invisible ici : rien
    // n'était perdu dans ce qui part à l'office, mais le partenaire VOYAIT s'effacer ce
    // qu’il venait de taper — dans le composant même de la Critique 1.
    const { onNoteChange, view, props } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Signaler une erreur' }));
    await userEvent.click(screen.getByLabelText('Dites-nous ce qui est faux'));
    await userEvent.paste('Le nom est faux.\n\nEt l’adresse aussi.');
    await userEvent.click(screen.getByRole('button', { name: 'Garder ce signalement' }));

    const written = onNoteChange.mock.calls.at(-1)?.[0] as string;
    view.rerender(<PortalVerifyCard {...props} note={written} />);
    expect(screen.getByLabelText('Dites-nous ce qui est faux')).toHaveValue('Le nom est faux.\n\nEt l’adresse aussi.');
  });
  it('vider le signalement ne laisse pas le préfixe orphelin dans la note', async () => {
    const { onNoteChange } = setup({ note: 'Erreur signalée : ancienne erreur' });

    const field = screen.getByLabelText('Dites-nous ce qui est faux');
    await userEvent.clear(field);
    await userEvent.click(screen.getByRole('button', { name: 'Garder ce signalement' }));

    expect(onNoteChange).toHaveBeenLastCalledWith('');
  });
});
