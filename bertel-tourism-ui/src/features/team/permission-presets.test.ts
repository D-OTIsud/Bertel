import { presetPermissionsFor, BUSINESS_ROLE_CODES } from './permission-presets';

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
