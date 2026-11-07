# Suppression définitive d'une fiche — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner aux administrateurs plateforme la possibilité de supprimer **définitivement** une fiche établissement (et ses médias/documents Storage), au-delà de l'archivage.

**Architecture:** On calque la voie RGPD Art. 17 (`api.rpc_gdpr_erase_subject` + `/api/rgpd/erase`). Un RPC `api.rpc_delete_object` (SECURITY DEFINER, superuser-only) fait la suppression relationnelle par `ON DELETE CASCADE`, journalise dans une table immuable, et retourne les URLs Storage. Une route Next.js exécute le RPC *en tant qu'appelant* puis balaie les buckets `media` + `documents` en service-role. L'éditeur expose un outil OUTILS « Supprimer définitivement », superuser-only, actif seulement si la fiche est archivée, derrière une modale de confirmation par saisie du nom.

**Tech Stack:** PostgreSQL (Supabase, schéma `api`), Next.js App Router (route handler), React + TypeScript, Jest, supabase-js.

**Spec:** `docs/superpowers/specs/2026-06-22-object-hard-delete-design.md` (§108).

## Global Constraints

- **Garde superuser** : `api.is_platform_superuser()` — seul gate d'autorisation (pas d'admin d'ORG). Déjà `GRANT EXECUTE … TO authenticated` (rls_policies.sql:1886) ⇒ sondable en RPC PostgREST.
- **Établissements uniquement** : `object_type = 'ORG'` rejeté (`FORBIDDEN_ORG`).
- **Double garde-fou** : statut `archived` requis (`MUST_ARCHIVE_FIRST`) **ET** nom de confirmation exact (`NAME_MISMATCH`), tous deux ré-imposés côté serveur.
- **`gen_random_uuid()`** dans tout corps de fonction à `search_path` restreint (jamais `uuid_generate_v4()`).
- **Documents = `ref_document` partagés** : ne supprimer (ligne + fichier) que les `ref_document` orphelinés par cette suppression (liés à aucun autre objet).
- **Déploiement** : migration autonome **listée dans le runbook** en ordre de dépendance (après `rls_policies.sql`), **non foldée** dans `schema_unified.sql` (la policy référence `api.is_platform_superuser`).
- **Commit** : directement sur `master`, **uniquement vos propres hunks** (le PO édite les fichiers partagés en parallèle via Cursor), **pas de push** (le PO pousse), pas de trailer co-author.
- **Redirection post-suppression** : `router.push('/explorer')` (convention du shell, pas `/objects`).
- **Test runner** : `npm run test:run -- <chemin>` (= `jest`, non-watch). Typecheck : `npm run typecheck`. Build : `npm run build`.

---

### Task 1: Migration SQL — table de journal + RPC `rpc_delete_object` + test behavioral + runbook

