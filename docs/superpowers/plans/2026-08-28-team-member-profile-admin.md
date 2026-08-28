# Édition du profil d'un membre depuis le panneau Équipe — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un administrateur du panneau Équipe d'éditer l'identité d'un membre (photo, nom, e-mail de connexion, rôle plateforme) dans une modale, et de lui envoyer un lien de connexion sans détruire son compte.

**Architecture :** Aucune migration SQL. Une route serveur `app/api/admin/user-profile` (modèle des routes `/api/admin/*` existantes : sonde d'autorisation **en tant qu'appelant**, écriture service-role) + une extension de `app/api/avatar/upload` pour l'avatar d'autrui + deux appels GoTrue publics depuis le client pour les liens e-mail. Le préambule d'autorisation dupliqué dans les deux routes admin existantes est d'abord extrait dans un helper partagé.

**Tech Stack :** Next.js App Router (route handlers `runtime = 'nodejs'`), `@supabase/supabase-js`, React 19 + Zustand (`session-store`), Jest + React Testing Library, `sonner` pour les toasts.

**Spec :** `docs/superpowers/specs/2026-08-28-team-member-profile-admin-design.md`

## Global Constraints

- **Racine de travail : `bertel-tourism-ui/`.** Tous les chemins de fichiers du plan sont relatifs à ce dossier ; toutes les commandes se lancent depuis lui.
- **Aucune migration SQL, aucun fichier sous `Base de donnée DLL et API/` n'est modifié.** Si une tâche semble en exiger une, s'arrêter et le signaler.
- **Langue de l'interface : français.** Libellés, messages d'erreur affichés, textes d'aide. Les commentaires de code suivent le fichier voisin (français dans `features/team/`, anglais dans les routes existantes — imiter le fichier qu'on touche).
- **L'UI ne garde jamais rien.** Toute règle d'autorisation est ré-évaluée serveur ; un contrôle désactivé côté client est un confort, jamais la frontière.
- **TDD strict :** test d'abord, exécuté ROUGE, puis implémentation, puis VERT, puis commit. Un test qu'on n'a pas vu échouer ne prouve rien.
- **Commits :** conventionnels (`feat:`, `refactor:`, `test:`, `docs:`), **sans** ligne `Co-Authored-By`. Un commit par tâche terminée et vérifiée.
- **Lancer les tests :** `npm run test:run -- <chemin>` (le `npm test` nu est en mode watch et ne rend jamais la main).
- **Typecheck :** `npm run typecheck` doit être vert avant chaque commit.
- **Rôles plateforme valides :** `tourism_agent`, `super_admin`, `owner` (CHECK en base sur `app_user_profile.role`). Rôles **privilégiés** au sens de la garde n° 4 : `super_admin` et `owner`.
- **Seuil de rang admin : 30** (identique aux routes `invite` et `delete-user`).

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/app/api/admin/_authorize.ts` | **Créé.** Sonde d'autorisation partagée des routes `/api/admin/*` + test de périmètre d'ORG. Aucune logique métier. |
| `src/app/api/admin/_authorize.test.ts` | **Créé.** |
| `src/app/api/admin/invite/route.ts` | **Modifié.** Consomme le helper. Comportement inchangé. |
| `src/app/api/admin/delete-user/route.ts` | **Modifié.** Consomme le helper. Comportement inchangé. |
| `src/app/api/admin/user-profile/route.ts` | **Créé.** `GET` (lecture du profil d'un membre) + `PATCH` (nom, e-mail, rôle plateforme). Porte les 4 gardes. |
| `src/app/api/admin/user-profile/route.test.ts` | **Créé.** |
| `src/app/api/avatar/upload/route.ts` | **Modifié.** Champ `targetUserId` optionnel → bras admin. |
| `src/app/api/avatar/upload/route.test.ts` | **Créé.** (aucun test n'existe aujourd'hui sur cette route) |
| `src/services/team-profile.ts` | **Créé.** Couche client : appels aux deux routes + les deux envois de lien GoTrue. Aucun JSX. |
| `src/services/team-profile.test.ts` | **Créé.** |
| `src/services/rbac.ts` | **Modifié.** Exporte `rbacRouteError` (déjà écrit, aujourd'hui privé) pour que `team-profile` traduise les erreurs de route sans la ré-écrire. |
| `src/features/team/MemberProfileModal.tsx` | **Créé.** La modale. Ne connaît que `team-profile` + `Modal`. |
| `src/features/team/MemberProfileModal.test.tsx` | **Créé.** |
| `src/features/team/MembersTable.tsx` | **Modifié.** Bouton « Modifier » dans la colonne d'actions. |
| `src/features/team/MembersTable.test.tsx` | **Modifié.** Un cas de plus. |
| `src/views/TeamAdminPage.tsx` | **Modifié.** État d'ouverture + montage de la modale. |

---

## Task 1 : helper d'autorisation partagé

**Files:**
- Create: `src/app/api/admin/_authorize.ts`
- Create: `src/app/api/admin/_authorize.test.ts`
- Modify: `src/app/api/admin/invite/route.ts` (lignes 7–32 — le préambule)
- Modify: `src/app/api/admin/delete-user/route.ts` (lignes 13–37 — le préambule)

**Interfaces:**
- Consomme : rien.
- Produit :
  - `authorizeAdminRoute(req: NextRequest): Promise<AdminAuth>` où
    `AdminAuth = { ok: true; server: SupabaseClient; asCaller: SupabaseClient; callerId: string; isSuper: boolean; rank: number } | { ok: false; response: NextResponse }`
  - `sharesActiveOrg(server: SupabaseClient, aUserId: string, bUserId: string): Promise<boolean>`

**Pourquoi cette tâche existe :** le même bloc de 25 lignes vit déjà dans deux routes ; la troisième arrive en Task 2. Le critère de réussite du refactor est que **les tests existants d'`invite` passent sans être modifiés**.

- [ ] **Step 1 : écrire le test du helper**

Créer `src/app/api/admin/_authorize.test.ts` :

```ts
/** @jest-environment node */
import { authorizeAdminRoute, sharesActiveOrg } from './_authorize';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

function req(headers: Record<string, string>): never {
  return { headers: new Headers(headers), url: 'https://app.test/api/admin/x' } as never;
}

/** Client "en tant qu'appelant" dont la sonde répond superuser / rang. */
function callerProbe(isSuper: unknown, rank: unknown) {
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: isSuper, error: null })
    .mockResolvedValueOnce({ data: rank, error: null });
  return { schema: () => ({ rpc }) };
}

function serverWithUser(id: string) {
  return { auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id } }, error: null }) } };
}

describe('authorizeAdminRoute', () => {
  beforeEach(() => {
    mockedServer.mockReset();
    mockedCreate.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  });

  it('500 quand la service key est absente', async () => {
    mockedServer.mockReturnValue(null);
    const auth = await authorizeAdminRoute(req({ authorization: 'Bearer t' }));
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(500);
  });

  it('401 sans en-tête Bearer', async () => {
    mockedServer.mockReturnValue({ auth: {} } as never);
    const auth = await authorizeAdminRoute(req({}));
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(401);
  });

  it('401 quand le JWT ne résout aucun utilisateur', async () => {
    mockedServer.mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never);
    const auth = await authorizeAdminRoute(req({ authorization: 'Bearer t' }));
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(401);
  });

  it('403 quand l’appelant n’est ni superuser ni admin de rang suffisant', async () => {
    mockedServer.mockReturnValue(serverWithUser('admin') as never);
    mockedCreate.mockReturnValue(callerProbe(false, 20) as never);
    const auth = await authorizeAdminRoute(req({ authorization: 'Bearer t' }));
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(403);
  });

  it('accepte un superuser et rend son identité', async () => {
    mockedServer.mockReturnValue(serverWithUser('admin') as never);
    mockedCreate.mockReturnValue(callerProbe(true, null) as never);
    const auth = await authorizeAdminRoute(req({ authorization: 'Bearer t' }));
    expect(auth.ok).toBe(true);
    if (auth.ok) {
      expect(auth.callerId).toBe('admin');
      expect(auth.isSuper).toBe(true);
      expect(auth.rank).toBe(0);
    }
  });

  it('accepte un admin d’ORG de rang 30 sans statut superuser', async () => {
    mockedServer.mockReturnValue(serverWithUser('admin') as never);
    mockedCreate.mockReturnValue(callerProbe(false, 30) as never);
    const auth = await authorizeAdminRoute(req({ authorization: 'Bearer t' }));
    expect(auth.ok).toBe(true);
    if (auth.ok) {
      expect(auth.isSuper).toBe(false);
      expect(auth.rank).toBe(30);
    }
  });
});

