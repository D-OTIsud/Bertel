import { businessRoleLabel, reviewRoleChange, BUSINESS_ROLE_CODES } from './permission-presets';

// §227 — les préréglages en dur ont disparu : la source des droits d'un rôle est la base
// (`org_role_permission`), lue par `listRolePermissions`. Ces tests portent donc sur ce qui
// reste ici : le vocabulaire FR, et la LECTURE d'un changement de rôle.
const MATRIX = {
  viewer: [],
  contributor: ['create_object', 'edit_hours'],
  editor: ['create_object', 'edit_hours', 'publish_object', 'write_crm_notes'],
};

describe('businessRoleLabel', () => {
  it('rend le libellé FR de chaque rôle du catalogue', () => {
    expect(BUSINESS_ROLE_CODES.map(businessRoleLabel)).toEqual(['Lecteur', 'Contributeur', 'Éditeur']);
  });
  it('replie sur le code brut si le rôle est inconnu', () => {
    expect(businessRoleLabel('role_exotique')).toBe('role_exotique');
  });
  it('nomme explicitement l’absence de rôle', () => {
    expect(businessRoleLabel(null)).toBe('(aucun rôle)');
  });
});

describe('reviewRoleChange', () => {
  it('rend les droits que le nouveau rôle confère', () => {
    expect(reviewRoleChange('contributor', [], MATRIX).granted).toEqual(['create_object', 'edit_hours']);
  });

  it('un passage à Lecteur ne confère rien', () => {
    expect(reviewRoleChange('viewer', [], MATRIX).granted).toEqual([]);
  });

  // Le point qui compte à la RÉTROGRADATION : l'étiquette change, mais une permission accordée
  // nommément survit. Un admin qui croit avoir fermé l'accès en changeant le rôle se tromperait.
  it('signale les exceptions individuelles qui survivent à une rétrogradation', () => {
    const r = reviewRoleChange('viewer', ['write_crm_notes', 'publish_object'], MATRIX);
    expect(r.granted).toEqual([]);
    expect(r.residualExceptions).toEqual(['publish_object', 'write_crm_notes']);
  });

  it('ne signale pas une exception que le nouveau rôle couvre déjà', () => {
    const r = reviewRoleChange('editor', ['write_crm_notes'], MATRIX);
    expect(r.residualExceptions).toEqual([]);
  });

  it('un rôle absent de la matrice ne confère rien et laisse tout en exception', () => {
    const r = reviewRoleChange('role_inconnu', ['edit_hours'], MATRIX);
    expect(r.granted).toEqual([]);
    expect(r.residualExceptions).toEqual(['edit_hours']);
  });
});
