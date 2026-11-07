# Per-Organisation Description Enrichment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any organisation with `edit_org_enrichment` write its own Accroche / Descriptif / Plan d'accès for an object, switchable via a scope toggle in editor §04, with overlay→canonical fallback.

**Architecture:** The per-`(object, org)` storage already exists (`object_description.org_object_id` + uniqueness constraints). We add (1) a SECURITY DEFINER write RPC that server-derives the org, (2) two editor-only raw read keys on `api.get_object_resource`, (3) an active-org session field for the toggle label, and (4) frontend parser/state/section wiring with a `ScopeTabs` primitive. Canonical and overlay are edited as two scopes over the same multilingual fields.

**Tech Stack:** Postgres (Supabase, `api` schema, SECURITY DEFINER RPCs), Next.js + React + TypeScript, Zustand session store, Jest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-01-org-description-enrichment-design.md`

**Conventions:**
- Frontend tests: `cd bertel-tourism-ui && npm run test:run -- <path>` (Jest). Typecheck: `npm run typecheck`.
- SQL: edit the canonical file, then apply with the Supabase MCP `apply_migration` (CREATE OR REPLACE is idempotent), then verify with `execute_sql`. Prefer a dev branch if one is available.
- Commit after each task.

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `Base de donnée DLL et API/rls_policies.sql` | `api.current_user_active_org()` (id + name for label) | Modify (append near `current_user_org_id`) |
| `Base de donnée DLL et API/api_views_functions.sql` | `api.rpc_write_org_description()` writer; two editor-only read keys in `api.get_object_resource` | Modify |
| `bertel-tourism-ui/src/services/object-workspace-parser.ts` | `orgOverlay` in descriptions module; parse `canonical_description`/`org_description`; languages from overlay | Modify |
| `bertel-tourism-ui/src/services/object-workspace.ts` | `descriptions` access flags; `writeOrgDescription`; gated `saveObjectWorkspaceDescriptions`; pure access helper | Modify |
| `bertel-tourism-ui/src/services/rpc.ts` | `fetchActiveOrg()` | Modify |
| `bertel-tourism-ui/src/hooks/useExplorerQueries.ts` | thread overlay flags into the descriptions save arg | Modify |
| `bertel-tourism-ui/src/features/object-editor/useEditorSave.ts` | pass `canEditCanonical`/`canEditOrgEnrichment` in `buildSaveArg` | Modify |
| `bertel-tourism-ui/src/store/session-store.ts` + `src/hooks/useBootstrapSession.ts` | `orgId`/`orgName` in session | Modify |
| `bertel-tourism-ui/src/features/object-editor/primitives/ScopeTabs.tsx` + `index.ts` + `object-editor.css` | scope toggle primitive | Create + Modify |
| `bertel-tourism-ui/src/features/object-editor/sections/SectionDescriptions.tsx` | scope state, ScopeTabs, scope-bound fields, fallback, remove OTI, gating | Modify |
| `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`, `CLAUDE.md` | decision log + invariant | Modify |

---

## Task 1: SQL — `api.current_user_active_org()`

**Files:**
- Modify: `Base de donnée DLL et API/rls_policies.sql` (after `api.current_user_org_id()`, ~line 246)

- [ ] **Step 1: Add the function**

Insert after the `current_user_org_id()` definition (it returns one active-membership org as `(org_id, org_name)`; mirrors `current_user_org_id` semantics):

```sql
-- Retourne l'ORG active de l'utilisateur courant (id + nom), pour le libellé
-- côté éditeur du sélecteur de périmètre des descriptions. Le serveur reste
-- autoritaire ; le client n'utilise ce nom que pour l'affichage.
CREATE OR REPLACE FUNCTION api.current_user_active_org()
RETURNS TABLE (org_id text, org_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT o.id, o.name
  FROM user_org_membership uom
  JOIN object o ON o.id = uom.org_object_id
  WHERE uom.user_id = auth.uid()
    AND uom.is_active = TRUE
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION api.current_user_active_org() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.current_user_active_org() TO authenticated, service_role;
```

- [ ] **Step 2: Apply**

Apply with the Supabase MCP `apply_migration` (name `current_user_active_org`), passing the SQL above.

- [ ] **Step 3: Verify it exists and runs**

Run via `execute_sql`:
```sql
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'api' AND p.proname = 'current_user_active_org';
```
Expected: one row `current_user_active_org`.

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/rls_policies.sql"
git commit -m "feat(api): add current_user_active_org() for the editor scope label"
```

---

## Task 2: SQL — `api.rpc_write_org_description()` (W2 writer)

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (append near other `rpc_*` write functions, e.g. after `rpc_publish_object`)

- [ ] **Step 1: Add the writer RPC**

```sql
-- Écrit/supprime la SURCOUCHE de description propre à l'ORG active de l'utilisateur.
-- Seul écrivain des lignes object_description scopées org_object_id (invariant CLAUDE.md).
-- Le serveur fixe org_object_id = current_user_org_id() : le client ne choisit pas l'ORG.
-- Payload tout-vide => suppression de la ligne (fallback canonique au rendu).
CREATE OR REPLACE FUNCTION api.rpc_write_org_description(
  p_object_id text,
  p_payload   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_org         text;
  v_has_content boolean;
  v_row_id      uuid;
BEGIN
  IF NOT api.user_can_write_enrichment(p_object_id) THEN
    RAISE EXCEPTION 'forbidden: edit_org_enrichment required for object %', p_object_id
      USING ERRCODE = '42501';
  END IF;

  v_org := api.current_user_org_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no active organisation for current user' USING ERRCODE = '42501';
  END IF;

  v_has_content :=
       COALESCE(NULLIF(p_payload->>'description',''), '') <> ''
    OR COALESCE(NULLIF(p_payload->>'description_chapo',''), '') <> ''
    OR COALESCE(NULLIF(p_payload->>'description_adapted',''), '') <> ''
    OR jsonb_typeof(p_payload->'description_i18n') = 'object'
    OR jsonb_typeof(p_payload->'description_chapo_i18n') = 'object'
    OR jsonb_typeof(p_payload->'description_adapted_i18n') = 'object';

  IF NOT v_has_content THEN
    DELETE FROM object_description
    WHERE object_id = p_object_id AND org_object_id = v_org;
    RETURN jsonb_build_object('deleted', true);
  END IF;

  INSERT INTO object_description (
    object_id, org_object_id, visibility,
    description,         description_i18n,
    description_chapo,   description_chapo_i18n,
    description_adapted, description_adapted_i18n
  ) VALUES (
    p_object_id, v_org, 'public',
    NULLIF(p_payload->>'description',''),
    CASE WHEN jsonb_typeof(p_payload->'description_i18n')='object'         THEN p_payload->'description_i18n'         ELSE NULL END,
    NULLIF(p_payload->>'description_chapo',''),
    CASE WHEN jsonb_typeof(p_payload->'description_chapo_i18n')='object'   THEN p_payload->'description_chapo_i18n'   ELSE NULL END,
    NULLIF(p_payload->>'description_adapted',''),
    CASE WHEN jsonb_typeof(p_payload->'description_adapted_i18n')='object' THEN p_payload->'description_adapted_i18n' ELSE NULL END
  )
  ON CONFLICT (object_id, org_object_id) WHERE org_object_id IS NOT NULL
  DO UPDATE SET
    description              = EXCLUDED.description,
    description_i18n         = EXCLUDED.description_i18n,
    description_chapo        = EXCLUDED.description_chapo,
    description_chapo_i18n   = EXCLUDED.description_chapo_i18n,
    description_adapted      = EXCLUDED.description_adapted,
    description_adapted_i18n = EXCLUDED.description_adapted_i18n,
    updated_at               = NOW()
  RETURNING id INTO v_row_id;

  RETURN jsonb_build_object('id', v_row_id, 'org_object_id', v_org);
END;
$$;

REVOKE EXECUTE ON FUNCTION api.rpc_write_org_description(text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_write_org_description(text, jsonb) TO authenticated, service_role;
```

- [ ] **Step 2: Apply** with `apply_migration` (name `rpc_write_org_description`).

- [ ] **Step 3: Verify the all-empty branch is a no-op delete and content upserts**

Pick an object id the connected role can enrich (or run as service_role for a smoke test). Run via `execute_sql`:
```sql
SELECT api.rpc_write_org_description('<object_id>', '{}'::jsonb);              -- expect {"deleted": true}
SELECT api.rpc_write_org_description('<object_id>', '{"description_chapo":"X"}'::jsonb); -- expect {"id":..., "org_object_id":...}
SELECT description_chapo FROM object_description
WHERE object_id = '<object_id>' AND org_object_id IS NOT NULL;                 -- expect 'X'
```
Expected: first returns `deleted`, second returns an id, third returns `X`. (If running as a role without an active org, expect the `no active organisation` error — that itself verifies the guard.)

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/api_views_functions.sql"
git commit -m "feat(api): add rpc_write_org_description (W2 org enrichment writer)"
```

---

## Task 3: SQL — editor-only raw read keys in `api.get_object_resource`

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (inside `api.get_object_resource`, after the `'descriptions'` array block, ~line 2613, before the `External IDs` block)

`v_user_org` (= current user's org, set ~line 2294) is in scope here. `to_jsonb(d)` returns every raw column including the `*_i18n` maps and `org_object_id`, which is exactly what the parser consumes.

- [ ] **Step 1: Add the two keys**

```sql
  -- Editor-only raw description layers (full i18n maps) so the workspace can edit
  -- canonical and the current user's org overlay per language. Additive keys: no
  -- existing consumer reads them. Spec 2026-06-01-org-description-enrichment.
  IF v_fields IS NULL OR 'canonical_description' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'canonical_description',
      (SELECT to_jsonb(d) FROM object_description d
        WHERE d.object_id = obj.id AND d.org_object_id IS NULL
        ORDER BY d.created_at DESC, d.id
        LIMIT 1)
    );
  END IF;
  IF v_fields IS NULL OR 'org_description' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'org_description',
      CASE WHEN v_user_org IS NULL THEN NULL ELSE (
        SELECT to_jsonb(d) FROM object_description d
          WHERE d.object_id = obj.id AND d.org_object_id = v_user_org
          ORDER BY d.created_at DESC, d.id
          LIMIT 1
      ) END
    );
  END IF;
