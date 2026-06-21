const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { render, screen } from '@testing-library/react';
import { CreateObjectButton } from './CreateObjectButton';
import { useSessionStore } from '../../../store/session-store';

beforeEach(() => {
  push.mockReset();
});

it('renders nothing when the user cannot edit objects', () => {
  useSessionStore.setState({ canEditObjects: false } as never);
  const { container } = render(<CreateObjectButton />);
  expect(container).toBeEmptyDOMElement();
});

it('shows the create CTA when the user can edit objects', () => {
  useSessionStore.setState({ canEditObjects: true } as never);
  render(<CreateObjectButton />);
  expect(screen.getByRole('button', { name: /créer une fiche/i })).toBeInTheDocument();
});
