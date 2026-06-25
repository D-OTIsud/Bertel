import {
  MODULE_LABEL,
  moduleLabel,
  saveResultToIssues,
  publishErrorToIssue,
  groupIssuesBySection,
} from './save-issues';
import { MODULE_KEY_MAP } from './editor-state';
import type { EditorSaveResult } from './useEditorSave';

describe('save-issues', () => {
  it('maps failed and blocked modules to req issues labelled by module', () => {
    const result: EditorSaveResult = {
      saved: [],
      submitted: [],
      failed: [{ module: 'pricing', message: 'Remise invalide.' }],
      blocked: [{ module: 'media', reason: 'Droits insuffisants' }],
    };
    const issues = saveResultToIssues(result);
    expect(issues).toEqual([
      { section: 'Tarifs, paiement & extras', message: 'Remise invalide.', tone: 'req' },
      { section: 'Médias', message: 'Lecture seule : Droits insuffisants', tone: 'req' },
    ]);
  });

  it('returns [] for an empty save result', () => {
    expect(saveResultToIssues({ saved: [], submitted: [], failed: [], blocked: [] })).toEqual([]);
  });

  it('turns a publish Error into a Publication req issue, with a fallback for non-errors', () => {
    expect(publishErrorToIssue(new Error('RPC refusé'))).toEqual({
      section: 'Publication',
      message: 'RPC refusé',
      tone: 'req',
    });
    expect(publishErrorToIssue('boom')).toEqual({
      section: 'Publication',
      message: 'Publication impossible.',
      tone: 'req',
    });
  });

  it('groups issues by section in first-seen order and resolves labels', () => {
    const groups = groupIssuesBySection(
      [
        { section: '04', message: 'Accroche', tone: 'req' },
        { section: '02', message: 'Commune', tone: 'req' },
        { section: '04', message: 'Descriptif', tone: 'req' },
        { section: '99', message: 'Inconnue', tone: 'req' },
      ],
      { '02': 'Localisation', '04': 'Descriptions & langues parlées' },
    );
    expect(groups).toEqual([
      {
        num: '04',
        label: 'Descriptions & langues parlées',
        issues: [
          { section: '04', message: 'Accroche', tone: 'req' },
          { section: '04', message: 'Descriptif', tone: 'req' },
        ],
      },
      { num: '02', label: 'Localisation', issues: [{ section: '02', message: 'Commune', tone: 'req' }] },
      { num: '99', label: '', issues: [{ section: '99', message: 'Inconnue', tone: 'req' }] },
    ]);
  });

  it('provides a non-empty label for every workspace module id', () => {
    for (const module of Object.keys(MODULE_KEY_MAP)) {
      expect(moduleLabel(module as keyof typeof MODULE_KEY_MAP)).toBeTruthy();
    }
    expect(Object.keys(MODULE_LABEL).sort()).toEqual(Object.keys(MODULE_KEY_MAP).sort());
  });
});
