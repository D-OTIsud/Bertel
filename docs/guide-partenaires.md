<!--
  Source canonique du guide partenaires. Rendu publiquement par partenaires.html
  (rendeur maison partenaires-render.js). Syntaxe Markdown supportée : titres #–####,
  paragraphes, **gras**, *italique*, `code`, blocs ```, tables |, listes plates -/1.,
  liens [t](url), citations >, règles ---. Ne pas introduire d'autre syntaxe sans
  étendre le rendeur (auto-check : node docs/partenaires-render.check.js).
-->

# API publique Bertel — Guide partenaires

**Office de Tourisme Intercommunal du Sud de La Réunion (OTI du Sud)** · Contrat `1.0.0` · Guide mis à jour le 2026-07-03

Bertel est le système d'information touristique de l'OTI du Sud. Son API publique donne aux partenaires un accès **en lecture seule** aux fiches touristiques **publiées** du territoire : hébergements, restaurants, activités, itinéraires, événements, patrimoine, sites naturels…

Elle est conçue pour la **synchronisation serveur-à-serveur** : alimenter votre site, votre application ou votre plateforme (DATAtourisme, Apidae, Tourinsoft, moteurs de recherche via schema.org) à partir des données à jour de l'OTI.

---

## 1. Démarrage rapide

### Obtenir une clé API

Écrivez à **d.philippe@otisud.com** en précisant : qui vous êtes, l'usage prévu des données et le nom de votre service. Vous recevrez :

- votre **clé API** au format `bk_live_` suivi de 48 caractères hexadécimaux ;
- le **domaine de base** de l'API (noté `<domaine>` dans ce guide).

**Délai et éligibilité.** L'accès est ouvert aux partenaires touristiques et institutionnels : offices de tourisme, plateformes SIT (DATAtourisme, Apidae, Tourinsoft), agences web mandatées, éditeurs de sites et d'applications valorisant le territoire. Comptez un délai indicatif de **quelques jours ouvrés** pour l'attribution.

**Évaluer avant de brancher.** Un exemple de réponse détail complet et réel est publié dans le contrat OpenAPI et la collection Postman (section 7) : de quoi juger la richesse des données sans écrire une ligne de code. Une **clé de démonstration** (lecture seule, débit limité) peut être fournie sur simple demande pour tester l'API en conditions réelles.

La base de toutes les URLs est :

```
https://<domaine>/api/public
```

### Premier appel

```bash
curl -H "Authorization: Bearer bk_live_votre_cle" \
  "https://<domaine>/api/public/objects?page_size=5"
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

### Enveloppe et versionnage

