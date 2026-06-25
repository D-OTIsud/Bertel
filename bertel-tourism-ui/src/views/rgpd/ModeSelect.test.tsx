import { render, screen, fireEvent } from '@testing-library/react';
import { ModeSelect } from './ModeSelect';

describe('ModeSelect', () => {
  it('rend deux radios avec aria-checked reflétant la valeur', () => {
    render(<ModeSelect value="anonymize" onChange={jest.fn()} />);
    expect(screen.getByRole('radio', { name: /Anonymiser/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Supprimer/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('émet onChange(delete) au clic sur Supprimer', () => {
    const onChange = jest.fn();
    render(<ModeSelect value="anonymize" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /Supprimer/i }));
    expect(onChange).toHaveBeenCalledWith('delete');
  });

  it('bascule le mode au clavier (flèche)', () => {
    const onChange = jest.fn();
    render(<ModeSelect value="anonymize" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenCalledWith('delete');
  });

  it('ne déclenche rien quand disabled', () => {
    const onChange = jest.fn();
    render(<ModeSelect value="anonymize" onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('radio', { name: /Supprimer/i }));
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowDown' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
