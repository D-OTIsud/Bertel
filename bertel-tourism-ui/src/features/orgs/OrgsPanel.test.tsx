import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { OrgsPanel } from './OrgsPanel';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('../../services/orgs', () => ({ listOrgs: jest.fn() }));
import { listOrgs } from '../../services/orgs';

beforeEach(() => { push.mockClear(); (listOrgs as jest.Mock).mockResolvedValue([
  { id: 'ORGRUN1', name: 'OTI du Sud', status: 'published', regionCode: 'RUN', accessScope: 'own_objects_only', memberCount: 4, createdAt: '2026-07-03' },
  { id: 'ORGRUN2', name: 'OTI Ouest', status: 'published', regionCode: 'RUN', accessScope: 'all_published', memberCount: 0, createdAt: '2026-07-03' },
]); });

test('rend les organisations avec le périmètre traduit', async () => {
  render(<OrgsPanel />);
  expect(await screen.findByText('OTI du Sud')).toBeInTheDocument();
  expect(screen.getByText('OTI Ouest')).toBeInTheDocument();
  expect(screen.getByText('Ses fiches uniquement')).toBeInTheDocument();
  expect(screen.getByText('Tout le publié')).toBeInTheDocument();
});

test('« Gérer l’équipe » navigue vers /settings?section=team&org=', async () => {
  render(<OrgsPanel />);
  await screen.findByText('OTI du Sud');
  fireEvent.click(screen.getAllByText('Gérer l’équipe')[0]);
  await waitFor(() => expect(push).toHaveBeenCalledWith('/settings?section=team&org=ORGRUN1'));
});
