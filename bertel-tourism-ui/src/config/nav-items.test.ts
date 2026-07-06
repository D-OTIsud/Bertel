import { visibleNavItems } from './nav-items';

describe('visibleNavItems — gating lecture seule (canEditObjects)', () => {
  it('sans rôle → aucune entrée', () => {
    expect(visibleNavItems(null, false, false)).toEqual([]);
    expect(visibleNavItems(null, true, true)).toEqual([]);
  });

  it('éditeur (canEditObjects=true) voit les surfaces « métier »', () => {
    const tos = visibleNavItems('super_admin', false, true).map((item) => item.to);
    expect(tos).toEqual(
      expect.arrayContaining(['/explorer', '/dashboard', '/crm', '/moderation', '/listes']),
    );
  });

  it('lecteur seul (canEditObjects=false) : masque CRM / modération / listes', () => {
    const tos = visibleNavItems('tourism_agent', false, false).map((item) => item.to);
    expect(tos).not.toContain('/crm');
    expect(tos).not.toContain('/moderation');
    expect(tos).not.toContain('/listes');
  });

  it('lecteur seul : garde les surfaces de consultation (Explorer + Dashboard + Paramètres)', () => {
    const tos = visibleNavItems('tourism_agent', false, false).map((item) => item.to);
    expect(tos).toEqual(expect.arrayContaining(['/explorer', '/dashboard', '/settings']));
  });

  it('même en mode démo, un lecteur seul ne voit pas les surfaces métier', () => {
    // Le demo-gating n'ouvre QUE /audits + /publications ; il ne contourne pas requiresEdit.
    const tos = visibleNavItems('tourism_agent', true, false).map((item) => item.to);
    expect(tos).not.toContain('/crm');
    expect(tos).not.toContain('/moderation');
  });

  it('hors démo : /audits et /publications restent masqués (maquettes sans RPC) même pour un éditeur', () => {
    const tos = visibleNavItems('super_admin', false, true).map((item) => item.to);
    expect(tos).not.toContain('/audits');
    expect(tos).not.toContain('/publications');
  });
});
