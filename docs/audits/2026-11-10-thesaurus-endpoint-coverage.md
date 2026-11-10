# Thesaurus endpoint and contract coverage audit — 2026-11-10

## Scope and evidence

This matrix follows the public Next.js route handlers under `bertel-tourism-ui/src/app/api/public/thesaurus`, the shared request parser/projection in `bertel-tourism-ui/src/lib/thesaurus-api.ts`, and the published OpenAPI/partner guide/Postman collection. It records only the public read contract; partner authentication and rate limiting apply before parameter validation and content lookup.

All routes require a bearer partner key. Success responses have `ETag`, `Cache-Control: private, no-cache`, `X-Bertel-Vocabulary-Release`, and `Content-Type`; matching `If-None-Match` returns bodyless `304` after auth/rate admission. ETags are computed over representation content type and serialized representation. Errors are flat `{ "error": ... }` objects. Authentication `401`, rate limit `429`, unavailable snapshot `503`, and upstream/configuration failures are common.

## Endpoint matrix

| Method and route | Action | Query parameters | Defaults and limits | Response data |
|---|---|---|---|---|
| `GET /thesaurus` | `manifest` | `lang`, `If-None-Match` | `lang=fr`; BCP 47 canonicalized | Current release manifest (`data.metadata_scope=release_snapshot`) and domains; `meta.metadata_checksum` when present; embedded release history may mark `is_current` relative to `meta.release_id` |
| `GET /thesaurus/releases/{releaseId}` | `release` | `lang`, `If-None-Match` | Positive safe integer release ID; `lang=fr` | Immutable manifest and domain snapshots (`data.metadata_scope=release_snapshot`); optional `meta.metadata_checksum`; no current-relative flag |
| `GET /thesaurus/releases/{releaseId}/concepts` | `concepts` | `domains`, `status`, `lang`, `query`, `page_size`, `cursor`, `If-None-Match` | `lang=fr`; `page_size=100`, 1–200; query up to 200 chars; statuses active/deprecated/retired | Page of concepts, `page_size`, `total`, `next_cursor` |
| `GET /thesaurus/releases/{releaseId}/concepts/{conceptId}` | `concept` | `lang`, `If-None-Match` | UUID concept ID; `lang=fr` | One concept from the pinned immutable release |
| `GET /thesaurus/concepts/{conceptId}` | `resolve` | `lang`, `If-None-Match` | UUID concept ID; `lang=fr` | One concept resolved against current release |
| `GET /thesaurus/releases/{releaseId}/changes` | `changes` | `domains`, `status`, `lang`, `query`, `page_size`, `cursor`, `If-None-Match` | Same paging/filter defaults as concepts | Changes since `previous_release_id`; `added`, `modified`, `deprecated`, `retired`, before/after concept snapshots |
| `GET /thesaurus/releases/{releaseId}/export` | `export` | `domains`, `status`, `lang`, `format`, `If-None-Match` | `lang=fr`; `format=json`; JSON or JSON-LD | Full filtered export; JSON-LD is standalone `application/ld+json` SKOS graph |

`domains` and `status` are accepted only for concepts, changes, and export. They are explicitly rejected on discovery manifest, release manifest, and single-concept routes. Missing `status` means all lifecycle values, not active-only. Unknown/repeated query names, repeated scalar parameters, malformed lists (over 100 entries), invalid BCP 47 language tags (over 35 characters), invalid page sizes/formats, and incompatible cursors produce `400`. Release and concept path identifiers are validated separately. Unknown/non-public domain behavior is a generic client error and must not disclose private vocabularies.

Comma-separated `domains` and `status` lists are trimmed, validated, deduplicated, and normalized before filtering. A pagination cursor is opaque and bound to the release, action, normalized filters, language, query, page size, and representation format. `cursor` is meaningful only on release-pinned paged routes.

## Localization and immutable snapshot rules

Concept records preserve the complete `preferred_labels` and `definitions` language maps and expose localized `name` and `description` where available, plus per-concept `requested_lang`, `effective_lang`, and `definition_lang`. `requested_lang` is present; the latter two are nullable and null when no language can be established. Fallback order for a localized name is exact requested tag, primary language, then French. A fallback is not inserted into the source language map. Historical records without the newer maps retain their established French/original-name behavior and do not claim an effective language.

Domain records preserve their full `name_i18n` maps and add localized `name`, `requested_lang`, and `effective_lang`. Domain fallback is exact requested tag, primary language, French, then the existing legacy `name` only when no language map exists. Legacy snapshots without maps retain their historical French name and fallback semantics. Discovery may include release-history records with `is_current` measured against that response's current `meta.release_id`; a standalone historical release response does not label itself current.

`meta.metadata_checksum` is the PostgreSQL JSONB `domains::text` MD5 and is distinct from the existing concept-content checksum; old releases may omit it. `data.metadata_scope` is `release_snapshot` on both the discovery manifest and a standalone release manifest. Neither `effective_lang` nor `definition_lang` is claimed as a top-level discovery/release response property. All translated maps survive JSON-LD serialization as language-indexed SKOS properties. Historical releases remain immutable, including their original name maps and checksums.

## OpenAPI and client examples

`docs/openapi.json` is normative for paths, parameter acceptance, defaults, bounds, response shapes, and errors. `docs/guide-partenaires.md` explains synchronization and fallback behavior. The Postman collection has credential-free examples; users must supply `partner_key` locally. Localization examples exercise `fr`, `en`, `es`, `de`, and a regional tag; negative examples check rejected `domains`/`status` on routes where those filters are unsupported. Never request or extract a key in a distributed collection.

## Release and historical coverage notes

Current release `25` and legacy releases `1`–`3` are both covered by the contract. Current-release assertions must not be applied to legacy records that lack `name_i18n` or `metadata_checksum`. Concept `checksum` behavior remains unchanged; metadata checksums describe release metadata separately. Discovery and release manifests must remain distinct representations and yield distinct ETags when their bodies differ.
