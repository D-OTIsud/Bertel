import { render } from '@testing-library/react';
import OtiTemplate from './OtiTemplate';

describe('OtiTemplate — lang attribute', () => {
  it('exposes lang="fr" on the root for the French template', () => {
    const { container } = render(
      <OtiTemplate template="carnet" lang="fr" accent="teal" name="Sélection test" items={[]} showMap={false} />,
    );
    expect(container.querySelector('.oti')).toHaveAttribute('lang', 'fr');
  });

  it('exposes lang="en" on the root for the English template', () => {
    const { container } = render(
      <OtiTemplate template="carnet" lang="en" accent="teal" name="Test list" items={[]} showMap={false} />,
    );
    expect(container.querySelector('.oti')).toHaveAttribute('lang', 'en');
  });
});
