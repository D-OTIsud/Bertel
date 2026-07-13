# Security audit — Bertel 3.0 (2026-07-01)

**Scope:** full-repository sweep for exposed secrets/keys, PII, and application/API
vulnerabilities, with emphasis on what is *published to the public*.
**Repo:** `github.com/D-OTIsud/Bertel` — **PUBLIC** (`isPrivate: false`, verified via `gh repo view`).
**Method:** manual reconnaissance (`git grep`/history scans on the tracked surface = the public
surface) + two parallel specialized agents (Next.js API-route security review; full-tree
secret/PII sweep). Every finding was re-verified directly; false positives were excluded.

The single most important framing: **the public exposure surface = files tracked in git.**
`.gitignore` is comprehensive and the tracked *code/config* surface is clean of credentials.
The real exposure is **personal data committed into tracked `docs/`.**

---

## Severity summary

| # | Sev | Finding | Public? |
|---|-----|---------|---------|
| **H1** | **HIGH** | Private-individual **PII** (68 personal emails, 46 mobiles, raw CRM note bodies) committed to the **public** repo | **YES — live** |
| M1 | MEDIUM | No rate-limiting on privileged/expensive API routes — esp. `/api/lists/send` (email abuse) | n/a |
| M2 | MEDIUM | In-memory rate limiter is per-instance / unbounded | n/a |
| M3 | MEDIUM | Real business gmail in tracked Postman example | YES |
| L1 | LOW | Raw upstream error text returned to client (~9 routes) | n/a |
| L2 | LOW | Superuser-controlled outbound `fetch(base_url)` (latent SSRF) | n/a |
| L3 | LOW | Plaintext PROD DB password in working-tree `.env.schemaspy` | no (untracked) |

No CRITICAL code vulnerabilities. No leaked API keys/JWTs/private keys in the tracked tree.

---

## H1 — HIGH · Personal data (PII) published on the public GitHub repo

**Confirmed live on `github.com/D-OTIsud/Bertel` (public).** These tracked files carry the
personal contact data of private individuals (gîte/restaurant/lodging owners), not just public
tourism-office contacts:

| File (all TRACKED) | Evidence |
|---|---|
| `docs/research/database-object-internet-enrichment-2026-06-04.md` | worst offender — personal gmail/orange/hotmail/sfr/wanadoo emails + 0692/0693 mobiles + a SIRET |
| `docs/research/berta-deletes-backup-2026-06-16.json` | **raw DB dump** — `contact_channel` + **`crm_interaction` note bodies** (internal notes, e.g. *"…m'a écrit par messenger"*), `object_origin`, media. Committed in `12225e0` |
| `docs/research/database-object-content-audit-2026-06-04.md` | same class |
| `docs/import-candidates/*.md` (32 files) | e.g. `ecuriesduvolcan@orange.fr` |

Quantified on the tracked surface: **68 unique personal-webmail addresses**, **46 unique Réunion
mobile numbers**, plus CRM interaction note bodies. All present in git **history** (not just HEAD).

**Impact.** For an RGPD-regulated *office de tourisme*, this is a personal-data disclosure —
directly contradicting the project's own RGPD/DPIA compliance pack (`docs/conformite-rgpd/`,
`public/legal/`). Public repos are cloned, forked, and indexed; treat the data as already
scraped.

**Remediation (in order):**
1. **Stop shipping it:** `git rm --cached` the offending files, add them to `.gitignore`
   (they stay on disk locally), commit. Prevents further exposure on the next push.
2. **Purge history:** because the repo is public and these blobs are in history, removing from
   HEAD is insufficient — use `git filter-repo --path <file> --invert-paths` (or BFG) to strip
   the blobs, then force-push. **This rewrites public history and needs the PO's explicit go-ahead**
   (coordinate with anyone who has clones/forks).
3. **Rotate/notify as your DPO process requires** — a public personal-data exposure may be a
   reportable event.
4. **Prevent recurrence:** gitignore `docs/research/*backup*.json` and any raw DB exports; never
   commit `crm_interaction` / `contact_channel` dumps.

---

## M1 — MEDIUM · Missing rate-limiting on privileged/expensive endpoints

Only `src/app/api/menu/extract/route.ts` throttles. Unthrottled:
`media/upload`, `document/upload`, `actor-photo/upload`, `admin/invite`, `admin/ai-config/test`,
`objects/delete`, `rgpd/erase`, and **`lists/send`**.

- **`/api/lists/send`** is the sharpest edge: an authenticated user with read access to a list can
  send unbounded emails to arbitrary `toEmail` via the VPS SMTP relay — outbound spam/phishing on
  the org's mail reputation.
- Upload routes each trigger `sharp` processing + a Storage write → CPU / storage-egress cost.

**Fix:** extend the per-user sliding-window limiter already used in `menu/extract` (or a shared
helper) to these routes; prioritize `lists/send`. The team already flags this as an MVP gap.