**Files:**
- Create: `Base de donnée DLL et API/migration_object_hard_delete.sql`
- Create: `Base de donnée DLL et API/tests/test_object_hard_delete.sql`
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (ajouter l'entrée step 14x en ordre de dépendance, après la migration RGPD / `rls_policies.sql`)

**Interfaces:**
- Produces: `api.rpc_delete_object(p_object_id text, p_confirm_name text) RETURNS jsonb` — retourne `{ object_id, object_name, media_to_delete: text[], documents_to_delete: text[], deleted: true }`. Lève `NO_AUTH_CONTEXT` / `FORBIDDEN` / `NOT_FOUND` / `FORBIDDEN_ORG` / `MUST_ARCHIVE_FIRST` / `NAME_MISMATCH`.
- Produces: table `public.object_deletion_log` (lecture superuser-only).

- [ ] **Step 1: Écrire la migration**

Créer `Base de donnée DLL et API/migration_object_hard_delete.sql` :

```sql
-- migration_object_hard_delete.sql
-- §108 — Suppression définitive d'une fiche (admin-only, irréversible).
-- Superuser-only (api.is_platform_superuser), établissements uniquement (ORG rejeté), la fiche
-- doit être 'archived', confirmation par nom exact. Journal immuable qui survit à la suppression.
-- Calque la voie RGPD Art. 17 (rpc_gdpr_erase_subject + /api/rgpd/erase) : le RPC fait la
-- suppression relationnelle (CASCADE) + journalise + retourne les URLs Storage ; la route
-- supprime les fichiers (media + documents) en service-role.
-- Apply order: APRÈS rls_policies.sql (la policy référence api.is_platform_superuser) — manifest 14x.
-- Idempotent + transactionnel. NON foldé dans schema_unified.sql (cf. spec §4.c).
\set ON_ERROR_STOP on
BEGIN;

-- 1. Journal immuable (calqué sur gdpr_erasure_log). PAS de FK vers object : la ligne doit
--    survivre à la suppression. Écrit UNIQUEMENT par api.rpc_delete_object.
CREATE TABLE IF NOT EXISTS object_deletion_log (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id              TEXT NOT NULL,
  object_name            TEXT,
  object_type            TEXT,
  status_at_deletion     TEXT,
  media_deleted_count    INT  NOT NULL DEFAULT 0,
  document_deleted_count INT  NOT NULL DEFAULT 0,
  performed_by           UUID,
  performed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  report                 JSONB
);

COMMENT ON TABLE object_deletion_log IS
  'Journal immuable des suppressions définitives de fiches (§108). Écrit uniquement par api.rpc_delete_object ; survit à la suppression de l''objet.';

ALTER TABLE object_deletion_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS object_deletion_log_admin_read ON object_deletion_log;
CREATE POLICY object_deletion_log_admin_read ON object_deletion_log
  FOR SELECT
  USING ((SELECT api.is_platform_superuser()));   -- §39 : auth wrappé en InitPlan
REVOKE ALL ON object_deletion_log FROM PUBLIC, anon;
GRANT SELECT ON object_deletion_log TO authenticated;
GRANT ALL    ON object_deletion_log TO service_role;

-- 2. RPC de suppression définitive.
CREATE OR REPLACE FUNCTION api.rpc_delete_object(p_object_id text, p_confirm_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_name    text;
  v_type    text;
  v_status  text;
  v_media   text[];
  v_doc_ids uuid[];
  v_docs    text[];
BEGIN
  -- 0. Contexte d'auth requis.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_CONTEXT: rpc_delete_object requires an authenticated user';
  END IF;

  -- 1. Superuser-only (même garde que l'effacement RGPD).
  IF NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'FORBIDDEN: suppression définitive réservée aux administrateurs plateforme';
  END IF;

  -- 2. Charger l'objet.
  SELECT name, object_type::text, status::text
    INTO v_name, v_type, v_status
    FROM object WHERE id = p_object_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: object % does not exist', p_object_id;
  END IF;

  -- 3. Établissements uniquement — les ORG sont hors périmètre.
  IF v_type = 'ORG' THEN
    RAISE EXCEPTION 'FORBIDDEN_ORG: les organisations ne peuvent pas être supprimées par cet outil';
  END IF;

  -- 4. Garde-fou : la fiche doit d'abord être archivée.
  IF v_status <> 'archived' THEN
    RAISE EXCEPTION 'MUST_ARCHIVE_FIRST: archivez la fiche avant de la supprimer définitivement';
  END IF;

  -- 5. Garde-fou : confirmation par nom exact (défense en profondeur ; l'UI l'exige déjà).
  IF btrim(coalesce(p_confirm_name,'')) <> btrim(coalesce(v_name,'')) THEN
    RAISE EXCEPTION 'NAME_MISMATCH: le nom de confirmation ne correspond pas';
  END IF;

  -- 6. Collecte AVANT suppression : URLs des médias object-keyed (CASCADE les supprimera).
  SELECT coalesce(array_agg(url), '{}'::text[])
    INTO v_media
    FROM media WHERE object_id = p_object_id AND url IS NOT NULL;

  -- 7. Documents = lignes ref_document PARTAGÉES via object_document. On ne retient que les
  --    ref_document qui ne seront plus liés à AUCUN autre objet après cette suppression.
  SELECT coalesce(array_agg(od.document_id), '{}'::uuid[]),
         coalesce(array_agg(rd.url), '{}'::text[])
    INTO v_doc_ids, v_docs
    FROM object_document od
    JOIN ref_document rd ON rd.id = od.document_id
   WHERE od.object_id = p_object_id
     AND NOT EXISTS (
       SELECT 1 FROM object_document od2
        WHERE od2.document_id = od.document_id
          AND od2.object_id <> p_object_id
     );

  -- 8. Journaliser (même transaction que le DELETE).
  INSERT INTO object_deletion_log(
    object_id, object_name, object_type, status_at_deletion,
    media_deleted_count, document_deleted_count, performed_by, report)
  VALUES (
    p_object_id, v_name, v_type, v_status,
    coalesce(array_length(v_media,1),0), coalesce(array_length(v_docs,1),0), v_caller,
    jsonb_build_object('media', to_jsonb(v_media), 'documents', to_jsonb(v_docs)));

  -- 9. Supprimer les ref_document orphelinés (CASCADE retire aussi leur lien object_document).
  IF array_length(v_doc_ids,1) IS NOT NULL THEN
    DELETE FROM ref_document WHERE id = ANY(v_doc_ids);
  END IF;

  -- 10. Supprimer l'objet — CASCADE nettoie tous les enfants object-keyed.
  DELETE FROM object WHERE id = p_object_id;

  -- 11. Retour : URLs Storage à supprimer côté serveur (route, service-role).
  RETURN jsonb_build_object(
    'object_id', p_object_id,
    'object_name', v_name,
    'media_to_delete', to_jsonb(v_media),
    'documents_to_delete', to_jsonb(v_docs),
    'deleted', true);
END;
$$;

REVOKE ALL     ON FUNCTION api.rpc_delete_object(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_delete_object(text, text) TO   authenticated, service_role;

COMMENT ON FUNCTION api.rpc_delete_object(text, text) IS
  'Suppression définitive d''une fiche (§108) : superuser-only, établissements, archived requis, confirmation par nom. Journalise dans object_deletion_log, supprime l''objet (CASCADE) + les ref_document orphelinés, et retourne les URLs Storage (media + documents) à supprimer côté serveur.';

COMMIT;
```

- [ ] **Step 2: Écrire le test behavioral**

Créer `Base de donnée DLL et API/tests/test_object_hard_delete.sql` :

```sql
-- test_object_hard_delete.sql
-- Behavioral test for api.rpc_delete_object (§108). Transactionnel, ROLLBACK final.
-- Run APRÈS le manifest complet INCLUANT migration_object_hard_delete.sql.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org       text := 'ORGRUN9999999971';
  v_obj       text := 'HOTRUN9999999971';
  v_su_uid    uuid := '00000000-0000-4000-a000-0000000000c1';  -- super_admin
  v_plain_uid uuid := '00000000-0000-4000-a000-0000000000c2';  -- tourism_agent (PAS superuser)
  v_pub_role  uuid;
  v_doc_id    uuid := gen_random_uuid();
  v_result    jsonb;
  v_obj_left  int;
  v_media_left int;
  v_link_left int;
  v_doc_left  int;
  v_log_count int;
BEGIN
  -- ---------- Users ----------
  INSERT INTO auth.users (id, email) VALUES
    (v_su_uid,    'hd_superadmin@test.local'),
    (v_plain_uid, 'hd_plain@test.local');
  INSERT INTO app_user_profile (id, role) VALUES
    (v_su_uid, 'super_admin'), (v_plain_uid, 'tourism_agent')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- ---------- Fixture : objet archivé + enfants témoins (cascade) + document orphelin ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher';
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org, 'ORG', 'HardDelete Test Org',   'published'),
    (v_obj, 'HOT', 'HardDelete Test Hotel', 'archived');
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES (v_obj, v_org, v_pub_role);
  INSERT INTO media (object_id, url)
    VALUES (v_obj, 'https://x/storage/v1/object/public/media/'||v_obj||'/a.jpg');
  INSERT INTO ref_document (id, url)
    VALUES (v_doc_id, 'https://x/storage/v1/object/public/documents/'||v_obj||'/d.pdf');
  INSERT INTO object_document (object_id, document_id) VALUES (v_obj, v_doc_id);

  -- ========== 1. Non-superuser => FORBIDDEN ==========
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_plain_uid, 'role','authenticated')::text, true);
  BEGIN
    v_result := api.rpc_delete_object(v_obj, 'HardDelete Test Hotel');
    RAISE EXCEPTION 'GUARD FAILED: non-superuser deleted an object';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('FORBIDDEN' IN SQLERRM) > 0, 'expected FORBIDDEN, got: '||SQLERRM;
  END;

  -- ========== superuser pour la suite ==========
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_su_uid, 'role','authenticated')::text, true);

  -- ========== 2. ORG rejeté ==========
  BEGIN
    v_result := api.rpc_delete_object(v_org, 'HardDelete Test Org');
    RAISE EXCEPTION 'GUARD FAILED: ORG was deleted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('FORBIDDEN_ORG' IN SQLERRM) > 0, 'expected FORBIDDEN_ORG, got: '||SQLERRM;
  END;

  -- ========== 3. nom de confirmation erroné ==========
  BEGIN
    v_result := api.rpc_delete_object(v_obj, 'Wrong Name');
    RAISE EXCEPTION 'GUARD FAILED: name mismatch accepted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('NAME_MISMATCH' IN SQLERRM) > 0, 'expected NAME_MISMATCH, got: '||SQLERRM;
  END;

  -- ========== 4. fiche non archivée bloquée ==========
  UPDATE object SET status = 'published' WHERE id = v_obj;
  BEGIN
    v_result := api.rpc_delete_object(v_obj, 'HardDelete Test Hotel');
    RAISE EXCEPTION 'GUARD FAILED: non-archived deleted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('MUST_ARCHIVE_FIRST' IN SQLERRM) > 0, 'expected MUST_ARCHIVE_FIRST, got: '||SQLERRM;
  END;
  UPDATE object SET status = 'archived' WHERE id = v_obj;

  -- ========== 5. happy path ==========
  v_result := api.rpc_delete_object(v_obj, 'HardDelete Test Hotel');
  ASSERT (v_result->>'deleted')::boolean,                          'expected deleted=true';
  ASSERT jsonb_array_length(v_result->'media_to_delete') = 1,      'expected 1 media url';
  ASSERT jsonb_array_length(v_result->'documents_to_delete') = 1,  'expected 1 document url';

  SELECT count(*) INTO v_obj_left   FROM object          WHERE id = v_obj;        ASSERT v_obj_left   = 0, 'object gone';
  SELECT count(*) INTO v_media_left FROM media           WHERE object_id = v_obj; ASSERT v_media_left = 0, 'media cascade-gone';
  SELECT count(*) INTO v_link_left  FROM object_org_link WHERE object_id = v_obj; ASSERT v_link_left  = 0, 'org_link cascade-gone';
  SELECT count(*) INTO v_doc_left   FROM ref_document    WHERE id = v_doc_id;     ASSERT v_doc_left   = 0, 'orphan ref_document deleted';
  SELECT count(*) INTO v_log_count  FROM object_deletion_log WHERE object_id = v_obj; ASSERT v_log_count = 1, 'one deletion log row';

  RAISE NOTICE 'Object hard-delete assertions passed.';
END$$;

ROLLBACK;
```

- [ ] **Step 3: Appliquer la migration sur la base + lancer le test**

Appliquer via le MCP Supabase (`apply_migration` avec le corps SQL de Step 1), puis exécuter le contenu de `test_object_hard_delete.sql` via `execute_sql` (il `ROLLBACK` à la fin).
Expected : `Object hard-delete assertions passed.` (NOTICE) et **aucune** ERROR. Si une assertion casse, lire le `SQLERRM` renvoyé et corriger le RPC.

- [ ] **Step 4: Vérifier l'absence de régression advisor**

Via le MCP Supabase `get_advisors` (security). Expected : seulement les avis attendus (`0028/0029_*_security_definer_function_executable` sur `rpc_delete_object` — comportement voulu, comme les RPC §36). Aucun nouvel avis ERROR.

- [ ] **Step 5: Inscrire la migration au runbook**

Dans `docs/SQL_ROLLOUT_RUNBOOK.md`, ajouter une ligne **step 14x** dans l'ordre de dépendance (après `rls_policies.sql` / à côté de `migration_gdpr_erasure.sql`), décrivant : « §108 — `migration_object_hard_delete.sql` : `object_deletion_log` + `api.rpc_delete_object` (superuser-only hard delete). Dépend de `rls_policies.sql` (api.is_platform_superuser). Test : `tests/test_object_hard_delete.sql`. » (Conserver la numérotation/format existants du fichier ; ne pas réécrire d'autres lignes.)

