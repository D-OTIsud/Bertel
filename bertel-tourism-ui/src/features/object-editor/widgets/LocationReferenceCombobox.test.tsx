import { fireEvent, render, screen } from '@testing-library/react';
import { LocationReferenceCombobox } from './LocationReferenceCombobox';

describe('LocationReferenceCombobox', () => {
  it('selects an existing option and normalizes on pick', () => {
    const onChange = jest.fn();
    render(
      <LocationReferenceCombobox
        value=""
        options={['Bras-Long', 'Centre Ville']}
        onChange={onChange}
        aria-label="Lieu-dit"
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Lieu-dit' });
    fireEvent.change(input, { target: { value: 'bras' } });
    fireEvent.click(screen.getByRole('option', { name: 'Bras-Long' }));
    expect(onChange).toHaveBeenCalledWith('Bras-Long');
  });

  it('creates a new normalized lieu-dit from typed text', () => {
    const onChange = jest.fn();
    render(
      <LocationReferenceCombobox
        value=""
        options={['Bras-Long']}
        onChange={onChange}
        aria-label="Lieu-dit"
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Lieu-dit' });
    fireEvent.change(input, { target: { value: 'chemin du bel air' } });
    fireEvent.click(screen.getByRole('option', { name: 'Ajouter « Chemin du Bel Air »' }));
    expect(onChange).toHaveBeenCalledWith('Chemin du Bel Air');
  });
});