```

- [ ] **Step 2: Apply** the full `api.get_object_resource` definition with `apply_migration` (name `get_object_resource_editor_layers`).

- [ ] **Step 3: Verify keys are present**

Run via `execute_sql` (replace with a real object id that has a canonical description):
```sql
SELECT api.get_object_resource('<object_id>', ARRAY['fr','en'], 'none', '{}'::jsonb)::jsonb
       ? 'canonical_description' AS has_canonical,
       api.get_object_resource('<object_id>', ARRAY['fr','en'], 'none', '{}'::jsonb)::jsonb
       ? 'org_description'       AS has_org;
```
Expected: both `true`. The `canonical_description` value should contain `description_chapo_i18n` when the row has translations.

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/api_views_functions.sql"
git commit -m "feat(api): expose canonical_description + org_description raw layers for the editor"
```

---

## Task 4: Parser — `orgOverlay` scope + raw layers

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace-parser.ts`
- Test: `bertel-tourism-ui/src/services/object-workspace-parser.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `object-workspace-parser.test.ts`:

```ts
describe('descriptions org overlay', () => {
  it('parses canonical_description (with i18n) and org_description into two scopes', () => {
    const detail = { id: 'o1', name: 'O', raw: {
      canonical_description: {
        id: 'c1', org_object_id: null,
        description_chapo: 'Chapo canon FR', description_chapo_i18n: { fr: 'Chapo canon FR', en: 'Canon hook EN' },
        description: 'Desc canon', description_adapted: 'Accès canon',
      },
      org_description: {
        id: 'g1', org_object_id: 'ORG-OTI',
        description_chapo: 'Chapo OTI FR', description_chapo_i18n: { fr: 'Chapo OTI FR' },
        description: 'Desc OTI',
      },
    } } as unknown as import('../types/domain').ObjectDetail;

    const parsed = parseObjectWorkspace(detail, ['fr', 'en']);
    expect(parsed.descriptions.object.chapo.values.en).toBe('Canon hook EN');
    expect(parsed.descriptions.orgOverlay).not.toBeNull();
    expect(parsed.descriptions.orgOverlay?.chapo.baseValue).toBe('Chapo OTI FR');
    expect(parsed.descriptions.orgOverlay?.description.baseValue).toBe('Desc OTI');
  });

  it('leaves orgOverlay null when org_description is absent', () => {
    const detail = { id: 'o2', name: 'O', raw: {
      canonical_description: { id: 'c2', org_object_id: null, description: 'Only canon' },
    } } as unknown as import('../types/domain').ObjectDetail;
    expect(parseObjectWorkspace(detail, ['fr']).descriptions.orgOverlay).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/services/object-workspace-parser.test.ts`