- [ ] **Step 6: Commit (vos hunks uniquement)**

```bash
cd "C:/Users/dphil/Bertel3.0"
git add "Base de donnée DLL et API/migration_object_hard_delete.sql" \
        "Base de donnée DLL et API/tests/test_object_hard_delete.sql" \
        "docs/SQL_ROLLOUT_RUNBOOK.md"
git commit -m "feat(sql): rpc_delete_object hard-delete + immutable log (§108)" -- \
  "Base de donnée DLL et API/migration_object_hard_delete.sql" \
  "Base de donnée DLL et API/tests/test_object_hard_delete.sql" \
  "docs/SQL_ROLLOUT_RUNBOOK.md"
```

---

### Task 2: API route `POST /api/objects/delete`

**Files:**
- Create: `bertel-tourism-ui/src/app/api/objects/delete/route.ts`
- Test: `bertel-tourism-ui/src/app/api/objects/delete/route.test.ts`

**Interfaces:**
- Consumes: `api.rpc_delete_object(p_object_id, p_confirm_name)` (Task 1).
- Produces: `POST /api/objects/delete` body `{ objectId: string, confirmName: string }` → `{ ok, report, mediaDeleted: string[], documentsDeleted: string[], storageError: string|null }`. 401 sans JWT, 403 sur garde superuser, 400 sur les autres erreurs RPC.

- [ ] **Step 1: Écrire le test du handler**

Créer `bertel-tourism-ui/src/app/api/objects/delete/route.test.ts` :

