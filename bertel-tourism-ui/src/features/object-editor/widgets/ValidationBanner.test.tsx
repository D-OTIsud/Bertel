import { fireEvent, render, screen } from '@testing-library/react';
import { ValidationBanner } from './ValidationBanner';

describe('ValidationBanner', () => {
  it('lists blockers and navigates to issue sections without a publish button', () => {
    const onGoToSection = jest.fn();
    render(
      <ValidationBanner
        blockers={[{ section: '01', message: 'Nom requis', tone: 'req' }]}
        warnings={[{ section: '02', message: 'Texte court', tone: 'warn' }]}
        typeCode="HOT"
        mode="complet"
        onGoToSection={onGoToSection}
      />,
    );

    expect(screen.queryByRole('button', { name: /Publier/ })).not.toBeInTheDocument();
    expect(screen.getByText(/1 blocage/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Corriger/ }));
    expect(onGoToSection).toHaveBeenCalledWith('01');
  });
});