Expected: FAIL — `orgOverlay` does not exist on the module (and `object.chapo.values.en` is empty because the canonical raw layer is not read yet).

- [ ] **Step 3: Add `orgOverlay` to the module type**

In `object-workspace-parser.ts`, extend `ObjectWorkspaceDescriptionsModule` (~line 120):

```ts
export interface ObjectWorkspaceDescriptionsModule {
  localLanguage: string;
  activeLanguage: string;
  availableLanguages: string[];
  object: ObjectWorkspaceDescriptionScope;
  /** Current user's organisation overlay (null when none / not enrichable). */
  orgOverlay: ObjectWorkspaceDescriptionScope | null;
  places: ObjectWorkspaceDescriptionScope[];
}
```

- [ ] **Step 4: Read the raw layers in `parseObjectWorkspace`**

Replace the `objectDescription` construction (~line 2904) with canonical-layer preference + overlay parsing:

```ts
  const canonicalRecord = readRecord(raw.canonical_description);
  const objectDescription = parseDescriptionScope({
    record: Object.keys(canonicalRecord).length > 0 ? canonicalRecord : pickDescriptionSource(raw),
    scope: 'object',
    label: 'Objet principal',
  });
  const orgRecord = readRecord(raw.org_description);
  const orgOverlay = Object.keys(orgRecord).length > 0
    ? parseDescriptionScope({ record: orgRecord, scope: 'object', label: 'Mon organisation' })
    : null;
```

- [ ] **Step 5: Include overlay languages + add overlay to the module**

In `collectLanguages` (~line 1174) add an optional `orgScope` param and include its values:

```ts
function collectLanguages(params: {
  langPrefs: string[];
  nameTranslations: Record<string, string>;
  objectScope: ObjectWorkspaceDescriptionScope;
  orgScope: ObjectWorkspaceDescriptionScope | null;
  placeScopes: ObjectWorkspaceDescriptionScope[];
}): string[] {
  const candidateSets = [
    params.langPrefs,
    Object.keys(params.nameTranslations),
    Object.keys(params.objectScope.description.values),
    Object.keys(params.objectScope.chapo.values),
    Object.keys(params.objectScope.adaptedDescription.values),
    Object.keys(params.objectScope.mobileDescription.values),
    Object.keys(params.objectScope.editorialDescription.values),
    ...(params.orgScope ? [
      Object.keys(params.orgScope.description.values),
      Object.keys(params.orgScope.chapo.values),
      Object.keys(params.orgScope.adaptedDescription.values),
    ] : []),
    ...params.placeScopes.flatMap((scope) => [
      Object.keys(scope.description.values),
      Object.keys(scope.chapo.values),
      Object.keys(scope.adaptedDescription.values),
      Object.keys(scope.mobileDescription.values),
      Object.keys(scope.editorialDescription.values),
    ]),
  ];
  const languages = candidateSets.flat().filter(Boolean);
  return Array.from(new Set(languages.length > 0 ? languages : ['fr']));
}
```

Update the `collectLanguages({ ... })` call site to pass `orgScope: orgOverlay`, and add `orgOverlay` to the `descriptions` module object (~line 2985):

```ts
    descriptions: {
      localLanguage,
      activeLanguage: localLanguage,
      availableLanguages,
      object: objectDescription,
      orgOverlay,
      places: placeDescriptions,
    },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:run -- src/services/object-workspace-parser.test.ts`
Expected: PASS. Then `npm run typecheck` — fix any `orgOverlay` missing-field errors in fixtures (Task 9 fixture is updated there; if other test fixtures construct the module inline, add `orgOverlay: null`).

- [ ] **Step 7: Commit**

```bash
git add bertel-tourism-ui/src/services/object-workspace-parser.ts bertel-tourism-ui/src/services/object-workspace-parser.test.ts
git commit -m "feat(editor): parse canonical + org-overlay description layers"
```

---

## Task 5: Permissions — `canEditCanonical` / `canEditOrgEnrichment`

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace.ts` (type ~line 87, builder ~line 3108)
- Test: `bertel-tourism-ui/src/services/object-workspace.descriptions-access.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describeDescriptionsAccess } from './object-workspace';

