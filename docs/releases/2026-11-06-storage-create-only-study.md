# Storage v1.41.8 create-only upload study

This isolated study prepares a real HTTP capability probe. It changes no copy
operator, Storage schema, policy, application flow or previously reviewed lot.
No hosted operation, real document or real Auth account is used. The isolated
workflow starts a blank disposable local stack on its GitHub runner only. It can
run on a push to the exact experimental branch or by manual dispatch once the
workflow is registered. Publishing that branch starts the real probe.

## Primary source and current limit

The official tag [v1.41.8](https://github.com/supabase/storage/tree/bb602aa99e44709609e46aa745298dd7b1dfa066)
resolves to `bb602aa99e44709609e46aa745298dd7b1dfa066`.
[createObject.ts](https://github.com/supabase/storage/blob/bb602aa99e44709609e46aa745298dd7b1dfa066/src/http/routes/object/createObject.ts)
sets `isUpsert` from `x-upsert === 'true'`.
[Uploader](https://github.com/supabase/storage/blob/bb602aa99e44709609e46aa745298dd7b1dfa066/src/storage/uploader.ts)
first tests `createObject` permission when upsert is false. That test runs in a
transaction deliberately rolled back by
[testPermission](https://github.com/supabase/storage/blob/bb602aa99e44709609e46aa745298dd7b1dfa066/src/storage/database/knex.ts).
After transferring the payload, `completeUpload` takes the object lock, reads the
current row and unconditionally calls `upsertObject`; it does not reject a row
that appeared since the precheck. `upsertObject` uses `ON CONFLICT ... MERGE`.
The later `isUpsert` branch selects the event type, not the creation constraint.

This source path gives a concrete race mechanism. It is not a measured upload
race result. The [current documentation](https://supabase.com/docs/guides/storage/uploads/standard-uploads#concurrency)
describes one winner without upsert; that description does not replace the
version-specific experiment. No atomic create-only guarantee is claimed here.

## Prepared experiment

The script accepts only an explicitly marked GitHub temporary project and
`http://127.0.0.1:54321`. It obtains generated local keys in memory, checks the
actual Storage container image/version and records its image ID. Its child home
is isolated; inherited account credentials and remote Docker configuration are
not forwarded. Raw CLI output and generated keys are withheld.

It creates one private synthetic bucket. A positive sequential upload and a
precise existing-target refusal are prerequisites. Three fresh targets each
receive two different fictional payloads with `x-upsert:false`; bodies are held
incomplete briefly to widen the precheck window. This is a client-side timing
probe, not a server-side preflight barrier. Every race must have exactly one
HTTP200, an explicit represented409 collision for the loser, and final GET bytes
whose SHA256 equals that unique successful payload. Two successes, a 5xx, unknown
refusal or mismatched hash fails the job. Later collision refusals must preserve
the observed bytes. Synthetic objects/bucket are removed, observations persist
without keys, and the workflow always destroys its owned stack.

The lightweight local tests cover the refusal classifier and endpoint/project
guards, including negative cases. They do not simulate or certify Storage.
Root review required two harness corrections before publication: resolve
`runner.temp` in step environments, and attach an immediate rejection handler
while upload bodies are held, without absorbing the final awaited error or
bypassing cleanup. Both corrections are included in the reviewed candidate.
The real probe has **not run locally** (Docker is absent). The actual disposable
CI execution is recorded below; no hosted operation, deployment or operator
change is included.

```sh
node --test tools/storage-create-only/contract.test.mjs
```

## Executed capability result: RED

[Run 42277702340](https://github.com/D-OTIsud/Bertel/actions/runs/42277702340),
job `128098246632`, executed source head
`c71fa30c05c9324dc6fb285723807b03e466fca8`. The actual image was
`public.ecr.aws/supabase/storage-api:v1.41.8`, image ID
`sha256:9d58edcbd8aefd2cefea68a289d1ded3447f4fe3236ed0f524134e85a7f5b1cb`.

The sequential control returned HTTP200, then HTTP400 with represented status
409 and error `Duplicate`; its first payload hash remained unchanged. All three
fresh-target concurrent races returned **HTTP200 / HTTP200** for the two different
payloads, despite `x-upsert:false`. In all three cases the final downloaded bytes
matched payload B. This is a measured overwrite race, not an accepted server
error, missing-file refusal or failed test setup. No 5xx was counted as success.

- Payload A SHA256: `0973a81092fbfb16df307cce1748cffbdaa1be0eed976cc1b28e973d5fb41a41`.
- Payload B/final SHA256: `8a252bd3adc42695aa2b2bf904a8cd020d2c9861f8756fb18aeab9650a2c4fe7`.

Later collision refusals preserved those final bytes. The uploaded report records
`cleanup:true` and `capabilityPassed:false`; object/bucket cleanup completed, and
the final owned-stack destruction step succeeded at 19:16:03 UTC. The capability
job correctly remains failed. It was not retried or weakened.

[Synthetic observations artifact 13533837354](https://github.com/D-OTIsud/Bertel/actions/runs/42277702340/artifacts/13533837354)
ZIP SHA256: `3e840cbfbff6f7f4552f5122d0de3cea4159529947299d57daf0d4cda7cc459e`.
This ZIP contains only the bounded `probe-report.json`; its digest was checked
again when retrieving the evidence. Keys and raw CLI output are excluded.

Therefore this standard-upload alternative is blocked for the migration on the
tested version. This result does not measure production, other Storage versions,
backends or every possible schedule. A source/backend fix or a different reviewed
primitive needs separate evidence. No atomic create-only guarantee is claimed.