## M2 — MEDIUM · In-memory limiter is per-instance & unbounded
`menu/extract/route.ts:28-40` — module-level `Map`. Bypassed by hitting a fresh instance in any
multi-instance deploy; grows with distinct users. **Fix:** DB/Redis-backed limiter (reuse the
`partner_rate_check` pattern in `src/lib/partner-auth.ts`).

## M3 — MEDIUM · Real business email in tracked Postman example
`docs/Bertel_API_v3.postman_collection.json:1220` — sample JSON-LD embeds a real restaurant's
`lemacabit97442@gmail.com` + phone + address. **Fix:** redact to a placeholder.

---

## L1 — LOW · Raw error text returned to the client
~9 routes echo `err.message` / `rpcErr.message` (e.g. `media/upload:98`, `document/upload:123`,
`actor-photo/upload:109`, `menu/extract:159`, `objects/delete`, `rgpd/erase`). Only reachable by
authenticated callers; leaks Postgres/PostgREST text (constraint/column names), no stack traces or
secrets. **Fix:** log server-side, return a generic message.

## L2 — LOW · Superuser-controlled outbound fetch (latent SSRF)
`admin/ai-config/test/route.ts:50-60` and `menu/extract/provider.ts:90` `fetch()` a DB-stored
`base_url`. Only a **platform superuser** can set it today (trusted), so not exploitable now — but
if ai-config write access ever broadens, it becomes SSRF (e.g. `http://169.254.169.254/…`).
**Fix:** block RFC1918/link-local/loopback + scheme allow-list before the fetch.

## L3 — LOW · Plaintext PROD DB password in working tree
`.env.schemaspy` → `PGPASSWORD=Maki@…` for `postgres.ryycrdhlkmzpxwwwwupy` @
`aws-1-eu-west-1.pooler.supabase.com`. **Verified UNtracked and never in git history** — not
published. But the matching project ref *is* public (`.mcp.json`, docs), so the password is
"exposed-adjacent." **Fix:** rotate it and move to a secret manager; keep it gitignored.

---

## Verified CLEAN (positives)

**Secrets / keys (tracked surface):**
- No JWTs / Supabase anon+service keys, no `AKIA…`/`AIza…`/`sk-`/`sk_live_`/`pk_live_`/`ghp_`/
  `xox…`/`SG.`, no `BEGIN … PRIVATE KEY`, no `.pem/.key/.p12/.pfx/id_rsa`.
- No hardcoded secrets in source (only a `hunter2` test mock). `.env.example` files are
  placeholder-only and even document *"DO NOT prefix `SUPABASE_SERVICE_ROLE_KEY` with NEXT_PUBLIC_"*.
- The `docs/index.html` "Bearer eyJ…" is a 39-char truncated documentation placeholder, not a token.
- CI creds are the fixed local-stack `postgres:postgres@127.0.0.1:54322` — not a real secret.
- Supabase **project ref** is public by design (it is in every client URL); RLS is the protection.

**Client/server boundary:** server-only guard chain verified end-to-end
(`env.server.ts` `import 'server-only'` → `supabase-server.ts` sole consumer); no `"use client"`
file imports it; the only `NEXT_PUBLIC_*` values are URL/anon-key/demo-flag/map-styles.

**AuthZ:** every service-role route authorizes **as the caller** first
(`api.user_can_write_object_canonical` / `user_can_write_crm_actor` / superuser gate) before any
service-role storage write — matching the documented "AUTORISATION ≠ service key" invariant.
Hard-delete + RGPD-erase run the RPC as caller; service-role only sweeps storage.

**Injection/XSS:** all `.rpc()` calls are parameterized; no SQL string interpolation. The markdown
renderer (`MarkdownContent.tsx`) is XSS-safe (`disableParsingRawHTML`, images stripped,
scheme-validated links, no `dangerouslySetInnerHTML`). The three `dangerouslySetInnerHTML`/
`innerHTML` sinks (`MapLegend`, `ResultCardView`, `fly-to-selection`) all render a **static
internal SVG glyph catalog / hardcoded literal** — no user input.

**Other:** partner API hashes keys (SHA-256) before Postgres, fail-closed auth, RPC allow-list,
re-checks `status='published'`; CORS wildcard scoped to `/api/public/*` only (Bearer, no cookies);
real CSP + HSTS + nosniff + frame-ancestors set in `next.config.ts`; no open redirects; media
pipeline strips EXIF; single-writer upload invariant holds.

---

## Prioritized action list
1. **H1** — scrub the PII files, purge from history (PO go-ahead for the force-push), follow DPO process.
2. **M1** — add rate-limiting to `lists/send` (then the upload routes).
3. **M3** — redact the Postman example email.
4. **L3** — rotate the schemaspy DB password.
5. **M2 / L1 / L2** — defense-in-depth hardening as capacity allows.