describe('sharesActiveOrg', () => {
  function serverWithMemberships(rows: Array<{ user_id: string; org_object_id: string }>) {
    const eq = jest.fn().mockResolvedValue({ data: rows, error: null });
    const inFn = jest.fn().mockReturnValue({ eq });
    const select = jest.fn().mockReturnValue({ in: inFn });
    return { from: jest.fn().mockReturnValue({ select }) } as never;
  }

  it('vrai quand les deux comptes partagent une ORG active', async () => {
    const server = serverWithMemberships([
      { user_id: 'a', org_object_id: 'ORG1' },
      { user_id: 'b', org_object_id: 'ORG1' },
    ]);
    await expect(sharesActiveOrg(server, 'a', 'b')).resolves.toBe(true);
  });

  it('faux quand les ORG diffèrent', async () => {
    const server = serverWithMemberships([
      { user_id: 'a', org_object_id: 'ORG1' },
      { user_id: 'b', org_object_id: 'ORG2' },
    ]);
    await expect(sharesActiveOrg(server, 'a', 'b')).resolves.toBe(false);
  });

  it('faux quand la cible n’a aucun membership actif', async () => {
    const server = serverWithMemberships([{ user_id: 'a', org_object_id: 'ORG1' }]);
    await expect(sharesActiveOrg(server, 'a', 'b')).resolves.toBe(false);
  });
});
```

- [ ] **Step 2 : exécuter le test, vérifier qu'il ÉCHOUE**

```bash
npm run test:run -- src/app/api/admin/_authorize.test.ts
```

Attendu : ÉCHEC — `Cannot find module './_authorize'`.

- [ ] **Step 3 : écrire le helper**

Créer `src/app/api/admin/_authorize.ts` :

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

/** Rang d'administration d'ORG minimal pour les routes /api/admin/*. */
const MIN_ADMIN_RANK = 30;

export type AdminAuth =
  | { ok: true; server: SupabaseClient; asCaller: SupabaseClient; callerId: string; isSuper: boolean; rank: number }
  | { ok: false; response: NextResponse };

/**
 * Authorize a /api/admin/* call AS THE CALLER.
 *
 * The service-role client returned here bypasses RLS, so this probe IS the security boundary —
 * exactly like the media upload route (§59). It runs the caller's own JWT through an anon client
 * so the DB answers for the CALLER, never for the service key.
 *
 * Returns the service-role client (`server`) and the caller-scoped client (`asCaller`) so a route
 * can run further caller-scoped probes (e.g. `api.is_platform_owner`) without rebuilding one.
 */
export async function authorizeAdminRoute(req: NextRequest): Promise<AdminAuth> {
  const server = getServerSupabaseClient();
  if (!server) {
    return { ok: false, response: NextResponse.json({ error: 'server_misconfigured' }, { status: 500 }) };
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!jwt) {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }
  const { data: caller, error: callerErr } = await server.auth.getUser(jwt);
  if (callerErr || !caller?.user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: isSuper }, { data: rank }] = await Promise.all([
    asCaller.schema('api').rpc('is_platform_superuser'),
    asCaller.schema('api').rpc('current_user_admin_rank'),
  ]);
  const numericRank = typeof rank === 'number' ? rank : 0;
  if (isSuper !== true && numericRank < MIN_ADMIN_RANK) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'forbidden', detail: 'org_admin (rank ≥ 30) or platform superuser required' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, server, asCaller, callerId: caller.user.id, isSuper: isSuper === true, rank: numericRank };
}

/**
 * True when both accounts share at least one ACTIVE org membership.
 *
 * Scope guard for non-superuser admins: without it, a rank-30 admin of ORG A could act on an
 * account of ORG B by knowing its userId. Read with the service-role client on purpose — the
 * caller cannot read another user's memberships under RLS, and the answer must not depend on that.
 */
export async function sharesActiveOrg(
  server: SupabaseClient,
  aUserId: string,
  bUserId: string,
): Promise<boolean> {
  const { data, error } = await server
    .from('user_org_membership')
    .select('user_id, org_object_id')
    .in('user_id', [aUserId, bUserId])
    .eq('is_active', true);
  if (error || !data) return false;
  const aOrgs = new Set(
    data.filter((r) => r.user_id === aUserId).map((r) => r.org_object_id as string),
  );
  return data.some((r) => r.user_id === bUserId && aOrgs.has(r.org_object_id as string));
}
```

- [ ] **Step 4 : exécuter le test, vérifier qu'il PASSE**

```bash
npm run test:run -- src/app/api/admin/_authorize.test.ts
```

Attendu : 9 tests verts.

- [ ] **Step 5 : re-pointer la route `invite` sur le helper**

Dans `src/app/api/admin/invite/route.ts`, remplacer les imports et tout le bloc qui va de `const server = getServerSupabaseClient();` jusqu'à la ligne `if (!authorized) return NextResponse.json({ error: 'forbidden', ... }, { status: 403 });` incluse, par :

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { authorizeAdminRoute } from '../_authorize';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminRoute(req);
  if (!auth.ok) return auth.response;
  const { server } = auth;
```

Les imports `createClient` et `getServerSupabaseClient` deviennent inutilisés dans ce fichier : **les supprimer**. Le reste du corps (parsing du body, `resend`, `inviteUserByEmail`, upsert du profil) est **inchangé**.

- [ ] **Step 6 : re-pointer la route `delete-user` sur le helper**

Dans `src/app/api/admin/delete-user/route.ts`, même remplacement du préambule. La référence `caller.user.id` de l'anti-self devient `auth.callerId` :

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { authorizeAdminRoute } from '../_authorize';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminRoute(req);
  if (!auth.ok) return auth.response;
  const { server } = auth;

  let body: { userId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) return NextResponse.json({ error: 'invalid_user_id' }, { status: 422 });

  // Anti-self (même règle §2.6 que les RPCs d'équipe) : un admin ne se supprime pas lui-même.
  if (userId === auth.callerId) {
    return NextResponse.json({ error: 'self_delete_forbidden' }, { status: 403 });
  }

  const { error: deleteErr } = await server.auth.admin.deleteUser(userId);
  if (deleteErr) return NextResponse.json({ error: 'delete_failed', detail: deleteErr.message }, { status: 500 });

  return NextResponse.json({ deleted: true }, { status: 200 });
}
```

Le commentaire d'en-tête du fichier (les FK cascade) est conservé tel quel au-dessus de `export async function POST`.

**Ne PAS** ajouter la garde de périmètre `sharesActiveOrg` ici : ce serait un changement de comportement hors périmètre, consigné en différé dans la spec § 8.

- [ ] **Step 7 : vérifier que les tests existants passent SANS AVOIR ÉTÉ MODIFIÉS**

```bash
npm run test:run -- src/app/api/admin
```

Attendu : les 6 cas d'`invite/route.test.ts` verts **et le fichier de test inchangé** (`git diff --stat src/app/api/admin/invite/route.test.ts` doit être vide). Si un test a dû être modifié, le refactor a changé le comportement : revenir en arrière et corriger le helper.

- [ ] **Step 8 : typecheck**

```bash
npm run typecheck
```

Attendu : aucune erreur. (En cas d'import inutilisé oublié, le lint le signalera au build — les retirer.)

- [ ] **Step 9 : commit**

```bash
git add src/app/api/admin/_authorize.ts src/app/api/admin/_authorize.test.ts src/app/api/admin/invite/route.ts src/app/api/admin/delete-user/route.ts
git commit -m "refactor(api): extraire la sonde d'autorisation partagee des routes admin"
```

---

## Task 2 : route `GET`/`PATCH /api/admin/user-profile`

**Files:**
- Create: `src/app/api/admin/user-profile/route.ts`
- Create: `src/app/api/admin/user-profile/route.test.ts`

**Interfaces:**
- Consomme : `authorizeAdminRoute`, `sharesActiveOrg` (Task 1).
- Produit : deux handlers HTTP.
  - `GET /api/admin/user-profile?userId=<uuid>` → `200 { displayName: string|null, avatarUrl: string|null, email: string|null, platformRole: string|null, lastSignInAt: string|null }`
  - `PATCH /api/admin/user-profile` body `{ userId: string, displayName?: string, email?: string, platformRole?: 'tourism_agent'|'super_admin'|'owner' }` → `200 { updated: true }`
  - Codes d'erreur du `PATCH` : `401 unauthenticated` · `403 forbidden` (rang) · `403 self_edit_forbidden` · `403 out_of_scope` · `403 owner_required` · `422 invalid_user_id` · `422 unknown_field` · `422 invalid_email` · `422 invalid_platform_role` · `404 user_not_found` · `500 email_update_failed` / `profile_update_failed`

**Pourquoi le `GET` :** `rpc_list_org_members` ne rend ni `avatar_url` ni le `role` brut. Sans lui la modale s'ouvrirait sur une photo absente et un rôle inconnu.

- [ ] **Step 1 : écrire le test de la route**

Créer `src/app/api/admin/user-profile/route.test.ts` :

```ts
/** @jest-environment node */
import { GET, PATCH } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

const CALLER = 'caller-1';
const TARGET = 'target-1';

function patchReq(body: unknown, headers: Record<string, string> = { authorization: 'Bearer t' }): never {
  return {
    headers: new Headers(headers),
    json: async () => body,
    url: 'https://app.test/api/admin/user-profile',
  } as never;
}

function getReq(userId: string): never {
  return {
    headers: new Headers({ authorization: 'Bearer t' }),
    url: `https://app.test/api/admin/user-profile?userId=${userId}`,
  } as never;
}

