# Plan de remédiation — documentation partenaires (2026-07-03)

Compagnon de l'audit [`partner-docs-audit-2026-07-03.md`](partner-docs-audit-2026-07-03.md). Couvre les **26 constats confirmés**. Objectif : rendre la doc partenaires exacte et suffisante pour une intégration de production sans rétro-ingénierie.

## État d'exécution (2026-07-03)

**LIVRÉ sur `master`** (commits `d3dddd4` code, `f58a8ea` contrat/doc, `c560d8d` nginx ; vérif : `tsc --noEmit` exit 0, `jest src/app/api/public` 37/37, openapi/postman JSON valides, render-check OK) :
- **Lot A** — A2 (meta liste en liste blanche + `next_cursor` corrigé), A3 (`detail` 502 générique), A4 (`since` ISO strict). +4 tests.
- **Lot D** — D1 (rendeur no-cache) + D2 (`.md` en `text/plain`). *Reste* : redéploiement de l'app docs Coolify + `docker build` de vérif (daemon absent en local).
- **Lot B partiel (non-juridique)** — B1 (schéma `CardItem` corrigé + exemple réel *Ferme Lebon Papillon* dans openapi.json et Postman + lexique de blocs au guide), B4 (promesse `lang=all` + note Langues), B5 (portée `search`).
- **Lot C** — C1/C2/C3/C4 (guide) + C8 (polish OpenAPI).

**LIVRÉ 2 (2026-07-03, décisions PO reçues ; commit `4dca4a0`)** :
- **Lot B juridique** — B2 licence : **Licence Ouverte / Etalab 2.0** (PO‑1 Open Data ; `info.license` OpenAPI aligné) + médias avec **crédit obligatoire** et URLs non stables (PO‑2) ; B3 **RGPD** : usage = information touristique, prospection/démarchage/revente interdits, propagation des suppressions (PO‑3).
- **Lot C gated** — C5 onboarding (délai indicatif + critères, PO‑6), C6 SLA (meilleur effort, PO‑5), C7 clé de démo lecture seule sur demande + renvoi à l'exemple réel (PO‑4).
- *Nota* : les textes juridiques restent à **valider par l'OTI** (rédaction conforme à la direction donnée, pas un avis juridique).

**LIVRÉ 3 (2026-07-03 ; commit `5c507ab` ; vérif : tsc 0, jest `src/app/api/public` 41/41, openapi valide, render-check OK)** :
- **W1 réconcilié sur `master`** — le fix `types`→502 (`a77a78a`, worktree `mystifying-morse`) n'était pas sur master ; ses 5 hunks ré-appliqués par pathspec (`OBJECT_TYPE_CODES` source unique, validation au bord + 400, 3 surfaces alignées) + ses 3 tests. La branche `claude/mystifying-morse-325872` est désormais **superséée sur master** (peut être abandonnée).
- **E4** (Lot E) — headers `X-RateLimit-Limit` / `X-RateLimit-Remaining` sur chaque réponse (le RPC `partner_rate_check` calculait déjà `remaining`) ; `checkPartnerRate` les expose, les 4 routes les émettent ; guide §2 + openapi (composants + réf 200 liste/détail) ; +1 test.

**RESTE À FAIRE** :
- **Lot E — DIFFÉRÉ avec raison** (pas de la timidité — chaque item est prématuré ou une décision produit) :
  - **E1** (couverture i18n élargie à `name` + proses de facettes) : `object.name_i18n` existe, mais le **corpus est FR-only** (aucune traduction établissement en base — chantier post-MVP) ⇒ payoff nul aujourd'hui ; de plus `object_menu_item` n'a **pas** de colonnes i18n. Construire quand les traductions existent (même logique que les autres différés « quand la donnée existe »).
  - **E2** (recherche large sur `object.search_document`) : **décision produit**, pas un bug — la recherche par **nom** précise convient à une API de sync (les partenaires synchronisent tout, ils ne full-text-cherchent pas), et c'est désormais correctement documenté (B5). L'élargir annulerait B5. À trancher par l'OTI si un besoin réel émerge.
  - **E3** (respect des `scopes`) : **aucune taxonomie de scopes définie** (colonne `text[]` libre, `'{}'` par défaut, placeholder Phase 2 R2) ⇒ l'enforcement verrouillerait les clés existantes. Nécessite d'abord une conception de scopes.
