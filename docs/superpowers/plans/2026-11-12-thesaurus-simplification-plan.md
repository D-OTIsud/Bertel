# Simplification du thésaurus, de la documentation et de Postman

Date : 12 novembre 2026. Statut : mise en œuvre locale autorisée par l'utilisateur et réalisée sur `codex/thesaurus-simplification`, depuis `221195b8`. La diffusion reste préparée, sans déploiement ni publication externe. Les résultats et limites sont consignés dans le [reçu de réalisation](../../releases/2026-11-12-thesaurus-simplification.md).

## 1. Résultat attendu

Permettre à un partenaire de découvrir un vocabulaire, de lire ses concepts et d'afficher un libellé avec trois appels compréhensibles. Réduire les répétitions dans le JSON et les exemples, conserver une référence exhaustive accessible et préserver les intégrations existantes.

La direction retenue est une option unique `view=compact` sur la découverte, le manifeste et la liste de concepts, avec le comportement historique conservé en son absence. La collection partenaire séparée et la réorganisation documentaire sont réalisées. Les sections suivantes conservent le détail du plan ayant guidé la réalisation ; le reçu distingue les contrôles locaux acquis des vérifications de diffusion encore à effectuer.

## 2. Référence de travail et correction du périmètre de l'audit

Deux états distincts ont été examinés, sans récupération réseau ni contrôle de production pendant la préparation de ce plan.

| État | Référence observée | Conséquence |
|---|---|---|
| Checkout de ce chat | Branche `codex/thesaurus-partner-api`, HEAD `daa6cede198f0fc21e74e48e1afeb5e0cdce93ae`, 6 novembre, avec modifications locales préexistantes | Source du premier audit et de la contre-vérification Claude |
| Référence d'intégration disponible localement | `origin/master`, `221195b83048e37020fe769c4bf9a7bdcab89dc2`, 11 novembre | Base documentaire et technique à réconcilier avant réalisation ; ne constitue pas une attestation du dernier état distant ou déployé |

Le constat « aucune requête thésaurus dans Postman » concerne le checkout ancien. Sur la référence d'intégration observée, la collection contient déjà 112 requêtes, dont 33 RPC internes et 79 requêtes publiques ; 37 concernent le thésaurus. Ces 37 requêtes n'ont pas de réponse enregistrée. Le chantier porte donc sur leur hiérarchie et leurs exemples, pas sur leur création intégrale.

La référence plus récente possède aussi un guide métier, un générateur HTML, des vérifications Postman et une CI documentaire. Elle utilise les éditions publiques officielles, le RPC `thesaurus_public_edition`, des curseurs liés à un snapshot et les liens `member_of` / `members`. Ces acquis doivent être intégrés au plan final et conservés.

Les constats de l'audit initial et de Claude sont des éléments d'analyse du checkout. Ils ne valent pas approbation de la réalisation décrite ici ni validation de la référence plus récente.

## 3. Décisions de réalisation

| Décision | Recommandation | Autre voie et conséquence |
|---|---|---|
| Compatibilité | Ajouter `view=compact` ; l'absence de ce paramètre conserve la réponse actuelle | Si une réponse compacte doit devenir le défaut, définir une version majeure propre à la surface thésaurus et une migration des clients |
| Périmètre initial du compact | Découverte et manifeste d'une édition ; listes dans un lot suivant | Ne pas coupler tous les changements à une livraison unique |
| Concept compact | Une projection commune aux lignes de liste ; détail, résolution, export et changements gardent la représentation complète | Une représentation universelle plus courte supprimerait des informations utiles aux intégrations sémantiques |
| Historique | Conserver `releases` avec des résumés dans la découverte compacte | Ne pas ajouter une route d'historique ni une pagination SQL sans besoin démontré |
| Postman | Une collection partenaire distribuée séparément ; collection technique maintenue pour l'équipe | Établir les identifiants et liens de distribution avant tout renommage ou déplacement d'artefact existant |
| Ordre des clés JSON | Ordre lisible dans les nouveaux objets compacts ; conserver les réponses existantes | Un changement général d'ordre modifierait tous les ETag sans réduire la structure du contrat |

L'observation des appels partenaires éclaire la transition ; l'absence d'appels dans une période de journalisation ne permet pas, à elle seule, de retirer un contrat publié. Les journaux sont alimentés au mieux et les usages externes restent à établir.