/**
 * Client "en tant qu'appelant". `rpc` répond dans l'ordre des appels de la route :
 * is_platform_superuser, current_user_admin_rank, puis (si sondé) is_platform_owner.
 */
function callerProbe(opts: { isSuper?: boolean; rank?: number | null; isOwner?: boolean }) {
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: opts.isSuper ?? false, error: null })
    .mockResolvedValueOnce({ data: opts.rank ?? null, error: null })
    .mockResolvedValueOnce({ data: opts.isOwner ?? false, error: null });
  return { schema: () => ({ rpc }) };
}

/**
 * Client service-role. `memberships` alimente sharesActiveOrg, `profile` la lecture du profil
 * cible, `authUser` la lecture auth.users. `updateUserById` / `upsert` sont observables.
 */
function serverMock(opts: {
  memberships?: Array<{ user_id: string; org_object_id: string }>;
  profile?: { display_name: string | null; avatar_url: string | null; role: string | null } | null;
  authUser?: { email: string; last_sign_in_at: string | null } | null;
  updateUserById?: jest.Mock;
  upsert?: jest.Mock;
}) {
  const memberships = opts.memberships ?? [
    { user_id: CALLER, org_object_id: 'ORG1' },
    { user_id: TARGET, org_object_id: 'ORG1' },
  ];
  const upsert = opts.upsert ?? jest.fn().mockResolvedValue({ error: null });
  const from = jest.fn((table: string) => {
    if (table === 'user_org_membership') {
      return { select: () => ({ in: () => ({ eq: async () => ({ data: memberships, error: null }) }) }) };
    }
    // app_user_profile
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.profile ?? null, error: null }) }) }),
      upsert,
    };
  });
  return {
    __upsert: upsert,
    from,
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: CALLER } }, error: null }),
      admin: {
        getUserById: jest.fn().mockResolvedValue(
          opts.authUser
            ? { data: { user: { id: TARGET, ...opts.authUser } }, error: null }
            : { data: { user: null }, error: { message: 'not found' } },
        ),
        updateUserById: opts.updateUserById ?? jest.fn().mockResolvedValue({ data: {}, error: null }),
      },
    },
  };
}

beforeEach(() => {
  mockedServer.mockReset();
  mockedCreate.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
});