- **D3** — collection Postman publique : URL vivante mais **SPA** (contenu non lisible par fetch) ⇒ vérif navigateur manuelle recommandée.
- **Déploiement** — redéployer l'app docs (Coolify) pour publier guide + nginx.
- **Validation juridique OTI** — textes B2/B3 (licence, médias, RGPD) à valider.

## Principes

1. **Ne rien inventer de juridique.** Licence des données, régime des médias, posture RGPD, SLA, critères d'onboarding : ce sont des décisions de l'OTI, pas des textes à fabriquer. Le **Lot B** attend la section « Décisions PO » ci-dessous.
2. **Trois surfaces, un seul contrat.** Toute modification de contrat doit rester synchronisée entre `docs/guide-partenaires.md`, `docs/openapi.json` et l'exemple/collection Postman. C'est l'invariant à faire respecter à chaque commit de ce plan.
3. **Corriger le code quand la doc dit vrai et le code ment.** Certains constats sont des bugs (le 502, la fuite de `detail`, les clés internes de `meta`) : on aligne le code sur la doc, pas l'inverse.
4. **Laziness.** Pour le plus gros trou (payload non décrit), on ne type pas 60 blocs en OpenAPI : on publie **un exemple réel complet** (extrait live) + un **lexique de blocs**, et on corrige le seul schéma réellement faux (les items de liste). 80/20.

## Ce qui est déjà en cours

- **W1 — `types` invalide ⇒ 502** (constat CRITICAL) : tâche `task_f858f4ee` lancée dans une session séparée. Elle valide les codes côté route et **aligne les 3 surfaces** (route + guide + openapi.json). Décision technique retenue : valider contre l'enum `object_type`, code inconnu ou en minuscules ⇒ `400 bad_request` (un résultat vide silencieux masque un bug d'intégrateur). **Ne pas dupliquer** ; les autres tâches ne touchent pas la validation `types`.

## Ce qui est explicitement HORS plan (constats réfutés à la vérification)

- « Panne DB sur la probe de statut ⇒ 404 » et « tombstone perdu si `limit` coupe deux suppressions au même timestamp » : la recette de synchro §4 (parcours complet + réconciliation) est déjà la mitigation. **Aucune action** — ne pas les ré-introduire comme tâches.

---

## Décisions PO requises (bloquent le Lot B)

À trancher avant de rédiger les sections juridiques. Chaque réponse alimente une tâche précise.

