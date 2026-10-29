import type { ObjectListDetail, ObjectListItem } from '../../../services/lists';
import {
  buildDraftMetaPatch,
  buildLanguageSwitchPatch,
  currentListIntro,
  currentListName,
  listItemDraftSignature,
  listItemsDiffer,
} from './list-draft';

function detail(overrides: Partial<ObjectListDetail> = {}): ObjectListDetail {
  return {
    lang: 'fr', name: 'Nom FR', nameEn: 'Name EN', introFr: 'Intro FR', introEn: 'Intro EN',
    recipientLabel: 'Voyageur', template: 'carnet', ...overrides,
  } as ObjectListDetail;
}

function item(objectId: string, overrides: Partial<ObjectListItem> = {}): ObjectListItem {
  return { objectId, position: 0, noteFr: null, noteEn: null, card: null, phone: null, web: null, ...overrides };
}

describe('current composition language text', () => {
  it('reads the selected language without falling back to the other language', () => {
    expect(currentListName(detail())).toBe('Nom FR');
    expect(currentListIntro(detail())).toBe('Intro FR');
    expect(currentListName(detail({ lang: 'en' }))).toBe('Name EN');
    expect(currentListIntro(detail({ lang: 'en' }))).toBe('Intro EN');
    const missingEnglish = { lang: 'en', name: 'Nom FR', introFr: 'Intro FR' } as ObjectListDetail;
    expect(currentListName(missingEnglish)).toBe('');
    expect(currentListIntro(missingEnglish)).toBe('');
  });

  it('distinguishes missing/null translations from literal empty or whitespace text', () => {
    expect(currentListName(detail({ lang: 'en', nameEn: null }))).toBe('');
    expect(currentListIntro(detail({ lang: 'en', introEn: null }))).toBe('');
    expect(currentListIntro(detail({ introFr: undefined }))).toBe('');
    expect(currentListIntro(detail({ introFr: null }))).toBe('');
    expect(currentListName(detail({ lang: 'en', nameEn: '' }))).toBe('');
    expect(currentListName(detail({ name: ' \t' }))).toBe(' \t');
    expect(currentListIntro(detail({ lang: 'en', introEn: ' \n' }))).toBe(' \n');
  });
});

describe('list item draft comparison', () => {
  it('compares only array order, IDs and both note languages, ignoring server enrichment and position metadata', () => {
    const first = item('a', { noteFr: 'FR', noteEn: 'EN' });
    const second = item('b');
    expect(listItemDraftSignature([first, second])).toBe('[["a","FR","EN"],["b",null,null]]');
    expect(listItemsDiffer([first], [{ ...first, position: 9, phone: '0262', web: 'https://example.com' }])).toBe(false);
    expect(listItemsDiffer([first, second], [second, first])).toBe(true);
    expect(listItemsDiffer([first], [{ ...first, objectId: 'different' }])).toBe(true);
    expect(listItemsDiffer([first], [{ ...first, noteFr: 'autre' }])).toBe(true);
    expect(listItemsDiffer([first], [{ ...first, noteEn: 'other' }])).toBe(true);
  });

  it('retains JSON array semantics for missing notes, empty text and sparse entries', () => {
    const missingNotes = { objectId: 'a' } as ObjectListItem;
    expect(listItemsDiffer([missingNotes], [item('a')])).toBe(false);
    expect(listItemsDiffer([item('a', { noteFr: '' })], [item('a')])).toBe(true);
    expect(listItemDraftSignature(new Array<ObjectListItem>(1))).toBe('[null]');
    expect(listItemsDiffer([], new Array<ObjectListItem>(1))).toBe(true);
    expect(listItemsDiffer([item('a'), item('a')], [item('a')])).toBe(true);
  });

  it('finishes the left serialization before reading the right items property', () => {
    const reads: string[] = [];
    const watched = (side: string) => Object.defineProperties({}, {
      objectId: { get: () => { reads.push(`${side}.objectId`); return 'a'; } },
      noteFr: { get: () => { reads.push(`${side}.noteFr`); return null; } },
      noteEn: { get: () => { reads.push(`${side}.noteEn`); return null; } },
    }) as ObjectListItem;
    const left = [watched('left')];
    const right = { get items() { reads.push('detail.items'); return [watched('right')]; } };
    expect(listItemDraftSignature(left) !== listItemDraftSignature(right.items)).toBe(false);
    expect(reads).toEqual([
      'left.objectId', 'left.noteFr', 'left.noteEn', 'detail.items',
      'right.objectId', 'right.noteFr', 'right.noteEn',
    ]);
  });
});

