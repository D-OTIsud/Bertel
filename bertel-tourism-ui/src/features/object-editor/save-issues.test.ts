import {
  MODULE_LABEL,
  MODULE_SECTION_NUMS,
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
    // `nums` (lot C 2026-08-28) : la cible du bouton « Aller › », que `section` — un LIBELLÉ de
    // module — ne pouvait pas fournir.
    expect(issues).toEqual([
      { section: 'Tarifs, paiement & extras', message: 'Remise invalide.', tone: 'req', nums: ['13'] },
      { section: 'Médias', message: 'Lecture seule : Droits insuffisants', tone: 'req', nums: ['05'] },
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
      nums: ['21'],
    });
    expect(publishErrorToIssue('boom')).toEqual({
      section: 'Publication',
      message: 'Publication impossible.',
      tone: 'req',
      nums: ['21'],
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

// ---------------------------------------------------------------------------------------
// Chantier 2026-08-28 n°4, lot C — saut vers la section depuis une erreur d'enregistrement.
// `Issue.section` est SURCHARGÉ (numéro pour les blocages, libellé de module pour les erreurs
// d'enregistrement) : c'est la raison structurelle pour laquelle ce bloc était statique.
// ---------------------------------------------------------------------------------------
describe('MODULE_SECTION_NUMS (chantier 2026-08-28, lot C)', () => {
  it('couvre EXACTEMENT les mêmes modules que MODULE_KEY_MAP (garde structurelle)', () => {
    expect(Object.keys(MODULE_SECTION_NUMS).sort()).toEqual(Object.keys(MODULE_KEY_MAP).sort());
  });

  it('donne au moins un numéro de section à chaque module, et jamais un libellé', () => {
    for (const nums of Object.values(MODULE_SECTION_NUMS)) {
      expect(nums.length).toBeGreaterThan(0);
      // Les ancres du DOM sont `id="section-NN"` : un numéro à deux chiffres, jamais un libellé.
      for (const num of nums) expect(num).toMatch(/^\d{2}$/);
    }
  });

  it('saveResultToIssues attache les numéros de saut aux échecs ET aux modules en lecture seule', () => {
    const issues = saveResultToIssues({
      failed: [{ module: 'location', message: 'Refus RLS.' }],
      blocked: [{ module: 'legal', reason: 'droits insuffisants' }],
    } as unknown as Parameters<typeof saveResultToIssues>[0]);
    expect(issues[0].nums).toEqual(['02']);
    expect(issues[1].nums).toEqual(['18']);
    // `section` reste le LIBELLÉ : c'est lui qui titre la ligne.
    expect(issues[0].section).toBe('Localisation');
  });

  it('publishErrorToIssue vise le §21 alors que sa `section` est le libellé « Publication »', () => {
    const issue = publishErrorToIssue(new Error('Publication refusée.'));
    expect(issue.section).toBe('Publication');
    // Sans `nums`, le bouton pointerait vers `section-Publication`, une ancre inexistante.
    expect(issue.nums).toEqual(['21']);
  });
});
