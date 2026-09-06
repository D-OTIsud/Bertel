# Permissions par rôle métier (par ORG) — plan d'implémentation

> Chantier §227 (provisoire — re-grep `^## §` dans `claude_brief/lot1_mapping_decisions.md` avant de figer le numéro).
> Origine : incident du 2026-08-31 — 12 permissions accordées à l'ORG entière, héritées par les 3 Lecteurs.

**But :** le rôle métier (Lecteur / Contributeur / Éditeur) **porte** les droits, réglables par ORG,
au lieu d'être une étiquette sans effet doublée d'une couche ORG aveugle au rôle.

**Architecture :** on passe de 3 couches d'octroi à 2.
- On **ajoute** `org_role_permission` (ORG × rôle × permission) et un 3ᵉ chemin dans `api.user_has_permission()`.
- On **retire** la couche ORG (`org_permission`, chemin 2) — c'est celle qui a causé l'incident : elle
  accorde à tout le monde sans regarder le rôle.
- On **garde** `user_permission` en exceptions additives.

`api.user_has_permission()` est le point de passage unique : **13 fonctions** en dépendent
(`user_can_write_crm`, `user_can_publish_object`, `user_can_write_canonical`, …) et **aucune policy RLS
ne l'appelle directement**. Modifier cette seule fonction propage partout — c'est ce qui rend le
chantier tenable.

**Stack :** PostgreSQL/Supabase (migration SQL + RPC SECURITY DEFINER), Next.js/React, Jest + RTL.

## Contraintes globales

- Migration idempotente (`IF NOT EXISTS`, `ON CONFLICT`) — la CI rejoue tout à blanc (`ci_fresh_apply.sql`).
- Tout fichier `migration_*.sql` s'accompagne d'une entrée de manifeste + runbook (`docs/SQL_ROLLOUT_RUNBOOK.md`)
  et d'un script de rollback dans `Base de donnée DLL et API/rollback/`.
- Vocabulaire UI en français, jamais le code brut (`businessRoleLabel`).
- Aucune permission n'est jamais accordée en masse sans confirmation nommant les membres impactés.
- Rang ≥ 30 (`org_admin`) requis pour écrire la matrice, comme pour les autres écritures de permission.
- Commits conventionnels, un par incrément vérifié, pas de trailer `Co-Authored-By`.

## Ce qui existe (relevé live du 2026-08-31)

| Table | Rôle actuel |
|---|---|
| `ref_permission` | 12 permissions actives, 5 catégories (content 7, crm 1, media 2, team 1, legal 1) |
| `ref_org_business_role` | `viewer`, `contributor`, `editor` (colonnes : id, code, name, description, position) |
| `user_org_business_role` | membership_id, role_id, is_active — le rôle d'un membre |
| `user_permission` | user_id, permission_id, is_active — chemin 1 |
| `org_permission` | org_object_id (text), permission_id, is_active — chemin 2, **à retirer** |

Préréglages documentés (source : `bertel-tourism-ui/src/features/team/permission-presets.ts`) :
- `viewer` : aucune
- `contributor` (7) : `create_object`, `edit_canonical_when_publisher`, `edit_org_enrichment`,
  `edit_hours`, `edit_pricing`, `edit_gallery`, `attach_documents`
- `editor` (12) : les 7 ci-dessus + `publish_object`, `validate_changes`, `manage_team_messages`,
  `manage_legal_compliance`, `write_crm_notes`

## Structure des fichiers

**Créer**
- `Base de donnée DLL et API/migration_role_permission_matrix.sql` — table, seed, chemin 3, RPC, retrait du chemin 2
- `Base de donnée DLL et API/rollback/rollback_role_permission_matrix.sql`
- `Base de donnée DLL et API/migration_role_permission_cleanup.sql` — désactivation des `user_permission` redondants
- `Base de donnée DLL et API/rollback/rollback_role_permission_cleanup.sql`
- `bertel-tourism-ui/src/features/team/OrgRolePermissionsModal.tsx` — la matrice
- `bertel-tourism-ui/src/features/team/OrgRolePermissionsModal.test.tsx`
- `bertel-tourism-ui/src/features/team/role-permission-matrix.ts` — logique pure (diff, impact)
- `bertel-tourism-ui/src/features/team/role-permission-matrix.test.ts`

**Modifier**
- `bertel-tourism-ui/src/services/rbac.ts` — service matrice, retrait des fns ORG
- `bertel-tourism-ui/src/features/team/MemberPermissionsDrawer.tsx` — retrait du bloc ORG, ajout du résumé de rôle
- `bertel-tourism-ui/src/features/team/MembersTable.tsx` — compteur = union(individuel, rôle)
- `bertel-tourism-ui/src/views/TeamAdminPage.tsx` — bouton d'ouverture de la matrice
- `bertel-tourism-ui/src/features/team/permission-presets.ts` — les préréglages viennent de la base
- `docs/SQL_ROLLOUT_RUNBOOK.md`