Si la voie v2 est finalement retenue, elle remplace la stratégie optionnelle : ne pas entretenir simultanément une v2 et une option compacte redondante. Ne pas augmenter globalement `PUBLIC_API_CONTRACT_VERSION` pour le seul thésaurus : cette constante et les en-têtes sont partagés avec les fiches, catalogues et suppressions.

## 4. Contrat cible retenu

### 4.1 Opérations

Le tableau décrit uniquement les ajouts envisagés. Sans `view`, les chemins, paramètres, champs, valeurs nulles, erreurs et garanties existants restent compatibles.

| Opération | Vue compacte proposée | Autres usages |
|---|---|---|
| `GET /thesaurus` | Oui : publication courante, domaines utiles et historique résumé | Réponse historique inchangée sans option |
| `GET /thesaurus/releases/{releaseId}` | Oui : métadonnées essentielles et domaines | Manifeste complet sans option |
| `GET /thesaurus/releases/{releaseId}/concepts` | Oui, après validation du lot listes | Pagination et filtres existants |
| Détail d'un concept dans une édition | Aucun nouveau paramètre | Représentation complète |
| Résolution de l'identité courante | Aucun nouveau paramètre | Représentation complète et URI pérenne |
| Export JSON et JSON-LD | Aucun nouveau paramètre | Informations sémantiques complètes |
| Changements | Aucun nouveau paramètre | `before` / `after` complets, synchronisation inchangée |

N'accepter que `view=compact` sur les opérations annoncées. Une valeur inconnue, un paramètre répété ou un usage sur une opération non concernée renvoie une erreur de paramètres conforme au contrat actuel. Ne pas introduire en parallèle `fields`, `include`, `expand` ou une seconde option équivalente.

### 4.2 Découverte et manifeste compacts

- `meta` : `contract_version`, `release_id`, `previous_release_id`, `as_of`, une seule fois pour la publication ciblée.
- `data` : licence et attribution avec leurs types actuels, `domains` ; `releases` seulement pour la découverte.
- Domaine : `domain`, `name`, `effective_lang`.
- Résumé d'historique : `release_id`, `previous_release_id`, `as_of` ; aucun manifeste ni domaine imbriqué. Préserver l'ordre et le périmètre officiel retournés par le lecteur existant.
- Réserver les règles éditoriales, traductions intégrales, compteurs d'impact et détails de provenance au manifeste complet. Ne pas présenter le titre localisé comme une nouvelle traduction enregistrée.
- Ne pas recopier `data.contract_version` dans la vue compacte. Sa valeur historique est inscrite dans les instantanés ; la version HTTP provient de la couche HTTP. Ne réécrire aucun manifeste stocké.
- Distinguer le checksum de publication, le checksum de métadonnées et l'ETag de représentation. La vue compacte utilise l'ETag pour son cache ; le manifeste complet conserve les empreintes existantes.

Le compact est une projection de consultation. Il réutilise les règles de localisation existantes, y compris les titres historiques, les cartes de traductions figées et la qualification de leur provenance. Les détails de provenance restent consultables dans le manifeste complet ; la documentation courte n'affirme pas que tous les titres historiques sont des traductions figées dans leur édition.

L'historique reste limité à ce que fournit actuellement le RPC, jusqu'à 100 éditions. Si le point de reprise n'y figure pas, consulter le manifeste connu ou reprendre un export complet. Utiliser `previous_release_id` plutôt qu'inventer un identifiant précédent. Ne pas mélanger numéros techniques et éditions publiques.

### 4.3 Liste compacte de concepts

| Champs | Règle proposée |
|---|---|
| `concept_id`, `domain`, `code`, `name`, `effective_lang`, `lifecycle`, `assignable` | Noyau toujours présent ; `name` et `effective_lang` acceptent `null` lorsqu'aucun libellé ni sa langue ne sont disponibles ; les autres champs conservent leurs types actuels |
| `context_key` | Présent lorsqu'il est non vide ; opaque, pas un identifiant à recalculer |
| `description`, `definition_lang` | Présents ensemble lorsqu'une description existe ; sa langue peut différer de celle du nom |
| `valid_from`, `valid_to` | Présents lorsqu'ils sont renseignés ; une absence dans cette nouvelle vue signifie aucune borne fournie |
| `broader` | Conservé lorsqu'il est non vide ; garder son nom et sa forme de tableau |
| `member_of` | Conservé lorsqu'il est non vide ; appartenance distincte d'une hiérarchie taxonomique |
| `replaced_by` | Conservé lorsqu'il est non vide ; plusieurs successeurs ne déclenchent aucun choix automatique |

