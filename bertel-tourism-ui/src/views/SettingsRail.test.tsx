import { act, cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { SettingsRail } from './SettingsRail';
import { buildSettingsNav, SETTINGS_NEW_BADGE_DURATION_MS, type SettingsNavGroup } from './settings-nav';

describe('SettingsRail (Phase 7.1)', () => {
  it('rend les groupes et leurs sections ; la section active porte aria-current=page', () => {
    render(<SettingsRail groups={buildSettingsNav('super_admin')} activeSection="markers" onSelect={jest.fn()} />);
    expect(screen.getByText('Mon compte')).toBeInTheDocument();
    expect(screen.getByText('Plateforme')).toBeInTheDocument();
    const active = screen.getByRole('button', { name: 'Marqueurs' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Préférences' })).not.toHaveAttribute('aria-current');
  });

  it('un clic sur une section appelle onSelect avec son id', () => {
    const onSelect = jest.fn();
    render(<SettingsRail groups={buildSettingsNav('super_admin')} activeSection="preferences" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apparence' }));
    expect(onSelect).toHaveBeenCalledWith('appearance');
  });

  it('rend le railhead « Paramètres » et le badge de périmètre des groupes gated', () => {
    render(<SettingsRail groups={buildSettingsNav('super_admin', { canManageTeam: true })} activeSection="preferences" onSelect={jest.fn()} />);
    // Railhead (fidélité maquette p7-01).
    expect(screen.getByText('Paramètres')).toBeInTheDocument();
    // Périmètre : « tout le monde » (non gated) + badges « admin ORG » / « super-admin » (gated).
    expect(screen.getByText('tout le monde')).toBeInTheDocument();
    expect(screen.getByText('admin ORG')).toBeInTheDocument();
    expect(screen.getByText('super-admin')).toBeInTheDocument();
  });
});

describe('SettingsRail — expiration des nouveautés', () => {
  const start = Date.parse('2026-09-06T00:00:00Z');
  const expiresAt = start + 14 * 24 * 60 * 60 * 1000;
  const groups: SettingsNavGroup[] = [{
    id: 'platform', label: 'Plateforme', scope: { label: 'super-admin', gated: true },
    sections: [{ id: 'smtp', label: 'E-mails & SMTP', introducedAt: '2026-09-06T00:00:00Z' }],
  }];
  const renderRail = () => render(<SettingsRail groups={groups} activeSection="smtp" onSelect={jest.fn()} />);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(start);
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('affiche les trois nouveautés du 6 septembre sans rebadger les anciennes sections', () => {
    render(<SettingsRail groups={buildSettingsNav('super_admin', { canManageActorPortal: true, canManageOrgBranding: true })} activeSection="smtp" onSelect={jest.fn()} />);

    expect(screen.getAllByText('Nouveau')).toHaveLength(3);
    for (const name of [/Portail acteurs/, /E-mails & SMTP/, /Corpus de test/]) {
      expect(within(screen.getByRole('button', { name })).getByText('Nouveau')).toBeInTheDocument();
    }
    for (const name of [/Apparence de l’organisation/, /Listes & référentiels/, /Clés API partenaire/, /Organisations/]) {
      expect(within(screen.getByRole('button', { name })).queryByText('Nouveau')).not.toBeInTheDocument();
    }
  });

  it('retire le badge exactement à son expiration sans interaction ni navigation', () => {
    jest.setSystemTime(expiresAt - 1);
    renderRail();
    expect(screen.getByText('Nouveau')).toBeInTheDocument();

    act(() => { jest.advanceTimersByTime(1); });

    expect(screen.queryByText('Nouveau')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'E-mails & SMTP' })).toHaveAttribute('aria-current', 'page');
  });

  it('recalcule la date au retour sur un onglet resté ouvert plusieurs semaines', () => {
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    renderRail();
    expect(screen.getByText('Nouveau')).toBeInTheDocument();
    jest.setSystemTime(start + 6 * 7 * 24 * 60 * 60 * 1000);

    fireEvent(document, new Event('visibilitychange'));

    expect(screen.queryByText('Nouveau')).not.toBeInTheDocument();
  });

  it('affiche une nouveauté future à son lancement puis la masque après 14 jours', () => {
    jest.setSystemTime(start - 1000);
    renderRail();
    expect(screen.queryByText('Nouveau')).not.toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(999); });
    expect(screen.queryByText('Nouveau')).not.toBeInTheDocument();

    act(() => { jest.advanceTimersByTime(1); });
    expect(screen.getByText('Nouveau')).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(SETTINGS_NEW_BADGE_DURATION_MS); });
    expect(screen.queryByText('Nouveau')).not.toBeInTheDocument();
  });

  it('libère le prochain réveil et l’écoute de visibilité au démontage', () => {
    const removeEventListener = jest.spyOn(document, 'removeEventListener');
    const { unmount } = renderRail();
    expect(jest.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(jest.getTimerCount()).toBe(0);
    expect(removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
