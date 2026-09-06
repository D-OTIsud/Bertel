import { render, screen, fireEvent } from '@testing-library/react';
import { LangTabs } from './LangTabs';

describe('LangTabs', () => {
  it('marks the active tab with aria-pressed and fires onSelect', () => {
    const onSelect = jest.fn();
    render(
      <LangTabs
        active="fr"
        onSelect={onSelect}
        tabs={[
          { code: 'fr', label: 'Français', filled: true },
          { code: 'en', label: 'English', filled: false },
        ]}
      />,
    );

    const fr = screen.getByRole('button', { name: 'Français' });
    const en = screen.getByRole('button', { name: 'English' });
    expect(fr).toHaveAttribute('aria-pressed', 'true');
    expect(en).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(en);
    expect(onSelect).toHaveBeenCalledWith('en');
  });
});
