# Création d'ORG, onboarding & branding par ORG — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un superadmin plateforme de créer une organisation (ORG), d'inviter son premier admin dans la foulée, de cibler n'importe quelle ORG dans l'administration d'équipe, puis (lot 2) de donner à chaque ORG son propre branding (nom de marque, logo, couleurs) résolu après connexion.

**Architecture:** Lot 1 : une RPC dédiée `api.rpc_create_org` (SECURITY DEFINER, superuser-only — la voie générique `rpc_create_object` produirait un draft impubliable) crée l'objet ORG **directement `published`** + sa ligne `org_config` ; un module « Organisations » dans la console admin `/settings` liste/crée les ORG et enchaîne l'invitation du premier admin via la chaîne d'équipe existante (déjà superuser-armée) ; `/team` gagne un sélecteur d'ORG pour le superadmin. Lot 2 : une table `org_branding_settings` (champs nullables = héritage champ par champ du singleton plateforme) est résolue par `api.get_app_branding()` selon le membership — signature inchangée ⇒ zéro changement du pipeline de thème front ; écritures via RPCs DEFINER gated superuser OU admin (rang ≥ 30) de l'ORG cible ; le logo passe par la route single-writer existante étendue per-org.

**Tech Stack:** PostgreSQL (Supabase, schéma `api`), Next.js App Router, React + TypeScript, Jest, supabase-js, MCP Supabase pour l'apply live.

**Spec:** `docs/superpowers/specs/2026-07-03-org-creation-onboarding-design.md`

## Global Constraints

- **Base cloud MCP = PROD OTI** : tout SQL passe d'abord par un dry-run transactionnel (`execute_sql` : `BEGIN; <migration sans BEGIN/COMMIT>; <corps du test>; ROLLBACK;`), puis `apply_migration`, puis `get_advisors`, puis `NOTIFY pgrst, 'reload schema';`.
- **Intégrité déploiement** : chaque migration = fichier autonome dans `Base de donnée DLL et API/`, **ajouté à `ci_fresh_apply.sql`** (ordre de dépendance) **+ `docs/SQL_ROLLOUT_RUNBOOK.md`**, avec son test SQL branché en fin de manifest. Jamais de DDL live-only.
- **RLS §39/§146** : aucune policy avec `auth.*()` nu — utiliser `TO authenticated` ou la forme `(select auth.uid())` ; la garde CI `tests/test_rls_initplan_broad_sweep.sql` échoue sinon.
- **`gen_random_uuid()`** dans tout corps de fonction à `search_path` restreint (jamais `uuid_generate_v4()` ; les DEFAULT de colonnes sont OK).
- **Storage single-writer** : aucune écriture bucket depuis le client ; uniquement la route service-role autorisée AS THE CALLER.
- **Ne PAS toucher** au dialog de création B1 : ORG reste exclu (`create-object-options.test.ts` le verrouille déjà).
- **Commits** : sur `master`, par **PATHSPEC** de ses propres fichiers, stage+commit dans la MÊME invocation (session parallèle possible), messages conventionnels en français, **pas de trailer co-author, pas de push**.
- **Tests front** : `cd bertel-tourism-ui` puis `npm run test:run -- <chemin>` (Jest non-watch) ; typecheck : `npm run typecheck`.
- **UI** : français, style maison compact + modal (`Modal` de `@/components/common/Modal`, classes `primary-button`/`ghost-button`/`field-block`/`select`/`pref__hint`/`chip`), tokens de thème (jamais de couleurs en dur).
- **Rangs admin** : `org_manager` = 20, `org_admin` = 30 (vérifier le **code** exact rank 30 dans `ref_org_admin_role` avant de l'utiliser en dur côté front).

---

## LOT 1 — Onboarding ORG

### Task 1: Migration SQL `migration_org_onboarding.sql` (rpc_create_org + rpc_list_orgs) + test + manifest

**Files:**
- Create: `Base de donnée DLL et API/migration_org_onboarding.sql`
- Create: `Base de donnée DLL et API/tests/test_org_onboarding.sql`
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql` (ajout `\ir` migration + test)
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (nouvelle étape)

**Interfaces:**
- Consumes: `api.is_platform_superuser()` (rls_policies.sql:1838), `org_config` (schema_unified.sql:6168), `trg_before_insert_object_generate_id` (id auto `ORGRUN…`), `trg_guard_object_status_change` = BEFORE **UPDATE** OF status (l'INSERT direct en `published` ne le déclenche pas).
- Produces: `api.rpc_create_org(p_name text, p_region_code text DEFAULT 'RUN', p_access_scope text DEFAULT 'own_objects_only') RETURNS text` (id de l'ORG) ; `api.rpc_list_orgs() RETURNS jsonb` (tableau `[{id, name, status, regionCode, accessScope, memberCount, createdAt}]`).

- [ ] **Step 1: Écrire le test SQL (échouera tant que la migration n'existe pas)**

Fixtures : plage dédiée `09xx` (08xx = CRM ; vérifier par `grep -r "0000000009" tests/` qu'elle est libre). Mécanique personas calquée sur `tests/test_crm_module.sql` (`set_config('request.jwt.claims', …)`).

```sql
-- test_org_onboarding.sql
-- Prouve migration_org_onboarding.sql :
-- A) rpc_create_org superuser : ORG créée published (published_at posé), id ORGRUN…, org_config créée.
-- B) Gardes : non-superuser FORBIDDEN ; nom vide MISSING_REQUIRED_FIELD ; doublon (casse-insensible,
--    même région) DUPLICATE_ORG ; scope invalide INVALID_ACCESS_SCOPE.
-- C) rpc_list_orgs : superuser voit la nouvelle ORG (memberCount 0) ; non-superuser FORBIDDEN.
-- Auto-contenu + transactionnel (ROLLBACK ; rien ne persiste).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_super uuid := '00000000-0000-4000-a000-000000000901';
  v_plain uuid := '00000000-0000-4000-a000-000000000902';
  v_org_id text;
  v_denied boolean := false;
  v_list jsonb;
BEGIN
  -- Personas (mêmes inserts de fixture que test_crm_module.sql : auth.users si FK requise + profil)
  INSERT INTO auth.users (id, email) VALUES
    (v_super, 'super-0901@test.local'), (v_plain, 'plain-0902@test.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_super, 'super_admin')
    ON CONFLICT (id) DO UPDATE SET role = 'super_admin';
  INSERT INTO app_user_profile (id, role) VALUES (v_plain, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = 'tourism_agent';

  -- A. Création par le superuser
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  v_org_id := api.rpc_create_org('ORG Test Onboarding 0901', 'RUN', 'all_published');
  ASSERT v_org_id LIKE 'ORGRUN%', 'id ORG inattendu: ' || v_org_id;
  ASSERT (SELECT status FROM object WHERE id = v_org_id) = 'published', 'ORG doit naître published';
  ASSERT (SELECT published_at FROM object WHERE id = v_org_id) IS NOT NULL, 'published_at doit être posé';
  ASSERT (SELECT access_scope FROM org_config WHERE org_object_id = v_org_id) = 'all_published',
         'org_config absente ou scope incorrect';

  -- B. Gardes
  BEGIN
    PERFORM api.rpc_create_org('org test onboarding 0901', 'RUN'); -- doublon casse-insensible
  EXCEPTION WHEN OTHERS THEN
    v_denied := SQLERRM LIKE 'DUPLICATE_ORG%';
  END;
  ASSERT v_denied, 'le doublon casse-insensible doit être refusé';
  v_denied := false;
  BEGIN
    PERFORM api.rpc_create_org('  ', 'RUN');
  EXCEPTION WHEN OTHERS THEN v_denied := SQLERRM LIKE 'MISSING_REQUIRED_FIELD%'; END;
  ASSERT v_denied, 'nom vide doit être refusé';
  v_denied := false;
  BEGIN
    PERFORM api.rpc_create_org('ORG Scope KO 0901', 'RUN', 'everything');
  EXCEPTION WHEN OTHERS THEN v_denied := SQLERRM LIKE 'INVALID_ACCESS_SCOPE%'; END;
  ASSERT v_denied, 'scope invalide doit être refusé';

  -- C. rpc_list_orgs superuser
  v_list := api.rpc_list_orgs();
  ASSERT v_list @> jsonb_build_array(jsonb_build_object('id', v_org_id, 'memberCount', 0)),
         'rpc_list_orgs doit contenir la nouvelle ORG avec memberCount 0';

  -- B/C. Non-superuser refusé
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_plain, 'role', 'authenticated')::text, true);
  v_denied := false;
  BEGIN
    PERFORM api.rpc_create_org('ORG Interdite 0901', 'RUN');
  EXCEPTION WHEN OTHERS THEN v_denied := SQLERRM LIKE 'FORBIDDEN%'; END;
  ASSERT v_denied, 'rpc_create_org doit être refusée à un non-superuser';
  v_denied := false;
  BEGIN
    PERFORM api.rpc_list_orgs();
  EXCEPTION WHEN OTHERS THEN v_denied := SQLERRM LIKE 'FORBIDDEN%'; END;
  ASSERT v_denied, 'rpc_list_orgs doit être refusée à un non-superuser';

  RAISE NOTICE 'test_org_onboarding: OK';