| # | Décision | Options | Recommandation | Débloque |
|---|----------|---------|----------------|----------|
| PO‑1 | **Licence des données** | Open data (ODbL / Licence Ouverte Etalab) · propriétaire avec attribution · usage restreint par convention | Licence explicite obligatoire pour verser dans DATAtourisme ; à défaut d'open data, « réutilisation autorisée pour l'information touristique, attribution *OTI du Sud*, pas de revente » | B2 |
| PO‑2 | **Régime des médias** | Republication autorisée ? · crédit photographe obligatoire ? · hotlinking des URLs bucket autorisé ou copie imposée ? | Autoriser la republication avec crédit (`media[].credit` est fourni) ; préciser que **les URLs ne sont pas stables** (un ré-upload change l'UUID) ⇒ resynchroniser via l'upsert, ne pas coder en dur | B2 |
| PO‑3 | **RGPD contacts** | Rappeler finalité + interdiction de prospection | Paragraphe court : finalité = information touristique ; le partenaire devient responsable de son traitement ; prospection/démarchage interdits ; propager les suppressions via le flux tombstones | B3 |
| PO‑4 | **Clé de démo / bac à sable** | Aucune · clé `bk_test_` rate-limitée · fiche d'exemple statique publiée | Publier au minimum **une fiche d'exemple réelle** à côté du guide (couvre aussi B1) ; clé de démo optionnelle | C8 |
| PO‑5 | **SLA / disponibilité** | Aucun engagement · « meilleur effort » · page de statut | Une phrase « meilleur effort, pas de fenêtre planifiée, signaler au contact » | C7 |
| PO‑6 | **Onboarding** | Délai indicatif de réponse · critères d'éligibilité · CGU/convention à signer | Annoncer un délai indicatif + « ouvert aux partenaires touristiques et institutionnels » + lier à la CGU si PO‑1 en crée une | C6 |

---

## Lot A — Correctness code (bugs ; aucune décision PO)

Corrections où le code contredit la doc. Tests attendus dans les `*.test.ts` voisins des routes.

### A1 — W1 (en cours) : `types` invalide ⇒ 502
Voir « Ce qui est déjà en cours ». Rien à faire ici sinon vérifier la cohérence des 3 surfaces à la fin.

### A2 — `meta` de liste fuit des clés internes + `next_cursor` faux en dernière page pleine
*Constats : « meta fuit kind/offset/schema_version/render_* » (minor) + « next_cursor null faux quand dernière page pleine » (minor).*
- **Fichier** : `bertel-tourism-ui/src/app/api/public/objects/route.ts:73‑76`.
- **Changement** : remplacer le `{ contract_version, ...pageInfo }` par une **construction explicite** de `meta` en liste blanche : `contract_version`, `page_size`, `total`, `next_cursor`. Supprimer de la surface publique `kind`, `offset`, `schema_version` (`'3.0'`, source de confusion à côté de `contract_version: '1.0.0'`), `render_locale/tz/version`, `language_fallbacks`, `cursor` (curseur de la page courante, redondant). Dans le même bloc, recalculer `next_cursor = (offset + items.length >= total) ? null : pageInfo.next_cursor` pour ne plus émettre un curseur pointant sur une page vide.
- **Test** (`objects/route.test.ts`) : (a) la réponse `meta` ne contient QUE les 4 clés blanches ; (b) une page dont `offset + count === total` renvoie `next_cursor: null`.
- **Doc** : documenter `meta.total` dans le guide §3.1 (utile aux intégrateurs) et l'ajouter à `Meta`/la réponse `/objects` dans `openapi.json` (voir C9).
- **Risque** : nul côté SQL (on ne touche pas le RPC partagé avec l'explorer ; le recalcul vit dans la route partenaire).

### A3 — corps `502` : `detail` = message Postgres brut
*Constat : « detail = message d'erreur Postgres brut » (info).*
- **Fichier** : `bertel-tourism-ui/src/lib/public-api.ts` (`callPublicRpc`, branche erreur PostgREST ⇒ `502 upstream_error`).
- **Changement** : **logger** le message Postgres complet côté serveur (diagnostic), mais renvoyer au partenaire un `detail` générique (`'upstream error'`) ou omettre `detail`. Ne plus exposer noms de fonctions/enum internes.
- **Test** : un RPC en échec renvoie `502` sans le texte Postgres d'origine dans le corps.
- **Note** : une fois W1 en place, la cause n°1 de ce 502 (cast enum sur `types`) disparaît ; cette tâche couvre les 502 résiduels.

### A4 — `since` accepte tout format parseable par `Date()`
*Constat : « since accepte plus que l'ISO 8601 annoncé » (info).*
- **Fichier** : `bertel-tourism-ui/src/app/api/public/objects/deletions/route.ts` (validation `since`).
- **Changement** : resserrer à l'ISO 8601 réel (regex `^\d{4}-\d{2}-\d{2}(T…)?` ou validation stricte) avant le `new Date()`, `400 bad_request` sinon — le contrat annonce déjà ISO 8601, on l'honore. **Alternative moindre** si on craint une dépendance existante : documenter la tolérance. Recommandation : resserrer (priorité basse, le suivi de la doc marche déjà).
- **Test** : `since="July 3, 2026"` ⇒ `400` ; `since="2026-07-03T00:00:00Z"` ⇒ `200`.

---

## Lot B — Contrat & juridique (dépend des décisions PO)

### B1 — Décrire le payload `data` (le plus gros trou contractuel)
*Constats : « dictionnaire des champs absent » (major) + « items de liste typés ObjectResource alors que le code émet des cartes » (major) + « fiche détail ~60 clés décrites nulle part » (major) + « forme d'une carte décrite nulle part » (major).*

Trois livrables :
1. **Corriger le schéma de liste (OpenAPI, bug réel)** : créer un schéma **`CardItem`** dans `openapi.json` (`id, type, name, status, commercial_visibility, image, rating, review_count, min_price, open_now` [tri-state nullable — **ne jamais booléaniser**], `location{lat,lon,city,postcode,lieu_dit,address}`, `description` [tronquée ~200 c, Markdown strippé], `taxonomy[], tags[], amenity_codes[], environment_tags[], badges[], updated_at`) et faire pointer `GET /objects` → `data: array<CardItem>` au lieu de `array<ObjectResource>`. Un client généré désérialise aujourd'hui FAUX chaque page.
2. **Exemple réel complet (détail)** : extraire une fiche riche réelle depuis la base live (`api.get_object_resource` sur un RES bien rempli, ex. *Le Macabit*), en retirant `canonical_description`/`org_description`/`private_note*` comme le fait la route, et l'attacher : (a) comme `example` de la réponse `200` de `GET /objects/{id}` dans `openapi.json`, et (b) comme **saved response** dans la collection Postman (dossier « 13. API Publique Partenaire »). Répond aussi à PO‑4.
3. **Lexique des blocs (guide)** : ajouter au §3.2 un tableau « blocs de la fiche » — une ligne par clé de premier niveau (`contacts, media, opening_times, prices, capacity, classifications, room_types, itinerary_details, fma_occurrences, …`), avec un one-liner et le caractère conditionnel-par-type (ITI ⇒ `itinerary_details` ; RES/FMA ⇒ `menus`…). Pas de field-by-field des 60 blocs — le tableau + l'exemple réel suffisent.
- **Fichiers** : `docs/openapi.json`, `docs/guide-partenaires.md` (§3.2), `docs/Bertel_API_v3.postman_collection.json`.
- **Vérif** : `openapi.json` reste JSON valide (`node -e "JSON.parse(...)"`) ; un `datamodel-code-generator`/`openapi-typescript` génère un type de carte distinct du type détail ; l'exemple charge dans openapi.html.

### B2 — Section « Conditions de réutilisation » (données + médias) — *dépend PO‑1, PO‑2*
- **Fichier** : `docs/guide-partenaires.md` — nouvelle section (avant §6 Références).
- **Contenu** : licence des données (PO‑1) ; droits médias (PO‑2 : republication, crédit `media[].credit`, hotlinking, **instabilité des URLs** ⇒ resync par upsert) ; répercuter la licence dans `openapi.json` `info.license` si PO‑1 en fixe une nommée.

### B3 — Paragraphe RGPD — *dépend PO‑3*
- **Fichier** : `docs/guide-partenaires.md` — 3‑4 phrases dans la section « Conditions de réutilisation » ou §2.
- **Contenu** : finalité autorisée (information touristique) ; les contacts publics (tél/email d'exploitants, parfois personnes physiques) sont des données à traiter licitement ; interdiction de prospection/démarchage ; obligation de propager les suppressions via `GET /objects/deletions` (§3.3). S'appuyer sur `docs/conformite-rgpd/` interne, validé par le PO — ne pas publier tel quel.

### B4 — Multilingue : langues disponibles + couverture honnête + promesse `lang=all`
*Constats : « langues disponibles listées nulle part » (major) + « lang=all promet toutes les traductions, le code ne couvre que 7 champs description » (major).*
- **Fichier** : `docs/guide-partenaires.md` (§3.2 `lang=all`, §2 ou nouvelle note « Langues »).
- **Changement** : (a) lister les codes langue acceptés ; (b) énoncer que le corpus est **aujourd'hui majoritairement francophone** (traduction du contenu établissements = chantier post‑MVP, fallback FR) ; (c) **corriger la promesse `lang=all`** : le bloc `i18n` ne couvre que les 7 champs de la famille `object_description` (`description, description_chapo, description_mobile, description_edition, description_adapted, description_offre_hors_zone, sanitary_measures`) — pas `name`, pas les proses de facettes. L'OpenAPI (`I18nBlock` fermé) est déjà exact ; nettoyer l'incohérence #2 (voir C9). Extension de couverture `i18n` = **backlog E1**.

### B5 — `search` : corriger la portée annoncée
*Constat : « OpenAPI prétend une recherche sur 9 périmètres, le code ne cherche que le nom » (major).*
- **Fichiers** : `docs/openapi.json` (description du paramètre `search` de `/objects`), `docs/guide-partenaires.md:99`.
- **Changement** : ramener la description à la réalité — « recherche plein-texte sur le **nom** de la fiche ». Élargir la recherche (brancher `object.search_document` §109 sur la route partenaire) = **backlog E2**, pas ce plan.

---

## Lot C — Précision & complétude éditoriale (doc-only, faible risque)

### C1 — Documenter les deux comportements de pagination surprenants
*Constats : « next_cursor non-null en dernière page pleine » (déjà corrigé code en A2, à mentionner) + « le curseur rejoue ses filtres embarqués » (minor).*
- **Fichier** : `docs/guide-partenaires.md` §3.1.
- **Changement** : une phrase « la boucle s'arrête quand `next_cursor` est `null` » (le fix A2 la rend vraie) + « les paramètres de filtre (`types`, `page_size`, `search`, `lang`) sont **figés par le curseur** ; pour changer de filtre, repartir sans `cursor` ».

### C2 — Corriger « toutes les réponses ont la forme `{meta, data}` »
*Constat : « faux pour les erreurs (corps plats sans meta) » (minor).*
- **Fichier** : `docs/guide-partenaires.md:74`.
- **Changement** : préciser « toute réponse **`200`** a la forme `{meta, data}` ; les erreurs sont des corps plats `{error, …}` (l'en-tête `X-Bertel-Api-Version` reste présent partout) ». Cohérent avec les exemples d'erreur déjà plats l.64/l.70.

### C3 — Fraîcheur des données + `updated_at` dans la recette
*Constat : « fraîcheur côté Bertel non documentée, updated_at inexploité » (minor).*
- **Fichier** : `docs/guide-partenaires.md` §4.
- **Changement** : « les fiches sont mises à jour en continu par l'OTI ; une synchro quotidienne est adaptée ; comparez `updated_at` pour ne retraiter que les fiches modifiées ». (`updated_at`/`updated_at_source` sont déjà émis.)

### C4 — Changelog / section « Historique »
*Constat : « ni changelog ni canal d'annonce » (minor).*
- **Fichier** : `docs/guide-partenaires.md` (nouvelle section courte) + décider un canal (« les évolutions additives seront notifiées par e-mail aux détenteurs de clés »).

### C5 — Onboarding : délai, critères, CGU — *dépend PO‑6*
- **Fichier** : `docs/guide-partenaires.md` §1.

### C6 — SLA / disponibilité — *dépend PO‑5*
- **Fichier** : `docs/guide-partenaires.md` (une phrase, §2 ou Références).

### C7 — Sandbox / clé de démo — *dépend PO‑4* (largement couvert par l'exemple réel de B1).

### C8 — Polish OpenAPI (rigueur machine)
*Constats : « next_cursor de /objects non typé » (minor) + incohérences internes (i18n block sur liste, ObjectStatus 4 valeurs, Tombstone sans pattern, id/CAMP, `meta.total` absent).*
- **Fichier** : `docs/openapi.json`.
- **Changements** : (a) typer `meta.next_cursor` (+ `meta.total`, cf. A2) sur la réponse `/objects` ; (b) retirer le bloc `i18n` d'`ObjectResource` quand il sert la **liste** (ou scinder liste/détail — de toute façon B1 introduit `CardItem`) ; (c) contraindre `ObjectStatus` à `published` sur cette surface, ou l'annoter mono-valeur ; (d) donner à `Tombstone.object_id` le même `pattern` 16 caractères que `ObjectId` ; (e) clarifier l'articulation type↔préfixe d'id (le guide dit « 3 lettres de type » mais `CAMP`/`PSV` sont des codes à 4 lettres — préciser que le **préfixe d'id** fait 3 lettres, distinct du code de type).

### C9 — Version EN (optionnel)
*Constat : « guide FR uniquement » (info).* Backlog : à envisager si un partenaire anglophone se présente. Pas prioritaire (audience primaire = DATAtourisme/Apidae/Tourinsoft/agences réunionnaises).

---

## Lot D — Serving / infra (image docs ; redéploiement Coolify de l'app docs)

### D1 — `partenaires-render.js` en cache 1 an immutable sans cache-busting
*Constat : « risque de désynchronisation rendeur/guide » (minor).*
- **Fichier** : `docs/nginx.conf`.
- **Changement** : ajouter, **avant** le bloc `location ~* \.(…|js|…)$`, un match exact qui sort le rendeur du cache immutable (le `.md` est déjà `fetch` no-cache ; le rendeur doit suivre) :
  ```nginx
  location = /partenaires-render.js { expires -1; add_header Cache-Control "no-cache"; }
  ```
  (le match exact `=` a priorité sur le regex `~*`).

### D2 — Liens `.md` servis en `application/octet-stream` (téléchargement au lieu d'affichage)
*Constat : « pas de type MIME .md » (info).*
- **Fichier** : `docs/nginx.conf`.
- **Changement** : ajouter
  ```nginx
  location ~* \.md$ { default_type text/plain; charset utf-8; }
  ```
  Le rendu principal (`fetch().text()`) est déjà OK ; ce fix concerne les deux liens visibles vers `guide-partenaires.md` (footer + fallback d'erreur). `text/plain` est déjà dans `gzip_types` ⇒ le `.md` sera aussi compressé.
- **Vérif D1+D2** : rebuild local de l'image (`docker build docs/`), `curl -I` sur `/partenaires-render.js` (no-cache) et `/guide-partenaires.md` (`Content-Type: text/plain`).

### D3 — Vérifier la collection Postman publique (manuel PO)
*Constat : « non vérifiée — page SPA illisible par fetch » (info).* Ouvrir l'URL Postman du §6 dans un navigateur, confirmer qu'elle est publique et contient le dossier « 13. API Publique Partenaire ». Pas une tâche code.

---

## Lot E — Backlog produit (features, hors doc)

Notés pour ne pas les confondre avec de la doc :
- **E1** — étendre la couverture `i18n` de `lang=all` à `name` + proses de facettes (`get_object_i18n_all`). Débloque une vraie promesse multilingue.
- **E2** — brancher la recherche large (`object.search_document`, §109) sur la route partenaire `/objects`.
- **E3** — faire respecter les `scopes` de clé (récupérés mais jamais vérifiés aujourd'hui).
- **E4** — exposer les en-têtes `X-RateLimit-Limit/Remaining` (le `remaining` est déjà calculé par le RPC puis jeté).

---

## Séquencement & commits

1. **Lot A** d'abord (bugs, indépendants, testables) — un commit par tâche (A2, A3, A4). A1/W1 arrive par sa propre session ; rebaser dessus.
2. **Lot D** en parallèle (isolé dans `docs/nginx.conf`) — un commit, puis redéploiement de l'app docs Coolify.
3. **Décisions PO** → débloquent **Lot B**. B1 est faisable *partiellement sans PO* (le fix `CardItem` + l'exemple réel ne dépendent d'aucune décision) : le sortir en premier.
4. **Lot C** (doc-only) après ou avec B, un commit thématique (pagination, erreurs, fraîcheur, changelog).
5. Chaque commit touchant le contrat **modifie les 3 surfaces ensemble** (guide + openapi.json + Postman) — c'est la garde anti-drift.

## Vérification globale (definition of done)

- `docs/openapi.json` : JSON valide, `CardItem` ≠ `ObjectResource`, exemple détail présent, `search`/`meta` corrigés.
- Suite Jest des 4 routes verte (nouveaux tests A2/A3/A4).
- `node docs/partenaires-render.check.js` vert (toute syntaxe Markdown ajoutée dans le guide reste dans le sous-ensemble supporté).
- Rebuild image docs OK ; `curl -I` confirme D1/D2 ; les liens `openapi.json`/`openapi.html`/`partenaires.html` du guide résolvent (invariant Dockerfile : COPY explicites).
- Relecture : plus aucune promesse du guide contredite par le contrat extrait (re-croiser contre l'audit).

## Ce qui reste incertain

- **PO‑1/PO‑2/PO‑3** (licence, médias, RGPD) sont des **textes juridiques** : ce plan cadre l'emplacement et la substance, mais le contenu exact est une décision OTI — Lot B ne peut pas être « done » sans elle.
- **A2 next_cursor** : le recalcul est fait dans la route partenaire (sûr) ; si un jour on veut le corriger à la source, vérifier d'abord que le RPC `list_object_resources_page` n'est pas partagé avec un consommateur qui dépend de la sémantique actuelle.
- **E1/E2** (i18n large, search large) sont des chantiers à part entière (spec→plan→impl), pas des retouches de doc.
