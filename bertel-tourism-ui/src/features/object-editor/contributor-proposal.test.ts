import {
  buildContributorSubmission,
  isAutoDispatchModule,
  AUTO_DISPATCH_ROUTES,
  MODULE_TARGET_TABLE,
} from './contributor-proposal';
import { MODULE_KEY_MAP } from './editor-state';
import {
  buildCharacteristicsRpcPayload,
  buildSustainabilityRpcPayload,
  buildTagsRpcPayload,
  buildOpeningsPayload,
  buildRelationshipsRpcPayload,
  type WorkspaceModuleId,
} from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';

const OBJECT_ID = 'HOTRUN0000000001';

/** Minimal modules fixture — only the slices the auto/manual paths read are populated. */
function makeModules(): ObjectWorkspaceModules {
  return {
    characteristics: {
      selectedLanguages: [],
      selectedPaymentCodes: ['cash', 'card'],
      selectedEnvironmentCodes: ['beach'],
      selectedAmenityCodes: ['wifi', 'pool'],
    },
    openings: { periods: [] },
    sustainability: {
      categories: [
        {
          code: 'CAT_ENERGY',
          actions: [
            { id: '', code: 'SA_SOLAR', selected: true, note: 'panneaux', documentId: '' },
            { id: '', code: 'SA_WIND', selected: false, note: '', documentId: '' },
          ],
        },
      ],
    },
    tags: { displayed: [{ tagId: '', slug: 'famille' }] },
    relationships: {
      relatedObjects: [],
      organizationLinks: [],
      actors: [],
    },
    contacts: { channels: [{ kind: 'email', value: 'a@b.re' }] },
    legal: { siret: '12345678900011' },
    itinerary: { stages: [] },
    location: { places: [] },
  } as unknown as ObjectWorkspaceModules;
}

describe('contributor-proposal — auto-dispatch registry', () => {
  it('the 5 auto-dispatch modules carry the exact §120-whitelisted RPC names', () => {
    expect(AUTO_DISPATCH_ROUTES.characteristics?.rpc).toBe('save_object_commercial');
    expect(AUTO_DISPATCH_ROUTES.openings?.rpc).toBe('save_object_openings');
    expect(AUTO_DISPATCH_ROUTES.sustainability?.rpc).toBe('save_object_workspace_sustainability');
    expect(AUTO_DISPATCH_ROUTES.tags?.rpc).toBe('save_object_workspace_tags');
    expect(AUTO_DISPATCH_ROUTES.relationships?.rpc).toBe('save_object_relations');
  });

  it('only those 5 modules are auto-dispatchable', () => {
    const auto = (Object.keys(AUTO_DISPATCH_ROUTES) as WorkspaceModuleId[]).filter(isAutoDispatchModule);
    expect(new Set(auto)).toEqual(
      new Set(['characteristics', 'openings', 'sustainability', 'tags', 'relationships']),
    );
  });

  it('itinéraire and lieux are NOT auto-dispatch (manual_apply by decision)', () => {
    expect(isAutoDispatchModule('itinerary')).toBe(false);
    expect(isAutoDispatchModule('location')).toBe(false);
  });

  it('every module id has a representative target table', () => {
    for (const module of Object.keys(MODULE_KEY_MAP) as WorkspaceModuleId[]) {
      expect(MODULE_TARGET_TABLE[module]).toBeTruthy();
    }
  });
});

describe('buildContributorSubmission — auto-dispatch sections', () => {
  const draft = makeModules();
  const baseline = makeModules();

  const cases: Array<[WorkspaceModuleId, string, Record<string, unknown>]> = [
    ['characteristics', 'save_object_commercial', buildCharacteristicsRpcPayload(draft.characteristics)],
    ['openings', 'save_object_openings', { periods: buildOpeningsPayload(draft.openings.periods) }],
    ['sustainability', 'save_object_workspace_sustainability', buildSustainabilityRpcPayload(draft.sustainability)],
    ['tags', 'save_object_workspace_tags', buildTagsRpcPayload(draft.tags)],
    ['relationships', 'save_object_relations', buildRelationshipsRpcPayload(draft.relationships)],
  ];

  it.each(cases)('%s stores the exact RPC envelope (rpc=%s) with manual_apply=false', (module, rpc, payload) => {
    const submission = buildContributorSubmission(OBJECT_ID, module, baseline, draft);
    expect(submission.objectId).toBe(OBJECT_ID);
    expect(submission.action).toBe('update');
    expect(submission.targetTable).toBe(MODULE_TARGET_TABLE[module]);
    expect(submission.payload).toEqual(payload);
    expect(submission.metadata).toMatchObject({
      rpc,
      section: module,
      manual_apply: false,
    });
  });

  it('characteristics payload carries the resolved commercial arms (not the editor module shape)', () => {
    const submission = buildContributorSubmission(OBJECT_ID, 'characteristics', baseline, draft);
    expect(submission.payload).toEqual({
      languages: [],
      payment_methods: [{ payment_method_code: 'cash' }, { payment_method_code: 'card' }],
      environment_tags: [{ environment_tag_code: 'beach' }],
      amenities: [{ amenity_code: 'wifi' }, { amenity_code: 'pool' }],
    });
  });
});

describe('buildContributorSubmission — manual_apply sections', () => {
  const draft = makeModules();
  const baseline = makeModules();

  it.each(['contacts', 'legal', 'itinerary', 'location'] as WorkspaceModuleId[])(
    '%s is manual_apply with a null rpc (approve cannot auto-dispatch)',
    (module) => {
      const submission = buildContributorSubmission(OBJECT_ID, module, baseline, draft);
      expect(submission.metadata).toMatchObject({ rpc: null, section: module, manual_apply: true });
      // payload is the raw module slice (informational — a moderator applies it by hand).
      expect(submission.payload).toEqual(draft[MODULE_KEY_MAP[module]]);
    },
  );
});

describe('buildContributorSubmission — before/after diff', () => {
  it('serializes baseline vs draft slices into flat metadata keys read by list_pending_changes', () => {
    const baseline = makeModules();
    const draft = makeModules();
    draft.contacts = { channels: [{ kind: 'email', value: 'changed@b.re' }] } as unknown as ObjectWorkspaceModules['contacts'];

    const submission = buildContributorSubmission(OBJECT_ID, 'contacts', baseline, draft);
    const meta = submission.metadata as Record<string, unknown>;
    expect(typeof meta.field).toBe('string');
    expect(meta.before).toBe(JSON.stringify(baseline.contacts));
    expect(meta.after).toBe(JSON.stringify(draft.contacts));
    expect(meta.before).not.toBe(meta.after);
  });
});