---

### Tâche 1 : table `org_role_permission` + seed

**Fichiers**
- Créer : `Base de donnée DLL et API/migration_role_permission_matrix.sql`
- Créer : `Base de donnée DLL et API/rollback/rollback_role_permission_matrix.sql`

**Interfaces**
- Produit : table `public.org_role_permission (id, org_object_id text, role_id uuid, permission_id uuid, is_active bool, granted_by uuid, granted_at, created_at, updated_at)`, contrainte unique `(org_object_id, role_id, permission_id)`.

- [ ] **Étape 1 : écrire la DDL + le seed**

```sql
CREATE TABLE IF NOT EXISTS public.org_role_permission (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_object_id text NOT NULL REFERENCES public.object(id) ON DELETE CASCADE,
  role_id       uuid NOT NULL REFERENCES public.ref_org_business_role(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.ref_permission(id) ON DELETE CASCADE,
  is_active     boolean NOT NULL DEFAULT TRUE,
  granted_by    uuid REFERENCES auth.users(id),
  granted_at    timestamptz NOT NULL DEFAULT NOW(),
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT org_role_permission_uniq UNIQUE (org_object_id, role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_org_role_permission_lookup
  ON public.org_role_permission (org_object_id, role_id, permission_id) WHERE is_active;

ALTER TABLE public.org_role_permission ENABLE ROW LEVEL SECURITY;

-- Lecture : les membres actifs de l'ORG voient la matrice de leur ORG.
DROP POLICY IF EXISTS org_role_permission_read ON public.org_role_permission;
CREATE POLICY org_role_permission_read ON public.org_role_permission
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_org_membership uom
    WHERE uom.user_id = (SELECT auth.uid())
      AND uom.org_object_id = org_role_permission.org_object_id
      AND uom.is_active
  ));
-- Écriture : par RPC SECURITY DEFINER uniquement (aucune policy INSERT/UPDATE).

-- Seed : le préréglage SP-2 documenté, pour CHAQUE ORG existante.
-- Idempotent : ON CONFLICT DO NOTHING, ne réactive pas un droit retiré à la main.
INSERT INTO public.org_role_permission (org_object_id, role_id, permission_id)
SELECT o.id, r.id, p.id
FROM public.object o
CROSS JOIN (VALUES
  ('contributor','create_object'), ('contributor','edit_canonical_when_publisher'),
  ('contributor','edit_org_enrichment'), ('contributor','edit_hours'),
  ('contributor','edit_pricing'), ('contributor','edit_gallery'),
  ('contributor','attach_documents'),
  ('editor','create_object'), ('editor','edit_canonical_when_publisher'),
  ('editor','edit_org_enrichment'), ('editor','edit_hours'),
  ('editor','edit_pricing'), ('editor','edit_gallery'),
  ('editor','attach_documents'), ('editor','publish_object'),
  ('editor','validate_changes'), ('editor','manage_team_messages'),
  ('editor','manage_legal_compliance'), ('editor','write_crm_notes')
) AS seed(role_code, perm_code)
JOIN public.ref_org_business_role r ON r.code = seed.role_code
JOIN public.ref_permission p ON p.code = seed.perm_code AND p.is_active
WHERE o.object_type = 'ORG'
ON CONFLICT ON CONSTRAINT org_role_permission_uniq DO NOTHING;
```

- [ ] **Étape 2 : appliquer et vérifier le seed**

```sql
SELECT o.name, r.code AS role, count(*) AS n
FROM org_role_permission orp
JOIN ref_org_business_role r ON r.id = orp.role_id
JOIN object o ON o.id = orp.org_object_id
WHERE orp.is_active GROUP BY 1,2 ORDER BY 1,2;
```

Attendu : par ORG, `contributor` = 7 et `editor` = 12 ; `viewer` absent (0 ligne).

- [ ] **Étape 3 : écrire le rollback**

```sql
DROP TABLE IF EXISTS public.org_role_permission CASCADE;
```

- [ ] **Étape 4 : commit**

```bash
git commit -m "feat(rbac): table org_role_permission — permissions par role metier et par ORG" -- "Base de donnée DLL et API/migration_role_permission_matrix.sql" "Base de donnée DLL et API/rollback/rollback_role_permission_matrix.sql"
```

---

### Tâche 2 : chemin 3 dans `api.user_has_permission` + retrait du chemin 2

**Fichiers**
- Modifier : `Base de donnée DLL et API/migration_role_permission_matrix.sql`
- Modifier : `Base de donnée DLL et API/api_views_functions.sql` (refléter la nouvelle définition)