describe('GET /api/admin/user-profile', () => {
  it('401 sans jeton', async () => {
    mockedServer.mockReturnValue({ auth: {} } as never);
    expect((await GET(getReq(TARGET))).status).toBe(401);
  });

  it('rend le profil complet du membre', async () => {
    mockedServer.mockReturnValue(serverMock({
      profile: { display_name: 'Alice', avatar_url: 'https://cdn/a.jpg', role: 'tourism_agent' },
      authUser: { email: 'alice@oti.re', last_sign_in_at: null },
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    const res = await GET(getReq(TARGET));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      displayName: 'Alice',
      avatarUrl: 'https://cdn/a.jpg',
      email: 'alice@oti.re',
      platformRole: 'tourism_agent',
      lastSignInAt: null,
    });
  });

  it('404 quand le compte auth n’existe pas', async () => {
    mockedServer.mockReturnValue(serverMock({ profile: null, authUser: null }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    expect((await GET(getReq(TARGET))).status).toBe(404);
  });

  it('403 hors périmètre pour un admin d’ORG non superuser', async () => {
    mockedServer.mockReturnValue(serverMock({
      memberships: [{ user_id: CALLER, org_object_id: 'ORG1' }, { user_id: TARGET, org_object_id: 'ORG2' }],
      profile: { display_name: 'Bob', avatar_url: null, role: null },
      authUser: { email: 'bob@ailleurs.re', last_sign_in_at: null },
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: false, rank: 30 }) as never);
    const res = await GET(getReq(TARGET));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('out_of_scope');
  });
});

describe('PATCH /api/admin/user-profile', () => {
  it('403 quand la cible est l’appelant lui-même', async () => {
    mockedServer.mockReturnValue(serverMock({}) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    const res = await PATCH(patchReq({ userId: CALLER, displayName: 'Moi' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('self_edit_forbidden');
  });

  it('403 hors périmètre pour un admin d’ORG non superuser', async () => {
    mockedServer.mockReturnValue(serverMock({
      memberships: [{ user_id: CALLER, org_object_id: 'ORG1' }, { user_id: TARGET, org_object_id: 'ORG2' }],
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: false, rank: 30 }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, displayName: 'Bob' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('out_of_scope');
  });

  it('422 sur une clé de payload inconnue', async () => {
    mockedServer.mockReturnValue(serverMock({}) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, langPrefs: ['fr'] }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('unknown_field');
  });

  it('422 sur une adresse invalide', async () => {
    mockedServer.mockReturnValue(serverMock({}) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, email: 'pas-une-adresse' }));
    expect(res.status).toBe(422);
  });

  it('403 owner_required : un superuser NON owner ne peut pas attribuer super_admin', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock({
      profile: { display_name: 'Alice', avatar_url: null, role: 'tourism_agent' },
      upsert,
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true, isOwner: false }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, platformRole: 'super_admin' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('owner_required');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('403 owner_required : retirer un rôle privilégié exige aussi owner', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock({
      profile: { display_name: 'Alice', avatar_url: null, role: 'super_admin' },
      upsert,
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true, isOwner: false }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, platformRole: 'tourism_agent' }));
    expect(res.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('200 : un owner attribue super_admin', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock({
      profile: { display_name: 'Alice', avatar_url: null, role: 'tourism_agent' },
      upsert,
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true, isOwner: true }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, platformRole: 'super_admin' }));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({ id: TARGET, role: 'super_admin' }, { onConflict: 'id' });
  });

  it('200 : renomme sans toucher au rôle ni à l’e-mail', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const updateUserById = jest.fn();
    mockedServer.mockReturnValue(serverMock({
      profile: { display_name: 'Alice', avatar_url: null, role: 'tourism_agent' },
      upsert,
      updateUserById,
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: false, rank: 30 }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, displayName: '  Alice Martin  ' }));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({ id: TARGET, display_name: 'Alice Martin' }, { onConflict: 'id' });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('200 : change l’e-mail de connexion sans courriel de confirmation', async () => {
    const updateUserById = jest.fn().mockResolvedValue({ data: {}, error: null });
    mockedServer.mockReturnValue(serverMock({
      profile: { display_name: 'Alice', avatar_url: null, role: 'tourism_agent' },
      updateUserById,
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, email: 'Nouvelle@OTI.re' }));
    expect(res.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith(TARGET, { email: 'nouvelle@oti.re', email_confirm: true });
  });
});
```

- [ ] **Step 2 : exécuter le test, vérifier qu'il ÉCHOUE**

```bash
npm run test:run -- src/app/api/admin/user-profile/route.test.ts
```

Attendu : ÉCHEC — `Cannot find module './route'`.

- [ ] **Step 3 : écrire la route**

Créer `src/app/api/admin/user-profile/route.ts` :

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { authorizeAdminRoute, sharesActiveOrg } from '../_authorize';

export const runtime = 'nodejs';

// Identité d'un MEMBRE, éditée par un administrateur (panneau Équipe).
//
// Les 4 gardes vivent ici et NULLE PART ailleurs côté client : l'écran désactive des contrôles
// pour rendre l'état lisible, il ne garde rien. L'écriture ci-dessous tourne en service-role
// (bypass RLS), donc les sondes "en tant qu'appelant" SONT la frontière (même modèle que §59).

const PATCH_FIELDS = new Set(['userId', 'displayName', 'email', 'platformRole']);
const PLATFORM_ROLES = new Set(['tourism_agent', 'super_admin', 'owner']);
/** Rôles qu'en base SEUL un owner peut attribuer (trigger api.enforce_app_user_profile_role_change). */
const PRIVILEGED_ROLES = new Set(['super_admin', 'owner']);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface TargetProfile { display_name: string | null; avatar_url: string | null; role: string | null }

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminRoute(req);
  if (!auth.ok) return auth.response;
  const { server } = auth;

  const userId = (new URL(req.url).searchParams.get('userId') ?? '').trim();
  if (!userId) return NextResponse.json({ error: 'invalid_user_id' }, { status: 422 });

  if (!auth.isSuper && !(await sharesActiveOrg(server, auth.callerId, userId))) {
    return NextResponse.json({ error: 'out_of_scope' }, { status: 403 });
  }

  const { data: authUser, error: authErr } = await server.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });

  const { data: profile } = await server
    .from('app_user_profile')
    .select('display_name, avatar_url, role')
    .eq('id', userId)
    .maybeSingle<TargetProfile>();

  return NextResponse.json({
    displayName: profile?.display_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    email: authUser.user.email ?? null,
    platformRole: profile?.role ?? null,
    lastSignInAt: authUser.user.last_sign_in_at ?? null,
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminRoute(req);
  if (!auth.ok) return auth.response;
  const { server } = auth;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  // Une clé inconnue FAIT ÉCHOUER l'appel : une valeur jetée en silence est un piège d'écriture.
  const unknown = Object.keys(body).find((k) => !PATCH_FIELDS.has(k));
  if (unknown) return NextResponse.json({ error: 'unknown_field', detail: unknown }, { status: 422 });

  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) return NextResponse.json({ error: 'invalid_user_id' }, { status: 422 });

  // Anti-self : un owner qui se rétrograde se verrouille dehors, et son identité a déjà sa
  // surface (Réglages → Mon compte).
  if (userId === auth.callerId) {
    return NextResponse.json({ error: 'self_edit_forbidden' }, { status: 403 });
  }
  if (!auth.isSuper && !(await sharesActiveOrg(server, auth.callerId, userId))) {
    return NextResponse.json({ error: 'out_of_scope' }, { status: 403 });
  }

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : undefined;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;
  const platformRole = typeof body.platformRole === 'string' ? body.platformRole.trim() : undefined;

  if (email !== undefined && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 422 });
  }
  if (platformRole !== undefined && !PLATFORM_ROLES.has(platformRole)) {
    return NextResponse.json({ error: 'invalid_platform_role' }, { status: 422 });
  }

  const { data: profile } = await server
    .from('app_user_profile')
    .select('display_name, avatar_url, role')
    .eq('id', userId)
    .maybeSingle<TargetProfile>();

  // Garde n° 4 — transcription littérale du trigger api.enforce_app_user_profile_role_change,
  // que l'écriture service-role ci-dessous NEUTRALISE (le trigger traite service_role comme un
  // owner et sort d'emblée sans JWT). Sans cette sonde, un super_admin ou un admin de rang 30
  // distribuerait le rang plateforme. Le sens compte dans les DEUX directions : retirer
  // 'owner'/'super_admin' à quelqu'un est aussi privilégié que le lui donner.
  if (platformRole !== undefined && platformRole !== (profile?.role ?? null)) {
    const touchesPrivileged =
      PRIVILEGED_ROLES.has(platformRole) || PRIVILEGED_ROLES.has(profile?.role ?? '');
    if (touchesPrivileged) {
      const { data: isOwner } = await auth.asCaller.schema('api').rpc('is_platform_owner');
      if (isOwner !== true) {
        return NextResponse.json(
          { error: 'owner_required', detail: 'Seul un owner peut attribuer ou retirer le rang plateforme.' },
          { status: 403 },
        );
      }
    }
  }

  if (email !== undefined) {
    // email_confirm: true ⇒ changement IMMÉDIAT, pas de courriel de confirmation. L'e-mail est
    // aussi ce que api.is_object_owner compare à actor_channel : changer l'adresse peut changer
    // les fiches que ce membre possède. La modale l'annonce à l'utilisateur.
    const { error: mailErr } = await server.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (mailErr) {
      return NextResponse.json({ error: 'email_update_failed', detail: mailErr.message }, { status: 500 });
    }
  }

  const patch: Record<string, unknown> = {};
  if (displayName !== undefined) patch.display_name = displayName;
  if (platformRole !== undefined) patch.role = platformRole;
  if (Object.keys(patch).length > 0) {
    // upsert : un compte invité peut ne pas encore avoir de ligne de profil applicatif.
    const { error: profErr } = await server
      .from('app_user_profile')
      .upsert({ id: userId, ...patch }, { onConflict: 'id' });
    if (profErr) {
      return NextResponse.json({ error: 'profile_update_failed', detail: profErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ updated: true }, { status: 200 });
}
```

- [ ] **Step 4 : exécuter le test, vérifier qu'il PASSE**

```bash
npm run test:run -- src/app/api/admin/user-profile/route.test.ts
```

Attendu : 13 tests verts.

- [ ] **Step 5 : typecheck puis commit**

```bash
npm run typecheck
git add src/app/api/admin/user-profile
git commit -m "feat(equipe): route d'edition du profil d'un membre (nom, e-mail, rang plateforme)"
```

---

## Task 3 : photo d'un autre membre (`targetUserId`)

**Files:**
- Modify: `src/app/api/avatar/upload/route.ts`
- Create: `src/app/api/avatar/upload/route.test.ts`

**Interfaces:**
- Consomme : `authorizeAdminRoute`, `sharesActiveOrg` (Task 1).
- Produit : `POST /api/avatar/upload` accepte un champ de formulaire optionnel `targetUserId`. Réponse inchangée : `201 { url }`.

**Règle :** absent ou égal à l'appelant ⇒ comportement actuel, strictement inchangé (chemin dérivé du JWT, persistance en tant qu'appelant). Différent ⇒ gardes rang + périmètre, chemin dérivé du **target validé**, persistance en service-role (la RLS `app_user_profile` n'autorise que soi-même ou un `owner`).

- [ ] **Step 1 : écrire le test**

Créer `src/app/api/avatar/upload/route.test.ts` :

```ts
/** @jest-environment node */
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../../media/upload/process-image', () => ({
  processImage: jest.fn().mockResolvedValue({ buffer: Buffer.from('img'), mimeType: 'image/jpeg' }),
  MediaProcessingError: class extends Error {},
}));
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

const CALLER = 'caller-1';
const TARGET = 'target-1';

function file(): File {
  return new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' });
}

function req(fields: Record<string, string> = {}): never {
  const form = new FormData();
  form.append('file', file());
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return {
    headers: new Headers({ authorization: 'Bearer t' }),
    formData: async () => form,
    url: 'https://app.test/api/avatar/upload',
  } as never;
}

function serverMock(opts: { memberships?: Array<{ user_id: string; org_object_id: string }>; update?: jest.Mock }) {
  const memberships = opts.memberships ?? [
    { user_id: CALLER, org_object_id: 'ORG1' },
    { user_id: TARGET, org_object_id: 'ORG1' },
  ];
  const update = opts.update ?? jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
  return {
    __update: update,
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: CALLER } }, error: null }) },
    from: jest.fn((table: string) =>
      table === 'user_org_membership'
        ? { select: () => ({ in: () => ({ eq: async () => ({ data: memberships, error: null }) }) }) }
        : { update },
    ),
    storage: {
      from: () => ({
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }),
      }),
    },
  };
}

beforeEach(() => {
  mockedServer.mockReset();
  mockedCreate.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
});

it('sans targetUserId : écrit son propre avatar, persisté en tant qu’appelant', async () => {
  const server = serverMock({});
  mockedServer.mockReturnValue(server as never);
  const asCallerUpdate = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
  mockedCreate.mockReturnValue({ from: () => ({ update: asCallerUpdate }) } as never);

  const res = await POST(req());
  expect(res.status).toBe(201);
  expect((await res.json()).url).toContain(`${CALLER}/avatar.jpg`);
  expect(asCallerUpdate).toHaveBeenCalled();
  expect(server.__update).not.toHaveBeenCalled();
});

it('targetUserId d’un membre de la même ORG : chemin de la CIBLE, persisté en service-role', async () => {
  const server = serverMock({});
  mockedServer.mockReturnValue(server as never);
  // 1er createClient = sonde d'autorisation (superuser true) ; on rend le même objet aux deux.
  mockedCreate.mockReturnValue({
    schema: () => ({ rpc: jest.fn().mockResolvedValue({ data: true, error: null }) }),
    from: () => ({ update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }) }),
  } as never);

  const res = await POST(req({ targetUserId: TARGET }));
  expect(res.status).toBe(201);
  expect((await res.json()).url).toContain(`${TARGET}/avatar.jpg`);
  expect(server.__update).toHaveBeenCalledWith({ avatar_url: expect.stringContaining(`${TARGET}/avatar.jpg`) });
});

it('targetUserId hors périmètre : 403, aucun fichier écrit', async () => {
  const server = serverMock({
    memberships: [{ user_id: CALLER, org_object_id: 'ORG1' }, { user_id: TARGET, org_object_id: 'ORG2' }],
  });
  mockedServer.mockReturnValue(server as never);
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: false, error: null })
    .mockResolvedValueOnce({ data: 30, error: null });
  mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

  const res = await POST(req({ targetUserId: TARGET }));
  expect(res.status).toBe(403);
  expect((await res.json()).error).toBe('out_of_scope');
});
```

- [ ] **Step 2 : exécuter le test, vérifier qu'il ÉCHOUE**

```bash
npm run test:run -- src/app/api/avatar/upload/route.test.ts
```

Attendu : ÉCHEC sur les deux cas `targetUserId` (le chemin reste celui de l'appelant, pas de 403).

- [ ] **Step 3 : modifier la route**

Dans `src/app/api/avatar/upload/route.ts` :

a) Ajouter l'import, sous les imports existants :

```ts
import { authorizeAdminRoute, sharesActiveOrg } from '../../admin/_authorize';
```

b) Remplacer la ligne `const userId = userData.user.id;` par :

```ts
  const callerId = userData.user.id;
```

c) Juste après le bloc qui récupère `file` (après le `if (!(file instanceof File)) { … }`), insérer la résolution de la cible :

```ts
  // Bras ADMIN (§ spec 2026-08-28) : un administrateur pose la photo d'un autre membre.
  // Le chemin storage est dérivé du target VALIDÉ, jamais du corps de requête tel quel — le
  // storage tourne en service-role, donc cette validation EST la frontière.
  const targetRaw = form.get('targetUserId');
  const target = typeof targetRaw === 'string' && targetRaw.trim() !== '' ? targetRaw.trim() : callerId;
  const isAdminBranch = target !== callerId;
  if (isAdminBranch) {
    const auth = await authorizeAdminRoute(req);
    if (!auth.ok) return auth.response;
    if (!auth.isSuper && !(await sharesActiveOrg(server, callerId, target))) {
      return NextResponse.json({ error: 'out_of_scope' }, { status: 403 });
    }
  }
  const userId = target;
```

d) Remplacer le bloc de persistance (celui qui construit `asCaller` et fait `.from('app_user_profile').update(...)`) par :

```ts
  // Persistance : EN TANT QU'APPELANT sur son propre profil (policy self-update id = auth.uid()),
  // en SERVICE-ROLE sur le bras admin (la policy n'autorise que soi-même ou un owner — l'admin
  // d'ORG n'y passerait pas, et sa légitimité a déjà été établie ci-dessus).
  let profErr: { message: string } | null = null;
  if (isAdminBranch) {
    ({ error: profErr } = await server.from('app_user_profile').update({ avatar_url: url }).eq('id', userId));
  } else {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
    const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
    const asCaller = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    ({ error: profErr } = await asCaller.from('app_user_profile').update({ avatar_url: url }).eq('id', userId));
  }
  if (profErr) {
    return NextResponse.json({ error: 'profile_update_failed', detail: profErr.message }, { status: 500 });
  }
```

Le commentaire d'en-tête du fichier gagne une phrase : le bras admin existe, et il est gardé.

- [ ] **Step 4 : exécuter le test, vérifier qu'il PASSE**

```bash
npm run test:run -- src/app/api/avatar/upload/route.test.ts
```

Attendu : 3 tests verts.

- [ ] **Step 5 : typecheck puis commit**

```bash
npm run typecheck
git add src/app/api/avatar/upload
git commit -m "feat(equipe): permettre a un admin de poser la photo d'un autre membre"
```

---

## Task 4 : couche service client

**Files:**
- Create: `src/services/team-profile.ts`
- Create: `src/services/team-profile.test.ts`
- Modify: `src/services/rbac.ts` (rendre `rbacRouteError` exporté)

**Interfaces:**
- Consomme : les routes des Tasks 2 et 3 ; `requestPasswordReset` de `src/services/auth.ts` ; `rbacRouteError` de `src/services/rbac.ts`.
- Produit :
  ```ts
  export interface MemberProfile {
    displayName: string | null;
    avatarUrl: string | null;
    email: string | null;
    platformRole: string | null;
    lastSignInAt: string | null;
  }
  export function getMemberProfile(userId: string): Promise<MemberProfile>
  export function updateMemberProfile(input: {
    userId: string; displayName?: string; email?: string; platformRole?: string;
  }): Promise<void>
  export function uploadMemberAvatar(userId: string, file: File): Promise<string>
  export function sendMemberSignInLink(email: string): Promise<void>   // resetPasswordForEmail
  export function sendMemberMagicLink(email: string): Promise<void>    // signInWithOtp
  ```

- [ ] **Step 1 : écrire le test**

Créer `src/services/team-profile.test.ts` :

```ts
import { getMemberProfile, updateMemberProfile, sendMemberMagicLink, sendMemberSignInLink } from './team-profile';

const signInWithOtp = jest.fn();
const resetPasswordForEmail = jest.fn();

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'tok' } } }),
      signInWithOtp: (...a: unknown[]) => signInWithOtp(...a),
      resetPasswordForEmail: (...a: unknown[]) => resetPasswordForEmail(...a),
    },
  }),
}));

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
  resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  global.fetch = fetchMock as unknown as typeof fetch;
});

it('getMemberProfile lit la route avec le jeton de session', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ displayName: 'Alice', avatarUrl: null, email: 'a@b.c', platformRole: 'tourism_agent', lastSignInAt: null }),
  });
  const profile = await getMemberProfile('u1');
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/admin/user-profile?userId=u1',
    expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer tok' }) }),
  );
  expect(profile.displayName).toBe('Alice');
});

it('updateMemberProfile n’émet QUE les champs fournis', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ updated: true }) });
  await updateMemberProfile({ userId: 'u1', displayName: 'Alice' });
  const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
  expect(body).toEqual({ userId: 'u1', displayName: 'Alice' });
});

it('updateMemberProfile traduit une erreur de route en français', async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 403,
    json: async () => ({ error: 'owner_required', detail: 'Seul un owner peut attribuer ou retirer le rang plateforme.' }),
  });
  await expect(updateMemberProfile({ userId: 'u1', platformRole: 'owner' })).rejects.toThrow(/owner/i);
});

it('sendMemberSignInLink passe par resetPasswordForEmail vers /set-password', async () => {
  await sendMemberSignInLink('a@b.c');
  expect(resetPasswordForEmail).toHaveBeenCalledWith('a@b.c', {
    redirectTo: `${window.location.origin}/set-password`,
  });
});

it('sendMemberMagicLink refuse de créer un compte au passage', async () => {
  await sendMemberMagicLink('a@b.c');
  expect(signInWithOtp).toHaveBeenCalledWith({
    email: 'a@b.c',
    options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` },
  });
});