describe('describeDescriptionsAccess', () => {
  it('publisher (canonical) can edit canonical and, if enrichment, the overlay', () => {
    const a = describeDescriptionsAccess({ directWrite: false, canonical: true, enrichment: true });
    expect(a.canEditCanonical).toBe(true);
    expect(a.canEditOrgEnrichment).toBe(true);
  });
  it('contributor (enrichment only) cannot edit canonical', () => {
    const a = describeDescriptionsAccess({ directWrite: false, canonical: false, enrichment: true });
    expect(a.canEditCanonical).toBe(false);
    expect(a.canEditOrgEnrichment).toBe(true);
  });
  it('direct-write bypass enables both', () => {
    const a = describeDescriptionsAccess({ directWrite: true, canonical: false, enrichment: false });
    expect(a.canEditCanonical).toBe(true);
    expect(a.canEditOrgEnrichment).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/services/object-workspace.descriptions-access.test.ts`
Expected: FAIL — `describeDescriptionsAccess` is not exported.

- [ ] **Step 3: Extend the type and add the pure helper**

In `object-workspace.ts`, extend the `descriptions` access type (~line 87):

```ts
  descriptions: ObjectWorkspaceModuleAccess & {
    canEditPlaceDescriptions: boolean;
    canEditCanonical: boolean;
    canEditOrgEnrichment: boolean;
  };
```

Add the pure helper near the top of the permissions section:

```ts
/** Pure: derive per-layer description edit rights from the resolved capability flags. */
export function describeDescriptionsAccess(flags: {
  directWrite: boolean;
  canonical: boolean;
  enrichment: boolean;
}): { canEditCanonical: boolean; canEditOrgEnrichment: boolean } {
  return {
    canEditCanonical: flags.directWrite || flags.canonical,
    canEditOrgEnrichment: flags.directWrite || flags.enrichment,
  };
}
```

- [ ] **Step 4: Hoist the capability flags so they reach the return**

In `getObjectWorkspacePermissions`, `canonical` and `enrichment` are currently declared `const` **inside** the `try` block (~lines 3055-3058), so they are out of scope at the `return`. Hoist them to the function scope so the `descriptions` entry can read them.

Beside the existing `let canPrepareProposal = directWrite;` (~line 3041) add:

```ts
  let canonical = false;
  let enrichment = false;
```

Then change the two inner declarations (~lines 3055-3058) from `const` to plain assignments so they target the hoisted variables:

```ts
      canonical =
        canonicalResult.status === 'fulfilled' && canonicalResult.value.error == null && canonicalResult.value.data === true;
      enrichment =
        enrichmentResult.status === 'fulfilled' && enrichmentResult.value.error == null && enrichmentResult.value.data === true;
```

(The existing `canPrepareProposal = directWrite || canonical || enrichment;` line keeps working unchanged.)

- [ ] **Step 5: Use the helper in the permissions builder**

There is a single place that builds the `descriptions` entry (~line 3108). With `canonical`/`enrichment` now hoisted, it becomes:

```ts
    descriptions: {
      ...directOrBlocked(),
      canEditPlaceDescriptions: session.demoMode || session.role === 'super_admin',
      ...describeDescriptionsAccess({ directWrite, canonical, enrichment }),
    },
```

In demo mode `directWrite` is `true`, so both layers resolve editable via the helper regardless of the (false) flags.

- [ ] **Step 6: Run tests + typecheck**

Run: `npm run test:run -- src/services/object-workspace.descriptions-access.test.ts` → PASS.
Run: `npm run typecheck` → fix any place that constructs `permissions.descriptions` (tests using `{} as ObjectWorkspacePermissions` are unaffected; the SectionDescriptions test casts, so it stays green).

- [ ] **Step 7: Commit**

```bash
git add bertel-tourism-ui/src/services/object-workspace.ts bertel-tourism-ui/src/services/object-workspace.descriptions-access.test.ts
git commit -m "feat(editor): surface canEditCanonical/canEditOrgEnrichment on descriptions access"
```

---

## Task 6: Save — org overlay write path

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace.ts` (description payload helpers + `saveObjectWorkspaceDescriptions`)
- Modify: `bertel-tourism-ui/src/hooks/useExplorerQueries.ts` (save input + dispatch)
- Modify: `bertel-tourism-ui/src/features/object-editor/useEditorSave.ts` (`buildSaveArg`)
- Test: `bertel-tourism-ui/src/services/object-workspace.org-description.test.ts` (create)

- [ ] **Step 1: Write the failing test for the pure payload helpers**

```ts
import { orgOverlayHasContent, buildOrgDescriptionPayload } from './object-workspace';

const field = (baseValue: string, values: Record<string, string> = {}) => ({ baseValue, values });
const scope = (over: Partial<{ chapo: any; description: any; adaptedDescription: any }> = {}) => ({
  recordId: null, scope: 'object' as const, placeId: null, label: '', visibility: 'public',
  chapo: field(''), description: field(''), adaptedDescription: field(''),
  mobileDescription: field(''), editorialDescription: field(''), ...over,
});

describe('org description payload', () => {
  it('detects empty vs non-empty overlays', () => {
    expect(orgOverlayHasContent(scope())).toBe(false);
    expect(orgOverlayHasContent(scope({ chapo: field('Hi') }))).toBe(true);
    expect(orgOverlayHasContent(scope({ description: field('', { en: 'X' }) }))).toBe(true);
  });
  it('builds a payload of the three overlay fields only', () => {
    const p = buildOrgDescriptionPayload(scope({ chapo: field('C', { fr: 'C' }), description: field('D') }));
    expect(p).toMatchObject({ description_chapo: 'C', description_chapo_i18n: { fr: 'C' }, description: 'D' });
    expect('description_edition' in p).toBe(false);
    expect('description_mobile' in p).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/services/object-workspace.org-description.test.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Add the pure helpers**

In `object-workspace.ts`, near `buildDescriptionPayload` (~line 4833):

```ts
/** Pure: TRUE if an org overlay scope carries any text or translation worth persisting. */
export function orgOverlayHasContent(scope: ObjectWorkspaceDescriptionScope): boolean {
  const fields = [scope.chapo, scope.description, scope.adaptedDescription];
  return fields.some((f) => f.baseValue.trim() !== '' || Object.keys(f.values).length > 0);
}

/** Pure: the org-overlay write payload — the three enrichable fields only. */
export function buildOrgDescriptionPayload(scope: ObjectWorkspaceDescriptionScope) {
  return {
    description: toNullableText(scope.description.baseValue),
    description_i18n: Object.keys(scope.description.values).length > 0 ? scope.description.values : null,
    description_chapo: toNullableText(scope.chapo.baseValue),
    description_chapo_i18n: Object.keys(scope.chapo.values).length > 0 ? scope.chapo.values : null,
    description_adapted: toNullableText(scope.adaptedDescription.baseValue),
    description_adapted_i18n: Object.keys(scope.adaptedDescription.values).length > 0 ? scope.adaptedDescription.values : null,
  };
}
```

`ObjectWorkspaceDescriptionScope` is already imported from the parser; if not, add it to the existing import block.

- [ ] **Step 4: Run helper tests to verify they pass**

Run: `npm run test:run -- src/services/object-workspace.org-description.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the RPC writer + gate the save**

In `object-workspace.ts`, add the writer and update `saveObjectWorkspaceDescriptions` (~line 4938):

```ts
async function writeOrgDescription(objectId: string, overlay: ObjectWorkspaceDescriptionScope | null): Promise<void> {
  const apiClient = getApiClient();
  if (!apiClient) {
    throw new Error('Connexion backend indisponible pour enregistrer la description ORG.');
  }
  // Empty overlay → send {} so the RPC deletes any existing row (fallback to canonical).
  const payload = overlay && orgOverlayHasContent(overlay) ? buildOrgDescriptionPayload(overlay) : {};
  const { error } = await apiClient.schema('api').rpc('rpc_write_org_description', {
    p_object_id: objectId,
    p_payload: payload,
  });
  if (error) {
    throw mapMutationError(error, "Impossible d'enregistrer la description propre à votre organisation.");
  }
}

export async function saveObjectWorkspaceDescriptions(
  objectId: string,
  input: ObjectWorkspaceDescriptionsModule,
  options: { canEditCanonical: boolean; canEditOrgEnrichment: boolean; canEditPlaceDescriptions: boolean },
): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  if (options.canEditCanonical) {
    await upsertObjectDescription(objectId, input.object);
  }

  if (options.canEditOrgEnrichment) {
    await writeOrgDescription(objectId, input.orgOverlay);
  }

  if (!options.canEditPlaceDescriptions) {
    return;
  }
  for (const placeScope of input.places) {
    await upsertPlaceDescription(placeScope);
  }
}
```

- [ ] **Step 6: Thread the flags through the save input + dispatch**

In `useExplorerQueries.ts`, update the descriptions variant of `SaveWorkspaceModuleInput` (~line 71):

```ts
  | { moduleId: 'descriptions'; value: ObjectWorkspaceDescriptionsModule; canEditCanonical: boolean; canEditOrgEnrichment: boolean; canEditPlaceDescriptions: boolean }
```

Find the mutation executor switch (the `case 'descriptions':` that calls `saveObjectWorkspaceDescriptions`) and pass the new options:

```ts
    case 'descriptions':
      await saveObjectWorkspaceDescriptions(objectId, input.value, {
        canEditCanonical: input.canEditCanonical,
        canEditOrgEnrichment: input.canEditOrgEnrichment,
        canEditPlaceDescriptions: input.canEditPlaceDescriptions,
      });
      return;
```

In `useEditorSave.ts`, update `buildSaveArg` (~line 49):

```ts
    case 'descriptions':
      return {
        moduleId: 'descriptions',
        value: draft.descriptions,
        canEditCanonical: permissions.descriptions.canEditCanonical,
        canEditOrgEnrichment: permissions.descriptions.canEditOrgEnrichment,
        canEditPlaceDescriptions: permissions.descriptions.canEditPlaceDescriptions,
      };
```

- [ ] **Step 7: Typecheck + run the descriptions tests**

Run: `npm run typecheck` (fixes ripple through the discriminated union).
Run: `npm run test:run -- src/services/object-workspace.org-description.test.ts` → PASS.

- [ ] **Step 8: Commit**

```bash
git add bertel-tourism-ui/src/services/object-workspace.ts bertel-tourism-ui/src/hooks/useExplorerQueries.ts bertel-tourism-ui/src/features/object-editor/useEditorSave.ts bertel-tourism-ui/src/services/object-workspace.org-description.test.ts
git commit -m "feat(editor): route org overlay saves through rpc_write_org_description, gated per layer"
```

---

## Task 7: Session — active organisation identity

**Files:**
- Modify: `bertel-tourism-ui/src/services/rpc.ts` (`fetchActiveOrg`)
- Modify: `bertel-tourism-ui/src/store/session-store.ts`
- Modify: `bertel-tourism-ui/src/hooks/useBootstrapSession.ts`
- Test: `bertel-tourism-ui/src/store/session-store.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { useSessionStore } from './session-store';

describe('session active org', () => {
  it('stores orgId/orgName from hydrateFromAuth', () => {
    useSessionStore.getState().hydrateFromAuth({
      role: 'tourism_agent', userId: 'u1', email: 'a@b.c', userName: 'A', avatar: 'A',
      langPrefs: ['fr'], canEditObjects: true, orgId: 'ORG-OTI', orgName: 'OTI du Sud',
    });
    expect(useSessionStore.getState().orgId).toBe('ORG-OTI');
    expect(useSessionStore.getState().orgName).toBe('OTI du Sud');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/store/session-store.test.ts`
Expected: FAIL — `orgId` not on state / `hydrateFromAuth` rejects the new keys.

- [ ] **Step 3: Add `orgId`/`orgName` to the store**

In `session-store.ts`: add `orgId: string | null;` and `orgName: string | null;` to `SessionState`; add `orgId`/`orgName` to the `hydrateFromAuth` payload type; initialise both (`env.demoMode ? 'OTI du Sud' : null` for `orgName`, `env.demoMode ? 'ORG-DEMO' : null` for `orgId`); set them in `hydrateFromAuth`; reset to `null` in `setGuest`/`setSessionError`.

```ts
  // in SessionState:
  orgId: string | null;
  orgName: string | null;
  // hydrateFromAuth payload gains:
  orgId: string | null;
  orgName: string | null;
  // initial state:
  orgId: env.demoMode ? 'ORG-DEMO' : null,
  orgName: env.demoMode ? 'OTI du Sud' : null,
  // in hydrateFromAuth set():  orgId, orgName,
  // in setGuest/setSessionError set():  orgId: null, orgName: null,
```

- [ ] **Step 4: Add `fetchActiveOrg` and call it at bootstrap**

In `rpc.ts`:

```ts
export async function fetchActiveOrg(): Promise<{ orgId: string | null; orgName: string | null }> {
  const client = getApiClient();
  if (!client) return { orgId: null, orgName: null };
  try {
    const { data, error } = await client.schema('api').rpc('current_user_active_org');
    if (error) return { orgId: null, orgName: null };
    const row = Array.isArray(data) ? data[0] : data;
    return { orgId: row?.org_id ?? null, orgName: row?.org_name ?? null };
  } catch {
    return { orgId: null, orgName: null };
  }
}
```

(`getApiClient` is the same accessor used by the other rpc.ts helpers; reuse the existing import.)

In `useBootstrapSession.ts`, after `const canEditObjects = await fetchCanEditObjects();` add `const activeOrg = await fetchActiveOrg();` (import it), and pass `orgId: activeOrg.orgId, orgName: activeOrg.orgName` into `hydrateFromAuth({ ... })`.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test:run -- src/store/session-store.test.ts` → PASS.
Run: `npm run typecheck` → fix the `hydrateFromAuth` call in `useBootstrapSession.ts` (now requires `orgId`/`orgName`).

- [ ] **Step 6: Commit**

```bash
git add bertel-tourism-ui/src/services/rpc.ts bertel-tourism-ui/src/store/session-store.ts bertel-tourism-ui/src/hooks/useBootstrapSession.ts bertel-tourism-ui/src/store/session-store.test.ts
git commit -m "feat(session): expose active organisation id/name for the editor scope label"
```

---

## Task 8: Primitive — `ScopeTabs`

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/primitives/ScopeTabs.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/primitives/index.ts`
- Modify: `bertel-tourism-ui/src/features/object-editor/object-editor.css` (add `.scope-tabs`, after `.lang-tabs` ~line 366)
- Test: `bertel-tourism-ui/src/features/object-editor/primitives/ScopeTabs.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ScopeTabs } from './ScopeTabs';

describe('ScopeTabs', () => {
  it('renders options and fires onSelect', () => {
    const onSelect = jest.fn();
    render(<ScopeTabs active="canonical" onSelect={onSelect} tabs={[
      { code: 'canonical', label: 'Canonique' },
      { code: 'org', label: 'Mon organisation · OTI du Sud' },
    ]} />);
    expect(screen.getByText('Canonique')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Mon organisation · OTI du Sud'));
    expect(onSelect).toHaveBeenCalledWith('org');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:run -- src/features/object-editor/primitives/ScopeTabs.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the primitive**

`ScopeTabs.tsx`:

```tsx
export interface ScopeTabDef {
  code: string;
  label: string;
}

interface ScopeTabsProps {
  tabs: ScopeTabDef[];
  active: string;
  onSelect: (code: string) => void;
}

/** Segmented control mirroring LangTabs, but with word labels — the descriptions
 *  "scope" switch (Canonique / Mon organisation). */
export function ScopeTabs({ tabs, active, onSelect }: ScopeTabsProps) {
  return (
    <div className="scope-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.code}
          type="button"
          role="tab"
          aria-selected={active === t.code}
          className={active === t.code ? 'is-on' : ''}
          onClick={() => onSelect(t.code)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

Add to `primitives/index.ts`:

```ts
export { ScopeTabs, type ScopeTabDef } from './ScopeTabs';
```

- [ ] **Step 4: Add the CSS**

Append after the `.lang-tabs` rules (~line 366) in `object-editor.css`:

```css
.object-editor .scope-tabs {
  display: inline-flex;
  background: var(--surface-2);
  padding: 3px; border-radius: 999px; margin-bottom: 10px; gap: 2px;
}
.object-editor .scope-tabs button {
  height: 26px; padding: 0 14px;
  border-radius: 999px;
  font-size: 12px; font-weight: 600;
  color: var(--ink-3); letter-spacing: 0.01em;
  background: transparent; border: 0; cursor: pointer;
}
.object-editor .scope-tabs button.is-on {
  background: var(--surface); color: var(--ink); box-shadow: var(--shadow-s);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:run -- src/features/object-editor/primitives/ScopeTabs.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/primitives/ScopeTabs.tsx bertel-tourism-ui/src/features/object-editor/primitives/index.ts bertel-tourism-ui/src/features/object-editor/object-editor.css bertel-tourism-ui/src/features/object-editor/primitives/ScopeTabs.test.tsx
git commit -m "feat(editor): add ScopeTabs primitive for the descriptions scope switch"
```

---

## Task 9: Section — `SectionDescriptions` rewrite

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionDescriptions.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/SectionDescriptions.test.tsx`

Behaviour: scope is local UI state (default `org` when the user can edit enrichment but not canonical, else `canonical`). The `Mon organisation` tab shows only when `canEditOrgEnrichment`. The three fields bind to `object` or `orgOverlay`. In `org` scope, an empty field shows the canonical value as a greyed placeholder. The "Accroche OTI" / "Descriptif OTI" boxes are removed.

- [ ] **Step 1: Write the failing tests**

Replace `SectionDescriptions.test.tsx` with (keeps the two existing assertions, adds scope behaviour; `modules()` gains `orgOverlay`):

```tsx
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionDescriptions } from './SectionDescriptions';
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

const emptyField = () => ({ baseValue: '', values: {} as Record<string, string> });
const scope = (over = {}) => ({
  recordId: null, scope: 'object' as const, placeId: null, label: '', visibility: 'public',
  description: emptyField(), chapo: emptyField(), adaptedDescription: emptyField(),
  mobileDescription: emptyField(), editorialDescription: emptyField(), ...over,
});

function modules(orgOverlay: unknown = null): ObjectWorkspaceModules {
  return {
    generalInfo: { name: 'A', commercialVisibility: 'full' },
    descriptions: {
      localLanguage: 'fr', activeLanguage: 'fr', availableLanguages: ['fr', 'en'],
      object: scope({ description: { baseValue: '', values: { fr: 'Un descriptif' } } }),
      orgOverlay,
      places: [],
    },
  } as unknown as ObjectWorkspaceModules;
}

const canonicalOnly = { descriptions: { canEditCanonical: true, canEditOrgEnrichment: false } } as unknown as ObjectWorkspacePermissions;
const bothLayers = { descriptions: { canEditCanonical: true, canEditOrgEnrichment: true } } as unknown as ObjectWorkspacePermissions;

describe('SectionDescriptions', () => {
  it('renders the descriptif for the active language', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionDescriptions editor={result.current} permissions={canonicalOnly} />);
    expect(screen.getByDisplayValue('Un descriptif')).toBeInTheDocument();
  });

  it('no longer renders the OTI fields', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionDescriptions editor={result.current} permissions={bothLayers} />);
    expect(screen.queryByText('Accroche OTI')).not.toBeInTheDocument();
    expect(screen.queryByText('Descriptif OTI')).not.toBeInTheDocument();
  });

  it('hides the org scope tab without enrichment rights', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules()));
    render(<SectionDescriptions editor={result.current} permissions={canonicalOnly} />);
    expect(screen.queryByText(/Mon organisation/)).not.toBeInTheDocument();
  });

  it('shows the org scope tab and edits the overlay when enrichment is allowed', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modules(scope())));
    render(<SectionDescriptions editor={result.current} permissions={bothLayers} />);
    fireEvent.click(screen.getByText(/Mon organisation/));
    const accroche = screen.getByLabelText('Accroche') as HTMLTextAreaElement;
    fireEvent.change(accroche, { target: { value: 'Accroche OTI propre' } });
    expect(result.current.draft.descriptions.orgOverlay?.chapo.baseValue).toBe('Accroche OTI propre');
    expect(result.current.draft.descriptions.object.chapo.baseValue).toBe('');
  });
});
```

> Note: `getByLabelText('Accroche')` requires `Field` to associate its label with the control. If `Field` does not render a `<label htmlFor>`, target the field via `screen.getByRole('textbox', { name: 'Accroche' })` or add a `data-testid`; confirm against `primitives/Field.tsx` during implementation and adjust the selector to match the existing pattern.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/features/object-editor/sections/SectionDescriptions.test.tsx`
Expected: FAIL — OTI text still present; no `Mon organisation` tab; overlay not edited.

