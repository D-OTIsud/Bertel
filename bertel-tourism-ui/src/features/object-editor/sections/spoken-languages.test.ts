import { spokenCodeToDescKey, descLanguageTabs, resolveLanguageLabel } from './spoken-languages';
import type { ObjectWorkspaceLanguageItem, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';

const lang = (code: string): ObjectWorkspaceLanguageItem => ({
  languageId: code, code, label: code, levelId: '', levelCode: '', levelLabel: '',
});

describe('spoken-languages helpers', () => {
  it('maps the reunion creole spoken code rcf to the description key cre', () => {
    expect(spokenCodeToDescKey('rcf')).toBe('cre');
    expect(spokenCodeToDescKey('de')).toBe('de');
  });

  it('unions content languages with spoken languages (mapped, de-duped, order preserved)', () => {
    expect(descLanguageTabs(['fr', 'en'], [lang('de'), lang('fr'), lang('rcf')]))
      .toEqual(['fr', 'en', 'de', 'cre']);
  });

  it('falls back to an empty list when both inputs are empty', () => {
    expect(descLanguageTabs([], [])).toEqual([]);
  });

  it('resolves a static label, then ref_language option, then the raw code', () => {
    const options: WorkspaceReferenceOption[] = [{ id: 'it', code: 'it', label: 'Italien' }];
    expect(resolveLanguageLabel('en', [])).toBe('English');
    expect(resolveLanguageLabel('cre', [])).toBe('Créole');
    expect(resolveLanguageLabel('it', options)).toBe('Italien');
    expect(resolveLanguageLabel('xx', [])).toBe('xx');
  });
});
