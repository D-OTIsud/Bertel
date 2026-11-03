import type { ObjectWorkspaceCapacityPoliciesModule, ObjectWorkspaceStayPolicyForm } from './object-workspace-parser';

export const STAY_POLICY_WRITE_CONTRACT = 'stay-policy-patch-v1';
export const STAY_KEYS = ['check_in_from', 'check_in_until', 'check_out_until', 'conditions'] as const;
export type StayPolicyKey = typeof STAY_KEYS[number];
export interface StayPolicySnapshot {
  exists: boolean;
  values: Record<StayPolicyKey, string | null>;
}
const FORM_KEYS = ['checkInFrom', 'checkInUntil', 'checkOutUntil', 'conditions'] as const;

/** Exact database values, including seconds and absent rows, never a display fingerprint. */
export function stayPolicySnapshot(row: unknown): StayPolicySnapshot {
  const record = row && typeof row === 'object' ? row as Record<string, unknown> : null;
  return { exists: record !== null, values: Object.fromEntries(STAY_KEYS.map(key => [key,
    typeof record?.[key] === 'string' ? record[key] : null,
  ])) as StayPolicySnapshot['values'] };
}

export function parseStayPolicySnapshot(value: unknown): StayPolicySnapshot {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  const values = row?.values && typeof row.values === 'object' ? row.values as Record<string, unknown> : null;
  if (!row || typeof row.exists !== 'boolean' || !values
    || !STAY_KEYS.every(key => Object.hasOwn(values, key) && (values[key] === null || typeof values[key] === 'string')))
    throw new Error('Nous n’avons pas pu confirmer les heures enregistrées. Rechargez la fiche avant de réessayer.');
  return { exists: row.exists, values: { ...values } as StayPolicySnapshot['values'] };
}

export function stayPolicyForm(snapshot: StayPolicySnapshot): ObjectWorkspaceStayPolicyForm {
  return { checkInFrom: snapshot.values.check_in_from?.slice(0, 5) ?? '',
    checkInUntil: snapshot.values.check_in_until?.slice(0, 5) ?? '',
    checkOutUntil: snapshot.values.check_out_until?.slice(0, 5) ?? '', conditions: snapshot.values.conditions ?? '' };
}

/** Omitted keys cannot clobber newer values. Missing baseline is never an overwrite permission. */
export function buildStayPolicyPatch(form: ObjectWorkspaceStayPolicyForm, snapshot: StayPolicySnapshot | undefined,
  keys: readonly StayPolicyKey[] = STAY_KEYS) {
  if (!snapshot) throw new Error('Rechargez la fiche avant d’enregistrer les heures. Votre saisie est conservée.');
  const baseline = stayPolicyForm(snapshot);
  const changes: Partial<Record<StayPolicyKey, string | null>> = {};
  STAY_KEYS.forEach((key, index) => {
    const field = FORM_KEYS[index];
    if (keys.includes(key) && form[field].trim() !== baseline[field].trim()) changes[key] = form[field].trim() || null;
  });
  return { write_contract: STAY_POLICY_WRITE_CONTRACT, expected: snapshot, changes };
}

export function withStayPolicySnapshot(input: ObjectWorkspaceCapacityPoliciesModule, snapshot: StayPolicySnapshot): ObjectWorkspaceCapacityPoliciesModule {
  return { ...input, stayPolicy: stayPolicyForm(snapshot), stayPolicySnapshot: snapshot };
}
