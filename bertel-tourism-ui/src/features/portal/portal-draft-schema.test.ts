/**
 * Le brouillon local porte AUSSI le message à l'office.
 *
 * Ce message peut être la SEULE chose saisie, et un envoi sans modification est refusé par
 * le serveur : il ne peut donc pas vivre dans un état d'écran, sans quoi il disparaît au
 * premier rechargement — et le partenaire le retape, ou renonce. Il entre donc dans le
 * schéma persisté, dans l'empreinte et dans la purge (clé préfixée par le compte, Task 12).
 */
import {
  PORTAL_DRAFT_VERSION,
  isPortalDraftEmpty,
  parsePortalDraft,
  portalDraftFingerprint,
  serializePortalDraft,
} from './portal-draft-schema';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';

const baseline = (over: Record<string, unknown> = {}) =>
  ({
    contacts: { objectItems: [{ id: 'c1', value: '0262 00' }] },
    descriptions: { object: { chapo: { baseValue: 'A', values: { fr: 'A' } } } },
    openings: { periods: [] },
    characteristics: { selectedAmenityCodes: ['wifi'] },
    capacityPolicies: { capacityItems: [] },
    pricing: { prices: [] },
    activity: { durationMin: '' },
    ...over,
  }) as unknown as ObjectWorkspaceModules;

describe('portalDraftFingerprint', () => {
  it('est stable pour la même donnée et change quand une tranche du portail bouge', () => {
    const a = portalDraftFingerprint(baseline());
    expect(portalDraftFingerprint(baseline())).toBe(a);
    expect(portalDraftFingerprint(baseline({ characteristics: { selectedAmenityCodes: ['wifi', 'parking'] } }))).not.toBe(a);
  });

  it('ignore ce que le portail ne touche pas (l’office peut travailler en parallèle)', () => {
    const a = portalDraftFingerprint(baseline());
    expect(portalDraftFingerprint(baseline({ tags: { displayed: [{ tagId: 't1' }] } }))).toBe(a);
  });

  it('ne dépend pas de l’ordre des clés de l’objet', () => {
    const straight = { contacts: { a: 1 }, pricing: { b: 2 } } as unknown as ObjectWorkspaceModules;
    const reversed = { pricing: { b: 2 }, contacts: { a: 1 } } as unknown as ObjectWorkspaceModules;
    expect(portalDraftFingerprint(straight)).toBe(portalDraftFingerprint(reversed));
  });
});

describe('serializePortalDraft / parsePortalDraft', () => {
  it('le message à l’office fait un aller-retour, même sans aucune modification', () => {
    const raw = serializePortalDraft({
      objectId: 'obj-1',
      fingerprint: 'fp',
      note: 'Bonjour, ma piscine est en travaux jusqu’en mai.',
      modules: {},
      savedAt: '2026-09-03T10:00:00.000Z',
    });
    const parsed = parsePortalDraft(raw);
    expect(parsed).toEqual({
      version: PORTAL_DRAFT_VERSION,
      objectId: 'obj-1',
      fingerprint: 'fp',
      note: 'Bonjour, ma piscine est en travaux jusqu’en mai.',
      modules: {},
      savedAt: '2026-09-03T10:00:00.000Z',
    });
  });

  it('un brouillon qui ne porte QUE le message n’est pas vide', () => {
    expect(isPortalDraftEmpty({ version: 1, objectId: 'o', fingerprint: 'f', note: 'un mot', modules: {}, savedAt: '' })).toBe(false);
    expect(isPortalDraftEmpty({ version: 1, objectId: 'o', fingerprint: 'f', note: '   ', modules: {}, savedAt: '' })).toBe(true);
    expect(isPortalDraftEmpty({ version: 1, objectId: 'o', fingerprint: 'f', note: '', modules: { contacts: {} }, savedAt: '' })).toBe(false);
  });

  it('ne rend rien plutôt que de rejouer un brouillon abîmé ou d’une autre version', () => {
    expect(parsePortalDraft(null)).toBeNull();
    expect(parsePortalDraft('')).toBeNull();
    expect(parsePortalDraft('{pas du json')).toBeNull();
    expect(parsePortalDraft('[]')).toBeNull();
    expect(parsePortalDraft(JSON.stringify({ version: 99, objectId: 'o', fingerprint: 'f', note: '', modules: {}, savedAt: '' }))).toBeNull();
    expect(parsePortalDraft(JSON.stringify({ version: 1, fingerprint: 'f', note: '', modules: {}, savedAt: '' }))).toBeNull();
  });

  it('un message absent du stockage se relit comme une chaîne vide, jamais undefined', () => {
    const parsed = parsePortalDraft(JSON.stringify({ version: 1, objectId: 'o', fingerprint: 'f', modules: {}, savedAt: '' }));
    expect(parsed?.note).toBe('');
  });

  it('ne garde que les tranches du portail (une tranche hors registre serait envoyée sans écran)', () => {
    const raw = serializePortalDraft({
      objectId: 'obj-1',
      fingerprint: 'fp',
      note: '',
      modules: { contacts: { objectItems: [] }, legal: { siret: '123' } } as Record<string, unknown>,
      savedAt: '',
    });
    expect(Object.keys(parsePortalDraft(raw)?.modules ?? {})).toEqual(['contacts']);
  });
});
