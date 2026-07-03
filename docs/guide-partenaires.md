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

Toutes les réponses ont la forme `{ "meta": …, "data": … }`. Chaque réponse porte la version de contrat dans `meta.contract_version` **et** dans l'en-tête `X-Bertel-Api-Version`.

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
| `search` | string | — | Recherche plein-texte |
| `lang` | code | `fr` | Langue de résolution des textes |
| `format` | profil | — | Ajoute un document pivot par fiche (voir section 5) |

**Pagination par curseur** : la réponse porte `meta.next_cursor`. Repassez cette valeur telle quelle dans `?cursor=` pour obtenir la page suivante ; `next_cursor` vaut `null` sur la dernière page. Le curseur est **opaque** — ne le construisez ni ne l'interprétez jamais.

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
| `lang=all` | Résout en français **et** ajoute un bloc `data.i18n` = `{champ: {langue: texte}}` avec toutes les traductions disponibles, en un seul appel |
| `format` | Ajoute un document pivot (section 5) |

```bash
curl -H "Authorization: Bearer bk_live_…" \
  "https://<domaine>/api/public/objects/RESRUN00000000XK?lang=all"
```

La fiche `data` contient l'ensemble des données publiques : identité, descriptions (texte propre), localisation et géo, contacts publics, médias publiés, horaires d'ouverture, tarifs, capacités, classements et labels, etc.

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

## 6. Références

- **OpenAPI 3.1** : [openapi.json](openapi.json) (importable dans Postman, Insomnia, ou un générateur de client) · [rendu lisible](openapi.html)
- **Collection Postman publique** : [Bertel API v3.0](https://www.postman.com/docking-module-astronaut-45890211/oti-du-sud-bertel-v3/collection/61gyd5k/bertel-api-v3-0) — dossier « 13. API Publique Partenaire »
- **Contact** : d.philippe@otisud.com (clés API, questions techniques, demandes d'enrichissement des profils)
