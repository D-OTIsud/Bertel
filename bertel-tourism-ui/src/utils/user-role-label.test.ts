import { resolveUserRoleLabel, resolveUserRoleTone } from './user-role-label';

describe('resolveUserRoleLabel', () => {
  it('maps each session role to a French label (never the raw enum)', () => {
    expect(resolveUserRoleLabel('super_admin')).toBe('Super-administrateur');
    expect(resolveUserRoleLabel('tourism_agent')).toBe('Agent touristique');
    expect(resolveUserRoleLabel('owner')).toBe('Propriétaire');
  });

  it('returns a "not connected" label for a null role', () => {
    expect(resolveUserRoleLabel(null)).toBe('Non connecté');
    expect(resolveUserRoleLabel(undefined)).toBe('Non connecté');
  });

  it('appends the org-admin marker for a non-super-admin with rank >= 10', () => {
    expect(resolveUserRoleLabel('tourism_agent', 10)).toBe('Agent touristique · Admin ORG');
    expect(resolveUserRoleLabel('owner', 30)).toBe('Propriétaire · Admin ORG');
  });

  it('does not append the org-admin marker for a super-admin or low rank', () => {
    expect(resolveUserRoleLabel('super_admin', 30)).toBe('Super-administrateur');
    expect(resolveUserRoleLabel('tourism_agent', 5)).toBe('Agent touristique');
    expect(resolveUserRoleLabel('tourism_agent', null)).toBe('Agent touristique');
  });
});

describe('resolveUserRoleTone', () => {
  it('maps super_admin to info and others to ok', () => {
    expect(resolveUserRoleTone('super_admin')).toBe('info');
    expect(resolveUserRoleTone('owner')).toBe('ok');
    expect(resolveUserRoleTone('tourism_agent')).toBe('ok');
  });

  it('returns warn for a null role', () => {
    expect(resolveUserRoleTone(null)).toBe('warn');
  });
});

describe('user-role-label — persona actor (portail 18a)', () => {
  it('affiche « Partenaire » — le mot à l’écran, jamais « prestataire »', () => {
    expect(resolveUserRoleLabel('actor')).toBe('Partenaire');
    expect(resolveUserRoleTone('actor')).toBe('ok');
  });

  it('ne colle jamais « · Admin ORG » à un partenaire, quel que soit le rang', () => {
    // Un partenaire n'administre aucune équipe : son rang est nul par construction
    // (bootstrap court-circuité). La fonction ne doit pas produire ce libellé même
    // si un rang non nul lui arrivait un jour.
    expect(resolveUserRoleLabel('actor', 30)).toBe('Partenaire');
  });
});
