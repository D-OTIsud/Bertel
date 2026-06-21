# §06 Restaurant — Phase 1 : Cuisine niveau-objet (#3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, controller applies SQL live via Supabase MCP and commits own hunks). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Faire de « cuisines proposées » un attribut niveau-objet (`object_cuisine_type`), découplé des menus, pour supprimer le write-trap et permettre la saisie sans menu.

**Architecture:** Nouvelle table descriptor-link `object_cuisine_type(object_id, cuisine_type_id, position)` (forme `object_amenity`), RLS §38 + per-command. `get_object_resource.cuisine_types`/FMA/search repointés dessus. Nouveau module éditeur `cuisine` (loader/saver directs PostgREST) câblé dans la draft + le dispatch de save. Catalogue `cuisine_type` corrigé (Française) + élargi.

**Tech Stack:** PostgreSQL/Supabase (RLS, SECURITY DEFINER RPC), Next.js/React/TS, Jest, pgTAP-style SQL asserts.

## Global Constraints

- `object.id` est **TEXT** → `object_cuisine_type.object_id TEXT`.
- RLS lecture = forme split §38 (jamais `USING(true)`) ; écriture = per-command `canonical_ins/upd/del` (jamais FOR ALL) ; colonnes externes **qualifiées** dans les sous-requêtes de policy.
- Tout SQL appliqué **live via MCP** PUIS foldé dans `schema_unified.sql` / `rls_policies.sql` / `api_views_functions.sql` / `seeds_data.sql` + ajouté au manifeste `docs/SQL_ROLLOUT_RUNBOOK.md` (step `14t`).
- Commits directs sur `master`, **uniquement mes hunks** (le PO édite des fichiers partagés en parallèle) ; pas d'amend ; pas de co-author.
- Pas de mock : vérifier contre la base live.

---

### Task 1: Table `object_cuisine_type` + RLS + grants (SQL, live + fold)

**Files:**
- Create: `Base de donnée DLL et API/migration_object_cuisine_type.sql`
- Modify (fold): `Base de donnée DLL et API/schema_unified.sql` (table+index), `Base de donnée DLL et API/rls_policies.sql` (RLS+grants)
- Create test: `Base de donnée DLL et API/tests/test_object_cuisine_type.sql`
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (manifest step 14t + incremental)

**Interfaces:**
- Produces: table `object_cuisine_type(object_id TEXT, cuisine_type_id UUID, position INT, PK(object_id,cuisine_type_id))`; policies `read_object_cuisine_type`, `canonical_ins/upd/del_object_cuisine_type`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- migration_object_cuisine_type.sql — §06 P1: cuisine niveau-objet (manifest 14t)
CREATE TABLE IF NOT EXISTS object_cuisine_type (
  object_id       TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  cuisine_type_id UUID NOT NULL REFERENCES ref_code_cuisine_type(id) ON DELETE CASCADE,
  position        INT  NOT NULL DEFAULT 1,
  PRIMARY KEY (object_id, cuisine_type_id)
);
CREATE INDEX IF NOT EXISTS idx_object_cuisine_type_object ON object_cuisine_type(object_id);
CREATE INDEX IF NOT EXISTS idx_object_cuisine_type_type   ON object_cuisine_type(cuisine_type_id);

ALTER TABLE object_cuisine_type ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS read_object_cuisine_type ON object_cuisine_type;
CREATE POLICY read_object_cuisine_type ON object_cuisine_type FOR SELECT USING (
  (EXISTS (SELECT 1 FROM object o WHERE o.id = object_cuisine_type.object_id AND o.status = 'published'))
  OR object_cuisine_type.object_id IN (SELECT api.current_user_extended_object_ids())
);

DROP POLICY IF EXISTS canonical_ins_object_cuisine_type ON object_cuisine_type;
CREATE POLICY canonical_ins_object_cuisine_type ON object_cuisine_type FOR INSERT
  WITH CHECK (api.user_can_write_object_canonical(object_cuisine_type.object_id));
DROP POLICY IF EXISTS canonical_upd_object_cuisine_type ON object_cuisine_type;
CREATE POLICY canonical_upd_object_cuisine_type ON object_cuisine_type FOR UPDATE
  USING (api.user_can_write_object_canonical(object_cuisine_type.object_id))
  WITH CHECK (api.user_can_write_object_canonical(object_cuisine_type.object_id));