it('sendMemberMagicLink propage l’erreur de débit', async () => {
  signInWithOtp.mockResolvedValue({ error: { message: 'For security purposes, you can only request this after 51 seconds.' } });
  await expect(sendMemberMagicLink('a@b.c')).rejects.toThrow(/51 seconds/);
});
```

- [ ] **Step 2 : exécuter le test, vérifier qu'il ÉCHOUE**

```bash
npm run test:run -- src/services/team-profile.test.ts
```

Attendu : ÉCHEC — `Cannot find module './team-profile'`.

- [ ] **Step 3 : exporter `rbacRouteError`**

Dans `src/services/rbac.ts`, ajouter le mot-clé `export` devant la fonction existante :

```ts
export function rbacRouteError(body: { detail?: string; error?: string } | null | undefined, status: number): Error {
```

Rien d'autre ne change dans ce fichier — le corps et les appelants internes restent identiques.

- [ ] **Step 4 : écrire le service**

Créer `src/services/team-profile.ts` :

```ts
// Identité d'un MEMBRE vue par un administrateur (panneau Équipe).
//
// Deux natures d'appels, délibérément séparées :
//  · l'identité passe par /api/admin/user-profile (service-role gardé serveur) ;
//  · les deux envois de lien passent en DIRECT par GoTrue, parce que resetPasswordForEmail et
//    signInWithOtp sont des endpoints PUBLICS : les router côté serveur avec la service key
//    n'ajouterait aucune barrière, seulement une surface d'attaque. La session de l'appelant
//    n'est pas affectée — le lien n'authentifie que le navigateur qui le clique.

import { getSupabaseClient } from '../lib/supabase';
import { rbacRouteError } from './rbac';

export interface MemberProfile {
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  platformRole: string | null;
  lastSignInAt: string | null;
}

async function authHeader(): Promise<Record<string, string>> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré.');
  const token = (await client.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Session expirée — reconnectez-vous.');
  return { authorization: `Bearer ${token}` };
}

export async function getMemberProfile(userId: string): Promise<MemberProfile> {
  const res = await fetch(`/api/admin/user-profile?userId=${encodeURIComponent(userId)}`, {
    headers: await authHeader(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw rbacRouteError(body, res.status);
  return body as MemberProfile;
}

export async function updateMemberProfile(input: {
  userId: string;
  displayName?: string;
  email?: string;
  platformRole?: string;
}): Promise<void> {
  // On n'émet QUE les champs fournis : la route refuse les clés inconnues, et un `undefined`
  // sérialisé disparaîtrait silencieusement — mieux vaut ne rien envoyer explicitement.
  const payload: Record<string, string> = { userId: input.userId };
  if (input.displayName !== undefined) payload.displayName = input.displayName;
  if (input.email !== undefined) payload.email = input.email;
  if (input.platformRole !== undefined) payload.platformRole = input.platformRole;

  const res = await fetch('/api/admin/user-profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw rbacRouteError(await res.json().catch(() => ({})), res.status);
}

/** Pose la photo de profil d'un AUTRE membre (même pipeline que la sienne : ≤ 512 px, EXIF strippé). */
export async function uploadMemberAvatar(userId: string, file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  body.append('targetUserId', userId);
  const res = await fetch('/api/avatar/upload', { method: 'POST', headers: await authHeader(), body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 415) throw new Error("Format d'image non supporté (JPEG, PNG ou WebP, ≤ 5 Mo).");
    throw rbacRouteError(json, res.status);
  }
  const url = (json as { url?: string }).url;
  if (!url) throw new Error("Réponse invalide du serveur d'avatar.");
  return url;
}

/**
 * Envoie le lien « définir mon mot de passe » (atterrissage /set-password, page qui gère déjà
 * l'invitation et la récupération). C'est AUSSI ce qu'on envoie à un compte jamais connecté :
 * inviteUserByEmail refuse une adresse existante, et le contournement (supprimer puis ré-inviter)
 * détruirait les permissions individuelles du membre.
 */
export async function sendMemberSignInLink(email: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré.');
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/set-password`,
  });
  if (error) throw new Error(error.message);
}

/** Lien de connexion à usage unique. shouldCreateUser: false — sinon une faute de frappe dans
 *  l'adresse créerait un compte fantôme au lieu d'échouer. */
export async function sendMemberMagicLink(email: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré.');
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` },
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 5 : exécuter le test, vérifier qu'il PASSE**

```bash
npm run test:run -- src/services/team-profile.test.ts
```

Attendu : 6 tests verts.

- [ ] **Step 6 : vérifier que rbac.ts n'a pas régressé, puis commit**

```bash
npm run test:run -- src/services
npm run typecheck
git add src/services/team-profile.ts src/services/team-profile.test.ts src/services/rbac.ts
git commit -m "feat(equipe): service client du profil membre et des liens de connexion"
```

---

## Task 5 : la modale `MemberProfileModal`

**Files:**
- Create: `src/features/team/MemberProfileModal.tsx`
- Create: `src/features/team/MemberProfileModal.test.tsx`

**Interfaces:**
- Consomme : `Modal` (`@/components/common/Modal`, props `{ open, title, onOpenChange, children, footer?, size? }`), les 5 fonctions de `team-profile` (Task 4), `OrgMember` de `@/services/rbac`.
- Produit :
  ```ts
  export function MemberProfileModal(props: {
    member: OrgMember | null;   // null ⇒ fermée
    canEditPlatformRole: boolean;
    onClose: () => void;
    onSaved: () => void;        // recharger le roster
  }): JSX.Element
  ```

**Deux pièges à ne pas recréer :**

1. **`Modal` reste monté** pendant son animation de sortie (`usePresence`) : un `useState(() => …)` figé au montage écrirait les valeurs du membre A sur la clé du membre B. La resynchronisation se fait **pendant le rendu**, sur l'**identité** de la ligne (`member.userId`), jamais dans un `useEffect` (deux effets du même commit liraient tous deux l'état d'avant).
2. Le libellé du bouton de lien **dérive de `lastSeenAt`** ; il n'y a qu'un seul appel derrière.

- [ ] **Step 1 : écrire le test**

Créer `src/features/team/MemberProfileModal.test.tsx` :

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemberProfileModal } from './MemberProfileModal';
import type { OrgMember } from '@/services/rbac';
import { getMemberProfile, updateMemberProfile, sendMemberSignInLink, sendMemberMagicLink } from '@/services/team-profile';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/services/team-profile', () => ({
  getMemberProfile: jest.fn(),
  updateMemberProfile: jest.fn(),
  uploadMemberAvatar: jest.fn(),
  sendMemberSignInLink: jest.fn(),
  sendMemberMagicLink: jest.fn(),
}));

const mockedGet = jest.mocked(getMemberProfile);
const mockedUpdate = jest.mocked(updateMemberProfile);
const mockedSignIn = jest.mocked(sendMemberSignInLink);
const mockedMagic = jest.mocked(sendMemberMagicLink);

const alice: OrgMember = {
  membershipId: 'm1', userId: 'u1', email: 'alice@oti.re', displayName: 'Alice',
  isActive: true, businessRoleCode: 'editor', adminRoleCode: null,
  permissionCodes: [], lastSeenAt: null, inheritedPermissionCodes: [], isPlatformSuperuser: false,
};
const bob: OrgMember = { ...alice, membershipId: 'm2', userId: 'u2', email: 'bob@oti.re', displayName: 'Bob' };

function profileOf(name: string, role = 'tourism_agent') {
  return { displayName: name, avatarUrl: null, email: `${name.toLowerCase()}@oti.re`, platformRole: role, lastSignInAt: null };
}

beforeEach(() => {
  mockedGet.mockReset().mockImplementation(async (id) => profileOf(id === 'u1' ? 'Alice' : 'Bob'));
  mockedUpdate.mockReset().mockResolvedValue(undefined);
  mockedSignIn.mockReset().mockResolvedValue(undefined);
  mockedMagic.mockReset().mockResolvedValue(undefined);
});

function renderModal(member: OrgMember | null, canEditPlatformRole = true) {
  return render(
    <MemberProfileModal member={member} canEditPlatformRole={canEditPlatformRole} onClose={() => {}} onSaved={() => {}} />,
  );
}

it('rend le nom chargé du membre', async () => {
  renderModal(alice);
  await waitFor(() => expect(screen.getByLabelText(/Nom affiché/i)).toHaveValue('Alice'));
});

it('resynchronise le formulaire quand la modale rouvre sur un AUTRE membre', async () => {
  const { rerender } = renderModal(alice);
  await waitFor(() => expect(screen.getByLabelText(/Nom affiché/i)).toHaveValue('Alice'));

  // Fermeture puis réouverture sur Bob SANS démontage (Modal reste monté pour son animation).
  rerender(<MemberProfileModal member={null} canEditPlatformRole onClose={() => {}} onSaved={() => {}} />);
  rerender(<MemberProfileModal member={bob} canEditPlatformRole onClose={() => {}} onSaved={() => {}} />);

  await waitFor(() => expect(screen.getByLabelText(/Nom affiché/i)).toHaveValue('Bob'));
});

it('libelle « Renvoyer l’invitation » pour un compte jamais connecté', async () => {
  renderModal({ ...alice, lastSeenAt: null });
  expect(await screen.findByRole('button', { name: /Renvoyer l’invitation/i })).toBeInTheDocument();
});

it('libelle « Réinitialiser le mot de passe » pour un compte déjà connecté', async () => {
  renderModal({ ...alice, lastSeenAt: '2026-08-01T10:00:00Z' });
  expect(await screen.findByRole('button', { name: /Réinitialiser le mot de passe/i })).toBeInTheDocument();
});

it('les deux libellés déclenchent le MÊME envoi', async () => {
  renderModal({ ...alice, lastSeenAt: null });
  fireEvent.click(await screen.findByRole('button', { name: /Renvoyer l’invitation/i }));
  await waitFor(() => expect(mockedSignIn).toHaveBeenCalledWith('alice@oti.re'));
});

it('envoie un lien de connexion à usage unique', async () => {
  renderModal(alice);
  fireEvent.click(await screen.findByRole('button', { name: /lien de connexion/i }));
  await waitFor(() => expect(mockedMagic).toHaveBeenCalledWith('alice@oti.re'));
});

it('désactive le rôle plateforme avec un motif accessible pour un non-owner', async () => {
  renderModal(alice, false);
  const select = await screen.findByLabelText(/Rôle plateforme/i);
  expect(select).toBeDisabled();
  expect(screen.getByText(/Seul un owner/i)).toBeInTheDocument();
});

it('affiche l’avertissement sur la conséquence d’un changement d’e-mail', async () => {
  renderModal(alice);
  expect(await screen.findByText(/fiches dont ce membre est propriétaire/i)).toBeInTheDocument();
});

it('n’envoie que les champs modifiés à l’enregistrement', async () => {
  renderModal(alice);
  await waitFor(() => expect(screen.getByLabelText(/Nom affiché/i)).toHaveValue('Alice'));
  fireEvent.change(screen.getByLabelText(/Nom affiché/i), { target: { value: 'Alice Martin' } });
  fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));
  await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith({ userId: 'u1', displayName: 'Alice Martin' }));
});
```

- [ ] **Step 2 : exécuter le test, vérifier qu'il ÉCHOUE**

```bash
npm run test:run -- src/features/team/MemberProfileModal.test.tsx
```

Attendu : ÉCHEC — `Cannot find module './MemberProfileModal'`.

- [ ] **Step 3 : écrire la modale**

Créer `src/features/team/MemberProfileModal.tsx` :

```tsx
'use client';

