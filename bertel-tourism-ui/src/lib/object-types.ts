/**
 * The 19 codes of the SQL enum `public.object_type` — the closed vocabulary of tourism object types.
 *
 * Single source of truth for boundary validation of the partner `types` filter: the public list
 * route (`GET /api/public/objects`) checks a caller's codes against this set BEFORE the RPC casts
 * them to the enum. An unknown code would otherwise raise Postgres error 22P02 and surface as a
 * misleading 502 (audit CRITICAL 2026-07-03) instead of a clean 400.
 *
 * Pure data (no `server-only`) so it can be reused on either side of the boundary.
 * Keep in sync with: the DB enum, docs/guide-partenaires.md §3.1, and docs/openapi.json `ObjectType`.
 */
export const OBJECT_TYPE_CODES: ReadonlySet<string> = new Set([
  'RES', 'PCU', 'PNA', 'ORG', 'ITI', 'VIL', 'HPA', 'ASC', 'COM',
  'HOT', 'HLO', 'LOI', 'FMA', 'CAMP', 'PSV', 'RVA', 'ACT', 'SPU', 'PRD',
]);
