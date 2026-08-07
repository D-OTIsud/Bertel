import { render, screen } from '@testing-library/react';
import { ListComposeEmailsButton } from './ListComposeView';
import { useSessionStore } from '../store/session-store';

jest.mock('@/services/selection-emails', () => ({
  ...jest.requireActual('@/services/selection-emails'),
  fetchSelectionEmails: jest.fn(() => new Promise(() => {})),
}));

describe('ListComposeView — bouton E-mails', () => {
  it('un éditeur voit le bouton', () => {
    useSessionStore.setState({ canEditObjects: true });
    render(<ListComposeEmailsButton listId="list-1" />);
    expect(screen.getByRole('button', { name: /E-mails/ })).toBeInTheDocument();
  });

  it('un lecteur seul ne voit PAS le bouton', () => {
    useSessionStore.setState({ canEditObjects: false });
    render(<ListComposeEmailsButton listId="list-1" />);
    expect(screen.queryByRole('button', { name: /E-mails/ })).toBeNull();
  });
});