// Identité d'un membre, éditée par un administrateur. Complément de ProfileEditModal (§171),
// qui reste la surface unique de SON PROPRE profil : cette modale ne s'ouvre jamais sur soi.
//
// Rappel de contrat : les contrôles désactivés ci-dessous sont un confort de lecture. La règle
// vit dans /api/admin/user-profile, qui la ré-évalue.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/common/Modal';
import type { OrgMember } from '@/services/rbac';
import {
  getMemberProfile,
  updateMemberProfile,
  uploadMemberAvatar,
  sendMemberSignInLink,
  sendMemberMagicLink,
  type MemberProfile,
} from '@/services/team-profile';

const PLATFORM_ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'tourism_agent', label: 'Agent (aucun rang plateforme)' },
  { value: 'super_admin', label: 'Super administrateur' },
  { value: 'owner', label: 'Propriétaire de la plateforme' },
];

export function MemberProfileModal({ member, canEditPlatformRole, onClose, onSaved }: {
  member: OrgMember | null;
  /** L'appelant est-il `owner` ? Seul un owner peut attribuer ou retirer un rang plateforme. */
  canEditPlatformRole: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loaded, setLoaded] = useState<MemberProfile | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [platformRole, setPlatformRole] = useState('tourism_agent');
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Resynchronisation PENDANT LE RENDU sur l'IDENTITÉ de la ligne. Modal reste monté pendant son
  // animation de sortie : un état figé au montage écrirait les valeurs du membre précédent sur la
  // clé du suivant. Un useEffect ne suffirait pas — deux effets du même commit liraient tous deux
  // l'état d'avant, et le chargement repartirait sur l'ancien id.
  const [syncedUserId, setSyncedUserId] = useState<string | null>(null);
  if (member && member.userId !== syncedUserId) {
    setSyncedUserId(member.userId);
    setLoaded(null);
    setName(member.displayName ?? '');
    setEmail(member.email ?? '');
    setPlatformRole('tourism_agent');
    setAvatarUrl(null);
  }

  const userId = member?.userId ?? null;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getMemberProfile(userId)
      .then((p) => {
        if (cancelled) return;
        setLoaded(p);
        setName(p.displayName ?? '');
        setEmail(p.email ?? '');
        setPlatformRole(p.platformRole ?? 'tourism_agent');
        setAvatarUrl(p.avatarUrl);
      })
      .catch((e: Error) => { if (!cancelled) toast.error(e.message); });
    return () => { cancelled = true; };
  }, [userId]);

  const neverConnected = member?.lastSeenAt === null;
  const signInLabel = neverConnected ? 'Renvoyer l’invitation' : 'Réinitialiser le mot de passe';

  async function send(kind: 'signin' | 'magic') {
    if (!member?.email) { toast.error('Ce compte n’a pas d’adresse e-mail.'); return; }
    setBusy(true);
    try {
      if (kind === 'signin') await sendMemberSignInLink(member.email);
      else await sendMemberMagicLink(member.email);
      toast.success(`Lien envoyé à ${member.email}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!member) return;
    const trimmed = name.trim();
    if (trimmed === '') { toast.error('Le nom ne peut pas être vide.'); return; }
    const patch: Parameters<typeof updateMemberProfile>[0] = { userId: member.userId };
    if (trimmed !== (loaded?.displayName ?? '')) patch.displayName = trimmed;
    const nextEmail = email.trim().toLowerCase();
    if (nextEmail !== (loaded?.email ?? '').toLowerCase()) patch.email = nextEmail;
    if (canEditPlatformRole && platformRole !== (loaded?.platformRole ?? 'tourism_agent')) {
      patch.platformRole = platformRole;
    }
    if (Object.keys(patch).length === 1) { onClose(); return; }

    setBusy(true);
    try {
      await updateMemberProfile(patch);
      toast.success('Profil mis à jour.');
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // permet de re-sélectionner le même fichier
    if (!file || !member) return;
    setAvatarBusy(true);
    try {
      setAvatarUrl(await uploadMemberAvatar(member.userId, file));
      toast.success('Photo mise à jour.');
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  const initials = (name.trim() || '?').split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

  return (
    <Modal
      open={member !== null}
      title={`Profil de ${member?.displayName ?? member?.email ?? 'ce membre'}`}
      onOpenChange={(next) => { if (!next) onClose(); }}
      footer={
        <>
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Annuler</button>
          <button type="button" className="primary-button" onClick={() => void save()} disabled={busy || name.trim() === ''}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      <div className="inline-actions" style={{ alignItems: 'center', gap: 16 }}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar CDN Supabase
          <img src={avatarUrl} alt="" width={64} height={64}
            style={{ width: 64, height: 64, borderRadius: 999, objectFit: 'cover', flex: 'none' }} />
        ) : (
          <span aria-hidden style={{ width: 64, height: 64, borderRadius: 999, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent, #1f7a6d)', color: '#fff', fontWeight: 700, fontSize: 22 }}>
            {initials}
          </span>
        )}
        <label className="ghost-button marker-upload-button cursor-pointer">
          {avatarBusy ? 'Envoi…' : avatarUrl ? 'Changer la photo' : 'Ajouter une photo'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
            disabled={avatarBusy} onChange={(e) => void onAvatarChange(e)} />
        </label>
      </div>
      <p className="pref__hint">JPEG, PNG ou WebP — ≤ 5 Mo. Redimensionnée et nettoyée (métadonnées EXIF/GPS supprimées).</p>

      <div className="field-block">
        <label htmlFor="memberProfileName">Nom affiché</label>
        <input id="memberProfileName" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </div>

      <div className="field-block">
        <label htmlFor="memberProfileEmail">E-mail de connexion</label>
        <p className="pref__hint" id="memberProfileEmailWarning">
          Le changement est immédiat, sans courriel de confirmation. Cette adresse sert aussi à
          rattacher un utilisateur aux prestataires : la modifier peut changer les fiches dont ce
          membre est propriétaire.
        </p>
        <input id="memberProfileEmail" type="email" value={email} aria-describedby="memberProfileEmailWarning"
          onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
      </div>

      <div className="field-block">
        <label htmlFor="memberProfileRole">Rôle plateforme</label>
        {!canEditPlatformRole && (
          <p className="pref__hint" id="memberProfileRoleReason">
            Seul un owner peut attribuer ou retirer un rang plateforme.
          </p>
        )}
        <select id="memberProfileRole" className="select" value={platformRole}
          disabled={!canEditPlatformRole}
          aria-describedby={canEditPlatformRole ? undefined : 'memberProfileRoleReason'}
          onChange={(e) => setPlatformRole(e.target.value)}>
          {PLATFORM_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="field-block">
        <span>Accès au compte</span>
        <div className="inline-actions">
          <button type="button" className="ghost-button" disabled={busy} onClick={() => void send('signin')}>
            {signInLabel}
          </button>
          <button type="button" className="ghost-button" disabled={busy} onClick={() => void send('magic')}>
            Envoyer un lien de connexion
          </button>
        </div>
        <p className="pref__hint">
          Les deux liens atterrissent sur l’application. Un envoi trop rapproché est refusé par la
          limite de débit de Supabase — le message d’erreur le dit.
        </p>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4 : exécuter le test, vérifier qu'il PASSE**

```bash
npm run test:run -- src/features/team/MemberProfileModal.test.tsx
```

Attendu : 9 tests verts. Si le cas « resynchronise » échoue, c'est que l'ajustement d'état a glissé dans un `useEffect` : il doit rester **dans le corps du rendu**.

- [ ] **Step 5 : typecheck puis commit**

```bash
npm run typecheck
git add src/features/team/MemberProfileModal.tsx src/features/team/MemberProfileModal.test.tsx
git commit -m "feat(equipe): modale d'edition du profil d'un membre"
```

---

## Task 6 : câblage dans le panneau Équipe

**Files:**
- Modify: `src/features/team/MembersTable.tsx` (props + colonne d'actions)
- Modify: `src/features/team/MembersTable.test.tsx` (un cas de plus)
- Modify: `src/views/TeamAdminPage.tsx`

**Interfaces:**
- Consomme : `MemberProfileModal` (Task 5).
- Produit : `MembersTable` accepte une prop optionnelle `onEditProfile?: (m: OrgMember) => void`, rendue comme un bouton « Modifier » **avant** « Désactiver », **absent sur sa propre ligne** (même règle que les deux autres actions).

- [ ] **Step 1 : écrire le test de la table**

Ajouter à la fin de `src/features/team/MembersTable.test.tsx` :

```tsx
describe('MembersTable — action Modifier', () => {
  it('rend le bouton Modifier sur une autre ligne que la sienne', () => {
    render(
      <MembersTable members={[base]} currentUserId="autre" onManagePermissions={() => {}} onEditProfile={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument();
  });

  it('n’offre PAS Modifier sur sa propre ligne', () => {
    render(
      <MembersTable members={[base]} currentUserId="u1" onManagePermissions={() => {}} onEditProfile={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : exécuter le test, vérifier qu'il ÉCHOUE**

```bash
npm run test:run -- src/features/team/MembersTable.test.tsx
```

Attendu : ÉCHEC sur le premier cas — le bouton n'existe pas.

- [ ] **Step 3 : ajouter l'action dans `MembersTable`**

a) Ajouter la prop à la signature, à côté de `onDeactivate` / `onDelete` :

```tsx
  /** Called when the admin clicks "Modifier" (identity modal) on a non-self row. */
  onEditProfile?: (m: OrgMember) => void;
```

et l'ajouter au déstructurage : `{ members, currentUserId, onManagePermissions, onEditProfile, onDeactivate, onDelete, children }`.

b) Dans la cellule `<td className="data-table__actions">`, insérer **avant** le bouton « Désactiver » :

```tsx
                {!isSelf && onEditProfile && (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onEditProfile(m)}
                    title="Modifier le profil de ce membre"
                  >
                    Modifier
                  </button>
                )}
```

- [ ] **Step 4 : exécuter le test, vérifier qu'il PASSE**

```bash
npm run test:run -- src/features/team/MembersTable.test.tsx
```

Attendu : tous les cas verts, anciens compris.

- [ ] **Step 5 : monter la modale dans `TeamAdminPage`**

a) Ajouter l'import à côté de celui de `MemberPermissionsDrawer` :

```tsx
import { MemberProfileModal } from '@/features/team/MemberProfileModal';
```

b) Ajouter l'état, à côté de `managingId` :

```tsx
  // ID du membership dont la modale de profil est ouverte (null = fermée).
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
```

c) Ajouter la dérivation, à côté de `managing` :

```tsx
  const editingProfile = members.find((m) => m.membershipId === editingProfileId) ?? null;
```

d) Passer la prop à `MembersTable`, à côté de `onDelete` :

```tsx
            onEditProfile={canManageOrgDefaults ? (m) => setEditingProfileId(m.membershipId) : undefined}
```

e) Monter la modale juste après `<MemberPermissionsDrawer … />` :

```tsx
      <MemberProfileModal
        member={editingProfile}
        canEditPlatformRole={role === 'owner'}
        onClose={() => setEditingProfileId(null)}
        onSaved={reload}
      />
```

`role === 'owner'` est délibérément plus strict que `isSuperuser` : c'est ce que `api.is_platform_owner()` reconnaît, et donc ce que la route acceptera. Un `super_admin` verrait sinon un champ actif dont l'enregistrement échouerait en 403 — un piège d'écriture.

- [ ] **Step 6 : exécuter toute la suite**

```bash
npm run test:run
npm run typecheck
```

Attendu : suite entièrement verte, aucune erreur de type.

- [ ] **Step 7 : commit**

```bash
git add src/features/team/MembersTable.tsx src/features/team/MembersTable.test.tsx src/views/TeamAdminPage.tsx
git commit -m "feat(equipe): ouvrir la modale de profil depuis la liste des membres"
```

---

## Task 7 : vérification dans l'app réelle + documentation

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (nouvelle entrée §)
- Modify: `CLAUDE.md` (tracker des différés, à la racine du dépôt)

**Aucun test unitaire ne prouve qu'un e-mail part.** Cette tâche est la seule preuve que la chaîne fonctionne bout en bout.

- [ ] **Step 1 : lancer l'application**

Utiliser l'outil de prévisualisation (`preview_start` avec l'entrée dev de `.claude/launch.json`), **jamais** `npm run dev` via Bash. Se connecter avec un compte `owner`, aller sur `/settings` → Équipe.

- [ ] **Step 2 : parcours nominal, avec relevé**

Sur un membre qui n'est pas soi :

1. Cliquer « Modifier » → la modale s'ouvre, la photo et le rôle plateforme sont **chargés** (ils ne viennent pas du roster : c'est la preuve que le `GET` répond).
2. Changer le nom, enregistrer → toast de succès, **la ligne du tableau porte le nouveau nom** après rechargement.
3. Rouvrir la modale sur un **autre** membre → les champs portent le second membre, pas le premier. *(C'est le piège §212 vérifié en vrai.)*
4. Cliquer le bouton de lien → toast nommant l'adresse ; **vérifier la réception** (ou relever le message d'erreur de limite de débit, qui prouve aussi que l'appel part).
5. Cliquer « Envoyer un lien de connexion » → même vérification. Si le projet Supabase a désactivé les liens magiques, relever le message d'erreur exact et le consigner.

- [ ] **Step 3 : vérifier la garde des DEUX côtés**

Une garde qui coupe tout le monde passerait le test du refus et casserait le produit.

- Avec le compte `owner` : le sélecteur de rôle plateforme est **actif** et l'enregistrement **passe**.
- Avec un compte `super_admin` **non owner** (ou en simulant `role !== 'owner'`) : le sélecteur est **désactivé avec son motif visible**, et une requête `PATCH` forgée à la main (console, `fetch` avec le jeton de session) répond **403 `owner_required`**. C'est cette seconde moitié qui prouve que l'UI n'est pas la seule barrière.

- [ ] **Step 4 : consigner la décision**

Ajouter une entrée dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`, numérotée **après** le dernier `## §` du fichier (le relire pour ne pas réutiliser un numéro). Elle doit contenir :

- ce qui a été livré (route, extension avatar, modale, câblage) ;
- **pourquoi deux boutons de lien et non trois** (`inviteUserByEmail` refuse une adresse existante ; le contournement delete+ré-invite détruit `user_permission`) ;
- **pourquoi la garde `is_platform_owner` est transcrite dans la route** (le trigger `api.enforce_app_user_profile_role_change` sort d'emblée sans JWT et traite `service_role` comme un owner — l'écriture service-role le neutralise) ;
- le rappel que `shouldCreateUser: false` empêche une faute de frappe de créer un compte fantôme ;
- ce qui a été **vérifié en réel** (Step 2 et 3), avec les résultats observés.

- [ ] **Step 5 : reporter le différé dans `CLAUDE.md`**

Dans le tableau « Deferred items tracker » de `.claude/WORKFLOW.md` (inclus par `CLAUDE.md`), ajouter :

| Item | Reason deferred | Unblocked by |
|------|----------------|--------------|
| **`/api/admin/invite` et `/api/admin/delete-user` ne vérifient pas le périmètre d'ORG** : un admin de rang 30 de l'ORG A peut inviter dans / supprimer un compte de l'ORG B en connaissant son `userId`. La garde `sharesActiveOrg` existe désormais (`src/app/api/admin/_authorize.ts`) mais n'est câblée que sur `user-profile` et le bras admin de l'upload d'avatar | Y toucher changerait le comportement de deux routes en production, hors périmètre de la passe qui a créé la garde | Passe dédiée sur les routes `/api/admin/*` |

- [ ] **Step 6 : commit**

```bash
git add "bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md" .claude/WORKFLOW.md
git commit -m "docs(equipe): consigner l'edition du profil membre et le differe de perimetre ORG"
```

- [ ] **Step 7 : rendre compte**

Énoncer, sans hedging : ce qui a changé, où, pourquoi, **ce qui a été vérifié avec la sortie réelle**, et ce qui reste incertain (typiquement : la disponibilité du lien magique côté projet Supabase, et la limite de débit observée).
