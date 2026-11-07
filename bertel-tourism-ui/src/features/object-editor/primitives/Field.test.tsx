import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Field } from './Field';
import { Input } from './Input';
import { Select } from './Select';
import { Textarea } from './Textarea';
import { Readout } from './Readout';

describe('Field (D2 : label/hint/erreur câblés)', () => {
  it('associe le label au contrôle natif via htmlFor/id', () => {
    render(
      <Field label="Nom commercial">
        <Input value="" onChange={jest.fn()} />
      </Field>,
    );
    // getByLabelText ne matche que si l'association label↔input est réelle.
    expect(screen.getByLabelText('Nom commercial')).toBeInTheDocument();
  });

  it('required : étoile masquée aux lecteurs d’écran + « (obligatoire) » sr-only + aria-required', () => {
    render(
      <Field label="Nom" required>
        <Input value="" onChange={jest.fn()} />
      </Field>,
    );
    const input = screen.getByLabelText(/^Nom/);
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(screen.getByText('(obligatoire)')).toHaveClass('sr-only');
  });

  it('hint : description accessible sans sous-titre visible répété', () => {
    render(
      <Field label="Durée" hint="En minutes">
        <Input value="" onChange={jest.fn()} />
      </Field>,
    );
    const input = screen.getByLabelText('Durée');
    expect(input).toHaveAccessibleDescription('En minutes');
    expect(screen.getByText('En minutes')).toBeInTheDocument();
    expect(screen.getByText('En minutes')).toHaveClass('sr-only');
    expect(screen.getByRole('button', { name: 'Aide : Durée' })).not.toHaveAttribute('title');
  });

  it('ouvre au focus, au survol et au toucher ; ferme par Échap, clic extérieur et départ du focus', async () => {
    render(<Field label="Durée" hint="En minutes"><Input value="" onChange={jest.fn()} /></Field>);
    const help = screen.getByRole('button', { name: 'Aide : Durée' });
    const input = screen.getByLabelText('Durée');
    expect(input).toHaveAccessibleDescription('En minutes');
    expect(document.querySelector('[data-field-help]')).toBeNull();
    fireEvent.mouseEnter(help);
    expect(help).toHaveAttribute('aria-expanded', 'true');
    fireEvent.mouseLeave(help);
    const bubble = document.querySelector('[data-field-help]')!;
    fireEvent.mouseEnter(bubble);
    expect(help).toHaveAttribute('aria-expanded', 'true');
    fireEvent.mouseLeave(bubble);
    await waitFor(() => expect(help).toHaveAttribute('aria-expanded', 'false'));
    fireEvent.focus(help);
    expect(help).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(help, { key: 'Escape' });
    expect(help).toHaveFocus();
    expect(help).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(help);
    expect(help).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(input);
    expect(help).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(help);
    fireEvent.blur(help);
    expect(help).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAccessibleDescription('En minutes');
  });

  it('conserve la description du Readout lorsque l’aide est fermée', () => {
    render(<Field label="ID OTI" hint="Identifiant canonique"><Readout value="HOT-01" /></Field>);
    const value = screen.getByText('HOT-01').closest('.readout');
    expect(value).toHaveAccessibleDescription('Identifiant canonique');
    expect(value).toHaveAttribute('id');
  });

  it('error : paragraphe role=alert + aria-invalid + décrit le contrôle (hint + erreur cumulés)', () => {
    render(
      <Field label="Email" hint="Adresse de contact" error="Format invalide">
        <Input value="abc" onChange={jest.fn()} />
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Format invalide');
    expect(input).toHaveAccessibleDescription('Adresse de contact Format invalide');
  });

  it('câble aussi Select et Textarea (les primitives transmettent id/aria-*)', () => {
    render(
      <>
        <Field label="Catégorie" error="Choix requis">
          <Select value="a" options={['a', 'b']} onChange={jest.fn()} />
        </Field>
        <Field label="Description">
          <Textarea value="" onChange={jest.fn()} />
        </Field>
      </>,
    );
    expect(screen.getByLabelText('Catégorie')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  it('sans erreur : pas de role=alert ni aria-invalid', () => {
    render(
      <Field label="Nom">
        <Input value="x" onChange={jest.fn()} />
      </Field>,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nom')).not.toHaveAttribute('aria-invalid');
  });
});
