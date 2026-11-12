<!--
  Source canonique du guide partenaires. Rendu publiquement par partenaires.html
  (rendeur maison partenaires-render.js). Syntaxe Markdown supportée : titres #–####,
  paragraphes, **gras**, *italique*, `code`, blocs ```, tables |, listes plates -/1.,
  liens [t](url), citations >, règles ---. Ne pas introduire d'autre syntaxe sans
  étendre le rendeur (auto-check : node docs/partenaires-render.check.js).
-->

# API publique Bertel — Guide partenaires

**Office de Tourisme Intercommunal du Sud de La Réunion (OTI du Sud)** · Contrats objets `1.0.0`, thésaurus `1.0.0` · Guide mis à jour le 2026-11-12

Bertel est le système d'information touristique de l'OTI du Sud. Son API publique donne aux partenaires un accès **en lecture seule** aux fiches touristiques **publiées** du territoire : hébergements, restaurants, activités, itinéraires, événements, patrimoine, sites naturels…

Elle est conçue pour la **synchronisation serveur-à-serveur** : alimenter votre site, votre application ou votre plateforme (DATAtourisme, Apidae, Tourinsoft, moteurs de recherche via schema.org) à partir des données à jour de l'OTI.

---

## 1. Démarrage rapide

### Obtenir une clé API

Écrivez à **d.philippe@otisud.com** en précisant : qui vous êtes, l'usage prévu des données et le nom de votre service. Vous recevrez :

- votre **clé API** au format `bk_live_` suivi de 48 caractères hexadécimaux ;
- le **domaine de base** de l'API (noté `VOTRE_DOMAINE` dans ce guide).

**Délai et éligibilité.** L'accès est ouvert aux partenaires touristiques et institutionnels : offices de tourisme, plateformes SIT (DATAtourisme, Apidae, Tourinsoft), agences web mandatées, éditeurs de sites et d'applications valorisant le territoire. Comptez un délai indicatif de **quelques jours ouvrés** pour l'attribution.

**Évaluer avant de brancher.** Un exemple de réponse détail complet et réel est publié dans le contrat OpenAPI et la collection Postman (section 7) : de quoi juger la richesse des données sans écrire une ligne de code. Une **clé de démonstration** (lecture seule, débit limité) peut être fournie sur simple demande pour tester l'API en conditions réelles.

La base de toutes les URLs est :

```
https://VOTRE_DOMAINE/api/public
```

### Premier appel

```bash
curl -H "Authorization: Bearer bk_live_votre_cle" \
  "https://VOTRE_DOMAINE/api/public/objects?page_size=5"