describe('distinct metadata patch policies', () => {
  it.each(['fr', 'en'] as const)('keeps outgoing %s keys and language-switch property order, without template', (lang) => {
    const base = detail({ lang, template: 'grille' });
    const next = lang === 'fr' ? 'en' : 'fr';
    const patch = buildLanguageSwitchPatch(base, next, 'Draft name', 'Draft intro', 'Draft recipient');
    expect(JSON.stringify(patch)).toBe(lang === 'fr'
      ? '{"lang":"en","name":"Draft name","intro_fr":"Draft intro","recipient_label":"Draft recipient"}'
      : '{"lang":"fr","name_en":"Draft name","intro_en":"Draft intro","recipient_label":"Draft recipient"}');
  });

  it.each(['fr', 'en'] as const)('keeps flush %s keys and its different property order, including template', (lang) => {
    const base = detail({ lang });
    const patch = buildDraftMetaPatch(base, currentListName(base), currentListIntro(base), 'Draft name', 'Draft recipient', 'Draft intro', 'grille');
    expect(JSON.stringify(patch)).toBe(lang === 'fr'
      ? '{"name":"Draft name","recipient_label":"Draft recipient","intro_fr":"Draft intro","template":"grille"}'
      : '{"name_en":"Draft name","recipient_label":"Draft recipient","intro_en":"Draft intro","template":"grille"}');
  });

  it('omits unchanged metadata while allowing intentional empty strings and whitespace', () => {
    const base = detail({ recipientLabel: null });
    expect(buildLanguageSwitchPatch(base, 'en', 'Nom FR', 'Intro FR', '')).toEqual({ lang: 'en' });
    expect(buildDraftMetaPatch(base, 'Nom FR', 'Intro FR', 'Nom FR', '', 'Intro FR', 'carnet')).toEqual({});
    expect(buildLanguageSwitchPatch(base, 'en', '', ' \n', '')).toEqual({ lang: 'en', name: '', intro_fr: ' \n' });
    expect(buildDraftMetaPatch(base, 'Nom FR', 'Intro FR', '', ' ', '', 'carnet')).toEqual({ name: '', recipient_label: ' ', intro_fr: '' });
  });

  it('retains language-switch getter order and never reads template', () => {
    const reads: string[] = [];
    const base = new Proxy(detail({ lang: 'en' }), {
      get(target, key, receiver) {
        reads.push(String(key));
        if (key === 'template') throw new Error('Language switching does not read template');
        return Reflect.get(target, key, receiver);
      },
    });
    buildLanguageSwitchPatch(base, 'fr', 'Draft name', 'Draft intro', 'Draft recipient');
    expect(reads).toEqual(['lang', 'nameEn', 'lang', 'introEn', 'lang', 'lang', 'recipientLabel']);
  });

  it('uses the caller’s pre-read baseline strings instead of moving text getters past the rights check', () => {
    const reads: string[] = [];
    const base = new Proxy(detail({ lang: 'en' }), {
      get(target, key, receiver) {
        reads.push(String(key));
        if (['name', 'nameEn', 'introFr', 'introEn', 'canEdit'].includes(String(key))) throw new Error('Baseline and rights remain caller-owned');
        return Reflect.get(target, key, receiver);
      },
    });
    buildDraftMetaPatch(base, 'Server name', 'Server intro', 'Draft name', 'Draft recipient', 'Draft intro', 'grille');
    expect(reads).toEqual(['lang', 'recipientLabel', 'lang', 'template']);
  });
});