```ts
import { POST } from './route';

// Mock the server supabase client + supabase-js createClient used inside the route.
const removeMock = jest.fn().mockResolvedValue({ error: null });
const getUserMock = jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
const rpcMock = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  getServerSupabaseClient: () => ({
    auth: { getUser: getUserMock },
    storage: { from: () => ({ remove: removeMock }) },
  }),
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ schema: () => ({ rpc: rpcMock }) }),
}));

function req(body: unknown, auth = 'Bearer jwt-123'): any {
  return { headers: { get: (k: string) => (k === 'authorization' ? auth : null) }, json: async () => body };
}

describe('POST /api/objects/delete', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('401 when no bearer token', async () => {
    const res = await POST(req({ objectId: 'o1', confirmName: 'X' }, ''));
    expect(res.status).toBe(401);
  });

  it('400 when objectId is missing', async () => {
    const res = await POST(req({ confirmName: 'X' }));
    expect(res.status).toBe(400);
  });

  it('deletes then sweeps both buckets, returns the report', async () => {
    rpcMock.mockResolvedValue({
      data: {
        object_id: 'HOTRUN0000000001', object_name: 'Hôtel X', deleted: true,
        media_to_delete: ['https://x/storage/v1/object/public/media/HOTRUN0000000001/a.jpg'],
        documents_to_delete: ['https://x/storage/v1/object/public/documents/HOTRUN0000000001/d.pdf'],
      },
      error: null,
    });
    const res = await POST(req({ objectId: 'HOTRUN0000000001', confirmName: 'Hôtel X' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.mediaDeleted).toEqual(['HOTRUN0000000001/a.jpg']);
    expect(json.documentsDeleted).toEqual(['HOTRUN0000000001/d.pdf']);
    expect(removeMock).toHaveBeenCalledTimes(2); // media bucket + documents bucket
  });

  it('maps the superuser gate to 403', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'FORBIDDEN: suppression définitive réservée aux administrateurs plateforme' } });
    const res = await POST(req({ objectId: 'o1', confirmName: 'X' }));
    expect(res.status).toBe(403);
  });

  it('maps MUST_ARCHIVE_FIRST to 400', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'MUST_ARCHIVE_FIRST: archivez la fiche...' } });
    const res = await POST(req({ objectId: 'o1', confirmName: 'X' }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `cd bertel-tourism-ui && npm run test:run -- src/app/api/objects/delete/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Écrire le handler**

Créer `bertel-tourism-ui/src/app/api/objects/delete/route.ts` :

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

// §108 — Suppression définitive d'une fiche (admin-only). Orchestration (calque /api/rgpd/erase) :
//   1. exécuter api.rpc_delete_object EN TANT QU'APPELANT → la garde superuser
//      (api.is_platform_superuser) s'applique côté serveur ; la suppression relationnelle = CASCADE.
//   2. avec la clé service-role, supprimer les fichiers Storage rapportés (media + documents) — ils
//      n'ont pas de FK cascade et resteraient orphelins sinon.

const MEDIA_BUCKET = 'media';
const DOCUMENTS_BUCKET = 'documents';

interface DeleteReport {
  media_to_delete?: string[];
  documents_to_delete?: string[];
  [key: string]: unknown;
}

/** Extrait le chemin in-bucket d'une URL publique Supabase ; null si l'URL est externe. */
function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length).split('?')[0];
  try { return decodeURIComponent(path); } catch { return path; }
}

async function sweepBucket(
  server: SupabaseClient,
  bucket: string,
  urls: unknown,
): Promise<{ deleted: string[]; error: string | null }> {
  const paths = (Array.isArray(urls) ? urls : [])
    .map((u) => (typeof u === 'string' ? storagePathFromPublicUrl(u, bucket) : null))
    .filter((p): p is string => p !== null);
  if (paths.length === 0) return { deleted: [], error: null };
  const { error } = await server.storage.from(bucket).remove(paths);
  return error ? { deleted: [], error: error.message } : { deleted: paths, error: null };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) {
    return NextResponse.json(
      { error: 'server_misconfigured', detail: 'SUPABASE_SERVICE_ROLE_KEY missing' },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!jwt) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: userData, error: userErr } = await server.auth.getUser(jwt);
  if (userErr || !userData?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const b = (body ?? {}) as Record<string, unknown>;
  const objectId = b.objectId;
  const confirmName = b.confirmName;
  if (typeof objectId !== 'string' || objectId.trim().length === 0) {
    return NextResponse.json({ error: 'missing_object_id' }, { status: 400 });
  }
  if (typeof confirmName !== 'string' || confirmName.length === 0) {
    return NextResponse.json({ error: 'missing_confirm_name' }, { status: 400 });
  }

  // Step 1 — supprimer EN TANT QU'APPELANT (la garde superuser du RPC s'applique côté serveur).
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: rpcData, error: rpcErr } = await asCaller
    .schema('api')
    .rpc('rpc_delete_object', { p_object_id: objectId, p_confirm_name: confirmName });
  if (rpcErr) {
    const msg = rpcErr.message ?? 'delete_failed';
    // 'FORBIDDEN:' = garde superuser → 403. 'FORBIDDEN_ORG:' / MUST_ARCHIVE_FIRST / NAME_MISMATCH / NOT_FOUND → 400.
    const forbidden = /FORBIDDEN:|administrateurs plateforme/i.test(msg);
    return NextResponse.json({ error: 'delete_failed', detail: msg }, { status: forbidden ? 403 : 400 });
  }

  const report = (rpcData ?? {}) as DeleteReport;

  // Step 2 — balayer le Storage (service-role) sur les deux buckets.
  const media = await sweepBucket(server, MEDIA_BUCKET, report.media_to_delete);
  const docs = await sweepBucket(server, DOCUMENTS_BUCKET, report.documents_to_delete);

  return NextResponse.json(
    {
      ok: true,
      report,
      mediaDeleted: media.deleted,
      documentsDeleted: docs.deleted,
      storageError: media.error ?? docs.error,
    },
    { status: 200 },
  );
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `cd bertel-tourism-ui && npm run test:run -- src/app/api/objects/delete/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui"
git add src/app/api/objects/delete/route.ts src/app/api/objects/delete/route.test.ts
git commit -m "feat(api): POST /api/objects/delete — hard-delete + storage sweep (§108)" -- \
  src/app/api/objects/delete/route.ts src/app/api/objects/delete/route.test.ts
```