```

Réponse (abrégée) :

```json
{
  "meta": { "contract_version": "1.0.0", "next_cursor": "eyJ…" },
  "data": [
    { "id": "RESRUN00000000XK", "type": "RES", "name": "Le Macabit", "…": "…" }
  ]
}
```

---

## 2. Authentification, limites et versionnage

### Clé API

Chaque requête porte la clé dans l'en-tête HTTP :

```
Authorization: Bearer bk_live_…
```

Clé absente, inconnue, révoquée ou expirée : réponse `401 {"error":"unauthorized"}`.

> **Votre clé est un secret serveur.** Ne l'embarquez jamais dans du code exécuté chez l'utilisateur final (page web, application mobile) : toute personne inspectant le trafic la récupérerait. Appelez l'API depuis vos serveurs uniquement. En cas de fuite, signalez-la : la clé est révocable immédiatement.

### Limite de débit

**120 requêtes par minute** et par clé (fenêtre fixe). Au-delà : `429 {"error":"rate_limited","retry_after":N}` avec l'en-tête `Retry-After` (secondes). Attendez ce délai avant de réessayer.

Chaque réponse porte les en-têtes `X-RateLimit-Limit` (le plafond, 120) et `X-RateLimit-Remaining` (requêtes restantes dans la fenêtre courante, `0` sur un `429`) : surveillez `X-RateLimit-Remaining` pour vous auto-réguler avant d'atteindre la limite.

### Enveloppe et versionnage

Seule une réponse `200` a la forme `{ "meta": …, "data": … }` ; les erreurs sont des corps **plats** portant une clé `error` (voir la table des codes d'erreur). L'en-tête `X-Bertel-Api-Version` reste présent **partout**, y compris sur les erreurs, et la réponse `200` porte en plus la version de contrat dans `meta.contract_version`.

Au sein d'une même version majeure, les évolutions sont **uniquement additives** : de nouvelles clés peuvent apparaître, les clés existantes ne changent jamais de sens. **Votre parseur doit donc ignorer les clés inconnues.** Une rupture de contrat serait publiée sous `/api/public/v2/*`, sans casser la v1.

### Codes d'erreur

| Code | Corps | Signification |
|---|---|---|
| 400 | `invalid_object_id` / `bad_request` | Paramètre malformé (id hors format, `since` non ISO 8601, code `types` inconnu) |
| 401 | `unauthorized` | Clé absente, invalide, révoquée ou expirée |
| 404 | `not_found` | Fiche inconnue **ou non publiée** (indistinguable, par conception) ; avec `selection_id`, sélection inconnue ou suspendue |
| 429 | `rate_limited` | Limite de débit atteinte — respecter `Retry-After` |
| 500 / 502 | `server_misconfigured` / `upstream_error` | Erreur côté Bertel — réessayer plus tard avec backoff |
| 503 | `selection_unavailable` / `selection_membership_unavailable` | Registre de sélection indisponible, ou calcul des appartenances indisponible avec `include_selection_ids=true` ; conserver le dernier état synchronisé avec succès |

---

## 3. Les endpoints

### 3.1 `GET /objects` — liste paginée des fiches publiées

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `cursor` | string | — | Curseur opaque de pagination (voir ci-dessous) |
| `page_size` | int 1–200 | 50 | Nombre de fiches par page (borné à **100** en `view=full`) |
| `view` | `card` \| `full` | `card` | `full` = fiche complète par objet (voir §3.1.1) |
| `track` | `gpx` \| `kml` | — | En `view=full` : ajoute le blob GPX/KML des itinéraires |
| `selection_id` | string | — | Identifiant numérique permanent d'une sélection OTI du Sud, transmis comme chaîne, par exemple `1006` pour Terroir et artisanat ; voir §3.1.2 |
| `include_selection_ids` | bool | `false` | `true` ajoute les identifiants des sélections actives à chaque fiche du flux général ; incompatible avec `selection_id`, même à `false` ; voir §3.1.3 |
| `types` | csv | tous | Filtre par types de fiche (codes ci-dessous) |
| `taxonomy` | csv | — | Codes qualifiés `taxonomy_hlo:appartement`, avec descendants selon la hiérarchie publiée |
| `include_equivalent_predecessors` | bool | `false` | Avec `taxonomy` uniquement : inclut les prédécesseurs déclarés exactement équivalents ; aucun élargissement implicite après une scission |
| `search` | string | — | Recherche sur le **nom** de la fiche uniquement |
| `lang` | code | `fr` | Langue de résolution des textes |
| `format` | profil | — | Ajoute un document pivot par fiche (voir section 5) |
| `variant` | `legacy-v1` \| `reunion-hebergement-v1` \| `reunion-regional-v1` | `legacy-v1` | Uniquement avec `format=tourinsoft` ; active explicitement le contrat Tourinsoft souhaité |

**Pagination par curseur** : la réponse porte `meta.next_cursor`. Repassez cette valeur telle quelle dans `?cursor=` pour obtenir la page suivante ; `next_cursor` vaut `null` sur la dernière page. Arrêtez la boucle de pagination quand `next_cursor` vaut `null`. Le curseur est **opaque** — ne le construisez ni ne l'interprétez jamais. Les paramètres de filtre (`types`, `page_size`, `search`, `lang`, `view`, `track`) sont **figés par le curseur** : pour changer un filtre, repartez sans `cursor`.

Après activation du thésaurus, les listes et détails de fiches portent aussi `meta.vocabulary_release`. Cette valeur et les libellés, chemins, traductions et documents pivots de la réponse proviennent du même état de lecture en base. Avant la première publication, cette métadonnée est absente. Deux requêtes successives peuvent légitimement annoncer des publications différentes : les fiches ne forment pas un instantané global du territoire.

`include_equivalent_predecessors=true` exige au moins un code `taxonomy`. Il utilise la même règle d'équivalence validée que le back-office, sans élargir les droits de lecture. Une simple relation de remplacement ou un terme associé ne suffit pas. Gardez également ces deux paramètres identiques pendant un parcours de pagination.

**Codes de type** (paramètre `types`, champ `type` des fiches) :

| Code | Libellé | Code | Libellé |
|---|---|---|---|
| HOT | Hôtel | PCU | Patrimoine culturel |
| HLO | Gîte & meublé | PNA | Site naturel |
| RVA | Résidence de vacances | ITI | Itinéraire / sentier |
| HPA | Hôtellerie de plein air | FMA | Fête / manifestation |
| CAMP | Camping | VIL | Ville / village |
| RES | Restaurant | PRD | Producteur |
| ASC | Activité | COM | Commerce |
| ACT | Activité encadrée | PSV | Prestataire de services |
| LOI | Loisir | SPU | Service public |
| ORG | Organisation | | |

Les codes sont **insensibles à la casse** (`res` équivaut à `RES`). Un code **inconnu** fait échouer toute la requête avec `400 {"error":"bad_request"}` (le champ `detail` nomme le ou les codes fautifs) — vérifiez l'orthographe contre la liste ci-dessus plutôt que de réessayer.

Exemple — les restaurants et hôtels, 200 par page :

```bash
curl -H "Authorization: Bearer bk_live_…" \
  "https://VOTRE_DOMAINE/api/public/objects?types=RES,HOT&page_size=200"
```

#### 3.1.1 Objets complets en liste — `view=full`

Par défaut la liste renvoie une **carte allégée** par objet. Avec `view=full`, chaque objet
de la page est la **fiche complète** — strictement le même contenu que `GET /objects/{id}`
(photos, descriptions, équipements, classements/distinctions, chambres, horaires,
`itinerary_details.track_geojson`…), **hors CRM et champs internes**.

- La page est bornée à **100 objets** (défaut 25) : la fiche complète est ~15 kB et ~30 ms
  par objet, donc une grande page reste volumineuse. Utilisez le curseur pour parcourir.
- Pour les **itinéraires**, ajoutez `track=gpx` (ou `kml`) pour obtenir en plus le blob de
  tracé au format demandé sous `itinerary_details.track`. Le tracé **GeoJSON** est de toute
  façon inclus nativement (`itinerary_details.track_geojson`).

```bash
curl -H "Authorization: Bearer bk_live_…" \
  "https://VOTRE_DOMAINE/api/public/objects?view=full&page_size=100&track=gpx"
```

#### 3.1.2 Sélections OTI du Sud — `selection_id`

Le paramètre `selection_id` permet de demander une sélection enregistrée dans Bertel, avec le même endpoint et la même clé partenaire. Les sélections sont gérées dans les Paramètres de Bertel par les administrateurs de leur organisation et les super-administrateurs. Un identifiant est permanent : le renommage, la modification des critères et la suspension ne le remplacent pas.

Les identifiants attribués par Bertel sont des entiers positifs transmis comme chaînes décimales, jusqu'à 19 chiffres. Recopiez l'identifiant de la sélection tel quel ; ce n'est ni son nom ni un UUID. Les quinze identifiants initiaux ci-dessous ne constituent pas une liste fermée : de nouvelles sélections peuvent être créées dans Bertel.

```bash
curl -H "Authorization: Bearer bk_live_…" \
  "https://VOTRE_DOMAINE/api/public/objects?selection_id=1006&view=full&page_size=100"
```

| Identifiant | Sélection |
|---|---|
| `1001` | À pied |
| `1002` | À vélo |
| `1003` | Nature |
| `1004` | Patrimoine |
| `1005` | Loisirs |
| `1006` | Terroir et artisanat |
| `1007` | Événements |
| `1008` | Restaurants |
| `1009` | Hôtels |
| `1010` | Locations et chambres |
| `1011` | Campings et aires |
| `1012` | Résidences de vacances |
| `1013` | Transports |
| `1014` | Offices de tourisme |
| `1015` | Services |

Les quinze définitions initiales ci-dessus couvrent les communes de l'Entre-Deux (`97403`), de Saint-Joseph (`97412`), de Saint-Philippe (`97417`) et du Tampon (`97422`), selon le code INSEE de l'adresse principale de la fiche. Leurs critères peuvent ensuite être administrés ; de nouvelles sélections peuvent avoir un autre périmètre. Seules les fiches publiées et hors corpus de test sont diffusées. Les résultats de plusieurs branches d'une sélection, notamment producteurs et artisans/marchés pour `1006`, sont fusionnés sans doublon d'identifiant Bertel.

Les sélections À pied et À vélo utilisent les pratiques des itinéraires. En l'absence de pratique renseignée, le classement taxonomique sert de repli. La sélection `1007` contient les événements publiés : le partenaire doit encore traiter les dates, les occurrences et les annulations pour construire son agenda. Les labels, les types de handicap, les animaux et les capacités restent des champs des fiches complètes (`view=full`) à exploiter par le partenaire.

Avec `selection_id`, seules les options `cursor`, `page_size`, `view`, `lang`, `track`, `format` et `variant` peuvent être ajoutées. La présence de `types`, `taxonomy`, `search`, `include_equivalent_predecessors` ou `include_selection_ids`, même à `false`, entraîne `400 bad_request`. Un identifiant vide, répété ou une autre option entraîne aussi `400 bad_request`. Une sélection inconnue ou suspendue renvoie `404 not_found` : elle ne provoque jamais un retour au catalogue complet. Une sélection connue sans résultat renvoie `200` avec `data: []`. Une indisponibilité du registre renvoie `503 selection_unavailable` ; elle ne remplace pas la définition enregistrée par une ancienne configuration.

Le contenu de chaque fiche dans `data` conserve le contrat existant. Trois métadonnées décrivent le contexte de la sélection ; elles sont absentes des appels sans `selection_id` :

```json
{
  "meta": {
    "contract_version": "1.0.0",
    "selection_id": "1006",
    "selection_name": "Terroir et artisanat",
    "selection_revision": 1,
    "page_size": 100,
    "total": 0,
    "next_cursor": null
  },
  "data": []
}
```

Cet exemple illustre une page vide, pas un volume de production. `selection_revision` identifie la révision enregistrée de la sélection (révision `1` pour les définitions initiales). Elle ne constitue ni une version des fiches ni un instantané de leurs appartenances. L'appartenance est recalculée à chaque page à partir des données et projections courantes de Bertel. Conservez le même `selection_id`, la même clé partenaire et les mêmes options pendant toute la pagination ; après une rotation de clé, une modification des critères ou un changement de sélection, repartez sans curseur. Un curseur incompatible est refusé.

Pour synchroniser une sélection, parcourez toutes ses pages et mettez les fiches à jour par `id`. **Rapprochez les appartenances seulement après un parcours entièrement réussi jusqu'à `next_cursor=null`.** Une erreur, un délai dépassé ou un curseur refusé ne signifie pas que la sélection est vide : conservez les appartenances précédentes tant que le parcours n'a pas abouti. Une fiche peut appartenir à plusieurs sélections ; sa sortie d'une sélection ne supprime pas ses autres appartenances. Le flux `/objects/deletions` ne signale pas ces sorties.

#### 3.1.3 Appartenances dans le flux général — `include_selection_ids`

Pour recevoir les appartenances sans parcourir séparément chaque sélection, ajoutez `include_selection_ids=true` à `GET /objects`, avec la même clé partenaire utilisée côté serveur :

```bash
curl -H "Authorization: Bearer bk_live_…" \
  "https://VOTRE_DOMAINE/api/public/objects?view=full&include_selection_ids=true&page_size=25"
```

Chaque objet de `data[]` porte alors un champ racine `selection_ids`, en `view=card` comme en `view=full`. Il contient uniquement des identifiants de sélections **actives**, sous forme de chaînes triées sans doublon. Une fiche sans appartenance reçoit `[]`. Aucun nom de sélection ni critère enregistré n'est fourni par ce champ. Exemple illustratif d'un extrait de fiche :

```json
{
  "id": "RESRUN0000000001",
  "type": "RES",
  "selection_ids": ["1008"]
}
```

Le champ est au même niveau que `id` et `type`, jamais à l'intérieur de `jsonld`, `datatourisme`, `apidae` ou `tourinsoft`. Les documents pivots et le détail `GET /objects/{id}` restent inchangés. L'option n'ajoute pas `selection_ids` aux réponses de détail.

Sans l'option, ou avec la valeur littérale `false`, le flux historique est conservé et le champ est **absent**. Les seules valeurs acceptées sont `true` et `false` : valeur vide, autre valeur ou paramètre répété donnent `400 bad_request`. L'option est incompatible avec `selection_id`, y compris `include_selection_ids=false` : les parcours par sélection conservent leur contrat existant.

Conservez `include_selection_ids=true` et les mêmes options pendant toutes les pages du parcours. Les règles de curseur du flux général restent applicables. Les appartenances sont calculées sur les données courantes : **il n'y a pas d'instantané entre les pages**. Une suspension de sélection ou une modification de ses critères peut changer `selection_ids` sans modifier la fiche ni son `updated_at`.

À chaque synchronisation complète, actualisez donc les appartenances de **toutes** les fiches reçues, même si leur horodatage n'a pas changé. Vous pouvez éviter de réimporter leur contenu inchangé, mais pas ignorer leur nouveau `selection_ids`. Préparez les retraits et appliquez-les seulement après la dernière page réussie (`next_cursor=null`). Une erreur, notamment `503 {"error":"selection_membership_unavailable"}`, n'est pas un tableau vide : conservez les appartenances du dernier parcours réussi. Cette indisponibilité de l'option ne change pas le traitement des appels historiques sans option ou avec `false`. Le flux `/objects/deletions` ne signale pas les sorties de sélection.

### 3.2 `GET /objects/{id}` — une fiche complète

L'identifiant a la forme `RESRUN00000000XK` (3 lettres de type + territoire + 10 caractères). Une fiche inconnue, dépubliée ou archivée répond `404` — un partenaire ne voit **jamais** un brouillon.

| Paramètre | Description |
|---|---|
| `lang` | Langue de résolution (`fr` par défaut) |
| `lang=all` | Résout en français **et** ajoute un bloc `data.i18n` = `{champ: {langue: texte}}` avec toutes les traductions disponibles, en un seul appel. Ce bloc couvre **uniquement** les 7 champs de la famille description (`description`, `description_chapo`, `description_mobile`, `description_edition`, `description_adapted`, `description_offre_hors_zone`, `sanitary_measures`) — **pas** le nom (`name`) ni les proses de facettes (menus, chambres, étapes d'itinéraire) |
| `format` | Ajoute un document pivot (section 5) |
| `variant` | Uniquement avec `format=tourinsoft` : `legacy-v1` (défaut), `reunion-hebergement-v1` ou `reunion-regional-v1` |

```bash
curl -H "Authorization: Bearer bk_live_…" \
  "https://VOTRE_DOMAINE/api/public/objects/RESRUN00000000XK?lang=all"
```

La fiche `data` contient l'ensemble des données publiques : identité, descriptions (texte propre), localisation et géo, contacts publics, médias publiés, horaires d'ouverture, tarifs, capacités, classements et labels, etc.

**Blocs de la fiche** — les blocs toujours présents décrivent l'identité commune à tous les types ; les blocs conditionnels n'apparaissent que pour les types qui les portent (colonne « Conditionnel »).

| Bloc | Contenu | Conditionnel |
|---|---|---|
| `identite` | `id`, `type`, `name`, `status`, `region_code`, dates | toujours |
| `address` | Adresse postale | toujours |
| `location` | Latitude / longitude | toujours |
| `description` + `descriptions[]` | Textes descriptifs (+ variantes `_md` en Markdown) | toujours |
| `contacts` | Canaux de contact publics | toujours |
| `web_channels` | Réseaux sociaux et canaux web publics | toujours |
| `media` | Photos / vidéos publiées (champ `credit`) | toujours |
| `capacity` | Capacités d'accueil | toujours |
| `amenities` | Équipements | toujours |
| `environment_tags` | Tags d'environnement | toujours |
| `payment_methods` | Moyens de paiement | toujours |
| `prices` | Tarifs | toujours |
| `discounts` | Réductions | toujours |
| `group_policies` | Conditions groupes | toujours |
| `classifications` | Labels et classements | toujours |
| `taxonomy` | Classement taxonomique | toujours |
| `tags` | Étiquettes libres | toujours |
| `languages` | Langues parlées | toujours |
| `opening_times` | Périodes d'ouverture (`periods`) | toujours |
| `org_links` | Organisations rattachées | toujours |
| `actors` | Acteurs (opérateurs, contacts) | toujours |
| `legal_records` | Mentions légales | toujours |
| `sustainability_labels` / `sustainability_actions` | Labels et actions de durabilité | toujours |
| `accessibility_labels` | Labels d'accessibilité | toujours |
| `outgoing_relations` / `incoming_relations` | Relations entre fiches | toujours |
| `render` | Lignes pré-formatées en français | toujours |
| `activity` | Détail activité | ACT / ASC |
| `itinerary` + `itinerary_details` | Détail itinéraire | ITI |
| `menus` + `cuisine_types` + `dietary_tags` + `allergens` | Carte, types de cuisine, régimes, allergènes | RES / FMA |
| `menu_documents` | Documents de carte | RES |
| `fma_occurrences` | Dates d'occurrence de l'événement | FMA |
| `room_types` + `meeting_rooms` | Chambres et salles de séminaire | Hébergement / MICE |
| `places` | Sous-lieux | selon la fiche |

Un exemple de réponse détail complet est fourni dans le contrat OpenAPI (`openapi.json`) et la collection Postman. Il est repris d'une capture réelle, à une exception près : le bloc `actors` y est **illustratif** (identifiants fabriqués) — il montre la FORME d'un acteur rédigé (§208) ; sur cette fiche, un appel partenaire reçoit en réalité `"actors": []`.

**Acteurs (`actors`).** Depuis §208, `contacts` est vide (`[]`) et `contacts_restricted` vaut `true` pour les appels partenaires : les coordonnées personnelles des acteurs (téléphone, e-mail, adresse) ne sortent plus par l'API publique. `first_name`, `last_name`, `gender` et `note` sortent également à `null` dans ce cas. Les contacts de l'ÉTABLISSEMENT (bloc racine `contacts`) sont inchangés.

**Langues.** Le code de résolution par défaut est `fr`. Le corpus est aujourd'hui majoritairement francophone : la traduction du contenu des établissements est un chantier en cours. À défaut de traduction disponible pour un champ dans la langue demandée, c'est la valeur française qui est renvoyée.

### 3.3 `GET /objects/deletions` — flux des suppressions (tombstones)

Quand une fiche est **définitivement supprimée** de Bertel, elle disparaît simplement de `GET /objects`. Ce flux vous permet de propager ces suppressions chez vous.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `since` | ISO 8601 | — | Ne renvoyer que les suppressions strictement postérieures ; absent = tout l'historique |
| `limit` | int 1–1000 | 500 | Taille de page |

```json
{
  "meta": { "contract_version": "1.0.0", "cursor": "2026-07-01T08:12:44.000Z", "count": 2 },
  "data": [
    { "object_id": "LOIRUN000000000A", "type": "LOI", "deleted_at": "2026-06-30T14:03:21.000Z" }
  ]
}
```

Conservez `meta.cursor` et repassez-le en `since` à l'appel suivant (il reste inchangé quand la page est vide).

> **Dépublication ≠ suppression.** Une fiche dépubliée (repassée en brouillon ou archivée) n'apparaît **pas** dans ce flux : elle disparaît de la liste `GET /objects` et son détail répond `404`. Voir la réconciliation en section 4.

### 3.4 `GET /catalog` — vocabulaires contrôlés

Les fiches référencent des codes (équipements, types de cuisine, labels…). Ce endpoint fournit les catalogues correspondants.

| Paramètre | Description |
|---|---|
| `domains` | csv de domaines ; absent = **tous** les catalogues publics (les clés de la réponse = liste des domaines disponibles) |
| `lang` | Langue des libellés (`fr` par défaut) |

Réponse : `data` = `{ "domaine": [{ "code", "name", "icon_url", "parent_code", "domain" }] }`. Un domaine inconnu est ignoré silencieusement.

### 3.5 Thésaurus versionné

**Parcours rapide en trois appels** :

1. `GET /thesaurus?view=compact` — repérer la publication courante (`release_id`) et les domaines.
2. `GET /thesaurus/releases/{releaseId}/concepts?domains=<domaine>&page_size=100&view=compact` — lister les concepts. Tant que `meta.next_cursor` n'est pas `null`, rappelez la même requête avec `cursor`, en gardant les mêmes paramètres.
3. `GET /thesaurus/releases/{releaseId}/concepts/{conceptId}` — lire la fiche complète (sans `view`). L'identité stable est `concept_id` ou `uri`.

Page de liste compacte (valeurs synthétiques) :

```json
{
  "meta": { "contract_version": "1.0.0", "release_id": 1, "total": 1, "next_cursor": null },
  "data": [
    {
      "concept_id": "11111111-1111-4111-8111-111111111111",
      "domain": "activity_type",
      "code": "randonnee",
      "name": "Randonnée",
      "effective_lang": "fr",
      "lifecycle": "active",
      "assignable": true
    }
  ]
}
```

`view=compact` n'est accepté que sur `GET /thesaurus`, le manifeste d'une publication et la liste des concepts. Sans `view`, la réponse est la forme complète historique. Les champs complets (noms et définitions par langue, relations, correspondances externes, provenance, dates) sont décrits dans OpenAPI.

| Route | Usage |
|---|---|
| `GET /thesaurus` | Découvrir les vocabulaires et la publication courante |
| `GET /thesaurus/releases/{releaseId}` | Manifeste immuable d'une publication |
| `GET /thesaurus/releases/{releaseId}/concepts` | Concepts de cette publication |
| `GET /thesaurus/releases/{releaseId}/concepts/{conceptId}` | Un concept dans cette publication |
| `GET /thesaurus/releases/{releaseId}/changes` | Changements depuis la publication précédente |
| `GET /thesaurus/releases/{releaseId}/export?format=json` ou `format=jsonld` | Export JSON ou RDF JSON-LD/SKOS |
| `GET /thesaurus/concepts/{conceptId}` | Résoudre l'identité dans la publication courante |

Ces routes utilisent la même clé et le même quota que les fiches ; sans clé valide, même une URI de concept répond `401`. Avant la première activation du thésaurus, elles répondent `503 {"error":"release_unavailable"}`.

**Catalogue et thésaurus.** `/catalog` donne les choix actifs au jour de l'appel. Le thésaurus donne des concepts stables et des publications immuables, y compris les concepts dépréciés ou retirés. Une fiche peut donc porter un code absent du catalogue mais résoluble dans le thésaurus.

**Édition publique.** `contract_version` décrit le contrat HTTP ; `release_id` et `vocabulary_release` désignent l'édition publique, aussi annoncée dans `X-Bertel-Vocabulary-Release`. Avant le gel du lancement, la série reste sur l'édition `1` : les retouches republient le dernier snapshot technique sous cette édition, sans exposer de numéro technique. `/thesaurus/releases/1` suit donc ce snapshot jusqu'au gel ; ce n'est pas encore un historique immuable. Avant le gel, `previous_release_id` vaut `null`, et `/changes` de l'édition `1` présente chaque concept public comme `added` (`before: null`). Après le gel, l'édition `1` devient le baseline immuable et les éditions suivantes comparent à la précédente. Les chemins gardent la même forme, et les UUID et URI des concepts restent stables.

**Curseurs et paramètres.** L'ETag et les curseurs se rapportent au snapshot technique sélectionné : une retouche peut changer l'ETag et invalider un curseur. Un curseur lie publication, filtres, langue, format et taille de page. Un curseur altéré, expiré, d'une autre publication ou réutilisé avec d'autres paramètres répond `400 invalid_cursor`. `cursor` est opaque : ne le construisez pas. Les paramètres sont stricts : un paramètre inconnu ou répété répond `400 invalid_parameters`. `domains` et `status` ne valent que pour les listes, changements et exports. Les listes CSV sont limitées à 100 éléments ; `status` vaut `active`, `deprecated` ou `retired` (absent = tous). `page_size` va de 1 à 200 (défaut 100), `query` est limité à 200 caractères. Un domaine inconnu ou non public produit une erreur générique.

**Langues.** `lang` (tag BCP 47, défaut `fr`) localise le nom : correspondance exacte, langue principale, puis français. Si la langue demandée manque, le libellé repasse en langue effective (`effective_lang`) sans créer de traduction, et `preferred_labels` reste fidèle au snapshot. `requested_lang`, `effective_lang` et `definition_lang` sont toujours présents ; ils valent `null` seulement si aucun texte de repli n'existe. Un concept historique sans map garde son nom canonique français (`effective_lang: "fr"`) sans entrée française inventée. Chaque domaine du manifeste porte `name_i18n` et sa propre langue effective. `name_metadata_scope` indique la provenance des noms (`release_snapshot`, `reviewed_legacy_dictionary`, `legacy_scalar`). Pour les anciens manifestes, un catalogue de traductions versionné ne traduit que les titres français exacts d'un alias ; ce n'est pas une modification du manifeste.

**Codes et identité.** `context_key` qualifie les codes réutilisés : un code est unique dans `(domain, context_key, code)`. Utilisez `concept_id` ou `uri` comme identité de synchronisation.

**Cycle de vie.** `lifecycle` et `assignable` sont distincts : un concept déprécié ou retiré reste résolvable en `200` mais n'est plus sélectionnable pour une nouvelle fiche. `replaced_by` signale ses successeurs éventuels. Le flux `changes` distingue `added`, `modified`, `deprecated` et `retired`, avec `before` et `after` ; un retrait n'est pas une suppression physique.

**Appartenances et hiérarchie.** Les champs `member_of` (sur une action) et `members` (sur un groupe) sont des listes d'UUID triées et uniques, facultatives et absentes des anciens snapshots. Ils sont distincts de la hiérarchie : une action garde son `broader` et son `context_key`, un groupe garde son parent de catégorie. En JSON-LD, ils deviennent `bertel:memberOf` et `bertel:member`, jamais `skos:broader`, `skos:related` ni une collection SKOS. Leur disponibilité HTTP dépend du déploiement de la projection API.

**Traces éditoriales.** Les traces répétitives du lot d'enrichissement de novembre 2026 (avertissement générique, auto-référence) sont exclues des réponses partenaires, y compris exports et `changes`. Les citations externes restent des notes de source. Cette présentation ne vaut pas validation humaine ou linguistique.

**Métadonnées, cache et licence.** Le manifeste porte `metadata_scope: "release_snapshot"` et, lorsqu'il existe, `metadata_checksum` (MD5 de `domains::text` en JSONB PostgreSQL, distinct du checksum conceptuel). Chaque réponse porte un `ETag` propre à la représentation et `Cache-Control: private, no-cache` ; `If-None-Match` renvoie `304` sans corps si rien n'a changé, mais chaque requête consomme le quota. Le manifeste contient la provenance, la licence effective et les attributions. La licence du logiciel Bertel (MIT) est distincte de celle des données. Pour le vocabulaire de l'OTI du Sud, la politique est la Licence Ouverte / Etalab 2.0, avec attribution à l'Office de Tourisme Intercommunal du Sud de La Réunion (OTI du Sud). Les restrictions de sources externes figurent dans leur provenance.

### 3.6 Synchroniser les versions de vocabulaire

1. Appelez `/thesaurus` et conservez le `release_id` courant.
2. Téléchargez l'export de cette publication, ou parcourez ses concepts jusqu'à `next_cursor=null`.
3. Conservez les concepts dépréciés ou retirés pour résoudre les anciennes fiches.
4. Lors d'une nouvelle publication, appliquez ses changements dans l'ordre ou reprenez un export complet.

Un changement d'ancêtre ou de libellé peut modifier les représentations publiques de nombreuses fiches à la fois. Bertel actualise alors leurs marqueurs de synchronisation ; prévoyez une reprise groupée et respectez le quota. La présence d'une nouvelle publication de vocabulaire n'est pas une garantie d'instantané global de toutes les fiches entre plusieurs requêtes.

---

## 4. Recette de synchronisation complète

Synchronisation initiale, puis incrémentale à chaque cycle (par exemple quotidien) :

```text
# 1. Upserts — parcourir la liste complète
cursor = absent
répéter :
  r = GET /objects?page_size=200[&format=<profil>][&cursor=cursor]
  pour chaque fiche de r.data : créer ou mettre à jour chez vous (upsert par id)
  cursor = r.meta.next_cursor
tant que cursor n'est pas null

# 2. Suppressions définitives
d = GET /objects/deletions?since=<cursor tombstone conservé>
retirer chez vous chaque d.data[i].object_id ; conserver d.meta.cursor

# 3. Réconciliation des dépublications
tout id présent chez vous mais absent du parcours (1) ET du flux (2)
  ⇒ fiche dépubliée : la masquer ou la retirer chez vous
```

> **Fiches complètes en une passe :** à l'étape 1, `GET /objects?view=full&page_size=100[&cursor=cursor]`
> renvoie la fiche complète par objet (au lieu d'un appel détail par fiche). La page est bornée à
> **100** en mode `full`. Ajoutez `&track=gpx` pour les tracés GPX des itinéraires.

Bonnes pratiques :

- `page_size=200` minimise le nombre d'appels (la base compte moins de 1 000 fiches publiées : la synchro complète tient en quelques requêtes).
- Restez sous la limite de débit ; sur `429` ou `5xx`, réessayez avec un backoff (attendre `Retry-After`, puis doubler).
- L'ordre de la liste n'est pas contractuel : l'upsert par `id` est la seule stratégie fiable.
- Les fiches sont mises à jour en continu par l'OTI : comparez le champ `updated_at` pour ne retraiter que les fiches réellement modifiées depuis votre dernier cycle.

---

## 5. Formats pivot — `?format=`

Chaque fiche peut être servie accompagnée d'un document conforme à un standard du secteur. Le paramètre `format` fonctionne sur le **détail** et sur la **liste** (le document est alors attaché à chaque élément de la page — même pagination, aucun appel supplémentaire).

| `?format=` | Clé ajoutée | Standard | Usage type |
|---|---|---|---|
| `jsonld` | `jsonld` | schema.org (JSON-LD) | SEO — à coller dans un `<script type="application/ld+json">` |
| `datatourisme` | `datatourisme` | Ontologie nationale DATAtourisme | Alimentation open data / plateforme nationale |
| `apidae` | `apidae` | JSON objet touristique Apidae | Échange avec la plateforme Apidae |
| `tourinsoft` | `tourinsoft` | Tourinsoft `legacy-v1` (défaut) | Compatibilité avec le bloc historique de 13 champs |
| `tourinsoft&variant=reunion-hebergement-v1` | `tourinsoft` | Tourinsoft CRT Réunion — hébergement | Projection enrichie HOT/HLO/CAMP conforme au schéma observé dans le flux CRT |
| `tourinsoft&variant=reunion-regional-v1` | `tourinsoft` | Tourinsoft CRT Réunion — régional | Projection taxonomique vers les six familles CRT actuellement publiées |

Le bloc est **additif** : les clés de base de la réponse ne changent jamais ; sans `format`, la réponse est identique à avant. Une fiche non couverte par un profil n'a simplement **pas** la clé — l'élément reste complet par ailleurs. En cas d'échec de construction, la réponse est servie sans le bloc (jamais d'erreur bloquante).

Exemple (détail, abrégé) :

```json
{
  "meta": { "contract_version": "1.0.0" },
  "data": {
    "id": "RESRUN00000000XK", "name": "Le Macabit",
    "datatourisme": {
      "@id": "urn:bertel:object:RESRUN00000000XK",
      "@type": ["PointOfInterest", "FoodEstablishment"],
      "rdfs:label": [{ "@language": "fr", "@value": "Le Macabit" }],
      "isLocatedAt": [{ "@type": "schema:Place", "schema:geo": { "…": "…" } }]
    }
  }
}
```

### Variante Tourinsoft CRT Réunion — hébergement

La variante `reunion-hebergement-v1` ne remplace pas silencieusement le contrat historique. Elle est activée explicitement :

```bash
curl -H "Authorization: Bearer bk_live_…" \
  "https://VOTRE_DOMAINE/api/public/objects/HOTRUN0000000001?format=tourinsoft&variant=reunion-hebergement-v1"

curl -H "Authorization: Bearer bk_live_…" \
  "https://VOTRE_DOMAINE/api/public/objects?types=HOT,HLO,CAMP&page_size=200&format=tourinsoft&variant=reunion-hebergement-v1"
```

Elle couvre uniquement les fiches publiées `HOT`, `HLO` et `CAMP`. Les groupes actuellement approuvés sont : identité et bordereau CRT, dates de publication/mise à jour, description commerciale, adresse et géolocalisation, communications publiques, réservation et réseaux sociaux publics, galerie de photos publiables, langues, paiements, animaux, capacités, arrivée/départ, tarifs et périodes d'ouverture. Les collections sont ordonnées de façon déterministe ; une fiche hors périmètre ne reçoit pas de bloc `tourinsoft`.

Les données privées, CRM, juridiques non approuvées, médias privés/non publiés/expirés et champs encore en attente de décision CRT ne sont jamais émis. L'inventaire contractuel classe les **314 propriétés** observées dans le flux fourni : 55 approuvées, 96 en attente de validation CRT et 163 auxiliaires ou exclues.

Le flux fourni par le CRT est un flux de **lecture/syndication**. Il permet de prouver la forme observée, mais pas à lui seul les règles d'import ou d'écriture. Avant toute alimentation Tourinsoft, le CRT doit confirmer l'endpoint d'écriture, l'authentification, les champs obligatoires, les thésaurus, les règles de suppression/dépublication et la priorité en cas de conflit.

### Variante Tourinsoft CRT Réunion — régional

La variante `reunion-regional-v1` étend la projection aux six familles actuelles sans
modifier `legacy-v1` ni `reunion-hebergement-v1` :

```bash
curl -H "Authorization: Bearer bk_live_…" \
  "https://VOTRE_DOMAINE/api/public/objects/RESRUN00000000XK?format=tourinsoft&variant=reunion-regional-v1"

curl -H "Authorization: Bearer bk_live_…" \
  "https://VOTRE_DOMAINE/api/public/objects?page_size=200&format=tourinsoft&variant=reunion-regional-v1"
```

Le routage est piloté par la taxonomie Bertel. Certains types ont une route directe ;
les familles qui se recouvrent restent fermées tant qu'une taxonomie n'a pas confirmé
le bordereau cible :

| Famille Tourinsoft | Routage Bertel actuel |
|---|---|
| Découverte | `PCU`, `PNA`, `PRD`, `LOI` |
| Hébergement | `HOT`, `HLO`, `CAMP`, `HPA`, `RVA` |
| Information et service touristique | `SPU` classé office d'information ; `PSV` classé agence réceptive |
| Loisir / plein air | `ACT` seulement pour les taxonomies approuvées ; locations de cycles `PSV` identifiées par taxonomie ; aucun repli `ASC` |
| Restauration | `RES` |
| Transport | `PSV` après les exceptions taxonomiques précédentes |

Une fiche publiée sans route, sans correspondance de type ou avec deux routes
taxonomiques contradictoires n'a pas de bloc `tourinsoft` ; le reste de la fiche reste
présent et le cas est remonté dans la file de diagnostic réservée au connecteur. Les
replis directs `HLO` et `RES` restent exportables mais sont signalés comme provisoires
jusqu'à validation du CRT. Les noms de collections restent
ceux du profil cible, y compris leurs variantes historiques (`Localisations` /
`Localisationss`, par exemple). Le détail et la liste utilisent le même sérialiseur ;
la liste effectue un seul appel par lot de 200 identifiants au maximum.

Le contrat régional inventorie les propriétés déclarées par `$metadata`, même si
aucune des 411 fiches ne les renseigne. Il couvre **683 chemins** et **1 983
occurrences champ-profil** : 187 chemins sont approuvés, 278 restent soumis à une
décision CRT et 218 sont exclus. Les champs approuvés sont produits depuis les données
canoniques publiques de Bertel. Les champs en attente ne sont pas inventés. Une
extension réservée au connecteur peut restituer uniquement les chemins autorisés pour
ce profil ; les feuilles exclues, privées ou inconnues sont supprimées et signalées,
les valeurs canoniques Bertel conservent toujours la priorité et les éléments sans
correspondant canonique ne sont pas émis. L'identifiant Tourinsoft est lui aussi propre
au profil ; il est omis tant que le CRT ne l'a pas confirmé, sans repli artificiel sur
l'identifiant Bertel. Le SIRET, lorsqu'il est présent, provient uniquement d'un
enregistrement légal public et actif validé à 14 chiffres ; aucun autre contenu
juridique n'est exposé.

Comme pour la variante hébergement, cette projection est une sortie de lecture
candidate. Elle ne doit pas être envoyée vers Tourinsoft en production avant validation
par le CRT du contrat d'import, des référentiels, des cardinalités, des règles
d'effacement et de la résolution des conflits bidirectionnels.

### Cycle de synchronisation recommandé

1. Parcourir `GET /objects?view=full&format=tourinsoft&variant=<variante>` avec `meta.next_cursor`, puis faire un upsert par `id` (`<variante>` = `reunion-hebergement-v1` ou `reunion-regional-v1`).
2. Comparer `updated_at` lors des cycles suivants et réconcilier périodiquement la liste complète des ids publiés. Une fiche dépubliée disparaît du corpus publié ; elle n'est pas encore signalée comme suppression définitive.
3. Consommer `GET /objects/deletions?since=…` pour les suppressions définitives et conserver le curseur renvoyé.
4. En cas de `429` ou `5xx`, reprendre avec backoff sans reconstruire le curseur.

### Périmètre des autres pivots

Les profils `jsonld`, `datatourisme`, `apidae`, Tourinsoft `legacy-v1` et la variante `reunion-hebergement-v1` ne changent pas avec cette livraison. Avant tout branchement réel, validez leur conformité champ à champ contre l'importeur cible.

---

## 6. Conditions de réutilisation, données personnelles et disponibilité

### Licence des données

Les données sont diffusées sous **Licence Ouverte / Etalab 2.0**. La réutilisation est **libre**, y compris à des fins commerciales, sous la seule réserve d'**attribution** : mentionnez la source **« Office de Tourisme Intercommunal du Sud de La Réunion (OTI du Sud) »** et, idéalement, la date de dernière mise à jour de la donnée réutilisée. Cette licence est compatible avec les plateformes open data nationales (DATAtourisme).

### Médias (photos, vidéos)

La réutilisation des **médias publiés** est autorisée dans le cadre de la valorisation touristique du territoire. Le **crédit est obligatoire** lorsqu'il est fourni : chaque média porte un champ `credit` — reproduisez-le tel quel ; à défaut de crédit renseigné, citez l'OTI du Sud. Les URLs des médias sont **directes et publiques**, mais **non garanties stables** : un ré-upload d'une photo change son URL. Resynchronisez donc les médias via l'upsert (section 4) plutôt que de coder les URLs en dur, et si vous recopiez les fichiers chez vous, reprenez-les à chaque cycle.

### Données personnelles (RGPD)

Certaines fiches exposent des **coordonnées de contact** (téléphone, e-mail) qui peuvent constituer des **données à caractère personnel** lorsque l'exploitant est une personne physique (gîtes, tables d'hôtes, producteurs, guides). En réutilisant ces données, vous devenez **responsable de votre propre traitement**.

- **Usage autorisé** : l'**information touristique** — afficher la fiche, permettre au public de contacter l'établissement.
- **Usage interdit** : la prospection commerciale, le démarchage, la revente de fichiers de contacts, ou tout usage étranger à l'information touristique.
- **Propagation des suppressions** : une fiche **supprimée** (flux `GET /objects/deletions`, section 3.3) ou **dépubliée** (réconciliation, section 4) doit être retirée de votre côté sans délai indu.

### Disponibilité

L'API est fournie en **meilleur effort**, sans engagement de niveau de service (SLA) ni fenêtre de maintenance planifiée. Le motif de synchronisation par lots avec backoff (section 4) absorbe les indisponibilités courtes. Signalez tout incident au contact ci-dessous.

---

## Historique des versions

- **`1.0.0`** — première version publique du contrat.

Au sein de la v1, les évolutions sont **additives** (de nouvelles clés peuvent apparaître, les clés existantes ne changent jamais de sens). Les ajouts sont notifiés par e-mail aux détenteurs de clés.

---

## 7. Références

- **OpenAPI 3.1** : [openapi.json](openapi.json) (importable dans Postman, Insomnia, ou un générateur de client) · [rendu lisible](openapi.html)
- **Collection Postman publique** : [Bertel API v3.0](https://www.postman.com/docking-module-astronaut-45890211/oti-du-sud-bertel-v3/collection/85lc214/bertel-api-v3-0) — dossier « 13. API Publique Partenaire »
- **Contact** : d.philippe@otisud.com (clés API, questions techniques, demandes d'enrichissement des profils)
