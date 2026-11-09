import assert from 'node:assert/strict';

export function collision(response) {
  const body = response.body;
  const code = body?.code === undefined ? body?.error : body.code;
  const represented = body?.statusCode === undefined ? undefined : Number(body.statusCode);
  // v1.41.8's standard error handler returns HTTP400 for a represented409;
  // routes using respectStatusCode can return 409 directly. A 5xx never qualifies.
  const status = (response.status === 409 && (represented === undefined || represented === 409))
    || (response.status === 400 && represented === 409);
  return status && ['KeyAlreadyExists', 'ResourceAlreadyExists', 'Duplicate'].includes(code);
}

export function assertRace(outcomes, finalHash) {
  assert.equal(outcomes.length, 2);
  const successes = outcomes.filter(item => item.status === 200);
  assert.equal(successes.length, 1, 'create-only race must have exactly one HTTP200; two successes are a failure');
  const loser = outcomes.find(item => item !== successes[0]);
  assert.ok(collision(loser), 'the loser must have the exact represented409 collision contract; no 5xx accepted');
  assert.equal(finalHash, successes[0].payloadHash, 'final bytes must equal the unique successful request');
}
