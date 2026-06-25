import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsRail } from './SettingsRail';
import { buildSettingsNav } from './settings-nav';

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
    // Le nouvel item « Listes & référentiels » porte un badge « Nouveau ».
    expect(screen.getByText('Nouveau')).toBeInTheDocument();
  });
});
