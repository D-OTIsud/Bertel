import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';

let mockPathname = '/explorer';
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));

beforeEach(() => {
  mockPathname = '/explorer';
  useSessionStore.setState({
    role: 'super_admin',
    adminRank: null,
    demoMode: true,
    userName: 'D. Philippe',
  } as never);
  useThemeStore.setState({
    theme: { ...useThemeStore.getState().theme, brandName: 'Bertel', logoUrl: null },
  } as never);
});

describe('Sidebar', () => {
  it('renders nav items with their visible labels for the role', () => {
    render(<Sidebar onOpenProfile={() => {}} />);
    expect(screen.getByText('Explorer')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('CRM')).toBeInTheDocument();
  });

  it('marks the active route item with aria-current="page"', () => {
    mockPathname = '/dashboard';
    render(<Sidebar onOpenProfile={() => {}} />);
    expect(screen.getByRole('link', { name: /Dashboard/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Explorer/i })).not.toHaveAttribute('aria-current');
  });

  it('shows the Équipe item for a team administrator', () => {
    useSessionStore.setState({ role: 'super_admin' } as never);
    render(<Sidebar onOpenProfile={() => {}} />);
    expect(screen.getByText('Équipe')).toBeInTheDocument();
  });

  it('hides the Équipe item for a non-admin role', () => {
    useSessionStore.setState({ role: 'tourism_agent', adminRank: null } as never);
    render(<Sidebar onOpenProfile={() => {}} />);
    expect(screen.queryByText('Équipe')).not.toBeInTheDocument();
  });

  it('calls onOpenProfile when the profile button is clicked', () => {
    const onOpenProfile = jest.fn();
    render(<Sidebar onOpenProfile={onOpenProfile} />);
    fireEvent.click(screen.getByRole('button', { name: /Profil/i }));
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it('renders the settings link', () => {
    render(<Sidebar onOpenProfile={() => {}} />);
    expect(screen.getByRole('link', { name: /Settings/i })).toBeInTheDocument();
  });
});