---

### Task 3: Client service `requestObjectDeletion`

**Files:**
- Create: `bertel-tourism-ui/src/services/object-delete.ts`
- Test: `bertel-tourism-ui/src/services/object-delete.test.ts`

**Interfaces:**
- Consumes: `POST /api/objects/delete` (Task 2).
- Produces: `requestObjectDeletion({ objectId, confirmName, accessToken }): Promise<DeleteObjectResult>` ; jette `Error(detail)` sur réponse non-ok.

- [ ] **Step 1: Écrire le test** (miroir de `services/rgpd.test.ts`)

Créer `bertel-tourism-ui/src/services/object-delete.test.ts` :

```ts
import { requestObjectDeletion } from './object-delete';

describe('requestObjectDeletion', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; jest.restoreAllMocks(); });

  it('POSTs to /api/objects/delete with bearer token and JSON body', async () => {
    const json = jest.fn().mockResolvedValue({
      ok: true, report: { object_id: 'o1' }, mediaDeleted: [], documentsDeleted: [], storageError: null,
    });
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await requestObjectDeletion({ objectId: 'o1', confirmName: 'Hôtel X', accessToken: 'jwt-123' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/objects/delete');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-123');
    expect(JSON.parse(init.body as string)).toEqual({ objectId: 'o1', confirmName: 'Hôtel X' });
    expect(res.report).toEqual({ object_id: 'o1' });
  });

  it('throws the server detail on a non-ok response (e.g. 403 gate)', async () => {
    const json = jest.fn().mockResolvedValue({ error: 'delete_failed', detail: 'réservée aux administrateurs plateforme' });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, json }) as unknown as typeof fetch;
    await expect(
      requestObjectDeletion({ objectId: 'o1', confirmName: 'X', accessToken: 't' }),
    ).rejects.toThrow('administrateurs');
  });
});
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `cd bertel-tourism-ui && npm run test:run -- src/services/object-delete.test.ts`
Expected: FAIL — `Cannot find module './object-delete'`.

- [ ] **Step 3: Écrire le service** (miroir de `services/rgpd.ts`)

Créer `bertel-tourism-ui/src/services/object-delete.ts` :

```ts
// §108 — client service. POST /api/objects/delete : exécute le RPC de suppression définitive
// en tant qu'appelant (superuser-gated) puis balaie les buckets media + documents.

export interface DeleteObjectInput {
  objectId: string;
  confirmName: string;
  accessToken: string;
}

export interface DeleteObjectResult {
  ok: boolean;
  report: Record<string, unknown>;
  mediaDeleted: string[];
  documentsDeleted: string[];
  storageError: string | null;
}

export async function requestObjectDeletion(input: DeleteObjectInput): Promise<DeleteObjectResult> {
  const response = await fetch('/api/objects/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.accessToken}` },
    body: JSON.stringify({ objectId: input.objectId, confirmName: input.confirmName }),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string; error?: string };
      detail = payload.detail ?? payload.error ?? detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }

  return (await response.json()) as DeleteObjectResult;
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `cd bertel-tourism-ui && npm run test:run -- src/services/object-delete.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui"
git add src/services/object-delete.ts src/services/object-delete.test.ts
git commit -m "feat(services): requestObjectDeletion client (§108)" -- \
  src/services/object-delete.ts src/services/object-delete.test.ts
```

---

### Task 4: Outil OUTILS « Supprimer définitivement » dans `editor-tools.ts`

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/shell/editor-tools.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/shell/editor-tools.test.ts`

**Interfaces:**
- Produces: `EditorToolKey` gagne `'delete'` ; `BuildEditorToolsInput` gagne `canHardDelete?: boolean`. L'outil `delete` n'apparaît que si `canHardDelete` ; `disabled` + raison tant que `status !== 'archived'` ; `danger: true` ; label `'Supprimer définitivement'`.

- [ ] **Step 1: Ajouter les tests** (à la fin du `describe('buildEditorTools', …)` existant)

Dans `editor-tools.test.ts`, ajouter :

```ts
  it('omits the delete tool when canHardDelete is falsy (default)', () => {
    const keys = buildEditorTools(base).map((t) => t.key);
    expect(keys).not.toContain('delete');
  });

  it('appends a danger delete tool for a superuser', () => {
    const tools = buildEditorTools({ status: 'archived', canArchive: true, canHardDelete: true });
    const del = tools.find((t) => t.key === 'delete')!;
    expect(del.label).toBe('Supprimer définitivement');
    expect(del.danger).toBe(true);
    expect(del.disabled).toBe(false);
    expect(tools[tools.length - 1].key).toBe('delete'); // dernier
  });

  it('disables the delete tool with an "archivez d’abord" reason when not archived', () => {
    const del = buildEditorTools({ status: 'published', canArchive: true, canHardDelete: true })
      .find((t) => t.key === 'delete')!;
    expect(del.disabled).toBe(true);
    expect(del.disabledReason).toMatch(/archivez/i);
  });
```

- [ ] **Step 2: Lancer les tests (échec attendu)**

Run: `cd bertel-tourism-ui && npm run test:run -- src/features/object-editor/shell/editor-tools.test.ts`
Expected: FAIL — le tool `delete` n'existe pas encore.

- [ ] **Step 3: Implémenter le tool**

Dans `editor-tools.ts` : élargir le type, l'input, et appender l'outil.

Remplacer la 1re ligne :
```ts
export type EditorToolKey = 'versions' | 'import-export' | 'archive';
```
par :
```ts
export type EditorToolKey = 'versions' | 'import-export' | 'archive' | 'delete';
```

Ajouter à `BuildEditorToolsInput` (après `currentVersion`) :
```ts
  /** §108: hard delete (superuser-only). When falsy the delete tool is omitted entirely. */
  canHardDelete?: boolean;
