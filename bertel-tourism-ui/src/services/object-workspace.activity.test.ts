jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({
  useSessionStore: {
    getState: () => ({ demoMode: false }),
    subscribe: jest.fn(() => () => {}),
  },
}));

import { getSupabaseClient } from '../lib/supabase';
import { getObjectWorkspaceActivityModule, saveObjectWorkspaceActivity } from './object-workspace';
import type { ObjectWorkspaceActivityModule } from './object-workspace-parser';
import type { ReferenceCatalogs } from './reference-catalogs';

const OBJECT_ID = 'ACTTST0000000001';
const catalogs = { refCodeByDomain: {}, tables: {} } as ReferenceCatalogs;
const supportedColumns = new Set([
  'object_id', 'duration_min', 'min_participants', 'max_participants', 'difficulty_level',
  'guide_required', 'min_age', 'equipment_provided',
]);

function activity(overrides: Partial<ObjectWorkspaceActivityModule> = {}): ObjectWorkspaceActivityModule {
  return {
    durationMin: '', minParticipants: '', maxParticipants: '', difficultyLevel: '', guideRequired: false,
    minAge: '', equipmentProvided: false, equipmentProvidedDetails: '', difficultyOptions: [],
    unavailableReason: null, ...overrides,
  };
}

type DatabaseError = { code: string; message: string };
function mockActivityClient(options: {
  row?: Record<string, unknown> | null;
  readError?: DatabaseError;
  writeError?: DatabaseError;
} = {}) {
  const upsert = jest.fn(async (row: Record<string, unknown>) => {
    const unknown = Object.keys(row).find((column) => !supportedColumns.has(column));
    return { error: unknown ? { code: 'PGRST204', message: `Unknown object_act column: ${unknown}` } : options.writeError ?? null };
  });
  const eq = jest.fn();
  const select = jest.fn((columns: string) => {
    const unknown = columns.split(',').map((column) => column.trim()).find((column) => !supportedColumns.has(column));
    eq.mockReturnValue({
      maybeSingle: async () => ({
        data: options.row ?? null,
        error: unknown ? { code: '42703', message: `column object_act.${unknown} does not exist` } : options.readError ?? null,
      }),
    });
    return { eq };
  });
  const from = jest.fn((table: string) => {
    if (table !== 'object_act') throw new Error(`Unexpected table ${table}`);
    return { select, upsert };
  });
  jest.mocked(getSupabaseClient).mockReturnValue({ from } as never);
  return { from, select, eq, upsert };
}

beforeEach(() => jest.clearAllMocks());

describe('activity reads on the deployed object_act schema', () => {
  it.each([true, false, null])('loads the existing fields without a details column, equipment=%s', async (equipment) => {
    const { eq } = mockActivityClient({ row: {
      duration_min: 90, min_participants: null, max_participants: 8, difficulty_level: 2,
      guide_required: false, min_age: 0, equipment_provided: equipment,
    } });

    const loaded = await getObjectWorkspaceActivityModule(OBJECT_ID, activity(), catalogs);

    expect(loaded).toEqual(activity({
      durationMin: '90', maxParticipants: '8', difficultyLevel: '2', guideRequired: false,
      minAge: '0', equipmentProvided: equipment ?? false,
    }));
    expect(eq).toHaveBeenCalledWith('object_id', OBJECT_ID);
  });

  it('keeps an applicable activity with no facet row editable', async () => {
    mockActivityClient({ row: null });
    const baseline = activity();
    await expect(getObjectWorkspaceActivityModule(OBJECT_ID, baseline, catalogs)).resolves.toEqual(baseline);
  });

  it.each([
    { code: '42501', message: 'permission denied for table object_act' },
    { code: 'PGRST000', message: 'database connection unavailable' },
    { code: '42703', message: 'column object_act.duration_min does not exist' },
  ])('retains the unavailable guard for a real read failure ($code)', async (readError) => {
    mockActivityClient({ readError });
    const loaded = await getObjectWorkspaceActivityModule(OBJECT_ID, activity(), catalogs);
    expect(loaded.unavailableReason).toBeTruthy();
    await expect(saveObjectWorkspaceActivity(OBJECT_ID, loaded)).rejects.toThrow(loaded.unavailableReason!);
  });
});

describe('activity writes on the deployed object_act schema', () => {
  it.each([true, false])('writes supported fields while preserving equipment=%s, zero and NULL', async (equipment) => {
    const { upsert } = mockActivityClient();
    await saveObjectWorkspaceActivity(OBJECT_ID, activity({
      durationMin: '90', maxParticipants: '8', guideRequired: false, minAge: '0', equipmentProvided: equipment,
    }));

    expect(upsert).toHaveBeenCalledWith({
      object_id: OBJECT_ID, duration_min: 90, min_participants: null, max_participants: 8,
      difficulty_level: null, guide_required: false, min_age: 0, equipment_provided: equipment,
    }, { onConflict: 'object_id' });
  });

  it('keeps blank numeric values NULL instead of turning them into zero', async () => {
    const { upsert } = mockActivityClient();
    await saveObjectWorkspaceActivity(OBJECT_ID, activity());
    expect(upsert).toHaveBeenCalledWith({
      object_id: OBJECT_ID, duration_min: null, min_participants: null, max_participants: null,
      difficulty_level: null, guide_required: false, min_age: null, equipment_provided: false,
    }, { onConflict: 'object_id' });
  });

  it.each([true, false])('refuses unsupported nonempty details before any write, equipment=%s', async (equipment) => {
    const { from, upsert } = mockActivityClient();
    const input = activity({ durationMin: '90', equipmentProvided: equipment, equipmentProvidedDetails: '  casque fourni  ' });

    await expect(saveObjectWorkspaceActivity(OBJECT_ID, input)).rejects.toThrow(
      'Le détail du matériel fourni ne peut pas être enregistré pour le moment. Votre saisie est conservée.',
    );
    expect(from).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(input.equipmentProvidedDetails).toBe('  casque fourni  ');
  });

  it('accepts whitespace-only details with equipment=false without mutating the input', async () => {
    const { upsert } = mockActivityClient();
    const input = activity({ equipmentProvided: false, equipmentProvidedDetails: '   ' });
    const before = { ...input };
    await saveObjectWorkspaceActivity(OBJECT_ID, input);
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('equipment_provided_details');
    expect(upsert.mock.calls[0][0].equipment_provided).toBe(false);
    expect(input).toEqual(before);
  });

  it('propagates an actual write refusal', async () => {
    mockActivityClient({ writeError: { code: '42501', message: 'permission denied for table object_act' } });
    await expect(saveObjectWorkspaceActivity(OBJECT_ID, activity())).rejects.toThrow();
  });
});
