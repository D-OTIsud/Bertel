import { render, screen } from '@testing-library/react';
import { Field } from './Field';
import { Input } from './Input';
import { Select } from './Select';
import { Textarea } from './Textarea';

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

  it('hint : rendu en paragraphe visible relié par aria-describedby', () => {
    render(
      <Field label="Durée" hint="En minutes">
        <Input value="" onChange={jest.fn()} />
      </Field>,
    );
    const input = screen.getByLabelText('Durée');
    expect(input).toHaveAccessibleDescription('En minutes');
    expect(screen.getByText('En minutes')).toBeInTheDocument();
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