**Interfaces**
- Consomme : `org_role_permission` (tâche 1).
- Produit : `api.user_has_permission(text) RETURNS boolean` — chemins : individuel OU rôle. Le chemin ORG disparaît.

⚠️ Le retrait du chemin 2 change l'accès de tout membre qui tenait un droit par `org_permission`.
Vérifier AVANT que la table est vide de lignes actives (au 2026-08-31 : 0 ligne active, les 12 ont été révoquées).

- [ ] **Étape 1 : garde pré-vol — aucun droit actif ne dépend du chemin 2**

```sql
SELECT count(*) AS grants_org_actifs FROM org_permission WHERE is_active;
```

Attendu : `0`. Si > 0, STOP : chaque ligne doit d'abord être reportée dans la matrice de rôle
ou en droit individuel, sinon des membres perdent l'accès sans préavis.

- [ ] **Étape 2 : remplacer la fonction**

```sql
CREATE OR REPLACE FUNCTION api.user_has_permission(p_permission_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
  WITH perm AS (
    SELECT id FROM ref_permission
    WHERE code = p_permission_code AND is_active = TRUE
    LIMIT 1
  )
  SELECT
    -- Chemin 1 : droit accordé INDIVIDUELLEMENT (exception).
    EXISTS (
      SELECT 1
      FROM user_permission up
      JOIN perm p ON p.id = up.permission_id
      WHERE up.user_id   = (SELECT auth.uid())
        AND up.is_active = TRUE
    )
    OR
    -- Chemin 2 : droit CONFÉRÉ par le rôle métier, réglé par ORG (§227).
    -- Remplace l'ancien héritage `org_permission`, qui accordait à TOUS les membres sans
    -- regarder leur rôle : le 2026-08-31 il a donné l'écriture CRM à 3 Lecteurs.
    EXISTS (
      SELECT 1
      FROM org_role_permission orp
      JOIN perm p ON p.id = orp.permission_id
      JOIN user_org_membership uom     ON uom.org_object_id = orp.org_object_id
      JOIN user_org_business_role ubr  ON ubr.membership_id = uom.id
      WHERE uom.user_id   = (SELECT auth.uid())
        AND uom.is_active = TRUE
        AND ubr.is_active = TRUE
        AND ubr.role_id   = orp.role_id
        AND orp.is_active = TRUE
    );
$function$;
```

- [ ] **Étape 3 : prouver la garde par sabotage**

Un test qui n'échoue jamais ne prouve rien. Vérifier les DEUX sens sur un Lecteur réel :

```sql
-- Doit rendre FALSE : un Lecteur n'a pas write_crm_notes.
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"<uuid-isabelle>","role":"authenticated"}';
SELECT api.user_has_permission('write_crm_notes') AS lecteur_ecrit_crm;
```

Attendu : `false`. Puis accorder temporairement `write_crm_notes` au rôle `viewer` de l'ORG,
rejouer (attendu `true`), et RETIRER. Si la valeur ne bouge pas entre les deux, la jointure de
rôle est morte — corriger avant d'aller plus loin.

- [ ] **Étape 4 : vérifier les 13 consommateurs**

```sql
SELECT n.nspname||'.'||p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prokind='f' AND n.nspname IN ('api','public')
  AND pg_get_functiondef(p.oid) ILIKE '%user_has_permission%' AND p.proname <> 'user_has_permission';
```

Attendu : les 13 fonctions listées au relevé, inchangées (elles héritent du nouveau comportement).

- [ ] **Étape 5 : commit**

```bash
git commit -m "feat(rbac): le role metier confere les droits — chemin ORG retire de user_has_permission" -- "Base de donnée DLL et API/migration_role_permission_matrix.sql" "Base de donnée DLL et API/api_views_functions.sql"
```

---

### Tâche 3 : RPC d'écriture de la matrice

**Fichiers**
- Modifier : `Base de donnée DLL et API/migration_role_permission_matrix.sql`

**Interfaces**
- Produit : `api.rpc_set_role_permission(p_org_object_id text, p_role_code text, p_permission_code text, p_granted boolean) RETURNS void`
- Produit : `api.rpc_list_role_permissions(p_org_object_id text) RETURNS TABLE(role_code text, permission_code text)`
- Supprime : `api.rpc_grant_org_permission`, `api.rpc_revoke_org_permission`

- [ ] **Étape 1 : écrire les RPC**

