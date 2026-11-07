import { buildClassificationSubvalueIds, saveObjectWorkspaceDistinctions } from './object-workspace';
import type { ObjectWorkspaceDistinctionsModule } from './object-workspace-parser';
import { useSessionStore } from '../store/session-store';

// Pins the object_classification.subvalue_ids WRITE contract for LBL_TOURISME_HANDICAP.
// The §10 editor's "Types de handicap couverts" chips edit disabilityTypesCovered
// (motor/hearing/visual/cognitive); saveObjectWorkspaceDistinctions must persist them as
// subvalue_ids — the UUIDs of the matching granted_* sub-values, resolved by
// (scheme_id, metadata->>'disability_type'), NEVER hard-coded (seeds_data.sql B-2b §3711-3754).
// Before this fix the saver omitted subvalue_ids (object-workspace.ts payload), so the filter
// label_disability_types_any and the read RPCs always saw empty subvalue_ids for app-authored
// objects — a silent write-trap (CLAUDE.md "Editor — no silent write-traps").

const TH = 'scheme-th'; // LBL_TOURISME_HANDICAP scheme id
const OTHER = 'scheme-other'; // an unrelated distinction scheme

// granted_* sub-values as loaded into valueRefs (ref_classification_value.metadata.disability_type
// → disabilityType). The parent 'granted' value carries no disability_type; a same-typed value of
// another scheme is present to prove the resolution is scheme-scoped, not type-only.
const subvalueRefs = [
  { id: 'uuid-motor', schemeId: TH, disabilityType: 'motor' },
  { id: 'uuid-hearing', schemeId: TH, disabilityType: 'hearing' },
  { id: 'uuid-visual', schemeId: TH, disabilityType: 'visual' },
  { id: 'uuid-cognitive', schemeId: TH, disabilityType: 'cognitive' },
  { id: 'uuid-granted', schemeId: TH, disabilityType: null },
  { id: 'uuid-other-motor', schemeId: OTHER, disabilityType: 'motor' },
];

describe('buildClassificationSubvalueIds', () => {
  it('maps covered disability-type codes to the matching granted_* subvalue UUIDs', () => {
    expect(buildClassificationSubvalueIds(['motor', 'hearing'], TH, subvalueRefs)).toEqual([
      'uuid-motor',
      'uuid-hearing',
    ]);
  });

  it('scopes resolution to the label scheme (joins by scheme_id + disability_type)', () => {
    // 'motor' must resolve to the TH subvalue, never the same-typed value of another scheme.
    expect(buildClassificationSubvalueIds(['motor'], TH, subvalueRefs)).toEqual(['uuid-motor']);
    expect(buildClassificationSubvalueIds(['motor'], OTHER, subvalueRefs)).toEqual(['uuid-other-motor']);
  });

  it('returns [] when no types are covered (clears subvalue_ids; non-T&H distinctions)', () => {
    expect(buildClassificationSubvalueIds([], TH, subvalueRefs)).toEqual([]);
  });

  it('ignores codes with no matching subvalue (no crash, no phantom ids)', () => {
    expect(buildClassificationSubvalueIds(['motor', 'bogus'], TH, subvalueRefs)).toEqual(['uuid-motor']);
  });

  it('dedupes repeated codes', () => {
    expect(buildClassificationSubvalueIds(['motor', 'motor'], TH, subvalueRefs)).toEqual(['uuid-motor']);
  });
});

describe('saveObjectWorkspaceDistinctions — no-clobber guard (§71 E review)', () => {
  // §08 and §10 share this saver. A degraded load sets unavailableReason and empties the
  // groups; without this guard a §10 edit + save would delete every real §08 classification
  // row (the delete-reconcile reads fresh DB rows but the saved set is empty). The guard
  // throws BEFORE any DB access, so the test needs no client mock.
  // jest.setup forces NEXT_PUBLIC_ENABLE_DEMO_MODE=true (saver no-ops in demo) — turn it off
  // so the guard is actually reached.
  const prevDemo = useSessionStore.getState().demoMode;
  beforeEach(() => useSessionStore.setState({ demoMode: false }));
  afterEach(() => useSessionStore.setState({ demoMode: prevDemo }));

  it('throws on a degraded module instead of running the delete-reconcile', async () => {
    const degraded: ObjectWorkspaceDistinctionsModule = {
      distinctionGroups: [],
      accessibilityLabels: [],
      accessibilityAmenityCoverage: [],
      schemeOptions: [],
      unavailableReason: 'Distinctions indisponibles dans le live actuel.',
    };
    await expect(saveObjectWorkspaceDistinctions('HOTRUN0000000001', degraded)).rejects.toThrow(
      'Distinctions indisponibles',
    );
  });
});
