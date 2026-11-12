# Utiliser les collections Postman Bertel

## Espace partenaire

Importez les deux fichiers distribués :

- [Bertel_Partenaires.postman_collection.json](Bertel_Partenaires.postman_collection.json) : la collection partenaire ;
- [Bertel_Partenaires.postman_environment.json](Bertel_Partenaires.postman_environment.json) : l'environnement à sélectionner.

Renseignez seulement deux variables :

| Variable | Valeur |
|---|---|
| `public_base_url` | Origine de l'application, sans `/api/public` ; `https://bertel.otisud.re` est pré-rempli |
| `partner_key` | Clé partenaire fournie par l'OTI, conservée localement (vide dans le fichier distribué) |

Les requêtes envoient `Authorization: Bearer {{partner_key}}`. Une clé vide fait ignorer les requêtes qui en ont besoin.

Le parcours principal tient en trois appels :

1. **Découvrir** le thésaurus avec `GET /api/public/thesaurus?view=compact` : la réponse donne la publication courante (`release_id`).
2. **Lister** les concepts de cette publication avec `view=compact`, puis suivre `meta.next_cursor` jusqu'à `null`.
3. **Lire** un concept avec `GET .../concepts/{conceptId}` (représentation complète, sans `view`).

Les autres dossiers de la collection partenaire couvrent les fiches et sélections, les catalogues, les suppressions et les formats d'interopérabilité. Les requêtes avancées et l'ensemble exhaustif des routes restent accessibles dans la collection canonique [Bertel_API_v3.postman_collection.json](Bertel_API_v3.postman_collection.json), dossier « API Publique Partenaire ».

Le détail des champs, des paramètres et des codes d'erreur se trouve dans le [guide partenaires](guide-partenaires.md) et dans OpenAPI.

## Référence technique

Cette section concerne la collection canonique et les recettes internes. Elle ne remplace pas le guide partenaire.

### Prérequis

- Une version de Postman qui prend en charge [`pm.execution.skipRequest()`](https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-execution). Les scripts ignorent ainsi, avant envoi, une requête dont les prérequis manquent ou dont l'écriture n'est pas activée.
- Un environnement actif prime sur les Globals. Une valeur vide explicitement définie dans cet environnement fait ignorer les requêtes qui l'exigent. Une adresse absente de toutes les portées utilise les adresses Bertel connues (`https://supabertel.otisud.re/rest/v1` et `https://bertel.otisud.re`) ; une adresse explicitement vide n'active pas ce repli.
- La collection ne redéfinit pas `apikey`, `authorization`, `partner_key`, `base_url` ni `public_base_url` : les valeurs locales ou les Globals sont conservées.

### Périmètres

| Périmètre | Adresse et authentification | Usage |
|---|---|---|
| API partenaire | `{{public_base_url}}/api/public/*` ; `partner_key` | Fiches publiées, sélections, catalogues et thésaurus versionné |
| Exemples techniques PostgREST | `{{base_url}}/rpc/*` ; `apikey` Supabase et `authorization` de session, schéma `api` | Développement et recette par une personne autorisée |

Les routes applicatives d'administration, de CRM, de documents et de RGPD relèvent de contrats internes distincts. Les fonctions PostgreSQL incluent aussi des helpers et des traitements réservés : elles ne définissent pas le périmètre de la collection.

### Variables PostgREST

| Variable | Valeur attendue |
|---|---|
| `base_url` | Racine REST complète, par exemple `https://<hôte-supabase>/rest/v1` ; la collection ajoute `/rpc/<fonction>` |
| `apikey` | Clé cliente Supabase publiée pour cette instance |
| `authorization` | Jeton de session d'un utilisateur autorisé, avec ou sans préfixe `Bearer` |
| `allow_write_requests` | `false` pour une recette en lecture ; `true` n'active les écritures qu'après satisfaction de leurs autres prérequis |

Les scripts normalisent le JWT dans la variable locale `rpc_authorization`. Les POST RPC envoient `Authorization`, `apikey` et `Content-Profile: api` ; les droits de la personne et les règles de la base continuent de s'appliquer. Une clé serveur privilégiée n'est ni nécessaire ni fournie. Retirez clés et jetons de vos valeurs locales avant de partager un environnement renseigné.

### Écritures

Les deux écritures juridiques sont ignorées tant que `allow_write_requests` ne vaut pas exactement `true`. Elles modifient réellement les données : n'activez-les que sur une cible de recette et des objets prévus à cet effet. Les autres POST RPC sont des lectures ; la méthode HTTP seule ne dit pas si une fonction écrit.

Pour les écritures, renseignez `legacy_legal_type_code`, `legacy_legal_value` (JSON valide complet, par exemple `{"policy_number":"EXEMPLE"}`, inséré tel quel), `legacy_legal_valid_from`, `legacy_legal_valid_to` et `legacy_requested_at`.

### Variables de parcours

Les valeurs capturées (identifiants de publication, curseurs, ETag) sont conservées dans les variables de collection et recopiées dans la portée locale de la requête qui en dépend. L'environnement ne les déclare pas : une ancienne valeur ne masque pas une valeur fraîchement capturée.

| Variables | Origine |
|---|---|
| `public_object_id`, `public_itinerary_id`, `public_next_cursor` | Résultats et pagination des fiches publiques |
| `selection_next_cursor`, `membership_next_cursor` | Pagination des sélections et du flux avec appartenances |
| `public_deletions_cursor`, `public_taxonomy_code` | Pagination des suppressions et code taxonomique découvert |
| `thesaurus_release_id`, `thesaurus_previous_release_id` | Découverte et manifeste du thésaurus |
| `thesaurus_concept_id`, `thesaurus_historical_concept_id` | Concept courant, puis concept déprécié ou retiré découvert |
| `thesaurus_next_cursor`, `thesaurus_changes_cursor`, `thesaurus_etag` | Pagination des concepts et des changements ; lecture conditionnelle |

Les exemples techniques utilisent leurs propres identifiants (`object_id`, `itinerary_id`). Une valeur issue d'une autre instance peut produire une absence de résultat ou une erreur de validation. Saisissez les valeurs de la cible dans l'onglet **Variables de la collection** lorsqu'un exemple ne peut pas les découvrir seul.

### Tests

Les scripts vérifient le statut et le type de contenu attendus, puis la structure correspondante : JSON usuel, JSON-LD ou `304` sans corps. Les cas d'erreur attendus constituent la réussite du cas testé. Consultez les requêtes **ignorées** dans le rapport du Runner : un parcours privé de clé, d'identifiant ou de curseur ne constitue pas une recette complète.

Hors connexion, depuis la racine du dépôt :

```bash
node docs/postman.check.js
```

Ces contrôles n'envoient aucune requête. Ils comparent la couverture à OpenAPI et vérifient les scripts sur des réponses simulées ; ils ne prouvent ni le fonctionnement d'une instance déployée ni la validité d'une clé.

### Catalogue du thésaurus

Le [guide métier](thesaurus.html) explique l'entretien du contenu. Le thésaurus fournit des identités stables, des textes multilingues, des synonymes, des relations et des éditions publiques ; le catalogue fournit les choix actifs du moment.