DROP POLICY IF EXISTS canonical_del_object_cuisine_type ON object_cuisine_type;
CREATE POLICY canonical_del_object_cuisine_type ON object_cuisine_type FOR DELETE
  USING (api.user_can_write_object_canonical(object_cuisine_type.object_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON object_cuisine_type TO authenticated, service_role;
GRANT SELECT ON object_cuisine_type TO anon;
```

- [ ] **Step 2: Apply live via MCP** (`apply_migration` name `object_cuisine_type_p1`). Expected: success, no error.

- [ ] **Step 3: Behavioral test live** — insert a row on a draft RES as service_role, confirm anon cannot SELECT it (published gate), org-member can; then rollback the probe row. Run `test_object_cuisine_type.sql` asserts (RAISE EXCEPTION on mismatch).

- [ ] **Step 4: Fold** table+indexes into `schema_unified.sql` (near `object_menu_item_cuisine_type`, ~line 5402), RLS+grants into `rls_policies.sql` (near `object_amenity`). Add manifest step `14t` to the runbook.

- [ ] **Step 5: Commit** `git add` the new migration + test + folded files (my hunks only) + runbook → `feat(res): object_cuisine_type table + RLS (§06 P1, manifest 14t)`.

---

### Task 2: Repoint `get_object_resource` + FMA + search to `object_cuisine_type` (SQL, live + fold)

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (`get_object_resource` RES block ~4257-4274, FMA ~4310-4333, `search_restaurants_by_cuisine` ~6006, `search_events_by_restaurant_cuisine` ~6119)

**Interfaces:**
- Consumes: `object_cuisine_type` (Task 1).
- Produces: `get_object_resource(RES).cuisine_types` sourced from `object_cuisine_type`.

- [ ] **Step 1: Edit the RES object-level `cuisine_types` block** to read object-level:

```sql
'cuisine_types', COALESCE((
  SELECT jsonb_agg(jsonb_build_object('id', ct.id, 'code', ct.code, 'name', ct.name,
                                      'description', ct.description, 'position', ct.position)
                   ORDER BY oct.position, ct.position, ct.name)
  FROM object_cuisine_type oct
  JOIN ref_code_cuisine_type ct ON ct.id = oct.cuisine_type_id
  WHERE oct.object_id = obj.id
), '[]'::jsonb),
```

- [ ] **Step 2: Edit FMA `associated_restaurants_cuisine_types`** to join partner restaurants' `object_cuisine_type` instead of their menu items (keep the `partner_of` relation filter).

- [ ] **Step 3: Edit `search_restaurants_by_cuisine` / `search_events_by_restaurant_cuisine`** to join `object → object_cuisine_type → ref_code_cuisine_type` (drop the `object_menu → object_menu_item → object_menu_item_cuisine_type` chain). Remove `cuisine_counts` (no per-dish count at object level) — verify no front caller depends on it (grep `cuisine_counts` / `search_restaurants_by_cuisine` in `bertel-tourism-ui/src`).

- [ ] **Step 4: Apply each `CREATE OR REPLACE FUNCTION` live via MCP**; `NOTIFY pgrst, 'reload schema'`. Behavioral test: seed 2 cuisine rows on a published RES, call `api.get_object_resource(<res>)`, assert `cuisine_types` has 2 ordered entries; call `search_restaurants_by_cuisine(ARRAY['creole'])`, assert the RES appears. Rollback probe rows.

- [ ] **Step 5: Fold** the edits into `api_views_functions.sql` (edit in place — it IS the source).

- [ ] **Step 6: Commit** `feat(res): get_object_resource/search cuisine_types lus depuis object_cuisine_type (§06 P1)`.

---

### Task 3: Catalogue `cuisine_type` — « Française » + 14 codes (SQL, live + fold)

**Files:**
- Modify: `Base de donnée DLL et API/seeds_data.sql` (~line 427-457)

- [ ] **Step 1: Live update + inserts via MCP:**

```sql
UPDATE ref_code SET name='Française', description='Cuisine française (hexagone)'
WHERE domain='cuisine_type' AND code='metropolitan';

INSERT INTO ref_code (domain, code, name, description) VALUES
('cuisine_type','mauricienne','Mauricienne','Cuisine mauricienne'),
('cuisine_type','malgache','Malgache','Cuisine malgache (Madagascar)'),
('cuisine_type','seychelloise','Seychelloise','Cuisine des Seychelles'),
('cuisine_type','sino_reunionnaise','Sino-réunionnaise','Cuisine chinoise réunionnaise (métisse)'),
('cuisine_type','creperie','Crêperie','Crêpes et galettes'),
('cuisine_type','pizzeria','Pizzeria','Pizzas'),
('cuisine_type','savoyarde','Savoyarde','Cuisine savoyarde et montagnarde'),
('cuisine_type','grecque','Grecque','Cuisine grecque'),
('cuisine_type','vietnamienne','Vietnamienne','Cuisine vietnamienne'),
('cuisine_type','coreenne','Coréenne','Cuisine coréenne'),
('cuisine_type','mexicaine','Mexicaine','Cuisine mexicaine et Tex-Mex'),
('cuisine_type','healthy','Healthy / Poké','Cuisine healthy, bowls et poké'),
('cuisine_type','bar_a_vin','Bar à vin & tapas','Bar à vin, planches et tapas'),
('cuisine_type','cafe','Café & brunch','Café, brunch et petite restauration')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Verify live** `SELECT code,name FROM ref_code WHERE domain='cuisine_type' ORDER BY name;` — 43 rows, `metropolitan→Française`.

- [ ] **Step 3: Fold** the rename + inserts into `seeds_data.sql` (idempotent; the block is `ON CONFLICT DO NOTHING` — the rename needs an explicit UPDATE or change the seed line `metropolitan` name to 'Française').

- [ ] **Step 4: Commit** `feat(ref): cuisine_type « Française » + 14 nouveaux types (§06 P1)`.

---

### Task 4: Parser — `ObjectWorkspaceCuisineModule` + draft wiring

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace-parser.ts` (add interface; add `cuisine` to `ObjectWorkspaceModules` ~line 1051; build it in the top-level parse ~line 3261)
- Test: `bertel-tourism-ui/src/services/object-workspace-parser.test.ts`

**Interfaces:**
- Produces: `interface ObjectWorkspaceCuisineModule { codes: string[]; options: WorkspaceReferenceOption[]; unavailableReason: string | null }`; `parseWorkspaceCuisineModule(raw)`.

- [ ] **Step 1: Failing test** — `parseWorkspaceCuisineModule({ cuisine_types: [{code:'creole',name:'Créole',position:1}] })` returns `{ codes:['creole'], options:[{code:'creole',...}], unavailableReason:null }`.
- [ ] **Step 2: Run** `pnpm --dir bertel-tourism-ui test object-workspace-parser` → FAIL (function undefined).
- [ ] **Step 3: Implement** the interface + `parseWorkspaceCuisineModule` (codes from `raw.cuisine_types[].code` ordered as given; options = `dedupeReferenceOptions(rows.map(readNamedReference))`), add `cuisine: parseWorkspaceCuisineModule(raw)` to the modules object, add `cuisine` to `ObjectWorkspaceModules`.
- [ ] **Step 4: Run** → PASS. `pnpm --dir bertel-tourism-ui tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(res): module parser cuisine (§06 P1)`.

---

### Task 5: Loader + saver `cuisine` + module id + save dispatch

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace.ts` (`WorkspaceModuleId` add `'cuisine'`; `loadObjectWorkspaceCuisine`; `saveObjectWorkspaceCuisine`; merge loader into the workspace load; export)
- Modify: `bertel-tourism-ui/src/hooks/useExplorerQueries.ts` (~line 289 add `if (input.moduleId === 'cuisine') return saveObjectWorkspaceCuisine(objectId, input.value);` + import)
- Test: `bertel-tourism-ui/src/services/object-workspace.cuisine.test.ts` (new)

**Interfaces:**
- Consumes: `object_cuisine_type` table, `ref_code_cuisine_type`.
- Produces: `loadObjectWorkspaceCuisine(objectId): Promise<ObjectWorkspaceCuisineModule>`; `saveObjectWorkspaceCuisine(objectId, input): Promise<void>`.

- [ ] **Step 1: Failing test** — `saveObjectWorkspaceCuisine('o1', { codes:['creole','francaise'], options:[…], unavailableReason:null })` deletes existing `object_cuisine_type` for `o1` then inserts 2 rows with `position` 1,2 resolved via `ref_code` code→id; and throws when `unavailableReason` set (degraded-load guard, mirror capacity test).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** loader (select `object_cuisine_type` ordered by position → codes via ref_code id→code; select ref_code cuisine_type → options) + saver (guard `unavailableReason`; resolve codes→ids; delete-all + insert with position=index+1); add `'cuisine'` to `WorkspaceModuleId`; merge `loadObjectWorkspaceCuisine` into the workspace assembly; wire dispatch in `useExplorerQueries.ts`.
- [ ] **Step 4: Run** → PASS; tsc clean.
- [ ] **Step 5: Commit** `feat(res): loader/saver cuisine + dispatch (§06 P1)`.

---

### Task 6: `editor-state.ts` — register `cuisine` module

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/editor-state.ts` (`MODULE_KEY_MAP` add `cuisine: 'cuisine'`; NOT in `READONLY_MODULES`)

- [ ] **Step 1: Failing test** (in `editor-completion.test.ts` or a state test): `getDirtySections` recognizes a changed `cuisine` module as dirty.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** add `cuisine: 'cuisine'` to `MODULE_KEY_MAP`.
- [ ] **Step 4: Run** → PASS; tsc clean.
- [ ] **Step 5: Commit** `feat(res): register cuisine module in editor state (§06 P1)`.

---

### Task 7: BlockRES Bloc A — cuisine field bound to `draft.cuisine`

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/blocks/BlockRES.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/blocks/BlockRES.test.tsx`

**Interfaces:**
- Consumes: `editor.draft.cuisine` (`ObjectWorkspaceCuisineModule`), `editor.replaceModule('cuisine', …)`.

- [ ] **Step 1: Failing test** — rendering BlockRES with a RES draft having no menus, selecting a cuisine chip calls `replaceModule('cuisine', { …, codes:['creole'] })` (no longer a no-op); the misleading "Identité culinaire" label no longer sits above the §07 note.
- [ ] **Step 2: Run** `pnpm --dir bertel-tourism-ui test BlockRES` → FAIL.
- [ ] **Step 3: Implement** Bloc A: `<Field label="Cuisines proposées" hint="Multi-sélection — la 1ère est la cuisine principale"><ChipMultiSelect options={editor.draft.cuisine.options} selected={editor.draft.cuisine.codes} onChange={(codes)=>editor.replaceModule('cuisine',{...editor.draft.cuisine,codes})} /></Field>`. Remove the old menus-coupled cuisine field + the misleading "Identité culinaire" label above the §07 note. Keep menus repeater as-is for now (P2 reworks it).
- [ ] **Step 4: Run** → PASS; tsc clean; `pnpm --dir bertel-tourism-ui build` exit 0.
- [ ] **Step 5: Commit** `feat(res): §06 Bloc A cuisines proposées niveau-objet, fin du write-trap (§06 P1)`.

---

### Task 8: Docs — decision log + memory

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (new § — P1 cuisine object-level), `CLAUDE.md` deferred tracker if needed, MCP/auto memory.

- [ ] **Step 1:** Append a decision-log § documenting: object_cuisine_type rationale (vs object_taxonomy), §38 RLS, repointed consumers, catalogue change, manifest 14t.
- [ ] **Step 2: Commit** `docs: décision §06 P1 cuisine niveau-objet`.

---

## Self-Review

- **Spec coverage:** Volet A (spec §3) fully covered T1-T8. Volets B/C are separate phases (own plans).
- **Placeholder scan:** none — SQL and TS shown; flagged-for-execution items (cuisine_counts caller check) are real verification steps, not placeholders.
- **Type consistency:** `ObjectWorkspaceCuisineModule { codes, options, unavailableReason }` used identically in T4/T5/T7; module id `'cuisine'` + key `'cuisine'` consistent across T5/T6.
