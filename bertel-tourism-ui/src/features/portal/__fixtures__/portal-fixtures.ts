/**
 * Fixtures partagées des tests du portail partenaire.
 *
 * Une tranche incomplète FAIT TOMBER du vrai code (`toNullableText(undefined)` jette dans
 * `buildOpeningsPayload`) : les fixtures ci-dessous sont donc complètes, pas minimales.
 * Elles vivent dans `__fixtures__/` — jamais chargé par l'application, jamais ramassé par
 * jest comme suite de tests.
 */
import { getObjectWorkspacePermissions, type ObjectWorkspacePermissions } from '../../../services/object-workspace';
import { useSessionStore } from '../../../store/session-store';
import type { ObjectEditorState } from '../../object-editor/useObjectEditorState';
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';

export const KIND_OPTIONS = [
  { id: 'k-phone', code: 'phone', label: 'Téléphone' },
  { id: 'k-email', code: 'email', label: 'E-mail' },
  { id: 'k-web', code: 'website', label: 'Site internet' },
  { id: 'k-fax', code: 'fax', label: 'Fax' },
];

/** Une période d'ouverture COMPLÈTE : `seasonTypeCode` et `order` absents font jeter le
 *  bâtisseur de payload, pas la lecture — le piège ne se voit qu'à l'envoi. */
export function openingPeriod(over: Record<string, unknown> = {}) {
  return {
    recordId: null,
    label: 'Horaires habituels',
    isClosure: false,
    recurrence: 'always',
    startDate: '',
    endDate: '',
    allYears: true,
    closedDays: [],
    order: '1',
    seasonTypeCode: '',
    weekdays: [],
    ...over,
  };
}

export function weekday(code: string, slots: { start: string; end: string }[]) {
  return { code, label: code, slots };
}

export function portalModules(over: Record<string, unknown> = {}): ObjectWorkspaceModules {
  return {
    contacts: { objectItems: [], webItems: [], kindOptions: KIND_OPTIONS, roleOptions: [] },
    descriptions: {
      localLanguage: 'fr',
      activeLanguage: 'fr',
      availableLanguages: ['fr'],
      object: { chapo: { baseValue: '', values: {} }, description: { baseValue: '', values: {} } },
    },
    openings: { periods: [], periodTypeOptions: [], unavailableReason: null },
    characteristics: {
      selectedAmenityCodes: [],
      selectedPaymentCodes: [],
      amenityGroups: [],
      paymentOptions: [],
      unavailableReason: null,
    },
    capacityPolicies: {
      capacityItems: [],
      metricOptions: [
        { id: 'm1', code: 'max_capacity', label: 'Capacité max.' },
        { id: 'm2', code: 'seats', label: 'Couverts' },
      ],
      petPolicy: { accepted: null, conditions: '' },
      groupPolicy: {},
      stayPolicy: {},
      unavailableReason: null,
    },
    pricing: {
      prices: [],
      priceKindOptions: [],
      priceUnitOptions: [],
      priceTypeOptions: [],
      discounts: [],
      promotions: [],
      unavailableReason: null,
    },
    activity: { durationMin: '', minParticipants: '', maxParticipants: '', minAge: '', unavailableReason: null },
    media: {
      objectItems: [],
      placeItems: [],
      typeOptions: [],
      tagOptions: [],
      unavailableReason: null,
      placeScopeUnavailableReason: null,
    },
    location: { main: { city: 'Petite-Île', address1: '3 chemin des Vanilliers', postcode: '97429' } },
    generalInfo: { commercialVisibility: 'public', status: 'published' },
    publication: { status: 'published' },
    ...over,
  } as unknown as ObjectWorkspaceModules;
}

/**
 * L'objet `permissions` RÉEL d'un compte portail — produit par la fonction de PRODUCTION,
 * jamais recopié à la main : recopié, il figerait une supposition, et il cesserait de
 * suivre `getObjectWorkspacePermissions` au premier module ajouté.
 *
 * Pour la persona acteur les trois sondes serveur valent FALSE PAR CONSTRUCTION :
 *  · `api.is_object_owner` porte `AND NOT api.is_actor_persona()` — c'est D7 ;
 *  · `user_can_write_canonical` et `user_can_write_enrichment` exigent
 *    `api.current_user_org_id()`, donc une adhésion `user_org_membership` qu'un compte
 *    portail n'a jamais.
 *
 * CHAQUE module porte donc un `disabledReason` non nul. C'est l'état NORMAL d'un
 * partenaire, pas une anomalie : `permissions.<module>.disabledReason` décrit l'écriture
 * canonique DIRECTE — un droit que D7 lui refuse volontairement — et non « peut-il
 * proposer ? », qui est la seule question du portail.
 *
 * `getApiClient()` rend `null` sous jest (pas de configuration Supabase) : les sondes
 * gardent leurs valeurs par défaut, exactement celles que le SQL rend à un acteur.
 */
export async function actorPortalPermissions(): Promise<ObjectWorkspacePermissions> {
  const before = useSessionStore.getState();
  useSessionStore.setState({ demoMode: false, role: 'actor' } as never);
  try {
    return await getObjectWorkspacePermissions('HOTRUN0001');
  } finally {
    useSessionStore.setState({ demoMode: before.demoMode, role: before.role } as never);
  }
}

export function fakeEditor(
  draft: ObjectWorkspaceModules = portalModules(),
  dirty: Record<string, boolean> = {},
  baseline: ObjectWorkspaceModules = draft,
): ObjectEditorState {
  return {
    objectId: 'RES1',
    draft,
    baseline,
    dirtySections: dirty,
    isDirty: Object.values(dirty).some(Boolean),
    patchModule: jest.fn(),
    replaceModule: jest.fn(),
    resetModule: jest.fn(),
    commitModules: jest.fn(),
    setSavedStatus: jest.fn(),
  } as unknown as ObjectEditorState;
}
