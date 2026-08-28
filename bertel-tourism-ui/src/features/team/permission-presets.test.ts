import { presetPermissionsFor, reviewRoleChange, BUSINESS_ROLE_CODES } from './permission-presets';

describe('presetPermissionsFor', () => {
  it('viewer gets no permissions', () => {
    expect(presetPermissionsFor('viewer')).toEqual([]);
  });
  it('contributor gets the 7 content/media editing permissions', () => {
    expect(presetPermissionsFor('contributor').sort()).toEqual([
      'attach_documents','create_object','edit_canonical_when_publisher',
      'edit_gallery','edit_hours','edit_org_enrichment','edit_pricing',
    ]);
  });
  it('editor gets contributor set plus publish/validate/team/legal', () => {
    const editor = presetPermissionsFor('editor');
    expect(editor).toEqual(expect.arrayContaining(presetPermissionsFor('contributor')));
    expect(editor).toEqual(expect.arrayContaining([
      'publish_object','validate_changes','manage_team_messages','manage_legal_compliance',
    ]));
    expect(editor).toHaveLength(12);
  });
  // §214 — assertion à part, et NON fondue dans le arrayContaining ci-dessus : c'est la seule
  // permission du préréglage dont l'absence ne se voit sur AUCUN écran d'édition de fiche (elle ne
  // gate que le CRM), donc la seule qu'un remaniement du tableau pourrait retirer sans rien casser
  // de visible. Elle mérite sa propre ligne rouge.
  it('editor can write CRM (§214 — sinon 42501 sur toute écriture CRM)', () => {
    expect(presetPermissionsFor('editor')).toContain('write_crm_notes');
    expect(presetPermissionsFor('contributor')).not.toContain('write_crm_notes');
  });
  it('unknown role → empty', () => {
    expect(presetPermissionsFor('nope')).toEqual([]);
  });
  it('exposes the three business-role codes in rank order', () => {
    expect(BUSINESS_ROLE_CODES).toEqual(['viewer','contributor','editor']);
  });
});

// ---------------------------------------------------------------------------------------
// Chantier 2026-08-28 n°1, sous-lot 1c (D5) — changer le rôle métier n'applique RIEN.
// `rpc_set_business_role` ne touche pas aux permissions et rien ne rejoue le préréglage :
// un membre promu Lecteur → Éditeur gardait 0 permission, un Éditeur → Lecteur gardait les 12.
// `reviewRoleChange` ne décide de rien : elle CONSTATE l'écart pour que l'écran puisse le dire.
// ---------------------------------------------------------------------------------------
describe('reviewRoleChange (chantier 2026-08-28, D5)', () => {
  it('promotion Lecteur → Éditeur : les 12 permissions du rôle sont MANQUANTES', () => {
    const review = reviewRoleChange('editor', []);
    expect(review.missing).toHaveLength(12);
    expect(review.missing).toContain('write_crm_notes');
    expect(review.excess).toEqual([]);
  });

  it('rétrogradation Éditeur → Lecteur : tout est en EXCÈS, et rien n’est « manquant »', () => {
    const review = reviewRoleChange('viewer', presetPermissionsFor('editor'));
    expect(review.missing).toEqual([]);
    expect(review.excess).toHaveLength(12);
  });

  it('un droit HÉRITÉ de l’ORG compte comme acquis : il n’est pas réclamé', () => {
    const review = reviewRoleChange('editor', [], presetPermissionsFor('editor'));
    expect(review.missing).toEqual([]);
  });

  it('un droit hérité n’est JAMAIS proposé à la révocation — il ne se retire pas d’ici', () => {
    // `excess` ne regarde que les droits INDIVIDUELS : proposer de révoquer un droit d'ORG
    // depuis la fiche d'un membre serait un piège (le clic n'aurait aucun effet).
    const review = reviewRoleChange('viewer', [], ['publish_object']);
    expect(review.excess).toEqual([]);
  });

  it('un rôle déjà aligné ne produit aucun écart (pas de bandeau inutile)', () => {
    const review = reviewRoleChange('contributor', presetPermissionsFor('contributor'));
    expect(review).toEqual({ missing: [], excess: [] });
  });

  it('rôle inconnu : préréglage vide ⇒ tout droit individuel est en excès, rien ne manque', () => {
    const review = reviewRoleChange('inconnu', ['create_object']);
    expect(review.missing).toEqual([]);
    expect(review.excess).toEqual(['create_object']);
  });
});