- [ ] **Step 3: Rewrite the section**

Replace `SectionDescriptions.tsx` with:

```tsx
import { useState } from 'react';
import { Fs, Field, Textarea, LangTabs, ScopeTabs } from '../primitives';
import type { SectionProps } from './section-types';
import { useSessionStore } from '../../../store/session-store';
import type { ObjectWorkspaceDescriptionScope } from '../../../services/object-workspace-parser';
import { readTranslatableField, updateTranslatableField } from './descriptions-field';

const LANG_LABELS: Record<string, string> = {
  fr: 'Français', en: 'English', cre: 'Créole', de: 'Deutsch', es: 'Español',
};

const EMPTY_FIELD = { baseValue: '', values: {} as Record<string, string> };
const emptyOverlay = (): ObjectWorkspaceDescriptionScope => ({
  recordId: null, scope: 'object', placeId: null, label: 'Mon organisation', visibility: 'public',
  description: { ...EMPTY_FIELD }, chapo: { ...EMPTY_FIELD }, adaptedDescription: { ...EMPTY_FIELD },
  mobileDescription: { ...EMPTY_FIELD }, editorialDescription: { ...EMPTY_FIELD },
});

/** Section 04 — multilingual descriptions, canonical + per-organisation overlay. */
export function SectionDescriptions({ editor, permissions, folded }: SectionProps) {
  const descriptions = editor.draft.descriptions;
  const active = descriptions.activeLanguage;
  const canEditOrg = permissions.descriptions?.canEditOrgEnrichment ?? false;
  const canEditCanonical = permissions.descriptions?.canEditCanonical ?? false;
  const orgName = useSessionStore((s) => s.orgName);

  // Scope is local UI navigation (must not mark the module dirty). Default to the
  // org layer for contributors who cannot edit canonical.
  const [scope, setScope] = useState<'canonical' | 'org'>(
    canEditOrg && !canEditCanonical ? 'org' : 'canonical',
  );
  const onOrg = scope === 'org';
  const activeScopeData: ObjectWorkspaceDescriptionScope = onOrg
    ? descriptions.orgOverlay ?? emptyOverlay()
    : descriptions.object;

  function setLanguage(code: string) {
    editor.replaceModule('descriptions', { ...descriptions, activeLanguage: code });
  }

  function patchField(field: 'chapo' | 'description' | 'adaptedDescription', value: string) {
    const updated = updateTranslatableField(activeScopeData[field], active, descriptions.localLanguage, value);
    const nextScope = { ...activeScopeData, [field]: updated };
    editor.replaceModule('descriptions', onOrg
      ? { ...descriptions, orgOverlay: nextScope }
      : { ...descriptions, object: nextScope });
  }

  const tabs = descriptions.availableLanguages.map((code) => ({
    code,
    label: LANG_LABELS[code] ?? code,
    filled: Boolean(
      readTranslatableField(activeScopeData.description, code, descriptions.localLanguage).trim()
      || readTranslatableField(activeScopeData.chapo, code, descriptions.localLanguage).trim(),
    ),
  }));

  const scopeTabs = [
    { code: 'canonical', label: 'Canonique' },
    ...(canEditOrg ? [{ code: 'org', label: `Mon organisation${orgName ? ` · ${orgName}` : ''}` }] : []),
  ];

  // In org scope, show the canonical value as a greyed fallback hint when empty.
  const fallback = (field: 'chapo' | 'description' | 'adaptedDescription') =>
    onOrg ? readTranslatableField(descriptions.object[field], active, descriptions.localLanguage) : '';
  const hint = (base: string, field: 'chapo' | 'description' | 'adaptedDescription') => {
    const fb = fallback(field);
    return onOrg && fb ? `Hérité du canonique : « ${fb.slice(0, 80)} » — saisir pour personnaliser` : base;
  };

  const readOnly = onOrg ? !canEditOrg : !canEditCanonical;
  const missingScope = onOrg ? 'overlay ORG' : 'canonique';

  return (
    <Fs
      num="04"
      title="Descriptions"
      sub="Accroche, descriptif, plan d'accès — par langue et par organisation"
      folded={folded}
      pill={{ tone: 'ok', label: onOrg ? 'Mon organisation' : 'Canonique' }}
    >
      {scopeTabs.length > 1 && <ScopeTabs tabs={scopeTabs} active={scope} onSelect={(c) => setScope(c as 'canonical' | 'org')} />}
      {tabs.length > 0 && <LangTabs tabs={tabs} active={active} onSelect={setLanguage} />}

      <Field label="Accroche" hint={hint('≤ 160 caractères — apparaît sous le titre dans l\'Explorer', 'chapo')}>
        <Textarea
          value={readTranslatableField(activeScopeData.chapo, active, descriptions.localLanguage)}
          onChange={(v) => patchField('chapo', v)}
          placeholder={fallback('chapo')}
          disabled={readOnly}
          count max={160} rows={2}
        />
      </Field>

      <Field label="Descriptif" required={!onOrg} hint={hint('Texte principal de la fiche détail', 'description')}>
        <Textarea
          value={readTranslatableField(activeScopeData.description, active, descriptions.localLanguage)}
          onChange={(v) => patchField('description', v)}
          placeholder={fallback('description')}
          disabled={readOnly}
          rich count max={2000}
        />
      </Field>

      <Field label="Descriptif du plan d'accès" hint={hint('Itinéraire textuel ; complète les coordonnées GPS', 'adaptedDescription')}>
        <Textarea
          value={readTranslatableField(activeScopeData.adaptedDescription, active, descriptions.localLanguage)}
          onChange={(v) => patchField('adaptedDescription', v)}
          placeholder={fallback('adaptedDescription')}
          disabled={readOnly}
          rows={4}
        />
      </Field>

      {readOnly && (
        <p className="muted" style={{ marginTop: 8 }}>
          Lecture seule : vos droits ne permettent pas d'éditer la couche {missingScope}.
        </p>
      )}
    </Fs>
  );
}
```

