# Utiliser la collection Postman Bertel

La collection contient **100 requêtes : 67 exemples partenaires et 33 appels
techniques à 24 RPC distinctes**. Elle couvre les **11 chemins de l’OpenAPI
partenaire**. Ces deux périmètres ont leur propre adresse, leur authentification
et leurs droits.

| Périmètre | Adresse et authentification | Usage |
|---|---|---|
| API partenaire | `{{public_base_url}}/api/public/*` ; clé `partner_key` | Fiches publiées, sélections, catalogues et thésaurus versionné |
| Exemples techniques PostgREST | `{{base_url}}/rpc/*` ; `apikey` Supabase et session `authorization`, schéma `api` | Développement et recette par une personne autorisée |

Les routes applicatives d’administration, de CRM, de documents et de RGPD relèvent
de contrats internes distincts. Les fonctions PostgreSQL incluent aussi des helpers
et des traitements réservés ; leur nombre ne définit pas la couverture de cette
collection.

## Importer et configurer

1. Importer `Bertel_API_v3.postman_collection.json` dans Postman.
2. Importer `Bertel_API_v3.postman_environment.json`, puis sélectionner cet environnement.
3. Renseigner localement les variables du périmètre choisi. Les fichiers distribués
   contiennent des emplacements de configuration, sans identifiants de connexion réels.

Un environnement privé facilite le choix de la cible. Si vous utilisez déjà
**No Environment** et vos **Globals locales**, ce fonctionnement est conservé pour
les clés et les adresses : la collection ne redéfinit pas `apikey`, `authorization`,
`partner_key`, `base_url` ou `public_base_url`.
Une valeur vide explicitement définie dans un environnement actif prend la priorité
sur les Globals et fait ignorer la requête qui exige cette clé ; renseigner
cet environnement ou sélectionner No Environment.

Une adresse déjà définie conserve sa valeur, y compris une adresse de recette.
Lorsque l’adresse est entièrement absente des portées configurées, les scripts
utilisent localement les adresses Bertel connues :
`https://supabertel.otisud.re/rest/v1` et `https://bertel.otisud.re`. Une adresse
explicitement vide n’active pas ce repli : la requête est ignorée.

Utiliser une version de Postman qui prend en charge
[`pm.execution.skipRequest()`](https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-execution).
Les scripts ignorent ainsi, avant son envoi, une requête dont les prérequis manquent
ou dont l’écriture n’est pas activée. Ce parcours vise l’API Client et le Collection Runner.

### Partenaire

| Variable | Valeur attendue |
|---|---|
| `public_base_url` | Origine de l’application, sans `/api/public` final ; par exemple `https://bertel.otisud.re` |
| `partner_key` | Clé partenaire fournie par l’OTI, conservée localement |
| `public_selection_id` | Identifiant permanent d’une sélection ; `1006` est l’exemple « Terroir et artisanat » |

Les requêtes construisent `Authorization: Bearer {{partner_key}}`. Cette clé donne
accès à la passerelle partenaire, avec son quota et le périmètre autorisé.

### Technique PostgREST

| Variable | Valeur attendue |
|---|---|
| `base_url` | Racine REST complète, par exemple `https://<hôte-supabase>/rest/v1` ; la collection ajoute `/rpc/<fonction>` |
| `apikey` | Clé cliente Supabase publiée pour cette instance |
| `authorization` | Jeton de session d’un utilisateur autorisé, avec ou sans préfixe `Bearer` |
| `allow_write_requests` | `false` pour une recette en lecture ; `true` active les deux écritures juridiques après satisfaction de leurs autres prérequis |

Les scripts normalisent le JWT dans une variable locale `rpc_authorization`.
Les POST RPC envoient `Authorization`, `apikey` et `Content-Profile: api` ; les droits
de la personne et les règles de la base continuent à s’appliquer.

La clé partenaire et le JWT Supabase remplissent des rôles différents. Une clé
serveur privilégiée n’est pas nécessaire aux exemples destinés à une personne et
n’est pas fournie dans l’environnement distribué. Conserver clés et jetons dans ses
valeurs locales ; les retirer avant de partager un environnement renseigné.

## Choisir les dossiers

| Dossiers | Contenu |
|---|---|
| Authentication & Headers ; Core Endpoints | Fiche, listes paginées, changements depuis une date et exemple serveur réservé |
| Advanced Filtering ; Filter Examples | Équipements, langues, accessibilité, labels, géolocalisation, itinéraires, capacités et salles |
| Track Data Examples ; Track & GPX Export | Tracés KML, GPX et GeoJSON |
| Deep Data ; Search & Discovery | Données liées, recherche, carte, labels et cuisines |
| Media ; Reviews & Room Types ; Promotions | Médias, avis, chambres et code promotionnel |
| Legal System | Quatre lectures juridiques |
| API Publique Partenaire | Fiches, exports, sélections, appartenances, suppressions, catalogues et thésaurus |
| Technique — écritures (désactivées par défaut) | Deux opérations juridiques : ajout d’un enregistrement et demande de document |

