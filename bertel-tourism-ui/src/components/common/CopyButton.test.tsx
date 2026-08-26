import { act, fireEvent, render, screen } from '@testing-library/react';
import { CopyButton } from './CopyButton';

// Recette clipboard maison (cf. CopyEmailsModal.test.tsx) : JSDOM n'a pas de
// navigator.clipboard — on l'installe par test.
function mockClipboard(impl: () => Promise<void> = () => Promise.resolve()) {
  const writeText = jest.fn(impl);
  Object.assign(navigator, { clipboard: { writeText } });
  return writeText;
}

describe('CopyButton', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('copie la valeur AFFICHÉE et bascule Copy → Check puis revient après ~1 s', async () => {
    const writeText = mockClipboard();
    const { container } = render(<CopyButton value="flo.girard123@gmail.com" />);

    const button = screen.getByRole('button', { name: 'Copier dans le presse-papiers' });
    await act(async () => {
      fireEvent.click(button);
    });

    // La valeur brute part au presse-papiers (jamais le href mailto:/tel:).
    expect(writeText).toHaveBeenCalledWith('flo.girard123@gmail.com');
    expect(container.querySelector('.lucide-check')).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(container.querySelector('.lucide-check')).toBeNull();
    expect(container.querySelector('.lucide-copy')).not.toBeNull();
  });

  it('ne propage pas le clic (bouton voisin/enfant de zones cliquables) et empêche le défaut', async () => {
    mockClipboard();
    const parentClick = jest.fn();
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={parentClick}>
        <CopyButton value="0693 87 57 74" label="Copier 0693 87 57 74" />
      </div>,
    );

    let defaultAllowed = true;
    await act(async () => {
      defaultAllowed = fireEvent.click(screen.getByRole('button', { name: 'Copier 0693 87 57 74' }));
    });

    expect(parentClick).not.toHaveBeenCalled();
    expect(defaultAllowed).toBe(false); // preventDefault ⇒ un <a> hôte ne naviguerait pas
  });

  it('presse-papiers refusé : pas de crash, pas de faux feedback « copié »', async () => {
    mockClipboard(() => Promise.reject(new Error('denied')));
    const { container } = render(<CopyButton value="x" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(container.querySelector('.lucide-check')).toBeNull();
    expect(container.querySelector('.lucide-copy')).not.toBeNull();
  });
});
