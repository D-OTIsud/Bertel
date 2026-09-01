import { effectivePermissions, impactOfToggle, type MemberRef } from './role-permission-matrix';

const MATRIX = {
  viewer: [],
  contributor: ['edit_hours'],
  editor: ['edit_hours', 'write_crm_notes'],
};

describe('effectivePermissions', () => {
  it('un lecteur sans exception n’a aucun droit', () => {
    expect(effectivePermissions([], 'viewer', MATRIX)).toEqual([]);
  });

  it('le rôle confère ses droits sans aucun octroi individuel', () => {
    expect(effectivePermissions([], 'editor', MATRIX).sort()).toEqual(['edit_hours', 'write_crm_notes']);
  });

  it('une exception individuelle s’ajoute au rôle sans doublon', () => {
    expect(effectivePermissions(['edit_hours', 'publish_object'], 'contributor', MATRIX).sort())
      .toEqual(['edit_hours', 'publish_object']);
  });

  // Un membre sans rôle métier actif existe en base (colonne nullable) : il ne doit pas faire
  // planter le calcul, et n'a évidemment aucun droit conféré.
  it('un membre sans rôle métier ne tient que ses exceptions', () => {
    expect(effectivePermissions(['edit_hours'], null, MATRIX)).toEqual(['edit_hours']);
  });

  it('un rôle absent de la matrice ne confère rien', () => {
    expect(effectivePermissions([], 'role_inconnu', MATRIX)).toEqual([]);
  });
});

describe('impactOfToggle', () => {
  const members: MemberRef[] = [
    { userId: 'u1', displayName: 'Isabelle', businessRoleCode: 'viewer', individualCodes: [] },
    { userId: 'u2', displayName: 'Nicolas', businessRoleCode: 'viewer', individualCodes: [] },
    { userId: 'u3', displayName: 'Marc', businessRoleCode: 'editor', individualCodes: [] },
    { userId: 'u4', displayName: 'Sophie', businessRoleCode: 'editor', individualCodes: ['write_crm_notes'] },
  ];

  it('nomme les membres qui GAGNENT le droit', () => {
    const r = impactOfToggle(MATRIX, 'viewer', 'write_crm_notes', true, members);
    expect(r.grants).toBe(true);
    expect(r.affected.map((m) => m.displayName)).toEqual(['Isabelle', 'Nicolas']);
  });

  it('nomme les membres qui PERDENT le droit', () => {
    const r = impactOfToggle(MATRIX, 'editor', 'write_crm_notes', false, members);
    expect(r.grants).toBe(false);
    expect(r.affected.map((m) => m.displayName)).toEqual(['Marc']);
  });

  // Le piège : Sophie porte le droit EN EXCEPTION individuelle. Le retirer du rôle ne le lui
  // retire pas — l'annoncer comme une perte serait un mensonge, et un admin pourrait croire
  // avoir fermé un accès qui reste ouvert.
  it('ne compte pas comme perdant un membre qui tient le droit en exception', () => {
    const r = impactOfToggle(MATRIX, 'editor', 'write_crm_notes', false, members);
    expect(r.affected.map((m) => m.displayName)).not.toContain('Sophie');
    expect(r.retainedByException.map((m) => m.displayName)).toEqual(['Sophie']);
  });

  it('ne compte jamais un membre d’un autre rôle', () => {
    const r = impactOfToggle(MATRIX, 'contributor', 'edit_hours', false, members);
    expect(r.affected).toEqual([]);
  });

  it('une bascule sans effet ne concerne personne', () => {
    const r = impactOfToggle(MATRIX, 'editor', 'edit_hours', true, members);
    expect(r.affected).toEqual([]);
  });
});