Pour une recette partenaire, sélectionner les dossiers de la passerelle publique.
Pour une recette technique, configurer les variables PostgREST et choisir les exemples
adaptés à ses droits et aux données de la cible.

Les variables `legacy_label_value_id`, `legacy_legal_id` et `legacy_promotion_code`
restent à renseigner pour leurs exemples spécialisés. Pour les écritures, fournir
`legacy_legal_type_code`, `legacy_legal_value`, `legacy_legal_valid_from`,
`legacy_legal_valid_to` et `legacy_requested_at`. `legacy_legal_value` contient un
**JSON valide complet**, par exemple `{"policy_number":"EXEMPLE"}` : le corps de
requête l’insère comme valeur JSON, sans guillemets supplémentaires.

`list_objects_with_validated_changes_since` reste un exemple réservé au serveur et
est ignoré par le parcours distribué. Une session utilisateur ordinaire ne représente
pas ce contexte ; une liste vide ne prouve pas une validation de ses privilèges.

Les deux écritures juridiques sont ignorées tant que `allow_write_requests` ne vaut
pas exactement `true`. Leur activation doit viser une cible de recette et des objets
prévus à cet effet : elles modifient réellement les données. Les autres POST RPC de
la collection sont des lectures ; la méthode HTTP seule ne détermine pas si une
fonction écrit.

## Parcourir les fiches et les sélections

1. Lancer la liste des fiches publiées. Si elle contient des résultats, les scripts
   mémorisent un identifiant public utilisable pour le détail et le curseur suivant.
2. Consulter une fiche, ses langues ou ses représentations JSON-LD, DATAtourisme,
   Apidae et Tourinsoft. Les variantes Tourinsoft sont des contrats distincts ;
   choisir une fiche couverte par la variante demandée.
3. Pour une sélection, renseigner `public_selection_id`, puis conserver le même
   identifiant, la même clé et les mêmes options pendant toute la pagination.
   Un renommage de sélection conserve son identifiant permanent.
4. Pour connaître les appartenances dans le flux général, utiliser
   `include_selection_ids=true`. Cette option est incompatible avec `selection_id`,
   y compris lorsqu’elle vaut `false`.

Les pages suivantes utilisent les curseurs capturés. Une requête qui dépend d’un
curseur ou d’un identifiant absent est ignorée ; une page vide connue est une réponse
valide. Poursuivre jusqu’à `next_cursor: null` pour une synchronisation complète.

Les appartenances `selection_ids` sont recalculées sur les données courantes. Une
suspension ou une modification des critères peut les changer sans changer
`updated_at` sur la fiche. Les pages ne forment pas un instantané : appliquer les
retraits dans son miroir après un parcours complet réussi. Une erreur, notamment
`503 selection_membership_unavailable`, conserve l’état précédemment synchronisé.

Pour un flux depuis une date, conserver son point de départ pendant le parcours et
ne l’avancer qu’après réussite de toutes les pages. Les exemples techniques utilisent
`p_cursor` et `p_page_size` ou `p_limit`, selon la signature ; la passerelle publique
utilise `cursor` et `page_size`.

`current_timestamp` est le point de départ configurable des exemples techniques
« since ». Il n’est pas remplacé automatiquement par l’heure présente. `public_lang`,
`public_search` et `thesaurus_query` règlent les exemples correspondants. Les codes de
filtres sont sensibles à la casse : par exemple `parking`, `wifi`, `photo`,
`carte_bleue`, `especes`, `hot_stars` et `max_capacity`. Les coordonnées des exemples
géographiques illustrent une zone du Sud de La Réunion ; elles ne garantissent pas
la présence de fiches correspondant à l’ensemble des autres critères.

## Parcourir le thésaurus

Le thésaurus apporte des identités stables, les textes multilingues, les synonymes,
les relations et les éditions publiques. Avant le gel explicite du lancement, la série
reste à l'édition 1 et reflète le dernier snapshot technique ; elle n'expose pas les
numéros de préparation ni les versions historiques internes. Après le gel, cette
édition devient le baseline immuable et les publications suivantes avancent la série.
Le catalogue fournit les choix actifs
du moment. Le [guide partenaires](guide-partenaires.md) détaille ces contrats ; le
[guide métier](thesaurus.html) explique l’entretien du contenu.

1. **Découvrir la publication courante** avec `GET /thesaurus`. Les scripts capturent
   l’identifiant retourné ; aucun numéro de publication n’est fixé dans les exemples.
2. **Lire son manifeste**, puis **lister ses concepts** avec cet identifiant. La
   première page peut fournir un concept à consulter et un curseur pour continuer.
3. **Consulter un concept dans la publication choisie**, puis son **URI pérenne**
   dans la publication courante. Ces deux lectures ont des temporalités distinctes.