> Implementation checks during this step:
> - Confirm `Textarea` (primitives/Textarea.tsx) accepts `placeholder` and `disabled`. If not, add those passthrough props to `Textarea` (and a matching `:disabled`/placeholder style) — keep it minimal.
> - Confirm `Field` renders `required` and `hint`; it already does (used across sections).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/features/object-editor/sections/SectionDescriptions.test.tsx`
Expected: PASS (adjust the field selector per the Step 1 note if `getByLabelText` does not resolve).

- [ ] **Step 5: Typecheck + full section suite**

Run: `npm run typecheck`.
Run: `npm run test:run -- src/features/object-editor` (no regressions in the editor suite).

- [ ] **Step 6: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/sections/SectionDescriptions.tsx bertel-tourism-ui/src/features/object-editor/sections/SectionDescriptions.test.tsx
git commit -m "feat(editor): scope switch for canonical vs org-specific descriptions in §04"
```

---

## Task 10: Documentation & decision log

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Log decisions in `lot1_mapping_decisions.md`**

Add a dated section capturing: the overlay+fallback model; that `object_description.org_object_id` already supported it (no new table); the fields (chapo/description/adapted); the W2 RPC `rpc_write_org_description` as the sole org-row writer; the empty-overlay-deletes rule; the two editor-only read keys; the active-org session addition; and that the "OTI" boxes were removed and `description_edition` freed. Note the deferred "Phase 6 — ORG enrichment RPC" item is delivered for descriptions.

