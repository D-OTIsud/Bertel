import { render, screen, fireEvent } from '@testing-library/react';
import { AvatarPicker } from './AvatarPicker';

describe('AvatarPicker', () => {
  it('affiche les initiales de repli quand aucune photo n’est posée', () => {
    render(
      <AvatarPicker
        avatarUrl={null}
        alt="Photo de David"
        initials="DP"
        buttonContent="Ajouter une photo"
        onFileSelected={jest.fn()}
      />,
    );
    expect(screen.getByText('DP')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('affiche la photo (avec le texte alternatif fourni) quand une URL est posée', () => {
    render(
      <AvatarPicker
        avatarUrl="https://cdn.example/avatar.jpg"
        alt="Photo de David"
        initials="DP"
        buttonContent="Changer la photo"
        onFileSelected={jest.fn()}
      />,
    );
    const img = screen.getByRole('img', { name: 'Photo de David' });
    expect(img).toHaveAttribute('src', 'https://cdn.example/avatar.jpg');
    expect(screen.queryByText('DP')).not.toBeInTheDocument();
  });

  it('remonte le fichier choisi et permet de re-sélectionner le même fichier', () => {
    const onFileSelected = jest.fn();
    render(
      <AvatarPicker
        avatarUrl={null}
        alt="Photo de David"
        initials="DP"
        buttonContent="Ajouter une photo"
        onFileSelected={onFileSelected}
      />,
    );
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/ajouter une photo/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(onFileSelected).toHaveBeenCalledWith(file);
    expect(input.value).toBe(''); // reset — permet de re-sélectionner le même fichier
  });

  it('le contenu du bouton est fourni par l’appelant (ReactNode libre)', () => {
    render(
      <AvatarPicker
        avatarUrl={null}
        alt="Photo de David"
        initials="DP"
        buttonContent={<span data-testid="custom-button-content">Envoi…</span>}
        onFileSelected={jest.fn()}
      />,
    );
    expect(screen.getByTestId('custom-button-content')).toHaveTextContent('Envoi…');
  });

  it('désactive l’input quand `disabled` est posé (envoi en cours, mode démo, etc. — un seul signal)', () => {
    render(
      <AvatarPicker
        avatarUrl={null}
        alt="Photo de David"
        initials="DP"
        disabled
        buttonContent="Envoi…"
        onFileSelected={jest.fn()}
      />,
    );
    expect(screen.getByLabelText(/Envoi…/i)).toBeDisabled();
  });

  it('n’appelle pas onFileSelected si la sélection est annulée (aucun fichier)', () => {
    const onFileSelected = jest.fn();
    render(
      <AvatarPicker
        avatarUrl={null}
        alt="Photo de David"
        initials="DP"
        buttonContent="Ajouter une photo"
        onFileSelected={onFileSelected}
      />,
    );
    const input = screen.getByLabelText(/ajouter une photo/i);
    fireEvent.change(input, { target: { files: [] } });
    expect(onFileSelected).not.toHaveBeenCalled();
  });
});