```sql
CREATE OR REPLACE FUNCTION api.rpc_set_role_permission(
  p_org_object_id text, p_role_code text, p_permission_code text, p_granted boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
DECLARE
  v_caller_id     uuid := auth.uid();
  v_caller_rank   integer;
  v_role_id       uuid;
  v_permission_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM object WHERE id = p_org_object_id AND object_type = 'ORG') THEN
    RAISE EXCEPTION 'INVALID_ORG: p_org_object_id doit référencer un objet de type ORG (reçu : %)', p_org_object_id;
  END IF;

  SELECT id INTO v_role_id FROM ref_org_business_role WHERE code = p_role_code;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: rôle métier inconnu : %', p_role_code;
  END IF;

  SELECT id INTO v_permission_id FROM ref_permission WHERE code = p_permission_code AND is_active = TRUE;
  IF v_permission_id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: code permission inconnu ou inactif : %', p_permission_code;
  END IF;

  IF NOT api.is_platform_superuser() THEN
    SELECT r.rank INTO v_caller_rank
    FROM user_org_membership uom
    JOIN user_org_admin_role uar ON uar.membership_id = uom.id AND uar.is_active = TRUE
    JOIN ref_org_admin_role  r   ON r.id = uar.role_id
    WHERE uom.user_id = v_caller_id AND uom.org_object_id = p_org_object_id AND uom.is_active = TRUE;

    IF v_caller_rank IS NULL THEN
      RAISE EXCEPTION 'FORBIDDEN: vous n''avez pas de rôle d''administration dans cette ORG';
    END IF;
    IF v_caller_rank < 30 THEN
      RAISE EXCEPTION 'INSUFFICIENT_RANK: rang minimum requis 30 (org_admin) pour régler les permissions d''un rôle';
    END IF;
  END IF;

  IF p_granted THEN
    INSERT INTO org_role_permission (org_object_id, role_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
    VALUES (p_org_object_id, v_role_id, v_permission_id, TRUE, v_caller_id, NOW(), NOW(), NOW())
    ON CONFLICT ON CONSTRAINT org_role_permission_uniq DO UPDATE
      SET is_active = TRUE, granted_by = EXCLUDED.granted_by,
          granted_at = EXCLUDED.granted_at, updated_at = NOW();
  ELSE
    UPDATE org_role_permission SET is_active = FALSE, updated_at = NOW()
    WHERE org_object_id = p_org_object_id AND role_id = v_role_id
      AND permission_id = v_permission_id AND is_active = TRUE;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION api.rpc_list_role_permissions(p_org_object_id text)
 RETURNS TABLE(role_code text, permission_code text)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
  SELECT r.code::text, p.code::text
  FROM org_role_permission orp
  JOIN ref_org_business_role r ON r.id = orp.role_id
  JOIN ref_permission p ON p.id = orp.permission_id
  WHERE orp.org_object_id = p_org_object_id
    AND orp.is_active
    AND EXISTS (
      SELECT 1 FROM user_org_membership uom
      WHERE uom.user_id = auth.uid() AND uom.org_object_id = p_org_object_id AND uom.is_active
    );
$function$;

DROP FUNCTION IF EXISTS api.rpc_grant_org_permission(text, text);
DROP FUNCTION IF EXISTS api.rpc_revoke_org_permission(text, text);
```

- [ ] **Étape 2 : vérifier le refus de rang**

```sql
SET LOCAL request.jwt.claims TO '{"sub":"<uuid-lecteur>","role":"authenticated"}';
SELECT api.rpc_set_role_permission('ORGRUN000000000B','viewer','write_crm_notes',true);
```

Attendu : `FORBIDDEN: vous n'avez pas de rôle d'administration dans cette ORG`.

- [ ] **Étape 3 : reprendre le roster `rpc_list_org_members`** (trouvé au relevé du 31/08 —
  absent de la première version de ce plan)

Cette RPC alimente l'écran /team et émettait `inherited_permission_codes` **depuis
`org_permission`**. La laisser en l'état après le retrait du chemin ORG afficherait « hérité de
l'ORG » depuis une table morte et n'afficherait **pas** les droits conférés par le rôle : un
Éditeur à 12 droits se lirait « 0 permission ». La colonne est renommée
`inherited_permission_codes` → `role_permission_codes`, et son sous-select corrélé sur
`ubr.role_id` (la donnée dépend désormais du rôle de chaque membre, elle n'est plus la même pour
tous). `DROP` + `CREATE` obligatoires : `CREATE OR REPLACE` ne peut pas renommer une colonne de
sortie.

- [ ] **Étape 4 : commit**

```bash
git commit -m "feat(rbac): RPC de reglage de la matrice role x permission par ORG" -- "Base de donnée DLL et API/migration_role_permission_matrix.sql" "Base de donnée DLL et API/rollback/rollback_role_permission_matrix.sql"
```

---

### Tâche 4 : logique pure de la matrice (front)

