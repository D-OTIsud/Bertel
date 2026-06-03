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
  it('editor gets contributor set plus publish/validate/team', () => {
    const editor = presetPermissionsFor('editor');
    expect(editor).toEqual(expect.arrayContaining(presetPermissionsFor('contributor')));
    expect(editor).toEqual(expect.arrayContaining(['publish_object','validate_changes','manage_team_messages']));
    expect(editor).toHaveLength(10);
  });
  it('unknown role → empty', () => {
    expect(presetPermissionsFor('nope')).toEqual([]);
  });
  it('exposes the three business-role codes in rank order', () => {
    expect(BUSINESS_ROLE_CODES).toEqual(['viewer','contributor','editor']);
  });
});
