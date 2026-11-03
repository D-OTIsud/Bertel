import { buildStayPolicyPatch, stayPolicySnapshot, stayPolicyForm } from './stay-policy-contract';

test('une capacité seule ne réécrit aucune heure ni condition, même avec secondes stockées', () => {
  const snapshot = stayPolicySnapshot({ check_in_from: '14:00:30', check_in_until: null, check_out_until: '10:00:00', conditions: 'Office' });
  expect(buildStayPolicyPatch(stayPolicyForm(snapshot), snapshot)).toEqual({ write_contract: 'stay-policy-patch-v1', expected: snapshot, changes: {} });
});
test('le patch vise seulement le champ réellement modifié et conserve le null de départ', () => {
  const snapshot = stayPolicySnapshot(null);
  expect(buildStayPolicyPatch({ ...stayPolicyForm(snapshot), checkInFrom: '15:00' }, snapshot).changes).toEqual({ check_in_from: '15:00' });
  expect(snapshot.exists).toBe(false);
  expect(snapshot.values.check_in_from).toBeNull();
});
test('le partenaire ne peut inclure les conditions dans son patch', () => {
  const snapshot = stayPolicySnapshot({ conditions: 'Office' });
  expect(buildStayPolicyPatch({ ...stayPolicyForm(snapshot), checkInFrom: '15:00', conditions: 'Forged' }, snapshot,
    ['check_in_from','check_in_until','check_out_until']).changes).toEqual({ check_in_from: '15:00' });
});
test('état de départ absent ne vaut jamais autorisation de remplacement', () => {
  expect(() => buildStayPolicyPatch(stayPolicyForm(stayPolicySnapshot(null)), undefined)).toThrow(/Rechargez/);
});