**Fichiers**
- Créer : `bertel-tourism-ui/src/features/team/role-permission-matrix.ts`
- Créer : `bertel-tourism-ui/src/features/team/role-permission-matrix.test.ts`

**Interfaces**
- Produit : `type RoleMatrix = Record<string, string[]>` (code rôle → codes permission)
- Produit : `effectivePermissions(individual: readonly string[], roleCodes: readonly string[], matrix: RoleMatrix): string[]`
- Produit : `impactOfToggle(matrix, roleCode, permCode, granted, members): { affected: MemberRef[]; grants: boolean }`
- Produit : `type MemberRef = { userId: string; displayName: string; businessRoleCode: string | null }`

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
import { effectivePermissions, impactOfToggle } from './role-permission-matrix';

const MATRIX = { viewer: [], contributor: ['edit_hours'], editor: ['edit_hours', 'write_crm_notes'] };

describe('effectivePermissions', () => {
  test('un lecteur sans exception n’a aucun droit', () => {
    expect(effectivePermissions([], ['viewer'], MATRIX)).toEqual([]);
  });

  test('le rôle confère ses droits sans octroi individuel', () => {
    expect(effectivePermissions([], ['editor'], MATRIX).sort()).toEqual(['edit_hours', 'write_crm_notes']);
  });

  test('une exception individuelle s’ajoute au rôle sans doublon', () => {
    expect(effectivePermissions(['edit_hours', 'publish_object'], ['contributor'], MATRIX).sort())
      .toEqual(['edit_hours', 'publish_object']);
  });
});

describe('impactOfToggle', () => {
  const members = [
    { userId: 'u1', displayName: 'Isabelle', businessRoleCode: 'viewer' },
    { userId: 'u2', displayName: 'Nicolas', businessRoleCode: 'viewer' },
    { userId: 'u3', displayName: 'Marc', businessRoleCode: 'editor' },
  ];

  test('nomme les membres qui GAGNENT le droit', () => {
    const r = impactOfToggle(MATRIX, 'viewer', 'write_crm_notes', true, members);
    expect(r.grants).toBe(true);
    expect(r.affected.map((m) => m.displayName)).toEqual(['Isabelle', 'Nicolas']);
  });

  test('nomme les membres qui PERDENT le droit', () => {
    const r = impactOfToggle(MATRIX, 'editor', 'write_crm_notes', false, members);
    expect(r.grants).toBe(false);
    expect(r.affected.map((m) => m.displayName)).toEqual(['Marc']);
  });

  test('ne compte jamais un membre d’un autre rôle', () => {
    const r = impactOfToggle(MATRIX, 'contributor', 'edit_hours', false, members);
    expect(r.affected).toEqual([]);
  });
});
```

- [ ] **Étape 2 : lancer, vérifier l'échec**

Run : `cd bertel-tourism-ui && npx jest src/features/team/role-permission-matrix.test.ts`
Attendu : ÉCHEC — `Cannot find module './role-permission-matrix'`.

- [ ] **Étape 3 : implémenter**

```ts
export type RoleMatrix = Record<string, string[]>;
export interface MemberRef { userId: string; displayName: string; businessRoleCode: string | null }

/** Droits effectifs d'un membre : exceptions individuelles ∪ droits conférés par son rôle. */
export function effectivePermissions(
  individual: readonly string[],
  roleCodes: readonly string[],
  matrix: RoleMatrix,
): string[] {
  const set = new Set(individual);
  for (const role of roleCodes) for (const code of matrix[role] ?? []) set.add(code);
  return [...set];
}

/**
 * Qui bascule si on (dé)coche une case de la matrice.
 *
 * Un membre qui tient déjà le droit INDIVIDUELLEMENT ne le perd pas quand on le retire du rôle :
 * l'appelant doit donc filtrer sur les exceptions avant d'annoncer une perte. Ici on ne connaît
 * que le rôle — on nomme les membres du rôle concerné, et l'écran précise le cas des exceptions.
 */
