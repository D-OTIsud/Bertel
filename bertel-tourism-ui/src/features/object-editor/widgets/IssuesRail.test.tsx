import { fireEvent, render, screen } from '@testing-library/react';
import { IssuesRail } from './IssuesRail';

describe('IssuesRail', () => {
  it('lists issues and navigates to their section', () => {
    const onGoToSection = jest.fn();
    render(
      <IssuesRail
        items={[{ section: '02', message: 'Descriptif court', tone: 'warn' }]}
        onGoToSection={onGoToSection}
      />,
    );

    fireEvent.click(screen.getByText('Descriptif court'));
    expect(onGoToSection).toHaveBeenCalledWith('02');
  });
});