- [ ] **Step 2: Propose the CLAUDE.md invariant**

Under "Business invariants", add a "Descriptions — per-organisation enrichment" invariant:

> Per-organisation description enrichment is stored as `object_description` rows scoped by `org_object_id` (canonical = `NULL`; one row per org via `uq_object_description_per_org`). Reads apply overlay → canonical fallback; an empty overlay field falls back to canonical. The **only** writer of org-scoped rows is `api.rpc_write_org_description`, gated by `edit_org_enrichment` + `api.user_can_write_enrichment`; it server-derives `org_object_id` from `api.current_user_org_id()` (the client cannot choose the org). The editor reads both layers via the `canonical_description` / `org_description` keys of `api.get_object_resource`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md "bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md"
git commit -m "docs: log per-org description enrichment decisions and invariant"
```

---

## Final verification

- [ ] `cd bertel-tourism-ui && npm run test:run` — full suite green.
- [ ] `npm run typecheck` — clean.
- [ ] Manual smoke (real app, `npm run dev`): as an enrichment-capable user, open an object editor §04 → the `Mon organisation · <name>` tab appears; switch to it; empty fields show the canonical text greyed; type an overlay; save; reload → overlay persists; clear all overlay fields; save; reload → falls back to canonical and the org row is gone. As a canonical-only super-admin, the `Mon organisation` tab still appears (direct-write bypass) and the canonical tab edits as before. The "Accroche OTI"/"Descriptif OTI" boxes are gone.
```
