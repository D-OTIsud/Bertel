import { buildSettingsNav, settingsSectionIds, resolveSettingsSection, DEFAULT_SETTINGS_SECTION } from './settings-nav';

describe('settings-nav (Phase 7.1 — rail gated par rôle)', () => {
  it('super-admin voit « Mon compte » ET « Plateforme »', () => {
    const groups = buildSettingsNav('super_admin');
    expect(groups.map((g) => g.id)).toEqual(['account', 'platform']);
    const platform = groups.find((g) => g.id === 'platform');
    expect(platform?.sections.map((s) => s.id)).toEqual(['appearance', 'markers', 'referentiels', 'ai', 'partner-keys', 'diagnostic']);
  });

  it('un rôle non super-admin ne voit QUE « Mon compte » (pas de groupe plateforme)', () => {
    for (const role of ['tourism_agent', 'owner'] as const) {
      const groups = buildSettingsNav(role);
      expect(groups.map((g) => g.id)).toEqual(['account']);
      expect(groups[0].sections.map((s) => s.id)).toEqual(['profile', 'preferences', 'session']);
    }
  });

  it('rôle null (session non chargée) : « Mon compte » seul', () => {
    expect(buildSettingsNav(null).map((g) => g.id)).toEqual(['account']);
  });

  it('settingsSectionIds aplatit les sections accessibles', () => {
    expect(settingsSectionIds('super_admin')).toEqual(['profile', 'preferences', 'session', 'appearance', 'markers', 'referentiels', 'ai', 'partner-keys', 'diagnostic']);
    expect(settingsSectionIds('owner')).toEqual(['profile', 'preferences', 'session']);
  });

  // 7.4 — « Mon organisation » (Équipe) apparaît quand canManageTeam, entre « Mon compte »
  // et « Plateforme ».
  it('canManageTeam ⇒ groupe « Mon organisation » (Équipe) inséré entre compte et plateforme', () => {
    const superGroups = buildSettingsNav('super_admin', { canManageTeam: true });
    expect(superGroups.map((g) => g.id)).toEqual(['account', 'org', 'platform']);
    const org = superGroups.find((g) => g.id === 'org');
    expect(org?.sections.map((s) => s.id)).toEqual(['team']);
    // un admin d'ORG non super-admin : compte + organisation, PAS plateforme
    const orgAdmin = buildSettingsNav('tourism_agent', { canManageTeam: true });
    expect(orgAdmin.map((g) => g.id)).toEqual(['account', 'org']);
  });

  it('sans canManageTeam : pas de groupe « Mon organisation »', () => {
    expect(buildSettingsNav('tourism_agent').map((g) => g.id)).toEqual(['account']);
    expect(settingsSectionIds('tourism_agent')).not.toContain('team');
    expect(settingsSectionIds('tourism_agent', { canManageTeam: true })).toContain('team');
  });

  it('resolveSettingsSection : honore un ?section accessible, sinon retombe sur le défaut', () => {
    expect(resolveSettingsSection('super_admin', 'markers')).toBe('markers');
    expect(resolveSettingsSection('super_admin', null)).toBe(DEFAULT_SETTINGS_SECTION);
    // un non super-admin demandant une section plateforme → repli sur le défaut (pas d'accès)
    expect(resolveSettingsSection('owner', 'markers')).toBe(DEFAULT_SETTINGS_SECTION);
    expect(resolveSettingsSection('owner', 'zzz')).toBe(DEFAULT_SETTINGS_SECTION);
  });
});
