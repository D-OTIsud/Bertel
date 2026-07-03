# Documentation dédiée aux prestataires externes (API publique partenaire) — design

**Date** : 2026-07-03 · **PO** : d.philippe@otisud.com · **Statut** : validé (audience, support, contact, restriction COPY — tous actés en session)

## Problème

La passerelle partenaire `/api/public/*` est livrée et complète (clés `bk_live_…`, 4 endpoints, 4 formats pivot, flux tombstone, `?lang=all`, OpenAPI 3.1, Postman), mais **aucun document ne s'adresse à un développeur tiers** : tout est éclaté entre notes de livraison internes (`docs/api-audit/*`), l'`openapi.json` brut et la collection Postman. Un partenaire qui reçoit une clé n'a pas de porte d'entrée.

## Décisions actées

| Question | Décision |
|---|---|
| Audience | Développeurs partenaires consommant l'API publique (agences, DATAtourisme, Apidae, Tourinsoft, intégrateurs) |
| Support | **Les deux** : Markdown versionné dans le repo **et** page HTML sur le site docs déployé (Coolify/nginx) |
| Anti-drift | **Une seule source** : `docs/guide-partenaires.md` ; la page `docs/partenaires.html` charge et rend ce Markdown côté client (le Dockerfile sert déjà les `.md` à la racine nginx) |
| Contact clé API | `d.philippe@otisud.com` (cohérent avec le champ `contact` d'`openapi.json`) |
| Base URL publiée | Placeholder `https://<domaine-fourni-avec-la-clé>/api/public` (même convention que le serveur variable d'`openapi.json` — le domaine réel est communiqué avec la clé) |
| `COPY *.md` du Dockerfile | **Restreint** dans la même passe à une liste explicite — les audits internes (`security-audit-*.md`, `db-structure-audit-*.md`…) ne doivent plus être servis publiquement |

## Approche retenue (A)

Markdown unique + page HTML « rendeur ». Rejetées : (B) page HTML rédigée à la main en plus du .md — double maintenance, drift garanti ; (C) section dans `index.html` — le partenaire atterrirait dans la doc interne monolithique.

## Livrables

1. **`docs/guide-partenaires.md`** — contenu canonique, en français, fidèle aux routes réelles (`bertel-tourism-ui/src/app/api/public/**` + `src/lib/partner-auth.ts` + `src/lib/public-api.ts`) :
   - Démarrage : rôle de l'API (lecture seule, fiches **publiées** uniquement), obtention de clé (contact), base URL, premier appel curl.
   - Auth & limites : `Authorization: Bearer bk_live_<48 hex>`, 401 ; 120 req/min/clé (fenêtre fixe, 429 + `Retry-After`) ; clé **serveur-à-serveur uniquement** (jamais dans un navigateur/mobile) ; versionnage `meta.contract_version` (1.0.0) + header `X-Bertel-Api-Version`, additif-only (le parseur doit ignorer les clés inconnues), rupture ⇒ `/api/public/v2/*`.
   - Les 4 endpoints : `GET /objects` (cursor, `page_size` 1–200 déf. 50, `types` csv — table des 19 codes, `search`, `lang`, `format` ; `meta.next_cursor` null en dernière page), `GET /objects/{id}` (forme d'id, 404 = inconnu OU non publié, `lang=all` → bloc additif `data.i18n`), `GET /objects/deletions` (`since` ISO 8601, `limit` 1–1000 déf. 500, `data[{object_id,type,deleted_at}]`, `meta.cursor` à repasser en `since` ; **suppressions définitives seulement** — dépublication = tombstone logique à réconcilier), `GET /catalog` (`domains` csv, `lang`).
   - Recette de synchronisation complète (boucle curseur + upserts + tombstones + réconciliation dépublications).
   - Formats pivot `?format=jsonld|datatourisme|apidae|tourinsoft` : tableau d'usage, bloc additif, item non couvert sans la clé, **périmètre honnête** (champs cœur ; pas d'horaires/tarifs/dates FMA/tracés ITI ; FR only dans les pivots ; validation field-à-field requise avant synchro de prod).
   - Table des erreurs (400/401/404/429/500/502) et bonnes pratiques (backoff, fréquence).
   - Références : `openapi.json`, `openapi.html`, collection Postman publique (dossier 13).
2. **`docs/partenaires.html`** — page publique au thème du site docs (#76B097, sombre/clair), sommaire généré, qui `fetch('guide-partenaires.md')` et le rend via :
3. **`docs/partenaires-render.js`** — mini-rendeur Markdown vendored (pas de CDN), périmètre = exactement la syntaxe utilisée par le guide (titres, gras/italique/code, blocs ```, tables, listes plates, liens http(s)/mailto/relatifs, citation, hr), échappement HTML d'abord. Auto-check Node `docs/partenaires-render.check.js` (non déployé).
4. **`docs/Dockerfile`** — `COPY` **explicites** : pages html réellement liées (`index/partenaires/openapi/api-db-reference.html` — les deux dernières étaient **déjà cassées** en prod, jamais copiées), md publics (`guide-partenaires`, `README_Postman`, `SQL_ROLLOUT_RUNBOOK`, `SUPABASE_SETUP`, note I4 sous `api-audit/`), les 3 json (openapi + Postman ×2), `partenaires-render.js`. Commentaire interdisant le retour à `COPY *.md`.
5. **`docs/index.html`** — lien « Espace partenaires » vers `partenaires.html` dans le tableau des artefacts ; **`docs/README.md`** — structure mise à jour.

## Vérification

- Auto-check Node du rendeur contre le vrai `guide-partenaires.md` (aucun artefact Markdown résiduel, ancres présentes).
- Site servi en local (serveur statique) + inspection du rendu de `partenaires.html` (snapshot/screenshot).
- Exemples du guide relus contre `openapi.json` et les routes réelles.

## Hors périmètre

- Traduction EN du guide (FR d'abord ; l'écosystème cible est français).
- Toute évolution de l'API elle-même ; portail self-service de clés.
