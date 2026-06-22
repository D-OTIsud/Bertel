const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('../useObjectSearch', () => ({ useObjectSearch: () => ({ results: [], loading: false }) }));

import { render, screen } from '@testing-library/react';
import { CreateObjectButton } from './CreateObjectButton';
import { useSessionStore } from '../../../store/session-store';

beforeEach(() => {
  push.mockReset();
});

it('renders nothing when the user cannot create objects', () => {
  useSessionStore.setState({ canCreateObjects: false } as never);
  const { container } = render(<CreateObjectButton />);
  expect(container).toBeEmptyDOMElement();
});

it('shows the create CTA when the user can create objects', () => {
  useSessionStore.setState({ canCreateObjects: true } as never);
  render(<CreateObjectButton />);
  expect(screen.getByRole('button', { name: /créer une fiche/i })).toBeInTheDocument();
});