```

Dans `buildEditorTools`, remplacer le `return [ … ];` par une liste mutable suivie de l'append conditionnel :
```ts
export function buildEditorTools(input: BuildEditorToolsInput): EditorToolItem[] {
  const isArchived = input.status === 'archived';
  const tools: EditorToolItem[] = [
    {
      key: 'versions',
      label: 'Versions / historique',
      disabled: input.currentVersion == null,
      disabledReason: input.currentVersion == null ? SOON : undefined,
      stat: input.currentVersion == null ? undefined : `v${input.currentVersion}`,
    },
    // Tranche E — frontend-only tool (JSON/CSV/PDF export + JSON import onto the draft); no gate.
    { key: 'import-export', label: 'Import / export', disabled: false },
    {
      key: 'archive',
      label: isArchived ? 'Restaurer' : 'Archiver',
      danger: !isArchived,
      disabled: !input.canArchive,
      disabledReason: input.canArchive ? undefined : (input.archiveDisabledReason ?? 'Lecture seule — publication.'),
    },
  ];
  // §108 — suppression définitive : superuser-only, et seulement sur une fiche déjà archivée.
  if (input.canHardDelete) {
    tools.push({
      key: 'delete',
      label: 'Supprimer définitivement',
      danger: true,
      disabled: !isArchived,
      disabledReason: isArchived
        ? undefined
        : 'Archivez d’abord la fiche avant de pouvoir la supprimer définitivement.',
    });
  }
  return tools;
}
```

- [ ] **Step 4: Lancer les tests (succès attendu)**

Run: `cd bertel-tourism-ui && npm run test:run -- src/features/object-editor/shell/editor-tools.test.ts`
Expected: PASS (les anciens tests + 3 nouveaux). Le test existant « lists exactly the three tools » reste vert (pas de `canHardDelete` ⇒ pas de delete).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui"
git add src/features/object-editor/shell/editor-tools.ts src/features/object-editor/shell/editor-tools.test.ts
git commit -m "feat(editor): OUTILS 'Supprimer définitivement' tool (superuser, archived-only) (§108)" -- \
  src/features/object-editor/shell/editor-tools.ts src/features/object-editor/shell/editor-tools.test.ts
```

---

### Task 5: Permission `delete` dans `getObjectWorkspacePermissions`

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace.ts` (interface + builder)
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/section-fixture.test-utils.ts` (fixture des permissions)

**Interfaces:**
- Produces: `ObjectWorkspacePermissions.delete: ObjectWorkspaceModuleAccess` ; `canDirectWrite = directWrite || (api.is_platform_superuser === true)`.

- [ ] **Step 1: Étendre l'interface**

Dans `object-workspace.ts`, interface `ObjectWorkspacePermissions` (après `syncIdentifiers: ObjectWorkspaceModuleAccess;`), ajouter :
```ts
  /** §108 — suppression définitive : superuser plateforme uniquement. */
  delete: ObjectWorkspaceModuleAccess;
```

- [ ] **Step 2: Sonder `is_platform_superuser` + calculer le flag**

Dans `getObjectWorkspacePermissions` :

(a) Après `let isOrgAdmin = directWrite;`, ajouter :
```ts
  let isPlatformSuperuser = directWrite;
```

(b) Dans le `Promise.allSettled([... ])`, ajouter un 8e appel à la fin du tableau :
```ts
        // §108 : garde de suppression définitive (mirroir exact de api.rpc_delete_object).
        apiClient.schema('api').rpc('is_platform_superuser'),
```
et l'ajouter à la déstructuration : `[..., orgAdminResult, superuserResult] = await Promise.allSettled([...]);`

(c) Après le calcul de `isOrgAdmin = …`, ajouter :
```ts
      isPlatformSuperuser =
        directWrite
        || (superuserResult.status === 'fulfilled' && superuserResult.value.error == null && superuserResult.value.data === true);
```

(d) Dans le `catch { … }`, ajouter `isPlatformSuperuser = directWrite;`.

- [ ] **Step 3: Retourner le module `delete`**

Dans l'objet retourné par `getObjectWorkspacePermissions` (à côté de `syncIdentifiers: { … }`), ajouter :
```ts
    delete: {
      canDirectWrite: isPlatformSuperuser,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: isPlatformSuperuser
        ? null
        : 'Réservé aux administrateurs plateforme — la suppression définitive est limitée au superadmin.',
    },
```

- [ ] **Step 4: Mettre à jour la fixture de tests**

Dans `section-fixture.test-utils.ts`, là où un objet `ObjectWorkspacePermissions` complet est construit (le helper qui fournit `publication`/`syncIdentifiers`/…), ajouter la clé :
```ts
    delete: { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: null },
```
(Garder la valeur par défaut `false` — la plupart des tests ne sont pas superuser.)

- [ ] **Step 5: Typecheck — repérer tout autre littéral de permissions à compléter**

Run: `cd bertel-tourism-ui && npm run typecheck`
Expected: PASS. Si `tsc` signale d'autres objets `ObjectWorkspacePermissions` incomplets (clé `delete` manquante), ajouter la même valeur par défaut `false` à chacun. Re-lancer jusqu'au vert.

- [ ] **Step 6: Lancer la suite de tests du service + fixtures**

Run: `cd bertel-tourism-ui && npm run test:run -- src/services/object-workspace`
Expected: PASS (aucune régression).

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui"
git add src/services/object-workspace.ts src/features/object-editor/sections/section-fixture.test-utils.ts
git commit -m "feat(editor): expose delete permission via is_platform_superuser probe (§108)" -- \
  src/services/object-workspace.ts src/features/object-editor/sections/section-fixture.test-utils.ts
```

> Si Step 5 a touché d'autres fichiers, les ajouter explicitement au même commit (uniquement vos hunks).

---

### Task 6: `DeleteObjectModal` (confirmation par saisie du nom)

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/widgets/DeleteObjectModal.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/widgets/DeleteObjectModal.test.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/object-editor.css` (ajouter `.delete-modal__warning` / `.delete-modal__error` en fin de fichier)

**Interfaces:**
- Consumes: `requestObjectDeletion` (Task 3), primitives `Dialog*` + `Field`/`Input`.
- Produces: `DeleteObjectModal({ open, objectId, objectName, accessToken, onClose, onDeleted })` + helper pur `deleteConfirmEnabled(typed, name): boolean`.

- [ ] **Step 1: Écrire le test**

Créer `bertel-tourism-ui/src/features/object-editor/widgets/DeleteObjectModal.test.tsx` :

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeleteObjectModal, deleteConfirmEnabled } from './DeleteObjectModal';

