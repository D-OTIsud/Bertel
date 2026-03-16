# Bertel Tourism UI

Application front-end dediee a la gestion touristique et CRM collaborative de Bertel 3.0.

## Prérequis

- **Node.js 20+** recommandé (certaines dépendances comme Supabase et un futur passage à Tailwind v4 le demandent). En Node 18 le projet peut encore builder avec Tailwind v3.

## Choix techniques

- React + TypeScript + Vite
- Supabase JS pour RPC et Realtime
- React Query pour les requetes et la pagination keyset
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

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ENABLE_DEMO_MODE`
- `VITE_MAP_STYLE_CLASSIC`
- `VITE_MAP_STYLE_SATELLITE`
- `VITE_MAP_STYLE_TOPO`

`VITE_ENABLE_DEMO_MODE` est desactive par defaut. Le mode mock doit etre active explicitement.

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