Seule une réponse `200` a la forme `{ "meta": …, "data": … }` ; les erreurs sont des corps **plats** portant une clé `error` (voir la table des codes d'erreur). L'en-tête `X-Bertel-Api-Version` reste présent **partout**, y compris sur les erreurs, et la réponse `200` porte en plus la version de contrat dans `meta.contract_version`.

Au sein d'une même version majeure, les évolutions sont **uniquement additives** : de nouvelles clés peuvent apparaître, les clés existantes ne changent jamais de sens. **Votre parseur doit donc ignorer les clés inconnues.** Une rupture de contrat serait publiée sous `/api/public/v2/*`, sans casser la v1.

### Codes d'erreur

| Code | Corps | Signification |
|---|---|---|
| 400 | `invalid_object_id` / `bad_request` | Paramètre malformé (id hors format, `since` non ISO 8601) |
| 401 | `unauthorized` | Clé absente, invalide, révoquée ou expirée |
| 404 | `not_found` | Fiche inconnue **ou non publiée** (indistinguable, par conception) |
| 429 | `rate_limited` | Limite de débit atteinte — respecter `Retry-After` |
| 500 / 502 | `server_misconfigured` / `upstream_error` | Erreur côté Bertel — réessayer plus tard avec backoff |

---

## 3. Les endpoints

### 3.1 `GET /objects` — liste paginée des fiches publiées

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `cursor` | string | — | Curseur opaque de pagination (voir ci-dessous) |
| `page_size` | int 1–200 | 50 | Nombre de fiches par page |
| `types` | csv | tous | Filtre par types de fiche (codes ci-dessous) |
| `search` | string | — | Recherche sur le **nom** de la fiche uniquement |
| `lang` | code | `fr` | Langue de résolution des textes |
| `format` | profil | — | Ajoute un document pivot par fiche (voir section 5) |

**Pagination par curseur** : la réponse porte `meta.next_cursor`. Repassez cette valeur telle quelle dans `?cursor=` pour obtenir la page suivante ; `next_cursor` vaut `null` sur la dernière page. Arrêtez la boucle de pagination quand `next_cursor` vaut `null`. Le curseur est **opaque** — ne le construisez ni ne l'interprétez jamais. Les paramètres de filtre (`types`, `page_size`, `search`, `lang`) sont **figés par le curseur** : pour changer un filtre, repartez sans `cursor`.

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

Exemple — les restaurants et hôtels, 200 par page :

```bash
curl -H "Authorization: Bearer bk_live_…" \
  "https://<domaine>/api/public/objects?types=RES,HOT&page_size=200"
```

### 3.2 `GET /objects/{id}` — une fiche complète

L'identifiant a la forme `RESRUN00000000XK` (3 lettres de type + territoire + 10 caractères). Une fiche inconnue, dépubliée ou archivée répond `404` — un partenaire ne voit **jamais** un brouillon.

| Paramètre | Description |
|---|---|
| `lang` | Langue de résolution (`fr` par défaut) |
| `lang=all` | Résout en français **et** ajoute un bloc `data.i18n` = `{champ: {langue: texte}}` avec toutes les traductions disponibles, en un seul appel. Ce bloc couvre **uniquement** les 7 champs de la famille description (`description`, `description_chapo`, `description_mobile`, `description_edition`, `description_adapted`, `description_offre_hors_zone`, `sanitary_measures`) — **pas** le nom (`name`) ni les proses de facettes (menus, chambres, étapes d'itinéraire) |
| `format` | Ajoute un document pivot (section 5) |

```bash
curl -H "Authorization: Bearer bk_live_…" \
  "https://<domaine>/api/public/objects/RESRUN00000000XK?lang=all"
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

Un exemple de réponse détail complet et réel est fourni dans le contrat OpenAPI (`openapi.json`) et la collection Postman.

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

Réponse : `data` = `{ "<domaine>": [{ "code", "name", "icon_url", "parent_code", "domain" }] }`. Un domaine inconnu est ignoré silencieusement.

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
| `tourinsoft` | `tourinsoft` | Syndication SIT Tourinsoft | Échange SIT (les codes de type Bertel sont des bordereaux Tourinsoft) |

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

### Périmètre des pivots — à lire avant une synchro de production

Les documents pivot couvrent les **champs cœur** : type/classe correcte dans le vocabulaire cible, nom, description (texte propre), adresse, coordonnées géographiques, téléphone/email/site publics, image de couverture, réseaux sociaux publics.

Ne sont **pas** encore portés dans les pivots (chaque standard compte des centaines de champs) : horaires d'ouverture, tarifs, capacités, équipements, classements, **dates d'occurrence des événements** (FMA), tracés GPX des itinéraires, ainsi que le multilingue (pivots en français ; les traductions restent disponibles sur la ressource de base via `?lang=all`).

**Avant tout branchement réel**, validez la conformité champ à champ contre l'importeur cible (validateur DATAtourisme, plateforme Apidae, SIT Tourinsoft régional). Si un champ vous manque dans un pivot, il est en général déjà présent dans la ressource de base `data` — et le profil peut être enrichi : parlez-en au contact ci-dessous.

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
- **Collection Postman publique** : [Bertel API v3.0](https://www.postman.com/docking-module-astronaut-45890211/oti-du-sud-bertel-v3/collection/61gyd5k/bertel-api-v3-0) — dossier « 13. API Publique Partenaire »
- **Contact** : d.philippe@otisud.com (clés API, questions techniques, demandes d'enrichissement des profils)
