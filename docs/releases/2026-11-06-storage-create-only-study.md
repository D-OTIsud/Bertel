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
The real probe has **not run locally** (Docker is absent). The workflow is
prepared for review; no run, deployment or operator change is implied.

```sh
node --test tools/storage-create-only/contract.test.mjs
```

If the real probe returns two successes, this alternative is blocked for the
migration. A source/backend fix or a different reviewed primitive would need its
own evidence. Replacing that failure with a permissive assertion is not an option.
