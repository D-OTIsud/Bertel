import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortalOfficeReturns } from './PortalOfficeReturns';
import { PORTAL_RUBRICS, type BuiltPortalRubric } from './portal-rubrics';

test('distingue une correction, une acceptation à reporter et une modification publiée', async () => {
  const onOpenRubric = jest.fn();
  const rubrics = PORTAL_RUBRICS.filter((rubric) => rubric.archetypes.includes('RES')).map((rubric) => ({ ...rubric, state: 'filled', readOnlyReason: null })) as BuiltPortalRubric[];
  render(<PortalOfficeReturns rubrics={rubrics} rejections={[{ module: 'openings', rubricId: 'hours', title: 'Vos horaires', note: 'Confirmez la fermeture à 22 h.' }]}
    approvedModules={new Set(['contacts'])} appliedModules={new Set(['pricing'])} hubHref="/espace/fiches/RES1" officeEmail="contact@office.test" onBack={jest.fn()} onOpenRubric={onOpenRubric} />);
  expect(screen.getByRole('heading', { name: 'Retours de l’office' })).toHaveFocus();
  expect(screen.getByText('Confirmez la fermeture à 22 h.')).toBeInTheDocument();
  expect(screen.getByText('Accepté — en cours de report')).toBeInTheDocument();
  expect(screen.getByText('Publié')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'Corriger vos horaires' }));
  expect(onOpenRubric).toHaveBeenCalledWith('hours');
});
