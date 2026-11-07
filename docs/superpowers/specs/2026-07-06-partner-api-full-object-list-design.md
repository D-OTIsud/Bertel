# Design — API partenaire : listes d'objets complets (`?view=full`)

**Date** : 2026-07-06
**Statut** : approuvé (PO) — Approche A
**Surface** : passerelle partenaire `/api/public/*` (audit API, lot R1b/I2)

---

## 1. Problème

Aujourd'hui `GET /api/public/objects` renvoie une **carte allégée** par objet
(`api.get_object_cards_batch` : nom, type, image de couverture, localisation, statut ouvert).
Le détail complet d'une fiche n'est disponible que via `GET /api/public/objects/{id}`,
**un objet à la fois** (`api.get_object_resource`).

Un partenaire qui veut redistribuer la donnée publique (photos, descriptions, équipements,
classements/distinctions, chambres, horaires, tracés GPS, dénivelés…) doit donc faire N appels
détail après la liste. Le PO veut pouvoir récupérer des **listes d'objets entiers** — la data
publique uniquement, pas le CRM.

## 2. Décision — Approche A (exposer le mode `full` déjà présent dans le RPC)

Le RPC qui alimente la liste, `api.list_object_resources_page`, possède **déjà** un paramètre
`p_view` : `'card'` (défaut) → cartes ; `'full'` → `api.get_object_resources_batch` →
**le même `api.get_object_resource` que la route détail**, un item par objet. La route partenaire
ne le passe simplement pas.

On expose ce mode via un drapeau de requête, avec un **plafond de page plus bas** (garde-fou
perf §125). Aucune nouvelle donnée n'est construite ; aucune nouvelle exposition (même payload
que la route détail déjà auditée le 2026-06-30, 0 critical).

Rejeté : **B** (endpoint d'export streaming NDJSON) — reporté, YAGNI pour ~840 objets avec le
delta déjà en place. **C** (projection publique intermédiaire dédiée) — nouveau sérialiseur à
maintenir en double du modèle ; les profils `datatourisme`/`apidae` couvrent déjà ce créneau.

## 3. Contrat API (additif — pas de rupture, même major)

`GET /api/public/objects` gagne deux paramètres optionnels :

| Param | Valeurs | Défaut | Effet |
|-------|---------|--------|-------|
| `view` | `card` \| `full` | `card` | `full` ⇒ chaque item = fiche complète `get_object_resource` |
| `track` | `gpx` \| `kml` | *(absent)* | En mode `full` uniquement : ajoute le blob GPX/KML sur les itinéraires |

Plafonds de pagination (curseur inchangé) :

| Mode | `page_size` défaut | `page_size` max |
|------|--------------------|-----------------|
| `card` (inchangé) | 50 | 200 |
| `full` | 25 | **100** |

- Le curseur transporte `view`/`page_size` : le plafond s'applique au **premier** appel, puis
  se propage. `status` reste **forcé** `published`.
- Enveloppe inchangée : `{ meta: { contract_version, page_size, total, next_cursor }, data:[…] }`.
- Orthogonal à `?lang` et `?format` : `view=full&format=datatourisme` renvoie l'item complet natif
  **plus** le bloc pivot par item (comportement additif existant du merge par `item.id`).

## 4. Performance (mesuré, base démo, 361 publiés, 0 ITI — borne basse)

`api.get_object_resources_batch` : **~27 ms/objet, ~15 kB/objet, linéaire**.

| Page | Temps | Payload |
|------|-------|---------|
| 25 | 0,65 s | 342 kB |
| 50 | 1,38 s | 778 kB |
| 100 | 2,94 s | 1,6 MB |
| 200 | 5,40 s | 3,0 MB |

⇒ plafond **max 100** (≈ 3 s / 1,6 Mo, prod avec ITI un peu plus lourde) ; 200 exclu (5,4 s).
Le sync corpus complet parcourt `?view=full&page_size=100` (~840 objets ≈ 9 pages) + tombstones.
**Invariant §125 respecté** : mesure avant de figer l'archi ; aucun enrichissement par-ligne
ajouté (on réutilise le chemin batch existant).

## 5. Sécurité

- **Published-only** : l'id-set du RPC filtre `status='published'` (le mode `full` n'y change
  rien — mêmes ids que le mode carte). Pas de fuite de draft.
- **Legs éditeur retirés par item** : la route détail supprime `canonical_description` /
  `org_description` (Markdown i18n brut, §106/§112) ; la liste `full` réplique ce retrait sur
  **chaque** item.
- **Pas de CRM** : `get_object_resource` ne porte pas les tables CRM (RPC séparés). À **vérifier**
  en implémentation (grep du corps : `private_description` / notes / crm) — même payload que la
  route détail déjà live, donc zéro nouvelle exposition attendue.

## 6. GPS / tracés

- `itinerary_details.track_geojson` est **toujours** présent sur les objets ITI avec géométrie
  (indépendant de `track`) — la géométrie est native au JSON.
- `?track=gpx|kml` ajoute en plus le blob `itinerary_details.track` (via `cached_gpx`/`cached_kml`
  ou `api.build_iti_track`). Honoré uniquement en `view=full` (les cartes ne portent pas
  `itinerary_details`).

## 7. Surfaces à modifier

**Code**
- `bertel-tourism-ui/src/app/api/public/objects/route.ts` — parse `view`/`track`, plafonds selon
  mode, passe `p_view`/`p_track_format`, retire les 2 legs éditeur par item en mode `full`.
- `bertel-tourism-ui/src/app/api/public/objects/route.test.ts` — cas `view=full` (items complets,
  plafond 100, legs retirés, `track=gpx`).
- Pas de changement SQL ni d'allowlist (`public-api.ts` liste déjà les deux RPC).

**Documentation (le PO insiste — invariant « contrat = guide + OpenAPI + Postman »)**
- `docs/openapi.json` — params `view`/`track` sur `GET /objects`, item = `ObjectResource` complet
  en mode `full` (réutiliser le `$ref` du détail), note plafonds.
- `docs/guide-partenaires.md` — section « Récupérer des objets complets en liste » + exemple.
- `docs/Bertel_API_v3.postman_collection.json` — requête « Objects (full) ».
- `docs/index.html` — mention si pertinent.
- Décision log `lot1_mapping_decisions.md` (nouveau §) + mémoire.

## 8. Tests / vérification

- Jest route : `view=full` renvoie des items complets ; plafond 100 respecté ; legs éditeur
  absents ; `track=gpx` ajoute le blob ; `view` absent ⇒ carte (non-régression).
- `docs/partenaires-render.check.js` reste vert (rendu du guide).
- Vérif live : un `GET /api/public/objects?view=full&page_size=100` mesuré < ~3,5 s sur prod ;
  contrôle qu'aucun champ privé/CRM n'apparaît (diff vs route détail sur un id).
- `tsc` + suite front vertes.

## 9. Hors périmètre (différé)

- **Streaming/export NDJSON** (Approche B) — quand le parcours par pages deviendra pénible.
- **Feed delta d'upserts** — les partenaires re-paginent la liste ; seules les **suppressions**
  ont un flux dédié (`/objects/deletions`, tombstones). Inchangé.
- **`view=full` sur le keyset `since_fast`** — non exposé en route partenaire aujourd'hui ;
  à ajouter seulement si un sync delta natif full est demandé.
