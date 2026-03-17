# Bertel Tourism UI

Application front-end dediee a la gestion touristique et CRM collaborative de Bertel 3.0.

## Prérequis

- **Node.js 20+** recommandé (certaines dépendances comme Supabase et un futur passage à Tailwind v4 le demandent). En Node 18 le projet peut encore builder avec Tailwind v3.

## Choix techniques

- **Next.js 16** (App Router) + React 19 + TypeScript
- Supabase JS pour RPC et Realtime
- TanStack Query pour les requetes et la pagination keyset
- Zustand pour l'etat UI, session et filtres
- MapLibre GL JS + Mapbox Draw pour la carte et le lasso
- Docker + Nginx avec injection runtime des variables pour Coolify

## Demarrage local

```bash
cp .env.example .env
npm install
npm run dev
```

## Variables d'environnement

Pour Next.js (`npm run dev` / `npm run build`), utilisez les variables **NEXT_PUBLIC_*** (exposees au client) :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_ENABLE_DEMO_MODE`
- `NEXT_PUBLIC_MAP_STYLE_CLASSIC`
- `NEXT_PUBLIC_MAP_STYLE_SATELLITE`
- `NEXT_PUBLIC_MAP_STYLE_TOPO`

`NEXT_PUBLIC_ENABLE_DEMO_MODE` est desactive par defaut. Le mode mock doit etre active explicitement. Les equivalents `VITE_*` restent utilisables pour `npm run dev:vite` / `npm run build:vite` (legacy).

## Demarrage Docker

```bash
docker compose up --build
```

## Notes d'integration

- Les listes et la carte s'appuient sur `api.list_object_resources_filtered_page` et `api.list_objects_map_view`.
- Le tiroir d'edition s'appuie sur `api.get_object_resource`.
- En mode normal, le role UI est attendu depuis la session Supabase, pas depuis un switch local.
- Les modules CRM, moderation, audits et publications affichent maintenant une erreur explicite tant que leurs RPC dedies ne sont pas branches.
- Les formats d'affichage doivent idealement reutiliser les blocs `render` emis par l'API.

## Supabase et schema `api`

L'API PostgreSQL est organisee avec une separation stricte :

- **Tables** : dans le schema par defaut `public`
- **Fonctions / endpoints RPC** : dans le schema `api`

Le front expose maintenant **deux clients Supabase distincts** dans `src/lib/supabase.ts` :

- `getSupabaseClient()` : client standard pour les tables du schema `public` et le storage
- `getApiClient()` : client dedie aux RPC du schema `api` avec `db: { schema: 'api' }`

Convention a appliquer :

- **Acces tables** :

```ts
const db = getSupabaseClient();
const { data, error } = await db.from('object').select('*');
```

- **Appels RPC** :

```ts
const api = getApiClient();
const { data, error } = await api.schema('api').rpc('get_public_branding');
```

En pratique, le projet combine les deux :

- `getApiClient()` pour separer clairement les appels RPC du client base de donnees standard
- `.schema('api')` devant `.rpc()` pour forcer le bon schema au moment de l'appel et eviter les erreurs 404/PGRST202

Cette regle est appliquee partout dans le front :

- `src/services/rpc.ts` :
  - `client.schema('api').rpc('get_object_with_deep_data', ...)`
  - `client.schema('api').rpc('list_object_resources_filtered_page', ...)`
  - `client.schema('api').rpc('list_objects_map_view', ...)`
  - `client.schema('api').rpc('get_object_resource', ...)`
- `src/services/branding.ts` :
  - `client.schema('api').rpc('get_public_branding')`
  - `client.schema('api').rpc('get_app_branding')`
  - `apiClient.schema('api').rpc('upsert_app_branding', ...)`

Cette architecture evite les erreurs de type PGRST202/404 lorsque les fonctions sont definies dans `api`, tout en conservant les acces standards aux tables dans `public`.