export function impactOfToggle(
  matrix: RoleMatrix,
  roleCode: string,
  permCode: string,
  granted: boolean,
  members: readonly MemberRef[],
): { affected: MemberRef[]; grants: boolean } {
  const has = (matrix[roleCode] ?? []).includes(permCode);
  if (has === granted) return { affected: [], grants: granted };
  return { affected: members.filter((m) => m.businessRoleCode === roleCode), grants: granted };
}
```

- [ ] **Étape 4 : lancer, vérifier le succès**

Run : `cd bertel-tourism-ui && npx jest src/features/team/role-permission-matrix.test.ts`
Attendu : 6 tests PASS.

- [ ] **Étape 5 : commit**

```bash
git commit -m "feat(team): logique pure de la matrice role x permission" -- bertel-tourism-ui/src/features/team/role-permission-matrix.ts bertel-tourism-ui/src/features/team/role-permission-matrix.test.ts
```

---

### Tâche 5 : service `rbac.ts`

**Fichiers**
- Modifier : `bertel-tourism-ui/src/services/rbac.ts`

**Interfaces**
- Consomme : `api.rpc_list_role_permissions`, `api.rpc_set_role_permission` (tâche 3).
- Produit : `listRolePermissions(orgObjectId: string): Promise<RoleMatrix>`
- Produit : `setRolePermission(orgObjectId: string, roleCode: string, permissionCode: string, granted: boolean): Promise<void>`
- Supprime : `grantOrgPermission`, `revokeOrgPermission`, `listOrgPermissions`
- Modifie : `OrgMember.inheritedPermissionCodes` → `rolePermissionCodes` (émis par le roster sous le nom `role_permission_codes`)

- [ ] **Étape 1 : ajouter les fonctions**

```ts
import type { RoleMatrix } from '@/features/team/role-permission-matrix';

/** Matrice rôle → permissions de l'ORG (§227). Rôles absents de la réponse = aucun droit. */
export async function listRolePermissions(orgObjectId: string): Promise<RoleMatrix> {
  const { data, error } = await requireClient().schema('api')
    .rpc('rpc_list_role_permissions', { p_org_object_id: orgObjectId });
  if (error) throw error;
  const matrix: RoleMatrix = {};
  for (const row of (data ?? []) as Array<{ role_code: string; permission_code: string }>) {
    (matrix[row.role_code] ??= []).push(row.permission_code);
  }
  return matrix;
}

export const setRolePermission = (orgObjectId: string, roleCode: string, permissionCode: string, granted: boolean) =>
  rpc('rpc_set_role_permission', {
    p_org_object_id: orgObjectId, p_role_code: roleCode,
    p_permission_code: permissionCode, p_granted: granted,
  });
```

- [ ] **Étape 2 : supprimer les trois fonctions ORG**

Retirer `grantOrgPermission`, `revokeOrgPermission`, `listOrgPermissions` de `rbac.ts`.

- [ ] **Étape 3 : vérifier qu'aucun appelant ne subsiste**

Run : `cd bertel-tourism-ui && grep -rn "grantOrgPermission\|revokeOrgPermission\|listOrgPermissions" src`
Attendu : aucune sortie.

- [ ] **Étape 4 : type-check**

Run : `cd bertel-tourism-ui && npx tsc --noEmit`
Attendu : 0 erreur.

- [ ] **Étape 5 : commit**

```bash
git commit -m "feat(rbac): service de la matrice role x permission, retrait des defauts d ORG" -- bertel-tourism-ui/src/services/rbac.ts
```

---

### Tâche 6 : écran de la matrice

**Fichiers**
- Créer : `bertel-tourism-ui/src/features/team/OrgRolePermissionsModal.tsx`
- Créer : `bertel-tourism-ui/src/features/team/OrgRolePermissionsModal.test.tsx`
- Modifier : `bertel-tourism-ui/src/views/TeamAdminPage.tsx`

**Interfaces**
- Consomme : `listRolePermissions`, `setRolePermission` (tâche 5) ; `impactOfToggle` (tâche 4) ; `Modal`, `ConfirmDialog` (existants).
- Produit : `<OrgRolePermissionsModal open orgId catalog roles members onClose onChanged />`

Composants et tokens maison uniquement (`Modal`, `ConfirmDialog`, `.data-table`, `--ink`/`--line`/`--surface`) —
pas de style ad hoc, conformément à la revue de maquette.

- [ ] **Étape 1 : écrire le test qui échoue**

```tsx
test('cocher une permission pour Lecteur demande confirmation en nommant les membres', async () => {
  render(<OrgRolePermissionsModal open orgId="ORG1" catalog={CATALOG} roles={ROLES} members={MEMBERS} onClose={jest.fn()} onChanged={jest.fn()} />);
  await userEvent.click(await screen.findByRole('checkbox', { name: /Écrire dans le CRM.*Lecteur/i }));
  expect(await screen.findByText(/Isabelle/)).toBeInTheDocument();
  expect(screen.getByText(/2 membres/)).toBeInTheDocument();
  expect(setRolePermission).not.toHaveBeenCalled();
});

