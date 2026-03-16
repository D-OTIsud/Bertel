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