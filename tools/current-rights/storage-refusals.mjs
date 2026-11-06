import assert from 'node:assert/strict';

const protocolErrors = new Set(['InvalidKey', 'InvalidRequest', 'InvalidMimeType', 'invalid_mime_type', 'NoSuchKey', 'NoSuchObject',
  'not_found', 'AccessDenied', 'KeyAlreadyExists', 'ResourceAlreadyExists', 'Duplicate', 'InternalError']);

// Some v1.41.8 routes serialize only legacy `error`. A present modern `code`
// remains authoritative, including when it is unknown. Never print messages.
export function storageErrorIdentity(error) {
  const value = error?.code === undefined ? error?.error : error.code;
  return protocolErrors.has(value) ? value : 'unknown';
}

const failures = {
  collision: { status: 409, codes: ['ResourceAlreadyExists', 'KeyAlreadyExists', 'Duplicate'] },
  mime: { status: 415, codes: ['InvalidMimeType', 'invalid_mime_type'] },
};

export async function assertStorageRefusal(response, kind, label) {
  const expected = failures[kind];
  assert.ok(expected, 'unknown Storage refusal contract');
  const body = await response.json().catch(() => null);
  const represented = body?.statusCode === undefined ? undefined : Number(body.statusCode);
  const code = storageErrorIdentity(body);
  const statusMatches = (response.status === expected.status && (represented === undefined || represented === expected.status))
    || (response.status === 400 && represented === expected.status);
  assert.ok(statusMatches && expected.codes.includes(code), `${label} must be an explicit ${kind} refusal (${response.status}, ${code})`);
}

export function assertAnonymousHeadRefusal(response) {
  assert.ok([400, 401, 403, 404].includes(response.status),
    `anonymous private HEAD must have a known refusal status (${response.status})`);
}