test('aucune écriture tant que la confirmation n’est pas validée', async () => {
  render(<OrgRolePermissionsModal open orgId="ORG1" catalog={CATALOG} roles={ROLES} members={MEMBERS} onClose={jest.fn()} onChanged={jest.fn()} />);
  await userEvent.click(await screen.findByRole('checkbox', { name: /Écrire dans le CRM.*Lecteur/i }));
  await userEvent.click(screen.getByRole('button', { name: /Annuler/i }));
  expect(setRolePermission).not.toHaveBeenCalled();
});
```

- [ ] **Étape 2 : lancer, vérifier l'échec**

Run : `cd bertel-tourism-ui && npx jest src/features/team/OrgRolePermissionsModal.test.tsx`
Attendu : ÉCHEC — module introuvable.

- [ ] **Étape 3 : implémenter la matrice**

Tableau `permission × rôle` groupé par catégorie (libellés `CATEGORY_LABELS` déplacés depuis
`MemberPermissionsDrawer.tsx`), un `<input type="checkbox">` par croisement, `aria-label` de la
forme `` `${p.name} — ${businessRoleLabel(role.code)}` `` pour que chaque case soit adressable.
Toute bascule ouvre `ConfirmDialog` (`tone="danger"` quand on accorde) avec le décompte et les
noms issus de `impactOfToggle`, et n'appelle `setRolePermission` qu'à la confirmation.

- [ ] **Étape 4 : lancer, vérifier le succès**

Run : `cd bertel-tourism-ui && npx jest src/features/team/OrgRolePermissionsModal.test.tsx`
Attendu : 2 tests PASS.

- [ ] **Étape 5 : brancher le bouton sur `/team`**

Dans `TeamAdminPage.tsx`, à côté d'`InviteMemberDialog`, sous `canManageOrgDefaults` :

```tsx
<button type="button" className="ghost-button" onClick={() => setRoleMatrixOpen(true)}>
  <ShieldCheck size={14} aria-hidden /> Permissions par rôle
</button>
```

- [ ] **Étape 6 : commit**

```bash
git commit -m "feat(team): ecran des permissions par role metier, avec confirmation nominative" -- bertel-tourism-ui/src/features/team/OrgRolePermissionsModal.tsx bertel-tourism-ui/src/features/team/OrgRolePermissionsModal.test.tsx bertel-tourism-ui/src/views/TeamAdminPage.tsx
```

---

### Tâche 7 : le tiroir d'un membre ne parle plus que de ce membre

**Fichiers**
- Modifier : `bertel-tourism-ui/src/features/team/MemberPermissionsDrawer.tsx`
- Modifier : `bertel-tourism-ui/src/features/team/MembersTable.tsx`
- Modifier : `bertel-tourism-ui/src/features/team/permission-presets.ts`

**Interfaces**
- Consomme : `RoleMatrix` (tâche 4), `OrgMember.rolePermissionCodes` (tâche 5).

- [ ] **Étape 1 : test — le tiroir n'expose plus aucun contrôle d'ORG**

```tsx
test('le tiroir d’un membre ne contient aucun contrôle de portée ORG', () => {
  render(<MemberPermissionsDrawer member={MEMBER} orgId="ORG1" catalog={CATALOG} roleMatrix={MATRIX} onClose={jest.fn()} onChanged={jest.fn()} />);
  expect(screen.queryByText(/permissions par défaut de l’organisation/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/héritée de l’ORG/i)).not.toBeInTheDocument();
});