Le nom et sa langue proviennent du normaliseur public existant ; leur absence devient explicitement `null` dans cette seule nouvelle vue, sans libellé inventé ni nouvelle erreur 502. Une identité ou un snapshot structurellement invalide garde les erreurs actuelles. Le détail et l'export conservent URI, toutes les langues, synonymes, notes, sources disponibles, relations, mappings, descendants et membres. Aucune suppression d'une clé de la représentation complète n'est justifiée par sa seule absence dans les données observées. Les champs `related` et `replaced_by` peuvent y répéter `relations` : leur consolidation générale est un autre changement de contrat, non nécessaire à la vue compacte.

La liste garde l'état publié et les dates : ne pas recalculer `assignable` au jour courant dans un snapshot. L'identité reste `concept_id` ; `code` seul, et même `(domain, code)`, ne suffit pas pour tous les catalogues.

`meta` de liste compacte contient `contract_version`, `release_id`, `total`, `next_cursor`. Ne pas répéter `vocabulary_release`, la taille demandée ou les dates de publication dans chaque page compacte. La cohérence du numéro avec `vocabulary_release` des fiches reste documentée.

### 4.4 Exemples proposés pour la revue

Valeurs fictives, ne constituant ni une capture de production ni une promesse sur son édition courante. L'option additive conserve ici la version HTTP actuelle ; toute évolution de son numéro doit respecter la convention partagée du dépôt.

Découverte : `GET /api/public/thesaurus?view=compact&lang=fr`.

```json
{
  "meta": {
    "contract_version": "1.0.0",
    "release_id": 2,
    "previous_release_id": 1,
    "as_of": "2026-11-12T08:00:00Z"
  },
  "data": {
    "license": "Licence Ouverte / Etalab 2.0",
    "attribution": "Office de Tourisme Intercommunal du Sud de La Réunion (OTI du Sud)",
    "domains": [
      { "domain": "activity_type", "name": "Types d’activité", "effective_lang": "fr" }
    ],
    "releases": [
      { "release_id": 2, "previous_release_id": 1, "as_of": "2026-11-12T08:00:00Z" },
      { "release_id": 1, "previous_release_id": null, "as_of": "2026-11-11T08:00:00Z" }
    ]
  }
}
```

Liste : `GET /api/public/thesaurus/releases/2/concepts?domains=activity_type&view=compact&lang=fr`.

