import { fireEvent, render, screen } from '@testing-library/react';
import { ValidationBanner } from './ValidationBanner';

describe('ValidationBanner', () => {
  it('disables publishing while blockers exist and navigates to issue sections', () => {
    const onGoToSection = jest.fn();
    render(
      <ValidationBanner
        blockers={[{ section: '01', message: 'Nom requis', tone: 'req' }]}
        warnings={[{ section: '02', message: 'Texte court', tone: 'warn' }]}
        typeCode="HOT"
        mode="complet"
        onGoToSection={onGoToSection}
        onPublish={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Publier maintenant/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Corriger/ }));
    expect(onGoToSection).toHaveBeenCalledWith('01');
  });
});