jest.mock('../../../services/object-delete', () => ({
  requestObjectDeletion: jest.fn().mockResolvedValue({ ok: true, report: {}, mediaDeleted: [], documentsDeleted: [], storageError: null }),
}));
import { requestObjectDeletion } from '../../../services/object-delete';

describe('deleteConfirmEnabled', () => {
  it('is false until the typed text matches the name (trimmed)', () => {
    expect(deleteConfirmEnabled('', 'Hôtel X')).toBe(false);
    expect(deleteConfirmEnabled('Hotel X', 'Hôtel X')).toBe(false);
    expect(deleteConfirmEnabled('  Hôtel X  ', 'Hôtel X')).toBe(true);
  });
});

describe('DeleteObjectModal', () => {
  const baseProps = {
    open: true, objectId: 'HOTRUN0000000001', objectName: 'Hôtel X',
    accessToken: 'jwt-123', onClose: jest.fn(), onDeleted: jest.fn(),
  };
  beforeEach(() => jest.clearAllMocks());

  it('keeps the destructive button disabled until the name matches', () => {
    render(<DeleteObjectModal {...baseProps} />);
    const btn = screen.getByRole('button', { name: /supprimer définitivement/i });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/nom de confirmation/i), { target: { value: 'Hôtel X' } });
    expect(btn).toBeEnabled();
  });

  it('calls requestObjectDeletion then onDeleted on confirm', async () => {
    const onDeleted = jest.fn();
    render(<DeleteObjectModal {...baseProps} onDeleted={onDeleted} />);
    fireEvent.change(screen.getByLabelText(/nom de confirmation/i), { target: { value: 'Hôtel X' } });
    fireEvent.click(screen.getByRole('button', { name: /supprimer définitivement/i }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(requestObjectDeletion).toHaveBeenCalledWith({ objectId: 'HOTRUN0000000001', confirmName: 'Hôtel X', accessToken: 'jwt-123' });
  });
});
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `cd bertel-tourism-ui && npm run test:run -- src/features/object-editor/widgets/DeleteObjectModal.test.tsx`
Expected: FAIL — `Cannot find module './DeleteObjectModal'`.

- [ ] **Step 3: Écrire la modale**

Créer `bertel-tourism-ui/src/features/object-editor/widgets/DeleteObjectModal.tsx` :