```json
{
  "meta": { "contract_version": "1.0.0", "release_id": 2, "total": 1, "next_cursor": null },
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

La licence et l'attribution sont des textes dans le modèle consulté. Ces valeurs illustrent la politique documentaire existante ; la réponse livrée reprend toujours celles du manifeste sélectionné, sans les inscrire en dur dans le sérialiseur.

## 5. Lots de réalisation

### Lot 0 — Réconcilier la base et mesurer l'existant

1. Relever le HEAD réellement intégré et l'état déployé si cette vérification est autorisée à l'exécution. Choisir et consigner une référence unique pour le candidat.
2. Préparer ensuite une branche isolée `codex/thesaurus-simplification` sur cette base. Ne pas réinitialiser le checkout sale, recopier ses fichiers en bloc ni écraser les changements préexistants. Importer seulement des différences explicitement utiles après comparaison.
3. Refaire l'inventaire ciblé API, OpenAPI, collections, générateurs et tests sur cette base. Conserver les protections ajoutées après le 6 novembre.
4. Mesurer sur le même corpus et les mêmes options : octets JSON avant compression, taille compressée si disponible, nombre de champs et requêtes nécessaires au parcours. Comparer découverte, manifeste et listes ; distinguer lecture courante et téléchargement exhaustif.
5. Si nécessaire pour la transition, examiner les appels thésaurus par action et catégorie de clé, la durée de conservation et les appels de recette. Ne pas publier d'identité partenaire ni de clé dans les preuves. Ne pas assimiler un journal vide à une preuve d'absence de client.

Livrable : référence de réalisation, inventaire corrigé, mesures de départ et décisions de la section 3 prêtes à valider.

### Lot 1 — Figer le contrat proposé et les exemples

1. Valider les opérations et tableaux de champs de la section 4 ; décider séparément de l'inclusion de la liste compacte.
2. Définir une liste blanche explicite pour chaque projection compacte et le comportement d'absence des champs optionnels.
3. Constituer des exemples synthétiques représentatifs : actif, catégorie non assignable, contexte de classification, parent, appartenance, retrait avec plusieurs remplaçants, dates, repli linguistique et résultat vide.
4. Fixer la stratégie de variable, d'identifiant et de distribution Postman. Conserver une voie d'accès aux requêtes techniques historiques.
5. Arrêter les critères de taille à partir des mesures du lot 0. Ne pas annoncer un pourcentage de gain avant de l'avoir mesuré.

Livrable : contrat relisible, exemples JSON valides et périmètre de compatibilité approuvé. Aucun changement de schéma PostgreSQL n'est nécessaire pour ces projections HTTP.

### Lot 2 — Simplifier les guides et leur navigation

Fichiers : `docs/guide-partenaires.md`, `docs/guide-metier-thesaurus.md`, `docs/README_Postman.md`, `docs/README.md`, `README.md`, et liens concernés dans `docs/index.html`, `docs/partenaires.html` et `docs/doc_api_bertel_v3.html`.

1. Ouvrir le guide partenaire sur le parcours découvrir → parcourir → lire un concept, avec un seul exemple court et la règle de pagination.
2. Placer ensuite traductions/replis, synchronisation, états, historique et SKOS. Expliquer chaque distinction une fois et renvoyer à OpenAPI pour le dictionnaire exhaustif des champs.
3. Dans le guide métier, privilégier chercher → rédiger → relire → publier. Regrouper les explications répétées sur identité, synonymes et relations ; conserver les distinctions métier qui empêchent une mauvaise saisie et les consignes de reprise.
4. Garder la charte, le thème et les mécanismes de navigation existants. Proposition de lecture : un parcours rapide en tête, chapitres de référence ensuite, liens explicites vers le guide développeur et OpenAPI. Une refonte visuelle n'est pas incluse.
5. Retirer les marqueurs de réalisation des titres et exemples destinés aux partenaires. Conserver l'historique technique dans les documents internes existants. Retirer les comptes manuels de requêtes dans les introductions ou les vérifier automatiquement : le README de la référence consultée annonce encore 100 requêtes alors que la collection en contient 112.
6. Préserver les ancres liées depuis d'autres pages, ou mettre à jour toutes leurs références. Le générateur métier cherche notamment le titre exact de la section 3.5 : une renumérotation impose de l'adapter.
7. Régénérer `docs/thesaurus.html` avec `docs/thesaurus-render.js`, depuis les sources ; ne pas éditer le corps HTML généré à la main.
8. Adapter `partenaires-render.check.js` et `thesaurus-render.check.js` aux objectifs de lecture. Remplacer les assertions de nombre exact de chapitres/tables par les invariants utiles de contenu, d'ancres, d'accès clavier et de publication.

Livraison possible sur le contrat actuel. Les mentions d'une option compacte ne deviennent publiques qu'une fois cette option disponible sur l'application cible.

### Lot 3 — Distribuer un Postman partenaire simple

Fichiers proposés : nouveaux `docs/Bertel_Partenaires.postman_collection.json` et `docs/Bertel_Partenaires.postman_environment.json` ; collection/environnement actuels, `docs/postman-sample-catalog.json`, `docs/postman.check.js`, guides et pages qui distribuent les liens.

1. Réutiliser les requêtes publiques existantes et leurs scripts ; ne pas reconstruire les 37 requêtes thésaurus depuis l'ancien checkout.
2. Dans la collection partenaire, placer trois requêtes thésaurus principales en premier : découvrir, parcourir une édition, lire un concept. Regrouper synchronisation/export dans Avancé ; garder les cas d'erreur et variantes linguistiques dans la collection de référence/recette, hors du parcours d'entrée.
3. Conserver pour les fiches les capacités publiques actuelles, notamment sélections, appartenances, suppressions et formats d'interopérabilité. Une réorganisation ne retire pas un cas fonctionnel.
4. Limiter la configuration partenaire saisie à `public_base_url` et `partner_key`. Déclarer chaque variable de parcours dans une seule portée, distincte des variables techniques ; effacer les dépendances périmées sur une réponse vide ou une nouvelle découverte.
5. Réutiliser l'authentification héritée lorsqu'elle convient ; garder les tests sans clé explicites. Ne pas rendre les erreurs et les requêtes conditionnelles inopérantes par une authentification globale imposée sans exception.
6. Ajouter de petites réponses enregistrées pour le parcours principal, plus les cas nécessaires aux scripts. Confronter leur structure aux schémas OpenAPI et couvrir les propriétés nécessaires au parcours dans le contrôle hors ligne ; marquer clairement les données synthétiques. Le contrôle existant n'est pas un validateur JSON Schema général : ne pas présenter ces assertions structurelles comme une validation exhaustive de tous les schémas.
7. Nommer les appels par leur action. Retirer les suffixes internes tels que I4b/C-5 dans la collection partenaire.
8. Désigner la collection canonique existante comme source des requêtes de référence. Dans `postman.check.js`, ajouter un contrôle de parité des requêtes partagées avec la collection partenaire : méthode, URL, paramètres, authentification et scripts, en autorisant seulement les différences de présentation et les variantes compactes explicitement identifiées. Vérifier la couverture exhaustive OpenAPI dans la collection de recette et le parcours court dans la collection distribuée. Éviter un générateur de collections supplémentaire tant que ces contrôles suffisent à empêcher leur divergence.
9. Préserver l'identifiant de la collection canonique existante et ses liens tant que la nouvelle destination n'est pas créée et vérifiée. La référence observée contrôle cet ID et le lien Postman `85lc214` ; ne pas inventer un nouvel URL public. Publier/actualiser le workspace Postman seulement dans le lot de diffusion autorisé.

Critère de fin : un partenaire configure deux valeurs puis exécute les trois appels sans rechercher un identifiant ; les parcours avancés et négatifs restent disponibles pour la recette.

### Lot 4 — Rendre OpenAPI précis et cohérent

Fichiers : `docs/openapi.json`, `docs/partenaires-render.check.js`, `docs/postman.check.js` ; `docs/openapi.html` seulement si ses mentions de navigation/version doivent changer.

1. Remplacer l'enveloppe indifférenciée utilisée par toutes les opérations par des composants correspondant à manifeste, concept, liste de concepts, changements et export. Réutiliser les composants communs plutôt que recopier les propriétés.
2. Conserver la description du JSON-LD autonome et de son type MIME. Ne pas l'envelopper dans un nouveau format.
3. Décrire le paramètre compact seulement sur les opérations concernées. Pour une opération à deux représentations, expliquer précisément le lien entre le paramètre et chaque schéma ; ne pas ajouter un champ JSON artificiel pour les différencier.
4. Documenter champs obligatoires, absents et nullables, langues effectives, dates, appartenances et hiérarchie. Ne pas réduire un tableau de relation à un scalaire au motif qu'un parent unique existe aujourd'hui.
5. Ajouter un petit exemple par forme de réponse, et les en-têtes/erreurs utiles. Les exemples du guide et de Postman doivent correspondre à ces formes.
6. Expliquer le lien entre édition publique et snapshot, le démarrage de l'édition 1 et la limite d'historique. Les données techniques de préparation ne deviennent pas des identifiants publics.
7. Conserver les métadonnées historiques complètes dans la description de la représentation existante. Une liste blanche de manifeste historique serait elle-même un changement de contrat si elle en retire des champs.

### Lot 5 — Implémenter la découverte compacte en HTTP

Fichiers : `bertel-tourism-ui/src/lib/thesaurus-api.ts`, un petit module pur `thesaurus-public-projection.ts` si l'extraction améliore la lisibilité, tests correspondants. Les sept wrappers de routes restent à vérifier ; aucune nouvelle route n'est nécessaire dans la direction recommandée.

1. Ajouter le paramètre au parseur pour `manifest` et `release` uniquement à ce stade. Transmettre la sélection à la projection, sans changer les paramètres SQL ni la politique de localisation.
2. Construire la réponse compacte à partir des données validées de `thesaurus_public_edition`, avec les listes blanches du lot 1. Réutiliser les règles de localisation et de provenance existantes.
3. Résumer chaque entrée de `releases` sans appeler le serveur une fois par édition, recalculer des identifiants ni recopier ses domaines.
4. Conserver l'intégralité de la réponse existante quand l'option est absente. Ne pas remplacer en bloc `publicThesaurusManifest` par une projection qui supprimerait des champs historiques.
5. Garder authentification et admission avant toute lecture et avant 304. Conserver les en-têtes et le calcul d'ETag lié à la série officielle, à l'édition, au snapshot, au type MIME et aux octets émis. Les vues distinctes ne doivent pas partager par erreur leur validateur de cache.
6. Ne pas modifier le JSON canonique utilisé par les signatures. La lisibilité des nouveaux objets ne justifie pas de modifier les octets du contrat historique.

Critère de fin : découverte compacte sans manifeste imbriqué dans l'historique ; mêmes éditions/domaines et même choix de traduction que la réponse complète ; aucune régression du chemin sans option.

La projection HTTP réduit la réponse et son traitement côté client. Le RPC pourra encore charger les manifestes complets. Une réduction du coût SQL nécessiterait des mesures puis un chantier séparé ; elle n'est pas promise par ce lot.

### Lot 6 — Ajouter la liste compacte si retenue

1. Étendre le même paramètre à `concepts`, avec une seule projection compacte partagée. Aucun paramètre compact sur détail, résolution, changements ou export.
2. Normaliser d'abord le concept avec les règles publiques existantes, puis projeter les champs compacts. Préserver le nettoyage des notes déjà réalisé, les replis scalaires historiques et les nouvelles relations d'appartenance.
3. Ajouter la vue à la liaison du curseur de façon compatible : garder exactement le scope historique si le paramètre est absent ; ajouter un marqueur compact seulement à la nouvelle représentation. Un curseur d'une vue ne doit pas permettre de reprendre l'autre.
4. Préserver série officielle, snapshot signé, filtres normalisés, langue et taille de page. Une préparation qui fait évoluer l'édition 1 doit continuer à invalider le curseur du snapshot précédent.
5. Rendre l'absence des champs optionnels déterministe dans la seule nouvelle vue. Garder dates/UUID/contextes/parents/appartenances/remplacements selon le tableau de la section 4.
6. Ne pas projeter `changes.before/after` en compact : la synchronisation conserve des documents complets. Garder les identités et la parité entre export JSON complet et JSON-LD.
7. Comparer les résultats des deux vues : mêmes identités dans le même ordre, mêmes totaux, aucune perte ou répétition pendant la pagination ; jetons distincts entre vues et sémantique de continuation identique.

Critère de fin : la liste est plus courte sur le corpus de référence, sans appel détail nécessaire pour connaître identité, libellé, état, contexte, parent, appartenance, dates ou remplacement.

### Lot 7 — Vérifier les comportements et les supports ensemble

1. Conserver les tests existants du contrat complet. Ajouter des assertions sur les résultats utiles de la projection compacte, plutôt que seulement reproduire les listes de clés de l'implémentation.
2. Couvrir locales complètes et de base, traduction absente, titre personnalisé, anciennes métadonnées, cartes figées, nom et définition dans des langues différentes, valeurs vides et descriptions absentes.
3. Couvrir concept actif/non assignable, retrait, remplacements multiples, homonymes de contexte, `member_of` distinct de `broader`, dates passées/futures, UUID invalides et données privées ajoutées au snapshot.
4. Couvrir paramètres refusés/répétés, domaine interdit, cursor altéré, changement de vue/langue/filtre/taille, snapshot obsolète, 401, 429 et admission avant 304. Ne pas rendre acceptables des paramètres jusqu'ici interdits sur les autres opérations.
5. Vérifier les éditions officielles : tant que la baseline n'est pas fixée, l'édition 1 suit la préparation ; après fixation, les lectures épinglées conservent leurs garanties. Ne pas promettre une immuabilité absolue avant ce gel.
6. Adapter `tools/thesaurus/verify_partner_http.py` : garder le contrôle exhaustif JSON/JSON-LD, ajouter le parcours compact, distinguer édition officielle et snapshot de préparation. Son hypothèse « une nouvelle publication augmente toujours le numéro public » doit être corrigée avant réutilisation.
7. Exécuter cette recette HTTP dans un environnement adapté avec une clé dédiée. Les phases qui supposent publication, révocation ou épuisement de quota sont des scénarios contrôlés ; ne pas les lancer comme une simple vérification de lecture en production. Les anciens outils SQL de `tools/thesaurus/` sont archivés/quarantainés sur la référence récente : ne pas les rejouer.
8. Vérifier les guides rendus : petit écran et bureau, clavier, sommaire, tableaux, ancres, blocs JSON, téléchargement des deux collections et liens entre guide métier, guide partenaire et OpenAPI.
9. Mesurer les mêmes réponses qu'au lot 0, sans généraliser un gain réseau à un gain SQL. Tester un historique long synthétique et le comportement au-delà des 100 entrées disponibles.

Commandes de contrôle connues, à exécuter sur le candidat réel, pas sur le checkout ancien pour certifier les nouveaux fichiers :

```text
# Depuis la racine
node docs/partenaires-render.check.js
node docs/thesaurus-render.check.js
node docs/postman.check.js
node tools/thesaurus-content/validate-domain-labels.mjs
node tools/thesaurus-content/validate-native-dictionaries.mjs
node tools/thesaurus-content/catalog-coverage.mjs
node --test tools/thesaurus-content/*.test.mjs
docker build --tag bertel-documentation-ci ./docs

# Depuis bertel-tourism-ui
npm run typecheck
npm run test:run -- --runInBand src/lib/thesaurus-api.test.ts src/lib/public-api.test.ts
# Inclure le test du module de projection s'il est créé.
```

La CI frontend actuelle exécute aussi la suite Jest, le build et les E2E requis : conserver ces contrôles. Ne pas inventer une commande `lint` absente de package.json. Après modifications du code, lancer `graphify update .` sur la bonne base. Sans changement de schéma, ne pas régénérer le graphe DB depuis un catalogue différent ni créer une migration.

Fichiers CI : `.github/workflows/documentation.yml` doit aussi déclencher les contrôles sur les modifications du handler, de son éventuel module de projection, de leurs tests, des libellés de vocabulaire et du vérificateur HTTP si celui-ci entre dans le périmètre contrôlé. Réutiliser le workflow existant. `.github/workflows/frontend.yml` conserve ses obligations actuelles.

### Lot 8 — Diffuser et prévoir le retour arrière

1. Préparer des changements relisibles : supports compatibles avec le contrat existant ; projection compacte de découverte ; liste compacte si validée. Chaque livraison doit garder API, exemples, tests et supports cohérents.
2. Examiner les déclencheurs de déploiement avant intégration : le site documentaire et l'application sont des ressources distinctes, parfois surveillant la même branche. Un changement documentaire ne doit pas provoquer une livraison applicative involontaire.
3. Pour les vues compactes, livrer l'application avant d'annoncer l'option dans les supports publics. Publier ensuite les guides et artefacts correspondant au même contrat. Le parcours actuel reste disponible pendant la transition.
4. Mettre à jour les liens de téléchargement et, si autorisé, la destination Postman réelle. Vérifier l'import de la collection distribuée ; un fichier Git modifié ne prouve pas qu'un workspace Postman a été actualisé.
5. Conserver la liste explicite de fichiers dans `docs/Dockerfile`. Ajouter seulement les nouveaux artefacts publics choisis. Les plans, audits, scripts de génération et sources métier privées restent hors de l'image servie.
6. Vérifier après livraison le commit servi, les exemples d'API avec une clé de recette, les réponses 304, les artefacts Postman et les pages. Le repli SPA peut renvoyer l'index avec un statut 200 : vérifier le contenu et l'empreinte attendus, pas le seul statut HTTP.
7. Conserver image/commit précédent par ressource. Avant adoption de l'option, un retrait peut remettre le parcours historique dans les supports puis dans l'application. Après adoption, revenir seulement à une image compatible avec `view=compact` ou préparer un correctif qui conserve cette option : modifier les guides ne retire pas les clients ni les collections déjà importées. Synchroniser les artefacts distribués ; ne toucher ni aux publications du thésaurus ni aux données métier pour corriger une projection HTTP.
8. Consigner les résultats réellement observés dans un reçu de livraison dédié. Ne modifier les anciens audits/reçus que pour ajouter une référence historique pertinente, jamais pour les faire passer pour des preuves de la nouvelle version.

## 6. Dépendances et ordre de passage

Le lot 0 précède toutes les modifications. Le lot 1 fixe les contrats proposés. Les lots 2, 3 et 4 peuvent être préparés en parallèle sur ce contrat, en distinguant les supports du fonctionnement actuel des supports de l'option future. Le lot 5 est le premier changement d'API ; le lot 6 dépend de sa validation et du choix produit sur les listes. Le lot 7 accompagne chaque changement puis vérifie le candidat assemblé. Le lot 8 dépend des contrôles acquis et de l'autorisation de diffusion.

Une première livraison documentaire peut s'arrêter après les lots 2 à 4 sur le contrat existant. Elle ne doit pas annoncer les lots 5 et 6 comme disponibles. Aucun lot ne dépend d'une refonte de l'administration, de la saisie des fiches ou du moteur de publication.

## 7. Critères d'acceptation globaux

- La référence intégrée est explicite et les modifications locales préexistantes sont préservées.
- Le guide et Postman rendent le parcours de trois appels immédiatement identifiable ; les exemples sont valides et courts.
- Les capacités avancées et les erreurs utiles restent accessibles, avec une référence précise pour chaque opération.
- Sans option compacte, le contrat actuel, les signatures/curseurs existants et les routes autres que le thésaurus gardent leurs comportements.
- La découverte compacte ne répète pas les domaines dans chaque publication historique ; ses métadonnées n'affichent pas deux versions concurrentes du contrat HTTP.
- Si la liste compacte est livrée, les identités, filtres, états, dates, contextes, langues et relations indispensables restent interprétables sans ambiguïté.
- Les éditions officielles, snapshots de préparation, ETag, quotas, droits et données privées conservent leurs garanties.
- La réduction de taille est mesurée sur un corpus fixé ; aucun gain SQL n'est déduit du seul allègement JSON.
- Les tests de rendu, de scripts Postman, de contrat API et la CI applicable passent sur le candidat exact.
- Le site public ne sert pas les sources et documents internes ; la diffusion effective et le retour arrière sont vérifiés séparément du simple changement de fichiers.

## 8. Limites de ce chantier

Le plan ne comprend pas la suppression de données sémantiques stockées, le retrait d'une route publique existante, la réécriture des anciennes publications, un changement de licence, une nouvelle politique d'équivalence, ni une modification des droits. La recherche textuelle qui parcourt le document JSON entier est une anomalie fonctionnelle repérée pendant la revue ; sa correction doit être spécifiée et testée séparément, car elle changerait les résultats de recherche.

La disponibilité réelle des partenaires, l'état du gel de l'édition officielle et la correspondance avec les déploiements sont des informations à établir sur l'environnement choisi. Les références Git consultées ne les attestent pas.

## 9. Sources de référence pour la réalisation

- [Plan initial du thésaurus](2026-11-06-thesaurus-api-partenaires-plan.md).
- [Handler HTTP](../../../bertel-tourism-ui/src/lib/thesaurus-api.ts), [tests](../../../bertel-tourism-ui/src/lib/thesaurus-api.test.ts), [contrat HTTP partagé](../../../bertel-tourism-ui/src/lib/public-api.ts).
- [Guide partenaire](../../guide-partenaires.md), [OpenAPI](../../openapi.json), [guide Postman](../../README_Postman.md).
- [Index DB](../../../db-graph-out/DB_AGENT_INDEX.md) et [contrats du thésaurus](../../../db-graph-out/THESAURUS.md).
- Sur la référence d'intégration du 11 novembre : `docs/guide-metier-thesaurus.md`, `docs/thesaurus-render.js`, `docs/thesaurus-render.check.js`, `docs/postman.check.js`, `.github/workflows/documentation.yml` et `supabase/migrations/20261111022257_thesaurus_public_launch_editions.sql`. Ces fichiers doivent être lus dans la base de réalisation choisie ; plusieurs sont absents du checkout de ce chat.
