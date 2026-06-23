import { buildSettingsNav, settingsSectionIds, resolveSettingsSection, DEFAULT_SETTINGS_SECTION } from './settings-nav';

describe('settings-nav (Phase 7.1 — rail gated par rôle)', () => {
  it('super-admin voit « Mon compte » ET « Plateforme »', () => {
    const groups = buildSettingsNav('super_admin');
    expect(groups.map((g) => g.id)).toEqual(['account', 'platform']);
    const platform = groups.find((g) => g.id === 'platform');
    expect(platform?.sections.map((s) => s.id)).toEqual(['appearance', 'markers', 'ai', 'diagnostic']);
  });

  it('un rôle non super-admin ne voit QUE « Mon compte » (pas de groupe plateforme)', () => {
    for (const role of ['tourism_agent', 'owner'] as const) {
      const groups = buildSettingsNav(role);
      expect(groups.map((g) => g.id)).toEqual(['account']);
      expect(groups[0].sections.map((s) => s.id)).toEqual(['preferences', 'session']);
    }
  });

  it('rôle null (session non chargée) : « Mon compte » seul', () => {
    expect(buildSettingsNav(null).map((g) => g.id)).toEqual(['account']);
  });

  it('settingsSectionIds aplatit les sections accessibles', () => {
    expect(settingsSectionIds('super_admin')).toEqual(['preferences', 'session', 'appearance', 'markers', 'ai', 'diagnostic']);
    expect(settingsSectionIds('owner')).toEqual(['preferences', 'session']);
  });

  it('resolveSettingsSection : honore un ?section accessible, sinon retombe sur le défaut', () => {
    expect(resolveSettingsSection('super_admin', 'markers')).toBe('markers');
    expect(resolveSettingsSection('super_admin', null)).toBe(DEFAULT_SETTINGS_SECTION);
    // un non super-admin demandant une section plateforme → repli sur le défaut (pas d'accès)
    expect(resolveSettingsSection('owner', 'markers')).toBe(DEFAULT_SETTINGS_SECTION);
    expect(resolveSettingsSection('owner', 'zzz')).toBe(DEFAULT_SETTINGS_SECTION);
  });
});