4. **Essayer les langues**, notamment `lang=de`. Les champs de langue effective
   indiquent les replis : une définition française de repli reste une définition
   française et n’est pas présentée comme une traduction.
5. **Télécharger l’export JSON** ou le document **JSON-LD/SKOS** de la publication.
   Le second répond en `application/ld+json` et décrit les relations sémantiques.
6. **Lire les changements** depuis la publication précédente, avec leur propre
   curseur. Avant le gel, l'édition 1 n'a pas de prédécesseur : tous les concepts
   publics du snapshot courant sont `added` (`before: null`). La requête de publication
   précédente est ignorée. Les curseurs sont liés au snapshot effectivement sélectionné;
   après une retouche pré-lancement, recommencer le parcours. Les concepts dépréciés
   ou retirés restent utiles pour les anciennes fiches.
7. **Rejouer une lecture avec l’ETag capturé**. Un `304` attendu ne contient pas de
   corps ; la clé partenaire et le quota sont toujours contrôlés.

Les curseurs du thésaurus sont liés à l'édition publique, au snapshot sélectionné, aux
filtres, à la langue et à la taille de page. Conserver ces paramètres jusqu'à la fin du
parcours. Une retouche pré-lancement peut invalider les pages de l'édition 1 ; après le
gel, une nouvelle édition n'altère pas les snapshots historiques.

Les exemples d’erreurs vérifient leurs statuts attendus, notamment les paramètres
invalides ou un concept inconnu. Leur réponse d’erreur attendue constitue la réussite
du cas testé ; elle ne transforme pas l’échec d’une requête normale en synchronisation réussie.

## Variables de parcours

Les valeurs capturées sont conservées dans les **variables de collection**. Les
scripts les recopient dans la portée locale de la requête qui en dépend. L’environnement
fourni ne déclare pas ces valeurs : une ancienne valeur d’environnement ne masque
ainsi pas une publication ou un curseur fraîchement capturé.

| Variables | Origine |
|---|---|
| `public_object_id`, `public_itinerary_id`, `public_next_cursor` | Résultats et pagination des fiches publiques |
| `selection_next_cursor`, `membership_next_cursor` | Pagination des sélections et du flux avec appartenances |
| `public_deletions_cursor`, `public_taxonomy_code` | Pagination des suppressions et exemple de code taxonomique découvert |
| `tourinsoft_regional_object_id` | Première fiche couverte par la variante régionale de l’exemple |
| `thesaurus_release_id`, `thesaurus_previous_release_id` | Découverte et manifeste du thésaurus |
| `thesaurus_concept_id` | Liste des concepts de la publication choisie |
| `thesaurus_historical_concept_id` | Concept déprécié ou retiré découvert dans la publication |
| `thesaurus_next_cursor`, `thesaurus_changes_cursor` | Pagination des concepts et des changements |
| `thesaurus_etag` | Réponse d’une lecture conditionnelle du thésaurus |

Les exemples techniques utilisent leurs propres identifiants, dont `object_id` et
`itinerary_id`. Une valeur issue d’une autre instance ou inventée peut produire une
absence de résultat ou une erreur de validation. Renseigner les valeurs de la cible
lorsqu’un exemple ne peut pas les découvrir automatiquement.

Pour saisir manuellement une valeur de parcours, utiliser l’onglet **Variables de
la collection**. Une liste technique peut fournir `object_id` et `itinerary_id`
avant les lectures de détail ; des filtres trop restrictifs peuvent laisser la
liste vide. Les identifiants techniques et partenaires sont capturés séparément.

Les portées et leur priorité sont décrites dans la
[documentation officielle des variables Postman](https://learning.postman.com/docs/use/send-requests/variables/variables/).

## Comprendre les tests

Les scripts vérifient le statut et le type de contenu attendus, puis la structure
correspondante. Ils distinguent JSON usuel, JSON-LD et `304` sans corps. Les variables
locales `expected_status` et `expected_content_type` sont pilotées par les cas particuliers.

Consulter les requêtes **ignorées** dans le rapport du Runner. Un parcours privé de
clé, d’identifiant ou de curseur peut ignorer plusieurs étapes : il ne constitue pas
une recette complète de ces étapes.

Depuis la racine du dépôt, les contrôles hors connexion se lancent avec :

```bash
node docs/postman.check.js
```

Ils comparent la couverture à OpenAPI et vérifient les scripts et les garde-fous sur
des réponses simulées. Ils recoupent aussi OpenAPI avec les routes HTTP publiques
implémentées et vérifient les codes d’exemples à partir du vocabulaire minimal relu
dans `postman-sample-catalog.json`. Ce dernier est un contrat de recette, avec sa
provenance ; il ne constitue pas un export complet des catalogues.

Ces contrôles n’envoient aucune requête et ne prouvent pas, à eux seuls, le
fonctionnement d’une instance déployée ou la validité d’une clé.