END $$;
ROLLBACK;
```

> Si l'INSERT `auth.users` exige d'autres colonnes NOT NULL sur cette base, reprendre exactement la fixture users de `tests/test_crm_module.sql` (source de vérité de la mécanique).

- [ ] **Step 2: Écrire la migration**

```sql
-- migration_org_onboarding.sql
-- Création d'organisation (ORG) par un superadmin plateforme — voie UNIQUE de création d'ORG.
-- Pourquoi une RPC dédiée : api.rpc_create_object force status='draft' et rpc_publish_object
-- exige une ORG *publisher* sur l'objet — une ORG n'en a pas ⇒ un draft ORG serait impubliable.
-- L'INSERT direct en 'published' est licite : trg_guard_object_status_change est
-- BEFORE UPDATE OF status (pas l'INSERT) ; published_at est posé explicitement
-- (trg_manage_object_published_at ne gère que le PASSAGE à published).
-- Une ORG naît publiée : la lisibilité RLS pour ses membres (memberships, /team, branding)
-- en dépend, et l'Explorer exclut le type ORG de toute façon.
-- Apply order: après rls_policies.sql (dépend de api.is_platform_superuser) — voir runbook.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION api.rpc_create_org(
  p_name         text,
  p_region_code  text DEFAULT 'RUN',
  p_access_scope text DEFAULT 'own_objects_only'
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_name      text := trim(coalesce(p_name, ''));
  v_new_id    text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_CONTEXT: rpc_create_org requiert un utilisateur authentifié (auth.uid() est NULL)';
  END IF;
  IF NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'FORBIDDEN: la création d''organisation est réservée au superadmin plateforme';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_FIELD: le nom de l''organisation est obligatoire';
  END IF;
  IF p_access_scope NOT IN ('own_objects_only', 'all_published') THEN
    RAISE EXCEPTION 'INVALID_ACCESS_SCOPE: % (attendu: own_objects_only | all_published)', p_access_scope;
  END IF;
  IF EXISTS (
    SELECT 1 FROM object o
    WHERE o.object_type = 'ORG'
      AND lower(o.name) = lower(v_name)
      AND o.region_code IS NOT DISTINCT FROM p_region_code
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_ORG: une organisation « % » existe déjà pour la région %', v_name, p_region_code;
  END IF;

  -- id NULL → généré par trg_before_insert_object_generate_id (ORGRUN…).
  INSERT INTO object (object_type, name, region_code, status, published_at,
                      created_by, updated_by, created_at, updated_at)
  VALUES ('ORG', v_name, p_region_code, 'published', NOW(),
          v_caller_id, v_caller_id, NOW(), NOW())
  RETURNING id INTO v_new_id;

  INSERT INTO org_config (org_object_id, access_scope)
  VALUES (v_new_id, p_access_scope);

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION api.rpc_create_org(text, text, text) IS
'Crée une organisation (objet ORG published + org_config). Superadmin plateforme uniquement — voie unique de création d''ORG.';

REVOKE EXECUTE ON FUNCTION api.rpc_create_org(text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_create_org(text, text, text) TO authenticated, service_role;

-- Liste des ORG pour la console admin + le sélecteur /team du superadmin.
CREATE OR REPLACE FUNCTION api.rpc_list_orgs()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'FORBIDDEN: la liste des organisations est réservée au superadmin plateforme';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id',          o.id,
           'name',        o.name,
           'status',      o.status::text,
           'regionCode',  o.region_code,
           'accessScope', oc.access_scope,
           'memberCount', COALESCE(m.cnt, 0),
           'createdAt',   o.created_at
         ) ORDER BY o.created_at), '[]'::jsonb)
    INTO v_out
    FROM object o
    LEFT JOIN org_config oc ON oc.org_object_id = o.id
    LEFT JOIN (
      SELECT uom.org_object_id, count(*) AS cnt
      FROM user_org_membership uom
      WHERE uom.is_active
      GROUP BY uom.org_object_id
    ) m ON m.org_object_id = o.id
   WHERE o.object_type = 'ORG';
  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION api.rpc_list_orgs() IS
'Liste des organisations (ORG) avec périmètre d''accès et effectif actif. Superadmin plateforme uniquement.';

REVOKE EXECUTE ON FUNCTION api.rpc_list_orgs() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_list_orgs() TO authenticated, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Brancher le manifest + runbook**

Dans `ci_fresh_apply.sql` : ajouter `\ir migration_org_onboarding.sql` **après** le dernier step de migration existant (numérotation continue, échо `\echo` au format des voisins), et `\ir tests/test_org_onboarding.sql` dans le bloc tests de fin. Dans `docs/SQL_ROLLOUT_RUNBOOK.md` : nouvelle ligne au même rang d'ordre, avec la mention « dépend de rls_policies.sql (is_platform_superuser) + schema_unified.sql (org_config) ».

- [ ] **Step 4: Dry-run transactionnel sur la base MCP**

Via MCP `execute_sql` : `BEGIN;` + corps de la migration (sans son BEGIN/COMMIT/NOTIFY) + corps du DO-block du test (sans BEGIN/ROLLBACK externes) + `ROLLBACK;`.
Expected: NOTICE `test_org_onboarding: OK`, aucun ERROR, et rien de persisté (`SELECT count(*) FROM object WHERE name LIKE 'ORG Test Onboarding%'` → 0 après rollback).

- [ ] **Step 5: Commit**

```bash
git add "Base de donnée DLL et API/migration_org_onboarding.sql" "Base de donnée DLL et API/tests/test_org_onboarding.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md && git commit -m "feat(org): rpc_create_org + rpc_list_orgs — création d'ORG superadmin-only (published direct + org_config), liste avec effectifs ; test comportemental + manifest/runbook"
```

---

### Task 2: Apply live + advisors

**Files:** aucun (opérations MCP).

- [ ] **Step 1: Appliquer la migration** — MCP `apply_migration` (name: `org_onboarding_rpcs`) avec le contenu du fichier (sans `\set`, BEGIN/COMMIT inclus acceptés par apply_migration ; sinon retirer BEGIN/COMMIT — apply_migration est déjà transactionnel).
- [ ] **Step 2: Re-jouer le test sur live** — MCP `execute_sql` avec le contenu de `tests/test_org_onboarding.sql` (transactionnel, ROLLBACK inclus). Expected: NOTICE OK.
- [ ] **Step 3: Advisors** — MCP `get_advisors` (security). Expected : seuls les flags 0028/0029 SECURITY DEFINER attendus sur les 2 RPCs (classe documentée §36) ; aucun autre nouveau flag.
- [ ] **Step 4: NOTIFY** — `NOTIFY pgrst, 'reload schema';` via `execute_sql` (si retiré de l'apply).

---

### Task 3: Service frontend `orgs.ts`

**Files:**
- Create: `bertel-tourism-ui/src/services/orgs.ts`
- Test: `bertel-tourism-ui/src/services/orgs.test.ts`

**Interfaces:**
- Consumes: `getApiClient` de `../lib/supabase` ; RPCs Task 1.
- Produces: `listOrgs(): Promise<OrgSummary[]>` ; `createOrg(input: CreateOrgInput): Promise<string>` ; `friendlyOrgError(err): string` ; types `OrgSummary { id; name; status; regionCode; accessScope; memberCount; createdAt }`, `CreateOrgInput { name; regionCode?; accessScope? }`.

- [ ] **Step 1: Écrire le test (échoue — module absent)**

```ts
// orgs.test.ts — modèle : src/services/rpc.create-object.test.ts (mock du client api)
import { listOrgs, createOrg, friendlyOrgError } from './orgs';
import { getApiClient } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));

function mockRpc(result: { data?: unknown; error?: unknown }) {
  const rpc = jest.fn().mockResolvedValue(result);
  (getApiClient as jest.Mock).mockReturnValue({ schema: () => ({ rpc }) });
  return rpc;
}

test('listOrgs mappe le payload jsonb en OrgSummary[]', async () => {
  mockRpc({ data: [{ id: 'ORGRUN1', name: 'OTI Test', status: 'published', regionCode: 'RUN', accessScope: 'own_objects_only', memberCount: 3, createdAt: '2026-07-03' }], error: null });
  const rows = await listOrgs();
  expect(rows).toEqual([{ id: 'ORGRUN1', name: 'OTI Test', status: 'published', regionCode: 'RUN', accessScope: 'own_objects_only', memberCount: 3, createdAt: '2026-07-03' }]);
});

test('createOrg appelle rpc_create_org avec les défauts et renvoie l’id', async () => {
  const rpc = mockRpc({ data: 'ORGRUN2', error: null });
  await expect(createOrg({ name: 'Nouvelle OTI' })).resolves.toBe('ORGRUN2');
  expect(rpc).toHaveBeenCalledWith('rpc_create_org', { p_name: 'Nouvelle OTI', p_region_code: 'RUN', p_access_scope: 'own_objects_only' });
});

test('friendlyOrgError traduit DUPLICATE_ORG', () => {
  expect(friendlyOrgError({ message: 'DUPLICATE_ORG: une organisation…' })).toMatch(/existe déjà/);
});
```

- [ ] **Step 2: Vérifier l'échec** — `npm run test:run -- src/services/orgs.test.ts` → FAIL (module introuvable).
- [ ] **Step 3: Implémenter**

```ts
// orgs.ts — administration des organisations (superadmin). Lecture/création via RPCs DEFINER
// superuser-only (rpc_list_orgs / rpc_create_org) — jamais de SELECT direct sur object ici.
import { getApiClient } from '../lib/supabase';

export interface OrgSummary {
  id: string;
  name: string;
  status: string;
  regionCode: string | null;
  accessScope: string | null;
  memberCount: number;
  createdAt: string | null;
}
export interface CreateOrgInput {
  name: string;
  regionCode?: string;
  accessScope?: 'own_objects_only' | 'all_published';
}

function requireClient() {
  const c = getApiClient();
  if (!c) throw new Error('Supabase non configuré.');
  return c;
}

export async function listOrgs(): Promise<OrgSummary[]> {
  const { data, error } = await requireClient().schema('api').rpc('rpc_list_orgs');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    name: String(r.name),
    status: String(r.status ?? ''),
    regionCode: (r.regionCode as string) ?? null,
    accessScope: (r.accessScope as string) ?? null,
    memberCount: typeof r.memberCount === 'number' ? r.memberCount : 0,
    createdAt: (r.createdAt as string) ?? null,
  }));
}

export async function createOrg(input: CreateOrgInput): Promise<string> {
  const { data, error } = await requireClient().schema('api').rpc('rpc_create_org', {
    p_name: input.name,
    p_region_code: input.regionCode ?? 'RUN',
    p_access_scope: input.accessScope ?? 'own_objects_only',
  });
  if (error) throw error;
  return data as string;
}

const FRIENDLY: Array<[string, string]> = [
  ['DUPLICATE_ORG', 'Une organisation de ce nom existe déjà pour cette région.'],
  ['MISSING_REQUIRED_FIELD', 'Le nom de l’organisation est obligatoire.'],
  ['INVALID_ACCESS_SCOPE', 'Périmètre d’accès invalide.'],
  ['FORBIDDEN', 'Action réservée au superadmin plateforme.'],
];
export function friendlyOrgError(err: { message?: string } | null | undefined): string {
  const msg = err?.message ?? '';
  for (const [code, friendly] of FRIENDLY) if (msg.includes(code)) return friendly;
  return msg || 'Action impossible.';
}
```

- [ ] **Step 4: Vérifier** — `npm run test:run -- src/services/orgs.test.ts` → PASS ; `npm run typecheck` → 0 erreur.
- [ ] **Step 5: Commit**

```bash
cd bertel-tourism-ui && git add src/services/orgs.ts src/services/orgs.test.ts && git commit -m "feat(org): service orgs — listOrgs/createOrg sur les RPCs superadmin + erreurs conviviales ; 3 tests"
```

---

### Task 4: Module « Organisations » dans /settings (nav + panneau liste)

**Files:**
- Modify: `bertel-tourism-ui/src/views/settings-nav.ts` (PLATFORM_GROUP)
- Modify: `bertel-tourism-ui/src/views/settings-nav.test.ts`
- Create: `bertel-tourism-ui/src/features/orgs/OrgsPanel.tsx`
- Modify: `bertel-tourism-ui/src/views/SettingsPage.tsx` (wiring du panneau)
- Test: `bertel-tourism-ui/src/features/orgs/OrgsPanel.test.tsx`

**Interfaces:**
- Consumes: `listOrgs`/`OrgSummary` (Task 3) ; `CreateOrgDialog` (Task 5 — dans CE task, poser un bouton désactivé avec le libellé final, remplacé au Task 5).
- Produces: section nav `id: 'organisations'` (groupe Plateforme) ; composant `OrgsPanel` (props: aucune) ; navigation équipe = `/settings?section=team&org={id}`.

- [ ] **Step 1: Test nav (échoue)** — dans `settings-nav.test.ts`, ajouter :

```ts
test('la section organisations est exposée aux super-admins uniquement', () => {
  expect(settingsSectionIds('super_admin')).toContain('organisations');
  expect(settingsSectionIds('tourism_agent', { canManageTeam: true })).not.toContain('organisations');
});
```

- [ ] **Step 2: Vérifier l'échec** — `npm run test:run -- src/views/settings-nav.test.ts` → FAIL.
- [ ] **Step 3: settings-nav.ts** — importer `Building2` de lucide-react ; dans `PLATFORM_GROUP.sections`, insérer avant `diagnostic` :

```ts
{ id: 'organisations', label: 'Organisations', icon: Building2, isNew: true },
```

- [ ] **Step 4: OrgsPanel**

```tsx
'use client';
// Console admin — liste des organisations (superadmin). Création via CreateOrgDialog (Task 5).
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listOrgs, type OrgSummary } from '@/services/orgs';

const SCOPE_LABEL: Record<string, string> = {
  own_objects_only: 'Ses fiches uniquement',
  all_published: 'Tout le publié',
};

export function OrgsPanel() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setOrgs(await listOrgs()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur de chargement'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  return (
    <section className="card">
      <header className="card__header">
        <div>
          <h2>Organisations</h2>
          <p className="pref__hint">Structures institutionnelles porteuses des fiches (ORG). La création est réservée au superadmin plateforme.</p>
        </div>
        {/* Remplacé par <CreateOrgDialog onDone={reload} /> au Task 5 */}
        <button type="button" className="primary-button" disabled title="Bientôt disponible">Nouvelle organisation</button>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <p className="pref__hint">Chargement…</p> : (
        <table className="members-table">
          <thead>
            <tr><th>Nom</th><th>Statut</th><th>Périmètre d’accès</th><th>Membres</th><th>Créée le</th><th aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id}>
                <td>{o.name}</td>
                <td><span className="chip">{o.status}</span></td>
                <td>{SCOPE_LABEL[o.accessScope ?? ''] ?? '—'}</td>
                <td>{o.memberCount}</td>
                <td>{o.createdAt ? new Date(o.createdAt).toLocaleDateString('fr-FR') : '—'}</td>
                <td>
                  <button type="button" className="ghost-button" onClick={() => router.push(`/settings?section=team&org=${encodeURIComponent(o.id)}`)}>
                    Gérer l’équipe
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

> Classes tableau : aligner sur celles réellement utilisées par `features/team/MembersTable.tsx` (source de vérité du style tableau maison) — remplacer `members-table`/`card__header`/`form-error` par les classes existantes constatées.

- [ ] **Step 5: Wiring SettingsPage** — dans `SettingsPage.tsx`, ajouter après le bloc `partner-keys` :

```tsx
{activeSection === 'organisations' && role === 'super_admin' && <OrgsPanel />}
```

(+ import `OrgsPanel`).

- [ ] **Step 6: Test panneau** — `OrgsPanel.test.tsx` : mock `@/services/orgs` (`listOrgs` → 2 ORG) + mock `next/navigation` ; assertions : les 2 noms rendus, le libellé de scope traduit, clic « Gérer l’équipe » → `router.push` avec `?section=team&org=`.
- [ ] **Step 7: Vérifier** — `npm run test:run -- src/views/settings-nav.test.ts src/features/orgs/OrgsPanel.test.tsx` → PASS ; `npm run typecheck` → 0.
- [ ] **Step 8: Commit**

```bash
cd bertel-tourism-ui && git add src/views/settings-nav.ts src/views/settings-nav.test.ts src/features/orgs/OrgsPanel.tsx src/features/orgs/OrgsPanel.test.tsx src/views/SettingsPage.tsx && git commit -m "feat(org): module Organisations dans la console admin /settings — rail Plateforme + tableau des ORG (scope, effectif) + lien équipe ciblé"
```

---

### Task 5: CreateOrgDialog — création + invitation du premier admin

**Files:**
- Create: `bertel-tourism-ui/src/features/orgs/CreateOrgDialog.tsx`
- Modify: `bertel-tourism-ui/src/features/orgs/OrgsPanel.tsx` (remplacer le bouton désactivé)
- Test: `bertel-tourism-ui/src/features/orgs/CreateOrgDialog.test.tsx`

**Interfaces:**
- Consumes: `createOrg`/`friendlyOrgError` (Task 3) ; `inviteUser`, `upsertMembership`, `setAdminRole`, `grantUserPermission`, `friendlyRbacError` de `@/services/rbac` (bras superuser rang 999 déjà en place côté SQL) ; `BUSINESS_ROLE_CODES`, `businessRoleLabel`, `presetPermissionsFor` de `@/features/team/permission-presets` ; `Modal` de `@/components/common/Modal`.
- Produces: `CreateOrgDialog({ onDone }: { onDone: () => void })` — bouton « Nouvelle organisation » + modal 2 étapes.

**Vérification préalable :** confirmer le code du rôle admin rang 30 : MCP `execute_sql` → `SELECT code, rank FROM ref_org_admin_role ORDER BY rank;`. Utiliser ce code exact pour la constante `FIRST_ADMIN_ROLE_CODE` (attendu : `org_admin`).

- [ ] **Step 1: Test (échoue)** — `CreateOrgDialog.test.tsx` : mocks de `@/services/orgs` et `@/services/rbac` ; scénarios :
  1. bouton ouvre le modal ; « Créer » désactivé tant que le nom est vide ;
  2. submit étape 1 → `createOrg({name, regionCode:'RUN', accessScope})` appelé, passage à l'étape 2 ;
  3. étape 2 avec e-mail → `inviteUser` puis `upsertMembership(userId, orgId, roleCode)` puis `setAdminRole(membershipId, FIRST_ADMIN_ROLE_CODE)` appelés dans cet ordre ;
  4. « Inviter plus tard » ferme sans appel d'invitation et déclenche `onDone`.
- [ ] **Step 2: Vérifier l'échec** — `npm run test:run -- src/features/orgs/CreateOrgDialog.test.tsx` → FAIL.
- [ ] **Step 3: Implémenter**

```tsx
'use client';
// Création d'ORG (superadmin) en 2 étapes : ① identité + périmètre → rpc_create_org ;
// ② invitation optionnelle du premier admin (chaîne existante invite → membership →
// rôle admin org_admin + préréglage de permissions — RPCs déjà superuser-armées).
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/common/Modal';
import { createOrg, friendlyOrgError } from '@/services/orgs';
import { inviteUser, upsertMembership, setAdminRole, grantUserPermission, friendlyRbacError } from '@/services/rbac';
import { BUSINESS_ROLE_CODES, businessRoleLabel, presetPermissionsFor } from '@/features/team/permission-presets';

// Rôle admin remis au premier membre (rang 30 — vérifié en base : ref_org_admin_role).
const FIRST_ADMIN_ROLE_CODE = 'org_admin';

interface CreateOrgDialogProps { onDone: () => void }

export function CreateOrgDialog({ onDone }: CreateOrgDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'infos' | 'admin'>('infos');
  const [busy, setBusy] = useState(false);
  // Étape 1
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'own_objects_only' | 'all_published'>('own_objects_only');
  const [orgId, setOrgId] = useState<string | null>(null);
  // Étape 2
  const [email, setEmail] = useState('');
  const [roleCode, setRoleCode] = useState('contributor');

  function reset() { setStep('infos'); setName(''); setScope('own_objects_only'); setOrgId(null); setEmail(''); setRoleCode('contributor'); }
  function close() { reset(); setOpen(false); }

  async function submitInfos() {
    setBusy(true);
    try {
      const id = await createOrg({ name: name.trim(), regionCode: 'RUN', accessScope: scope });
      setOrgId(id);
      setStep('admin');
      toast.success(`Organisation « ${name.trim()} » créée.`);
      onDone();
    } catch (e) {
      toast.error(friendlyOrgError(e as { message?: string }));
    } finally { setBusy(false); }
  }

  async function submitAdmin() {
    if (!orgId) return;
    setBusy(true);
    try {
      const invited = await inviteUser({ email: email.trim(), orgObjectId: orgId, businessRoleCode: roleCode });
      const membershipId = await upsertMembership(invited.userId, orgId, roleCode);
      for (const code of presetPermissionsFor(roleCode)) {
        try { await grantUserPermission(invited.userId, code); } catch (e) { console.warn('preset grant failed', code, e); }
      }
      await setAdminRole(membershipId, FIRST_ADMIN_ROLE_CODE);
      toast.success(`Invitation envoyée à ${email.trim()} — premier admin de l’organisation.`);
      onDone();
      close();
    } catch (e) {
      toast.error(friendlyRbacError(e as { message?: string }));
    } finally { setBusy(false); }
  }

  const footer = step === 'infos' ? (
    <>
      <button type="button" className="ghost-button" onClick={close} disabled={busy}>Annuler</button>
      <button type="button" className="primary-button" onClick={() => { void submitInfos(); }} disabled={busy || name.trim() === ''}>
        {busy ? 'Création…' : 'Créer l’organisation'}
      </button>
    </>
  ) : (
    <>
      <button type="button" className="ghost-button" onClick={() => { onDone(); close(); }} disabled={busy}>Inviter plus tard</button>
      <button type="button" className="primary-button" onClick={() => { void submitAdmin(); }} disabled={busy || email.trim() === ''}>
        {busy ? 'Envoi…' : 'Inviter comme premier admin'}
      </button>
    </>
  );

  return (
    <>
      <button type="button" className="primary-button" onClick={() => setOpen(true)}>Nouvelle organisation</button>
      {open && (
        <Modal title={step === 'infos' ? 'Nouvelle organisation' : 'Premier administrateur'} onClose={close} footer={footer}>
          {step === 'infos' ? (
            <>
              <label className="field-block" htmlFor="org-name">
                <span>Nom de l’organisation</span>
                <input id="org-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="OTI de l’Ouest" disabled={busy} />
              </label>
              <label className="field-block" htmlFor="org-scope">
                <span>Périmètre d’accès aux fiches</span>
                <select id="org-scope" className="select" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} disabled={busy}>
                  <option value="own_objects_only">Ses fiches uniquement</option>
                  <option value="all_published">Tout le publié</option>
                </select>
                <span className="pref__hint">Région : RUN (La Réunion) — immuable une fois posée.</span>
              </label>
            </>
          ) : (
            <>
              <p className="pref__hint">L’organisation est créée. Invitez son premier administrateur : il recevra un e-mail et choisira son mot de passe, puis pourra gérer son équipe en autonomie.</p>
              <label className="field-block" htmlFor="org-admin-email">
                <span>Adresse e-mail</span>
                <input id="org-admin-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="direction@oti-ouest.re" disabled={busy} />
              </label>
              <label className="field-block" htmlFor="org-admin-role">
                <span>Rôle métier</span>
                <select id="org-admin-role" className="select" value={roleCode} onChange={(e) => setRoleCode(e.target.value)} disabled={busy}>
                  {BUSINESS_ROLE_CODES.map((code) => <option key={code} value={code}>{businessRoleLabel(code)}</option>)}
                </select>
                <span className="pref__hint">Le rôle d’administration « org_admin » (gestion d’équipe) est ajouté automatiquement.</span>
              </label>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
```

> Si la classe `input` n'existe pas, reprendre la classe des inputs texte de `InviteMemberDialog.tsx`/`SettingsPage.tsx` (constatée dans le code).

- [ ] **Step 4: Brancher dans OrgsPanel** — remplacer le bouton désactivé par `<CreateOrgDialog onDone={reload} />`.
- [ ] **Step 5: Vérifier** — `npm run test:run -- src/features/orgs` → PASS ; `npm run typecheck` → 0.
- [ ] **Step 6: Commit**

```bash
cd bertel-tourism-ui && git add src/features/orgs/CreateOrgDialog.tsx src/features/orgs/CreateOrgDialog.test.tsx src/features/orgs/OrgsPanel.tsx && git commit -m "feat(org): CreateOrgDialog 2 étapes — création (nom/périmètre) puis invitation du premier admin (invite → membership → org_admin + préréglage)"
```

---

### Task 6: /team — sélecteur d'ORG pour le superadmin (+ deep-link ?org=)

**Files:**
- Modify: `bertel-tourism-ui/src/views/TeamAdminPage.tsx` (remplacer le fallback `getDefaultOrgId`)
- Modify: `bertel-tourism-ui/src/services/rbac.ts` (supprimer `getDefaultOrgId`, devenu mort)
- Test: `bertel-tourism-ui/src/views/TeamAdminPage.orgselect.test.tsx`

**Interfaces:**
- Consumes: `listOrgs`/`OrgSummary` (Task 3) ; état session `role`/`orgId` (session-store).
- Produces: superadmin → `<select id="team-org">` au-dessus du roster ; ordre de résolution de l'ORG effective : `?org=` (URL) → ORG de session → première ORG listée. Non-superadmin : comportement inchangé (ORG de session, pas de sélecteur).

- [ ] **Step 1: Test (échoue)** — `TeamAdminPage.orgselect.test.tsx` : mock session-store (role `super_admin`, orgId null), mock `@/services/orgs` (`listOrgs` → 2 ORG), mock `@/services/rbac` (roster vide) ; assertions :
  1. le sélecteur rend les 2 ORG et `listOrgMembers` est appelé avec la première ;
  2. changement de sélection → `listOrgMembers` r-appelé avec la seconde ;
  3. avec `window.history.replaceState(null, '', '/settings?section=team&org=ORG2')` posé avant le render, l'ORG initiale est ORG2 ;
  4. role `tourism_agent` + orgId session → aucun sélecteur rendu.
- [ ] **Step 2: Vérifier l'échec** — `npm run test:run -- src/views/TeamAdminPage.orgselect.test.tsx` → FAIL.
- [ ] **Step 3: Implémenter** — dans `TeamAdminPage.tsx`, remplacer l'effet `effectiveOrgId` existant (lignes 38-46) par :

```tsx
const isSuperuser = role === 'owner' || role === 'super_admin';
const [orgs, setOrgs] = useState<OrgSummary[]>([]);

useEffect(() => {
  if (!allowed) return;
  if (!isSuperuser) { if (orgId) setEffectiveOrgId(orgId); return; }
  // Superadmin : liste complète + ciblage explicite (?org= > ORG de session > première).
  // Lecture one-shot de l'URL (window) : TeamAdminPage est monté dans /settings, pas de
  // useSearchParams pour éviter la contrainte de Suspense boundary.
  const urlOrg = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('org') : null;
  listOrgs()
    .then((rows) => {
      setOrgs(rows);
      setEffectiveOrgId((current) => current ?? urlOrg ?? orgId ?? rows[0]?.id ?? null);
    })
    .catch(() => { if (orgId) setEffectiveOrgId(orgId); });
}, [allowed, isSuperuser, orgId]);
```

Imports : `listOrgs, type OrgSummary` depuis `@/services/orgs` ; retirer `getDefaultOrgId` de l'import rbac. Rendu, au-dessus du roster (visible seulement si `isSuperuser && orgs.length > 1`) :

```tsx
{isSuperuser && orgs.length > 1 && (
  <label className="field-block" htmlFor="team-org">
    <span>Organisation</span>
    <select id="team-org" className="select" value={effectiveOrgId ?? ''} onChange={(e) => setEffectiveOrgId(e.target.value)}>
      {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  </label>
)}
```

- [ ] **Step 4: Supprimer `getDefaultOrgId`** de `rbac.ts` (plus aucun appelant — vérifier par `grep -r getDefaultOrgId src/`).
- [ ] **Step 5: Vérifier** — `npm run test:run -- src/views/TeamAdminPage.orgselect.test.tsx src/features/team` → PASS ; `npm run typecheck` → 0 ; suite complète `npm run test:run` verte.
- [ ] **Step 6: Commit**

```bash
cd bertel-tourism-ui && git add src/views/TeamAdminPage.tsx src/views/TeamAdminPage.orgselect.test.tsx src/services/rbac.ts && git commit -m "feat(team): sélecteur d'ORG superadmin (?org= > session > première) — remplace le fallback aveugle getDefaultOrgId (supprimé)"
```

---

## LOT 2 — Branding par ORG

### Task 7: Migration SQL `migration_org_branding.sql` + test + manifest

**Files:**
- Create: `Base de donnée DLL et API/migration_org_branding.sql`
- Create: `Base de donnée DLL et API/tests/test_org_branding.sql`
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql` (+ `\ir` migration après `ui_whitelabel_branding.sql` et Task 1 ; + test)
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md`

**Interfaces:**
- Consumes: `app_branding_settings` + `api.get_app_branding()` (ui_whitelabel_branding.sql) ; `api.current_user_org_id()` ; `update_updated_at_column()` ; rangs `ref_org_admin_role`.
- Produces: table `org_branding_settings` ; `api.user_can_manage_org_branding(p_org_object_id text) RETURNS boolean` ; `api.get_org_branding(p_org_object_id text) RETURNS jsonb` (`{orgObjectId, raw, resolved}`) ; `api.upsert_org_branding(p_org_object_id text, p_brand_name text, p_logo_storage_path text, p_logo_public_url text, p_logo_mime_type text, p_primary_color text, p_accent_color text, p_text_color text, p_background_color text, p_surface_color text, p_reset boolean DEFAULT FALSE) RETURNS jsonb` (contrat **full-state PUT** : chaque appel remplace la ligne entière ; NULL = hérite) ; `api.get_app_branding()` résout désormais par ORG (clé `orgObjectId` ajoutée, `markerStyles` toujours plateforme).

- [ ] **Step 1: Écrire le test SQL**

Fixtures plage `09xx` (suite de Task 1) : 2 ORG (`ORGRUN9999990903`/`0904` insérées published), 4 users (superuser 0905 ; admin30 de A 0906 ; manager20 de A 0907 ; admin30 de B 0908) avec memberships + `user_org_admin_role` (reprendre la mécanique de fixtures rôle admin de `tests/test_sp2_permission_behavior.sql`). Assertions :

1. `get_app_branding()` en tant que membre de A **sans ligne org** = valeurs plateforme, `orgObjectId` NULL.
2. superuser : `upsert_org_branding(orgA, p_brand_name => 'OTI A', p_primary_color => '#112233', tous les autres NULL)` → membre de A voit `brandName='OTI A'`, `primaryColor='#112233'`, les autres champs = plateforme, `markerStyles` = plateforme, `orgObjectId = orgA` ; membre/admin de B voit toujours 100 % plateforme.
3. Gates d'écriture : admin30 de A → OK sur A ; manager20 de A → 42501 ; admin30 de B → 42501 sur A ; membre sans rôle admin → 42501.
4. `upsert_org_branding(orgA, …, p_reset => TRUE)` → ligne supprimée, retour au 100 % plateforme.
5. `get_public_branding()` strictement identique avant/après la ligne org (le pré-auth ne fuit pas le branding ORG).
6. Persona `anon` (`set_config('request.jwt.claims', '{"role":"anon"}', true)`) : `SELECT count(*) FROM org_branding_settings` → exception (pas de grant anon) — capturer et ASSERT.

Structure identique au test du Task 1 (DO-block unique, `ROLLBACK` final, NOTICE `test_org_branding: OK`).

- [ ] **Step 2: Écrire la migration**

```sql
-- migration_org_branding.sql
-- Branding par ORG (§ décidé PO 2026-07-03) : chaque ORG peut surcharger l'identité visuelle
-- (nom de marque, logo, 5 couleurs) champ par champ ; NULL = hérite du singleton plateforme
-- app_branding_settings. La résolution se fait dans api.get_app_branding() selon le membership
-- (un seul membership actif par user ⇒ non ambiguë). get_public_branding (login) inchangée.
-- markerStyles reste plateforme (pins carte = PNGs statiques). Écritures = RPCs DEFINER
-- uniquement (aucune policy d'écriture directe). Apply order: après ui_whitelabel_branding.sql
-- et migration_org_onboarding.sql — voir runbook.
\set ON_ERROR_STOP on
BEGIN;

CREATE TABLE IF NOT EXISTS public.org_branding_settings (
  org_object_id     TEXT PRIMARY KEY REFERENCES object(id) ON DELETE CASCADE,
  brand_name        TEXT,
  logo_storage_path TEXT,
  logo_public_url   TEXT,
  logo_mime_type    TEXT,
  primary_color     TEXT,
  accent_color      TEXT,
  text_color        TEXT,
  background_color  TEXT,
  surface_color     TEXT,
  extra             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT chk_org_branding_logo_mime CHECK (logo_mime_type IS NULL OR lower(logo_mime_type) IN ('image/png','image/jpeg','image/webp','image/svg+xml')),
  CONSTRAINT chk_org_branding_logo_url  CHECK (logo_public_url IS NULL OR logo_public_url ~* '^(https?://|/storage/v1/object/public/)'),
  CONSTRAINT chk_org_branding_primary   CHECK (primary_color    IS NULL OR primary_color    ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_org_branding_accent    CHECK (accent_color     IS NULL OR accent_color     ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_org_branding_text      CHECK (text_color       IS NULL OR text_color       ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_org_branding_bg        CHECK (background_color IS NULL OR background_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_org_branding_surface   CHECK (surface_color    IS NULL OR surface_color    ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_org_branding_extra     CHECK (jsonb_typeof(extra) = 'object')
);

COMMENT ON TABLE public.org_branding_settings IS
'Surcharges de branding par organisation (NULL = hérite de app_branding_settings). Résolue par api.get_app_branding selon le membership.';

-- Garde type ORG (miroir de check_org_config_org_type — table à part, message dédié).
CREATE OR REPLACE FUNCTION api.check_org_branding_org_type()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM object WHERE id = NEW.org_object_id AND object_type = 'ORG') THEN
    RAISE EXCEPTION 'org_branding_settings.org_object_id doit pointer vers un objet ORG (reçu : %)', NEW.org_object_id;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_check_org_branding_org_type ON public.org_branding_settings;
CREATE TRIGGER trg_check_org_branding_org_type
  BEFORE INSERT OR UPDATE ON public.org_branding_settings
  FOR EACH ROW EXECUTE FUNCTION api.check_org_branding_org_type();

DROP TRIGGER IF EXISTS update_org_branding_settings_updated_at ON public.org_branding_settings;
CREATE TRIGGER update_org_branding_settings_updated_at
  BEFORE UPDATE ON public.org_branding_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS : lecture authenticated (le branding n'est pas un secret — logo en bucket public) ;
-- AUCUNE policy d'écriture directe : écritures via les RPCs DEFINER ci-dessous uniquement.
-- Forme TO authenticated USING (true) : pas d'auth.*() nu (garde CI initplan §39/§146).
ALTER TABLE public.org_branding_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_org_branding" ON public.org_branding_settings;
CREATE POLICY "read_org_branding" ON public.org_branding_settings
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.org_branding_settings TO authenticated;
GRANT ALL    ON public.org_branding_settings TO service_role;

-- Gouvernance : superuser plateforme OU admin (rang >= 30) actif de CETTE ORG.
CREATE OR REPLACE FUNCTION api.user_can_manage_org_branding(p_org_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT api.is_platform_superuser()
      OR EXISTS (
           SELECT 1
           FROM user_org_membership uom
           JOIN user_org_admin_role uar ON uar.membership_id = uom.id AND uar.is_active
           JOIN ref_org_admin_role  r   ON r.id = uar.role_id
           WHERE uom.user_id = (SELECT auth.uid())
             AND uom.org_object_id = p_org_object_id
             AND uom.is_active
             AND r.rank >= 30
         );
$$;
REVOKE EXECUTE ON FUNCTION api.user_can_manage_org_branding(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.user_can_manage_org_branding(text) TO authenticated, service_role;

-- Lecture admin (éditeur de branding) : ligne brute (NULL = hérite) + payload résolu.
CREATE OR REPLACE FUNCTION api.get_org_branding(p_org_object_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE v_out jsonb;
BEGIN
  IF NOT api.user_can_manage_org_branding(p_org_object_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: branding réservé au superadmin plateforme ou à un admin de cette organisation'
      USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'orgObjectId', p_org_object_id,
    'raw', COALESCE((
      SELECT jsonb_build_object(
        'brandName', b.brand_name, 'logoStoragePath', b.logo_storage_path,
        'logoPublicUrl', b.logo_public_url, 'logoMimeType', b.logo_mime_type,
        'primaryColor', b.primary_color, 'accentColor', b.accent_color,
        'textColor', b.text_color, 'backgroundColor', b.background_color,
        'surfaceColor', b.surface_color)
      FROM org_branding_settings b WHERE b.org_object_id = p_org_object_id), '{}'::jsonb),
    'resolved', (
      SELECT jsonb_build_object(
        'brandName',       COALESCE(o.brand_name, s.brand_name),
        'logoPublicUrl',   COALESCE(o.logo_public_url, s.logo_public_url),
        'primaryColor',    COALESCE(o.primary_color, s.primary_color),
        'accentColor',     COALESCE(o.accent_color, s.accent_color),
        'textColor',       COALESCE(o.text_color, s.text_color),
        'backgroundColor', COALESCE(o.background_color, s.background_color),
        'surfaceColor',    COALESCE(o.surface_color, s.surface_color))
      FROM app_branding_settings s
      LEFT JOIN org_branding_settings o ON o.org_object_id = p_org_object_id
      WHERE s.setting_key = 'default')
  ) INTO v_out;
  RETURN v_out;
END; $$;
REVOKE EXECUTE ON FUNCTION api.get_org_branding(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_org_branding(text) TO authenticated, service_role;

-- Écriture : contrat FULL-STATE PUT — chaque appel remplace la ligne entière (NULL = hérite).
-- Le dialog recharge d'abord get_org_branding().raw et renvoie tous les champs. p_reset = TRUE
-- supprime la ligne (retour complet au thème plateforme).
CREATE OR REPLACE FUNCTION api.upsert_org_branding(
  p_org_object_id    text,
  p_brand_name       text DEFAULT NULL,
  p_logo_storage_path text DEFAULT NULL,
  p_logo_public_url  text DEFAULT NULL,
  p_logo_mime_type   text DEFAULT NULL,
  p_primary_color    text DEFAULT NULL,
  p_accent_color     text DEFAULT NULL,
  p_text_color       text DEFAULT NULL,
  p_background_color text DEFAULT NULL,
  p_surface_color    text DEFAULT NULL,
  p_reset            boolean DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth
AS $$
BEGIN
  IF NOT api.user_can_manage_org_branding(p_org_object_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: branding réservé au superadmin plateforme ou à un admin de cette organisation'
      USING ERRCODE = '42501';
  END IF;
  IF p_reset THEN
    DELETE FROM org_branding_settings WHERE org_object_id = p_org_object_id;
    RETURN api.get_org_branding(p_org_object_id);
  END IF;
  INSERT INTO org_branding_settings (
    org_object_id, brand_name, logo_storage_path, logo_public_url, logo_mime_type,
    primary_color, accent_color, text_color, background_color, surface_color,
    created_by, updated_by)
  VALUES (
    p_org_object_id,
    NULLIF(btrim(COALESCE(p_brand_name, '')), ''),
    NULLIF(btrim(COALESCE(p_logo_storage_path, '')), ''),
    NULLIF(btrim(COALESCE(p_logo_public_url, '')), ''),
    lower(NULLIF(btrim(COALESCE(p_logo_mime_type, '')), '')),
    upper(NULLIF(btrim(COALESCE(p_primary_color, '')), '')),
    upper(NULLIF(btrim(COALESCE(p_accent_color, '')), '')),
    upper(NULLIF(btrim(COALESCE(p_text_color, '')), '')),
    upper(NULLIF(btrim(COALESCE(p_background_color, '')), '')),
    upper(NULLIF(btrim(COALESCE(p_surface_color, '')), '')),
    auth.uid(), auth.uid())
  ON CONFLICT (org_object_id) DO UPDATE SET
    brand_name        = EXCLUDED.brand_name,
    logo_storage_path = EXCLUDED.logo_storage_path,
    logo_public_url   = EXCLUDED.logo_public_url,
    logo_mime_type    = EXCLUDED.logo_mime_type,
    primary_color     = EXCLUDED.primary_color,
    accent_color      = EXCLUDED.accent_color,
    text_color        = EXCLUDED.text_color,
    background_color  = EXCLUDED.background_color,
    surface_color     = EXCLUDED.surface_color,
    updated_by        = EXCLUDED.updated_by;
  RETURN api.get_org_branding(p_org_object_id);
END; $$;
REVOKE EXECUTE ON FUNCTION api.upsert_org_branding(text, text, text, text, text, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.upsert_org_branding(text, text, text, text, text, text, text, text, text, text, boolean) TO authenticated, service_role;

-- Résolution par ORG dans le payload authentifié. Signature/forme INCHANGÉES (le front ne
-- change pas) ; clé orgObjectId ajoutée ; markerStyles/extra restent plateforme ; le trio
-- logo bascule EN BLOC (un logo ORG posé ⇒ path+mime de l'ORG, jamais de mélange).
CREATE OR REPLACE FUNCTION api.get_app_branding()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT jsonb_build_object(
    'orgObjectId',     o.org_object_id,
    'brandName',       COALESCE(o.brand_name, s.brand_name),
    'logoStoragePath', CASE WHEN o.logo_public_url IS NOT NULL THEN o.logo_storage_path ELSE s.logo_storage_path END,
    'logoPublicUrl',   COALESCE(o.logo_public_url, s.logo_public_url),
    'logoMimeType',    CASE WHEN o.logo_public_url IS NOT NULL THEN o.logo_mime_type ELSE s.logo_mime_type END,
    'primaryColor',    COALESCE(o.primary_color, s.primary_color),
    'accentColor',     COALESCE(o.accent_color, s.accent_color),
    'textColor',       COALESCE(o.text_color, s.text_color),
    'backgroundColor', COALESCE(o.background_color, s.background_color),
    'surfaceColor',    COALESCE(o.surface_color, s.surface_color),
    'markerStyles',    s.marker_styles,
    'extra',           s.extra,
    'updatedAt',       GREATEST(s.updated_at, COALESCE(o.updated_at, s.updated_at)),
    'updatedBy',       s.updated_by
  )
  FROM app_branding_settings s
  LEFT JOIN org_branding_settings o ON o.org_object_id = api.current_user_org_id()
  WHERE s.setting_key = 'default';
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Manifest + runbook** — `ci_fresh_apply.sql` : `\ir migration_org_branding.sql` après `ui_whitelabel_branding.sql` ET après `migration_org_onboarding.sql` ; `\ir tests/test_org_branding.sql` au bloc tests. Runbook : nouvelle ligne, dépendances explicites.
- [ ] **Step 4: Dry-run transactionnel MCP** (même recette que Task 1 Step 4). Expected: NOTICE `test_org_branding: OK`, rollback propre.
- [ ] **Step 5: Commit**

```bash
git add "Base de donnée DLL et API/migration_org_branding.sql" "Base de donnée DLL et API/tests/test_org_branding.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md && git commit -m "feat(branding): org_branding_settings + résolution par ORG dans get_app_branding (héritage champ par champ, logo en bloc) ; RPCs get/upsert gated superuser|org_admin>=30 ; test + manifest/runbook"
```

---

### Task 8: Apply live branding + vérifications

**Files:** aucun (opérations MCP).

- [ ] **Step 1: `apply_migration`** (name: `org_branding_per_org`).
- [ ] **Step 2: Test live** — `execute_sql` avec `tests/test_org_branding.sql` (transactionnel). Expected: NOTICE OK.
- [ ] **Step 3: Non-régression du thème courant** — `execute_sql` : `SELECT api.get_public_branding();` puis, avec un JWT de session réelle impossible ici, vérifier au moins `SELECT api.get_app_branding();` en service_role → payload complet, `orgObjectId` NULL (pas de membership service_role), toutes les valeurs = plateforme. Comparer aux valeurs de `app_branding_settings`.
- [ ] **Step 4: Advisors + NOTIFY** — `get_advisors` (flags 0028/0029 attendus sur les nouvelles DEFINER uniquement) ; `NOTIFY pgrst, 'reload schema';`.
- [ ] **Step 5: Vérification app** — recharger l'app connectée (compte OTI du Sud) : thème inchangé (aucune ligne org encore).

---

### Task 9: Route logo upload — variante per-org

**Files:**
- Modify: `bertel-tourism-ui/src/app/api/branding/logo/upload/route.ts`
- Modify: `bertel-tourism-ui/src/app/api/branding/logo/upload/route.test.ts`

**Interfaces:**
- Consumes: `api.user_can_manage_org_branding` (Task 7) ; pipeline existant (processImage, bucket `branding-assets`, garde `is_platform_admin`).
- Produces: la route accepte un champ FormData optionnel `orgObjectId` → autorisation AS THE CALLER via `user_can_manage_org_branding(orgObjectId)`, stockage sous `org/{orgObjectId}/…` ; sans le champ, comportement plateforme inchangé.

- [ ] **Step 1: Tests (échouent)** — ajouter à `route.test.ts` :
  1. FormData avec `orgObjectId` + caller dont `user_can_manage_org_branding` → true : 200, path retourné commence par `org/ORGRUN…/` ;
  2. même appel avec probe → false : 403 (et **aucun** appel storage) ;
  3. sans `orgObjectId` : la garde reste `is_platform_admin` (mock inchangé des tests existants).
- [ ] **Step 2: Vérifier l'échec** — `npm run test:run -- src/app/api/branding/logo/upload/route.test.ts` → FAIL.
- [ ] **Step 3: Implémenter** — dans la route, après extraction du FormData :

```ts
const orgObjectIdRaw = form.get('orgObjectId');
const orgObjectId = typeof orgObjectIdRaw === 'string' && orgObjectIdRaw.trim() !== '' ? orgObjectIdRaw.trim() : null;
```

Remplacer la garde unique par :

```ts
if (orgObjectId) {
  const { data: canManage, error: probeErr } = await asCaller
    .schema('api').rpc('user_can_manage_org_branding', { p_org_object_id: orgObjectId });
  if (probeErr || canManage !== true) {
    return NextResponse.json({ error: 'forbidden', detail: 'superadmin plateforme ou admin de cette organisation requis' }, { status: 403 });
  }
} else {
  // garde plateforme existante (is_platform_admin) inchangée
}
```

Et préfixer le chemin de stockage : `const path = orgObjectId ? `org/${orgObjectId}/${basename}` : basename;` (où `basename` est le nom de fichier généré existant — conserver la génération actuelle telle quelle).

- [ ] **Step 4: Vérifier** — tests route PASS ; `npm run typecheck` → 0.
- [ ] **Step 5: Commit**

```bash
cd bertel-tourism-ui && git add src/app/api/branding/logo/upload/route.ts src/app/api/branding/logo/upload/route.test.ts && git commit -m "feat(branding): upload logo per-org — champ orgObjectId autorisé AS THE CALLER via user_can_manage_org_branding, stockage org/{id}/ ; garde plateforme inchangée sinon"
```

---

### Task 10: Service branding — fonctions org

**Files:**
- Modify: `bertel-tourism-ui/src/services/branding.ts`
- Test: `bertel-tourism-ui/src/services/branding.org.test.ts`

**Interfaces:**
- Consumes: RPCs Task 7 ; route Task 9 ; `uploadBrandLogo` existant (étendu d'un paramètre).
- Produces: `interface OrgBrandingRaw { brandName; logoStoragePath; logoPublicUrl; logoMimeType; primaryColor; accentColor; textColor; backgroundColor; surfaceColor }` (tous `string | null`) ; `interface OrgBrandingSnapshot { orgObjectId: string; raw: OrgBrandingRaw; resolved: Record<string, string | null> }` ; `getOrgBranding(orgId): Promise<OrgBrandingSnapshot>` ; `saveOrgBranding(orgId, input: { raw: OrgBrandingRaw; logoFile?: File | null; clearLogo?: boolean; reset?: boolean }): Promise<OrgBrandingSnapshot>`.

- [ ] **Step 1: Tests (échouent)** — `branding.org.test.ts` (mocks client api + fetch) :
  1. `getOrgBranding('ORGRUN1')` appelle `get_org_branding` avec `p_org_object_id` et normalise `{raw, resolved}` (champs absents → null) ;
  2. `saveOrgBranding` sans logoFile → `upsert_org_branding` reçoit exactement les 9 champs raw + `p_reset: false` ;
  3. avec `logoFile` → `fetch('/api/branding/logo/upload')` avec FormData contenant `orgObjectId`, puis upsert avec le trio logo retourné ;
  4. `reset: true` → upsert appelé avec `p_reset: true` (et pas d'upload).
- [ ] **Step 2: Vérifier l'échec** — `npm run test:run -- src/services/branding.org.test.ts` → FAIL.
- [ ] **Step 3: Implémenter** — dans `branding.ts` :
  - `uploadBrandLogo(file, client, orgObjectId?: string)` : si fourni, `body.append('orgObjectId', orgObjectId)`.
  - Nouvelles fonctions (normalisation défensive comme `normalizeBrandingSnapshot`) :

```ts
function readNullableString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}
function normalizeOrgRaw(data: unknown): OrgBrandingRaw {
  const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    brandName: readNullableString(raw.brandName),
    logoStoragePath: readNullableString(raw.logoStoragePath),
    logoPublicUrl: readNullableString(raw.logoPublicUrl),
    logoMimeType: readNullableString(raw.logoMimeType),
    primaryColor: readNullableString(raw.primaryColor),
    accentColor: readNullableString(raw.accentColor),
    textColor: readNullableString(raw.textColor),
    backgroundColor: readNullableString(raw.backgroundColor),
    surfaceColor: readNullableString(raw.surfaceColor),
  };
}

export async function getOrgBranding(orgObjectId: string): Promise<OrgBrandingSnapshot> {
  const client = getApiClient();
  if (!client) throw new Error('Supabase non configuré.');
  const { data, error } = await client.schema('api').rpc('get_org_branding', { p_org_object_id: orgObjectId });
  if (error) throw error;
  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    orgObjectId,
    raw: normalizeOrgRaw(payload.raw),
    resolved: (payload.resolved ?? {}) as Record<string, string | null>,
  };
}

export async function saveOrgBranding(
  orgObjectId: string,
  input: { raw: OrgBrandingRaw; logoFile?: File | null; clearLogo?: boolean; reset?: boolean },
): Promise<OrgBrandingSnapshot> {
  const client = getApiClient();
  const dbClient = getSupabaseClient();
  if (!client || !dbClient) throw new Error('Supabase non configuré.');
  let logo = {
    logoStoragePath: input.clearLogo ? null : input.raw.logoStoragePath,
    logoPublicUrl: input.clearLogo ? null : input.raw.logoPublicUrl,
    logoMimeType: input.clearLogo ? null : input.raw.logoMimeType,
  };
  if (!input.reset && input.logoFile) {
    const uploaded = await uploadBrandLogo(input.logoFile, dbClient, orgObjectId);
    logo = { logoStoragePath: uploaded.logoStoragePath, logoPublicUrl: uploaded.logoPublicUrl, logoMimeType: uploaded.logoMimeType };
  }
  const { data, error } = await client.schema('api').rpc('upsert_org_branding', {
    p_org_object_id: orgObjectId,
    p_brand_name: input.raw.brandName,
    p_logo_storage_path: logo.logoStoragePath,
    p_logo_public_url: logo.logoPublicUrl,
    p_logo_mime_type: logo.logoMimeType,
    p_primary_color: input.raw.primaryColor,
    p_accent_color: input.raw.accentColor,
    p_text_color: input.raw.textColor,
    p_background_color: input.raw.backgroundColor,
    p_surface_color: input.raw.surfaceColor,
    p_reset: input.reset === true,
  });
  if (error) throw error;
  const payload = (data ?? {}) as Record<string, unknown>;
  return { orgObjectId, raw: normalizeOrgRaw(payload.raw), resolved: (payload.resolved ?? {}) as Record<string, string | null> };
}
```

- [ ] **Step 4: Vérifier** — tests PASS + suite branding existante toujours verte (`npm run test:run -- src/services`) ; typecheck 0.
- [ ] **Step 5: Commit**

```bash
cd bertel-tourism-ui && git add src/services/branding.ts src/services/branding.org.test.ts && git commit -m "feat(branding): getOrgBranding/saveOrgBranding — full-state PUT vers upsert_org_branding, upload logo per-org, reset = retour au thème plateforme"
```

---

### Task 11: UI branding ORG — formulaire partagé, action superadmin, section « Mon organisation »

**Files:**
- Create: `bertel-tourism-ui/src/features/orgs/OrgBrandingForm.tsx`
- Modify: `bertel-tourism-ui/src/features/orgs/OrgsPanel.tsx` (action « Branding » par ligne → Modal)
- Modify: `bertel-tourism-ui/src/views/settings-nav.ts` + `settings-nav.test.ts` (section `org-branding` dans ORG_GROUP, nouvelle option)
- Modify: `bertel-tourism-ui/src/views/SettingsPage.tsx` (panneau `org-branding` + calcul du droit)
- Test: `bertel-tourism-ui/src/features/orgs/OrgBrandingForm.test.tsx`

**Interfaces:**
- Consumes: `getOrgBranding`/`saveOrgBranding`/`OrgBrandingRaw` (Task 10) ; `ConfirmDialog` de `@/components/common/ConfirmDialog` ; `useQueryClient` (invalidation `['branding','authenticated']` — pattern SettingsPage:294) ; session `adminRank`/`orgId`.
- Produces: `OrgBrandingForm({ orgId, onSaved }: { orgId: string; onSaved?: () => void })` — formulaire complet (nom de marque, logo upload/retrait, 5 couleurs ; champ vide = hérite, placeholder = valeur résolue) + « Revenir au thème plateforme » (ConfirmDialog → reset) ; nav : `buildSettingsNav(role, { canManageTeam, canManageOrgBranding })` avec ORG_GROUP construit dynamiquement (`team` si canManageTeam, `org-branding` si canManageOrgBranding).

- [ ] **Step 1: Tests (échouent)** —
  - `settings-nav.test.ts` : `settingsSectionIds('tourism_agent', { canManageOrgBranding: true })` contient `org-branding` ; sans l'option, non.
  - `OrgBrandingForm.test.tsx` (mocks services) : ① charge `getOrgBranding` et pré-remplit les inputs avec `raw` (champ hérité = vide, placeholder = résolu) ; ② submit envoie `saveOrgBranding` avec `raw` où les inputs vides sont null ; ③ « Revenir au thème plateforme » ouvre le ConfirmDialog puis appelle `saveOrgBranding(..., { reset: true })` ; ④ `onSaved` appelé après succès.
- [ ] **Step 2: Vérifier l'échec** — `npm run test:run -- src/features/orgs/OrgBrandingForm.test.tsx src/views/settings-nav.test.ts` → FAIL.
- [ ] **Step 3: settings-nav.ts** — étendre `SettingsNavOptions` avec `canManageOrgBranding?: boolean` ; remplacer la constante `ORG_GROUP` par un builder :

```ts
import { Brush } from 'lucide-react'; // + imports existants

function buildOrgGroup(options: SettingsNavOptions): SettingsNavGroup | null {
  const sections: SettingsNavSection[] = [];
  if (options.canManageTeam) sections.push({ id: 'team', label: 'Équipe', icon: Users });
  if (options.canManageOrgBranding) sections.push({ id: 'org-branding', label: 'Apparence de l’organisation', icon: Brush, isNew: true });
  if (sections.length === 0) return null;
  return { id: 'org', label: 'Mon organisation', scope: { label: 'admin ORG', gated: true }, sections };
}
```

et dans `buildSettingsNav` : `const orgGroup = buildOrgGroup(options); if (orgGroup) groups.push(orgGroup);`.

- [ ] **Step 4: OrgBrandingForm** — formulaire contrôlé sur `OrgBrandingRaw` :

```tsx
'use client';
// Branding d'une ORG : chaque champ vide hérite du thème plateforme (placeholder = valeur
// résolue). Full-state PUT côté RPC — le formulaire recharge raw avant toute sauvegarde.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { getOrgBranding, saveOrgBranding, type OrgBrandingRaw } from '@/services/branding';

const EMPTY_RAW: OrgBrandingRaw = {
  brandName: null, logoStoragePath: null, logoPublicUrl: null, logoMimeType: null,
  primaryColor: null, accentColor: null, textColor: null, backgroundColor: null, surfaceColor: null,
};
const COLOR_FIELDS: Array<{ key: keyof OrgBrandingRaw; label: string }> = [
  { key: 'primaryColor', label: 'Couleur principale' },
  { key: 'accentColor', label: 'Couleur d’accent' },
  { key: 'textColor', label: 'Couleur du texte' },
  { key: 'backgroundColor', label: 'Fond' },
  { key: 'surfaceColor', label: 'Surfaces' },
];

export function OrgBrandingForm({ orgId, onSaved }: { orgId: string; onSaved?: () => void }) {
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState<OrgBrandingRaw>(EMPTY_RAW);
  const [resolved, setResolved] = useState<Record<string, string | null>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [clearLogo, setClearLogo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const snap = await getOrgBranding(orgId);
      setRaw(snap.raw); setResolved(snap.resolved); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur de chargement'); }
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);

  function setField(key: keyof OrgBrandingRaw, value: string) {
    setRaw((prev) => ({ ...prev, [key]: value.trim() === '' ? null : value }));
  }

  async function persist(reset: boolean) {
    setBusy(true);
    try {
      const snap = await saveOrgBranding(orgId, reset ? { raw, reset: true } : { raw, logoFile, clearLogo });
      setRaw(snap.raw); setResolved(snap.resolved); setLogoFile(null); setClearLogo(false);
      await queryClient.invalidateQueries({ queryKey: ['branding', 'authenticated'] });
      toast.success(reset ? 'Thème de l’organisation réinitialisé.' : 'Branding de l’organisation enregistré.');
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally { setBusy(false); setConfirmReset(false); }
  }

  if (error) return <p className="form-error" role="alert">{error}</p>;

  return (
    <div className="field-stack">
      <label className="field-block" htmlFor="orgb-name">
        <span>Nom de marque</span>
        <input id="orgb-name" className="input" value={raw.brandName ?? ''} placeholder={resolved.brandName ?? ''} onChange={(e) => setField('brandName', e.target.value)} disabled={busy} />
        <span className="pref__hint">Vide = hérite du nom plateforme.</span>
      </label>

      <div className="field-block">
        <span>Logo</span>
        {raw.logoPublicUrl && !clearLogo ? (
          <div className="logo-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={raw.logoPublicUrl} alt="Logo de l’organisation" style={{ maxHeight: 48 }} />
            <button type="button" className="ghost-button" onClick={() => setClearLogo(true)} disabled={busy}>Retirer</button>
          </div>
        ) : (
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} disabled={busy} />
        )}
        <span className="pref__hint">Sans logo propre, celui de la plateforme est utilisé.</span>
      </div>

      {COLOR_FIELDS.map(({ key, label }) => (
        <label key={key} className="field-block" htmlFor={`orgb-${key}`}>
          <span>{label}</span>
          <div className="color-row">
            <input id={`orgb-${key}`} className="input" value={(raw[key] as string | null) ?? ''} placeholder={resolved[key] ?? '#000000'} onChange={(e) => setField(key, e.target.value)} pattern="#[0-9A-Fa-f]{6}" disabled={busy} />
            <span aria-hidden style={{ display: 'inline-block', width: 20, height: 20, borderRadius: 4, background: (raw[key] as string | null) ?? resolved[key] ?? 'transparent', border: '1px solid var(--line)' }} />
          </div>
        </label>
      ))}

      <div className="actions-row">
        <button type="button" className="ghost-button" onClick={() => setConfirmReset(true)} disabled={busy}>Revenir au thème plateforme</button>
        <button type="button" className="primary-button" onClick={() => { void persist(false); }} disabled={busy}>
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="Revenir au thème plateforme ?"
          description="Toutes les surcharges de branding de cette organisation seront supprimées."
          confirmLabel="Réinitialiser"
          onConfirm={() => { void persist(true); }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}
```

> Adapter les props exactes de `ConfirmDialog` à sa signature réelle (constatée dans `components/common/ConfirmDialog.tsx` — déjà utilisée par TeamAdminPage).

- [ ] **Step 5: OrgsPanel** — colonne actions : bouton « Branding » qui ouvre `Modal` (titre = nom de l'ORG) contenant `<OrgBrandingForm orgId={o.id} />`.
- [ ] **Step 6: SettingsPage** — calculer `const canManageOrgBranding = (adminRank ?? 0) >= 30 && !!orgId;`, passer l'option à `buildSettingsNav`/`resolveSettingsSection`, et rendre :

```tsx
{activeSection === 'org-branding' && canManageOrgBranding && orgId && (
  <section className="card">
    <h2>Apparence de l’organisation</h2>
    <p className="pref__hint">Personnalisez l’identité visuelle vue par les membres de votre organisation. Les champs vides héritent du thème plateforme.</p>
    <OrgBrandingForm orgId={orgId} />
  </section>
)}
```

- [ ] **Step 7: Vérifier** — `npm run test:run -- src/features/orgs src/views/settings-nav.test.ts` → PASS ; suite complète verte ; typecheck 0.
- [ ] **Step 8: Vérification visuelle (preview)** — `preview_start` du dev server, se connecter (compte super_admin), /settings → Organisations → Branding d'une ORG de test : poser une couleur principale, vérifier après invalidation que le thème NE change PAS pour le superadmin sans membership (payload plateforme) ; `preview_screenshot` du module. (La preview locale = base démo — vérifier au moins le rendu du formulaire si la base locale n'a pas les RPCs.)
- [ ] **Step 9: Commit**

```bash
cd bertel-tourism-ui && git add src/features/orgs/OrgBrandingForm.tsx src/features/orgs/OrgBrandingForm.test.tsx src/features/orgs/OrgsPanel.tsx src/views/settings-nav.ts src/views/settings-nav.test.ts src/views/SettingsPage.tsx && git commit -m "feat(branding): UI branding par ORG — formulaire partagé (héritage par champ, reset confirmé), action Branding du module Organisations + section Apparence de l'organisation (admin >= 30)"
```

---

### Task 12: Documentation, journal des décisions & clôture

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (nouveau §)
- Modify: `.claude/WORKFLOW.md` (lignes différés)
- Modify: `CLAUDE.md` (proposition d'invariant — à faire valider par le PO dans le récap final)
- Modify: `Base de donnée DLL et API/README.md` (si le README documente les RPCs — vérifier et compléter)

- [ ] **Step 1: Journal des décisions** — **re-grep le dernier `## §` du log avant de numéroter** (collisions de sessions parallèles déjà vécues). Consigner : voie unique `rpc_create_org` (published direct — pourquoi), `rpc_list_orgs`, sélecteur /team (suppression `getDefaultOrgId`), gouvernance branding (superuser + org_admin ≥ 30), résolution par membership (COALESCE par champ, logo en bloc, markerStyles plateforme), login = plateforme, contrat full-state PUT, différés (marker styles per-org, login brandé par URL, switcher global multi-org, archivage/suppression d'ORG).
- [ ] **Step 2: WORKFLOW.md** — ajouter les différés au tracker avec raison + déblocage.
- [ ] **Step 3: Proposition CLAUDE.md** — ajouter sous « Business invariants » :

```markdown
### Création d'organisation (ORG)
La création d'une ORG passe par l'**unique** voie `api.rpc_create_org` (SECURITY DEFINER,
superuser-only) : objet ORG créé **directement `published`** (l'INSERT ne déclenche pas
`trg_guard_object_status_change` — BEFORE UPDATE OF status — et un draft ORG serait
impubliable faute d'ORG publisher) + `org_config` en une transaction. JAMAIS via
`rpc_create_object` ni le dialog B1 (ORG exclu). Le branding par ORG
(`org_branding_settings`) hérite champ par champ du singleton plateforme et se résout dans
`api.get_app_branding()` selon le membership ; écritures via `api.upsert_org_branding`
(superuser OU admin rang ≥ 30 de l'ORG cible) ; le logo passe par la route single-writer
`/api/branding/logo/upload` (champ `orgObjectId`).
```

- [ ] **Step 4: Suite complète + typecheck** — `npm run test:run` (tout vert) + `npm run typecheck` (0) ; côté SQL, re-jouer les 2 tests live une dernière fois.
- [ ] **Step 5: Commit docs**

```bash
git add bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md .claude/WORKFLOW.md CLAUDE.md "Base de donnée DLL et API/README.md" && git commit -m "docs(org): journal § création d'ORG + branding par ORG — invariant CLAUDE.md (voie unique rpc_create_org), différés tracés"
```

- [ ] **Step 6: Récap final au PO** — ce qui a changé / où / vérifications faites / incertitudes restantes ; rappeler les caveats opérationnels : (a) l'e-mail d'invitation exige que le domaine de redirection soit dans l'allowlist Auth (déjà en place pour /set-password), (b) le thème d'un membre ne change qu'à la prochaine résolution de `get_app_branding` (reload/login), (c) marker styles restent plateforme.

---

## Self-review (fait à l'écriture du plan)

- **Couverture spec** : création (T1-T2), module admin (T4-T5), premier admin (T5), ciblage /team (T6), table+résolution branding (T7-T8), logo per-org (T9), services+UI branding (T10-T11), gouvernance (T7/T9/T11), docs+journal (T12). Hors-périmètre consignés (T12).
- **Types cohérents** : `OrgSummary`/`CreateOrgInput` (T3) consommés par T4/T5/T6 ; `OrgBrandingRaw`/`OrgBrandingSnapshot` (T10) consommés par T11 ; noms de RPCs identiques SQL↔services.
- **Points de vigilance explicités** : classes CSS tableau/input à aligner sur MembersTable/InviteMemberDialog (constat dans le code), code exact du rôle rang 30 vérifié en base avant T5, props exactes de ConfirmDialog, fixtures auth.users à calquer sur test_crm_module.sql.