```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';
import { Field, Input } from '../primitives';
import { requestObjectDeletion } from '../../../services/object-delete';

/** Pure : le bouton destructeur n'est actif que si le texte saisi == nom de la fiche (trim, non vide). */
export function deleteConfirmEnabled(typed: string, name: string): boolean {
  const t = typed.trim();
  return t.length > 0 && t === name.trim();
}

interface DeleteObjectModalProps {
  open: boolean;
  objectId: string;
  objectName: string;
  accessToken: string | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteObjectModal({ open, objectId, objectName, accessToken, onClose, onDeleted }: DeleteObjectModalProps) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canConfirm = deleteConfirmEnabled(typed, objectName) && !!accessToken && !pending;

  function reset() { setTyped(''); setError(null); setPending(false); }
  function handleClose() { reset(); onClose(); }

  async function handleConfirm() {
    if (!accessToken) { setError('Session expirée — reconnectez-vous.'); return; }
    setPending(true);
    setError(null);
    try {
      await requestObjectDeletion({ objectId, confirmName: typed.trim(), accessToken });
      reset();
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suppression impossible.');
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) handleClose(); }}>
      <DialogContent className="object-editor">
        <DialogHeader>
          <DialogTitle>Supprimer définitivement la fiche</DialogTitle>
        </DialogHeader>
        <div className="ed-modal__body">
          <p className="delete-modal__warning">
            Cette action est <strong>irréversible</strong>. La fiche «&nbsp;{objectName}&nbsp;» et toutes ses données
            associées seront définitivement supprimées : photos et vidéos, descriptions, relations entrantes et
            sortantes, tarifs, périodes d’ouverture, documents… Aucune restauration n’est possible.
          </p>
          <Field label="Pour confirmer, saisissez le nom exact de la fiche" required>
            <Input
              value={typed}
              placeholder={objectName}
              aria-label="Nom de confirmation"
              onChange={(value) => setTyped(value)}
            />
          </Field>
          {error && <p className="delete-modal__error" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <button type="button" className="btn" onClick={handleClose}>Annuler</button>
          <button type="button" className="btn danger" disabled={!canConfirm} onClick={() => void handleConfirm()}>
            {pending ? 'Suppression…' : 'Supprimer définitivement'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Ajouter le style (fin de `object-editor.css`, hunk isolé)**

Ajouter à la fin de `object-editor.css` :
```css
/* §108 — modale de suppression définitive */
.delete-modal__warning { color: var(--text, #1f2937); line-height: 1.5; margin-bottom: 1rem; }
.delete-modal__error { color: var(--danger, #b91c1c); margin-top: 0.75rem; font-size: 0.875rem; }
```
> ⚠️ `object-editor.css` est co-édité par le PO via Cursor. Ne committer QUE ce hunk (cf. recette « commit own hunks » de la mémoire). Vérifier le `git diff` avant de stager.

- [ ] **Step 5: Lancer le test (succès attendu)**

Run: `cd bertel-tourism-ui && npm run test:run -- src/features/object-editor/widgets/DeleteObjectModal.test.tsx`
Expected: PASS (3 tests). Si `Input`/`Field` ne propagent pas `aria-label` jusqu'à un input querable par `getByLabelText`, vérifier la primitive `Input` (elle accepte `aria-label` — cf. usage dans `LegalDocumentEditModal`).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui"
git add src/features/object-editor/widgets/DeleteObjectModal.tsx \
        src/features/object-editor/widgets/DeleteObjectModal.test.tsx
git diff --staged --stat   # vérifier qu'object-editor.css n'embarque pas de hunk PO
git add src/features/object-editor/object-editor.css
git commit -m "feat(editor): DeleteObjectModal — type-the-name confirmation (§108)" -- \
  src/features/object-editor/widgets/DeleteObjectModal.tsx \
  src/features/object-editor/widgets/DeleteObjectModal.test.tsx \
  src/features/object-editor/object-editor.css
```

---

### Task 7: Câbler l'outil + la modale dans `ObjectEditPage`

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx`

**Interfaces:**
- Consumes: `buildEditorTools` (Task 4, `canHardDelete`), `resource.permissions.delete` (Task 5), `DeleteObjectModal` (Task 6).

- [ ] **Step 1: Imports**

Ajouter en tête (près des autres imports widgets) :
```ts
import { DeleteObjectModal } from './widgets/DeleteObjectModal';
import { getApiClient } from '../../lib/supabase';
```
(`getApiClient` est exporté par `src/lib/supabase.ts` — `export const getApiClient = getSupabaseClient`.)

- [ ] **Step 2: State + récupération du token**

Près des autres `useState` du composant, ajouter :
```ts
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
```
Et un effet (près des autres `useEffect`) :
```ts
  useEffect(() => {
    const client = getApiClient();
    if (!client) return;
    void client.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
  }, []);
```

- [ ] **Step 3: Passer `canHardDelete` au memo des outils**

Dans le `useMemo` `editorTools`, ajouter le champ et la dépendance :
```ts
  const editorTools = useMemo(
    () =>
      buildEditorTools({
        status: lifecycleStatus,
        canArchive: resource.permissions.publication.canDirectWrite,
        archiveDisabledReason: resource.permissions.publication.disabledReason,
        currentVersion,
        canHardDelete: resource.permissions.delete.canDirectWrite,
      }),
    [lifecycleStatus, resource.permissions.publication.canDirectWrite, resource.permissions.publication.disabledReason, currentVersion, resource.permissions.delete.canDirectWrite],
  );
```

- [ ] **Step 4: Dispatch + handler de suppression**

Dans `handleToolSelect`, ajouter une branche :
```ts
    } else if (key === 'delete') {
      setDeleteModalOpen(true);
    }
```
Et ajouter le handler (près de `handleArchiveConfirm`) :
```ts
  function handleObjectDeleted() {
    setDeleteModalOpen(false);
    router.push('/explorer');
  }
```

- [ ] **Step 5: Rendre la modale**

Dans le JSX, après le `<ConfirmDialog … />` d'archivage (ou à côté des autres modales en bas), ajouter :
```tsx
      <DeleteObjectModal
        open={deleteModalOpen}
        objectId={objectId}
        objectName={resource.name}
        accessToken={accessToken}
        onClose={() => setDeleteModalOpen(false)}
        onDeleted={handleObjectDeleted}
      />
```

- [ ] **Step 6: Vérifier — typecheck + suites éditeur + build**

Run: `cd bertel-tourism-ui && npm run typecheck`
Expected: PASS.

Run: `cd bertel-tourism-ui && npm run test:run -- src/features/object-editor`
Expected: PASS (toutes les suites éditeur, incl. `ObjectEditPage` si elle a un test).

Run: `cd bertel-tourism-ui && npm run build`
Expected: build exit 0.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/dphil/Bertel3.0/bertel-tourism-ui"
git diff --stat   # ObjectEditPage.tsx doit être le seul fichier modifié de cette tâche
git add src/features/object-editor/ObjectEditPage.tsx
git commit -m "feat(editor): wire hard-delete tool + modal into the editor shell (§108)" -- \
  src/features/object-editor/ObjectEditPage.tsx
```

---

### Task 8: Vérification de bout en bout + documentation

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (ajouter §108)
- (Proposer) Modify: `CLAUDE.md` (nouvel invariant — voir Step 3 ; CLAUDE.md est local/gitignored, à proposer au PO)

- [ ] **Step 1: Suite complète + build**

Run: `cd bertel-tourism-ui && npm run test:run`
Expected: PASS (toutes les suites ; +5 route, +2 service, +3 editor-tools, +3 modal ≈ +13 tests).

Run: `cd bertel-tourism-ui && npm run typecheck && npm run build`
Expected: typecheck PASS, build exit 0.

- [ ] **Step 2: Smoke manuel (optionnel mais recommandé)**

Dans l'app lancée (preview), en tant que superadmin : ouvrir une fiche **archivée** → OUTILS → « Supprimer définitivement » → la modale exige le nom exact → confirmer → redirection vers l'Explorer, fiche disparue. Vérifier (MCP `execute_sql`) qu'une ligne existe dans `object_deletion_log` et que la fiche + ses médias sont absents. Sur une fiche **non archivée** : l'outil est désactivé avec la raison « Archivez d’abord… ». En tant que non-superadmin : l'outil est absent.

- [ ] **Step 3: Journal de décision §108**

Ajouter une section `## §108 — Suppression définitive d'une fiche (admin-only)` à `lot1_mapping_decisions.md` : garde superuser, établissements only, archived + nom requis, `object_deletion_log`, route `/api/objects/delete` (sweep media + documents), nettoyage ciblé des `ref_document` orphelinés, manifest 14x (runbook, non foldé). Proposer au PO l'invariant CLAUDE.md : « Toute suppression définitive d'objet passe par `api.rpc_delete_object` (superuser-only, établissements, archived requis, confirmation par nom) + `/api/objects/delete` ; jamais un `DELETE FROM object` direct. »

- [ ] **Step 4: Commit doc**

```bash
cd "C:/Users/dphil/Bertel3.0"
git add bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md
git commit -m "docs(decision): §108 object hard-delete" -- \
  bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md
```

---

## Notes pour l'exécutant

- **Ordre** : Task 1 (SQL) d'abord — les tâches frontend en dépendent fonctionnellement mais pas pour compiler. Tasks 2→7 séquentielles (Task 7 dépend de 4/5/6). Task 8 en clôture.
- **Fichiers partagés** (`object-editor.css`, et potentiellement `object-workspace.ts` / `ObjectEditPage.tsx` édités par le PO via Cursor) : toujours `git diff` avant de stager, committer **uniquement vos hunks** par chemin explicite, **ne pas pousser**.
- **SQL** : l'environnement local n'a ni psql ni supabase-CLI — appliquer/tester via le MCP Supabase (`apply_migration` / `execute_sql`).
- **Pas de mock de données** : les tests RPC tournent sur la vraie base (transactionnels, ROLLBACK).