test('les droits du rôle sont montrés en lecture seule, non cochables', () => {
  render(<MemberPermissionsDrawer member={VIEWER} orgId="ORG1" catalog={CATALOG} roleMatrix={MATRIX} onClose={jest.fn()} onChanged={jest.fn()} />);
  expect(screen.getByText(/Lecture seule\. Aucun droit d’écriture\./i)).toBeInTheDocument();
});
```

- [ ] **Étape 2 : lancer, vérifier l'échec**

Run : `cd bertel-tourism-ui && npx jest src/features/team/`
Attendu : ÉCHEC sur les deux nouveaux tests.

- [ ] **Étape 3 : retirer le bloc ORG, ajouter le résumé de rôle**

Supprimer de `MemberPermissionsDrawer.tsx` : la prop `orgPermissions`, la prop `canManageOrgDefaults`,
`toggleOrgPermission`, le bloc `perm-drawer__org`, le badge `perm-inherit`, l'état indéterminé, et le
bouton « Appliquer le préréglage » (le rôle confère désormais — le préréglage n'a plus d'objet).
Ajouter en tête un résumé lecture seule des droits du rôle, et retitrer la liste des cases
« Exceptions individuelles ».

- [ ] **Étape 4 : compteur = union(individuel, rôle)**

Dans `MembersTable.tsx`, remplacer `m.inheritedPermissionCodes` par `m.rolePermissionCodes`
et le badge « dont N héritée » par « dont N par le rôle ».

- [ ] **Étape 5 : lancer toute la suite team**

Run : `cd bertel-tourism-ui && npx jest src/features/team/ src/views/TeamAdminPage`
Attendu : tous PASS (les tests existants du bloc ORG doivent être supprimés, pas contournés).

- [ ] **Étape 6 : commit**

```bash
git commit -m "refactor(team): le tiroir d un membre ne porte plus de controle d ORG" -- bertel-tourism-ui/src/features/team/MemberPermissionsDrawer.tsx bertel-tourism-ui/src/features/team/MembersTable.tsx bertel-tourism-ui/src/features/team/permission-presets.ts
```

---

### Tâche 8 : nettoyage des droits individuels redondants

À faire **en dernier**, une fois la matrice en place et vérifiée : ces `user_permission` deviennent
des doublons du rôle et rendent la lecture de l'écran trompeuse (on ne distingue plus l'exception
de la règle).

**Fichiers**
- Créer : `Base de donnée DLL et API/migration_role_permission_cleanup.sql`
- Créer : `Base de donnée DLL et API/rollback/rollback_role_permission_cleanup.sql`

- [ ] **Étape 1 : capturer l'état AVANT (c'est le rollback)**

```sql
CREATE TABLE IF NOT EXISTS public.bak_user_permission_20260831 AS
SELECT up.* FROM user_permission up WHERE up.is_active;
```

- [ ] **Étape 2 : désactiver uniquement ce que le rôle couvre déjà**

```sql
UPDATE user_permission up
   SET is_active = FALSE, updated_at = NOW()
 WHERE up.is_active
   AND EXISTS (
     SELECT 1
     FROM user_org_membership uom
     JOIN user_org_business_role ubr ON ubr.membership_id = uom.id AND ubr.is_active
     JOIN org_role_permission orp
       ON orp.org_object_id = uom.org_object_id
      AND orp.role_id       = ubr.role_id
      AND orp.permission_id = up.permission_id
      AND orp.is_active
     WHERE uom.user_id = up.user_id AND uom.is_active
   );
```

- [ ] **Étape 3 : prouver qu'aucun accès n'a changé**

```sql
SELECT u.email, r.code AS role,
  (SELECT count(*) FROM user_permission x WHERE x.user_id = uom.user_id AND x.is_active) AS exceptions,
  (SELECT count(*) FROM org_role_permission o WHERE o.org_object_id = uom.org_object_id
     AND o.role_id = ubr.role_id AND o.is_active) AS par_role
FROM user_org_membership uom
JOIN auth.users u ON u.id = uom.user_id
LEFT JOIN user_org_business_role ubr ON ubr.membership_id = uom.id AND ubr.is_active
LEFT JOIN ref_org_business_role r ON r.id = ubr.role_id
WHERE uom.is_active ORDER BY r.code, u.email;
```

Attendu : Lecteurs `exceptions = 0, par_role = 0` ; Éditeurs `exceptions = 0, par_role = 12`.
Le total effectif par membre doit être **identique** au relevé d'avant migration — sinon STOP et rollback.

- [ ] **Étape 4 : commit**

```bash
git commit -m "chore(rbac): retirer les droits individuels devenus redondants avec le role" -- "Base de donnée DLL et API/migration_role_permission_cleanup.sql" "Base de donnée DLL et API/rollback/rollback_role_permission_cleanup.sql"
```

---

### Tâche 9 : runbook et clôture

**Fichiers**
- Modifier : `docs/SQL_ROLLOUT_RUNBOOK.md`
- Modifier : `Base de donnée DLL et API/README.md`

- [ ] **Étape 1 : entrée de runbook** — ordre d'application (`matrix` puis `cleanup`), garde pré-vol
  du chemin 2, requête de vérification post-application, chemin de rollback.
- [ ] **Étape 2 : vérifier la CI à blanc** — Run : `psql -f "Base de donnée DLL et API/ci_fresh_apply.sql"` — Attendu : 0 erreur.
- [ ] **Étape 3 : commit**

```bash
git commit -m "docs(sql): runbook de la matrice role x permission" -- docs/SQL_ROLLOUT_RUNBOOK.md "Base de donnée DLL et API/README.md"
```

---

## Risques

| Risque | Parade |
|---|---|
| Le retrait du chemin ORG coupe un accès en silence | Garde pré-vol tâche 2 étape 1 : STOP si `org_permission` a une ligne active |
| La jointure de rôle est morte et rend toujours FALSE | Sabotage tâche 2 étape 3 : accorder puis retirer, la valeur DOIT bouger |
| Le nettoyage retire un droit que le rôle ne couvre pas | `EXISTS` corrélé sur `(user, org, rôle, permission)` + table `bak_` + comparaison avant/après |
| Rétrograder un membre retire désormais son accès | C'est l'effet voulu — à annoncer dans la confirmation de changement de rôle |
| Un membre sans rôle métier actif se retrouve à 0 droit | Vérifié : les 10 membres actifs ont tous un rôle |
