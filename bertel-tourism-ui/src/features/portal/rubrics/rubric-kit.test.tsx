import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortalField } from './rubric-kit';

test('l’aide est disponible au clavier, sans soumettre le formulaire, et Échap restaure le focus', async () => {
  const submit = jest.fn((event) => event.preventDefault());
  render(<form onSubmit={submit}><PortalField id="phone" label="Téléphone" hint="Votre numéro public.">
    {(slots) => <input {...slots} />}
  </PortalField><button>Valider</button></form>);
  const help = screen.getByRole('button', { name: 'Aide : Téléphone' });
  expect(help).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
  await userEvent.click(help);
  expect(screen.getByRole('note')).toHaveTextContent('Votre numéro public.');
  expect(screen.getByRole('textbox', { name: 'Téléphone' })).toHaveAttribute('aria-describedby', 'phone-hint');
  expect(submit).not.toHaveBeenCalled();
  await userEvent.keyboard('{Escape}');
  expect(help).toHaveFocus();
  expect(help).toHaveAttribute('aria-expanded', 'false');
});

test('cliquer un champ referme l’aide et une erreur reste affichée sous le champ', async () => {
  render(<PortalField id="email" label="E-mail" hint="Adresse publique." error="Adresse invalide.">
    {(slots) => <input {...slots} />}
  </PortalField>);
  await userEvent.click(screen.getByRole('button', { name: 'Aide : E-mail' }));
  await userEvent.click(screen.getByRole('textbox'));
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Adresse invalide.');
  expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
});
