# Thésaurus Bertel et API partenaires

Date : 6 novembre 2026. Version : V3. Statut : plan d’architecture et de réalisation validé par Claude et Codex après trois tours de revue. Cette validation porte sur le plan ; sa mise en œuvre constitue un travail distinct.

Suivi de réalisation au 6 novembre : les neuf lots techniques sont implémentés et les 66 domaines publics sont activés en production (publication R3, 1 319 concepts). Les migrations, tests, performances mesurées, recettes HTTP et limites sont consignés dans [l'audit d'implémentation](../../audits/2026-11-06-thesaurus-implementation.md) et le [runbook](../../SQL_ROLLOUT_RUNBOOK.md). La complétude éditoriale des définitions, traductions et correspondances externes reste un travail métier ; le bootstrap ne certifie pas ces contenus. Les retours ultérieurs de Claude Code ont conduit à des corrections de concurrence ; sa dernière relecture du code reste indisponible à cause du plafond du compte et n'est pas assimilée à la validation du plan ci-dessus.

Construire un thésaurus touristique sur les référentiels existants, avec des concepts identifiables durablement, des libellés et relations explicites, une administration éditoriale et des publications reproductibles accessibles aux partenaires. Le stockage reste PostgreSQL ; le modèle s’aligne sur SKOS et propose des représentations JSON et JSON-LD/SKOS.

## 1. Périmètre et jalons

La cible complète comprend les taxonomies touristiques et les catalogues publics descriptifs des fiches : équipements, classifications, durabilité et autres vocabulaires retenus. Les référentiels techniques, permissions et vocabulaires internes/CRM ne deviennent pas publics par découverte automatique.

- **V1 pilote** : domaines `ref_code` de l’hébergement, puis autres domaines `ref_code` explicitement approuvés ; workflow complet, publication, recherche, administration et API.
- **V2 couverture** : adaptateurs typés pour les catalogues autonomes, notamment équipements, classifications et durabilité, puis généralisation.
- **Évolutions ultérieures** : polyhiérarchie, comparaison arbitraire de publications éloignées et préparation asynchrone par génération si les mesures la justifient.

Français obligatoire ; autres langues exposées lorsqu’elles sont validées. Une publication techniquement fidèle aux données importées ne vaut pas déclaration de complétude éditoriale. Les critères de complétude sont déclarés par domaine : définition, provenance, traductions requises et correspondances validées.

Le premier lot inventorie la base réelle, les catalogues, leurs clés complètes, leurs consommateurs et leurs responsables. Les comptes de catalogues des anciennes documentations ne constituent pas un inventaire actuel.

## 2. Existant à réutiliser

- `ref_code` : clé primaire `(id, domain)`, code unique dans son domaine, noms/descriptions multilingues, parent unique, dates et activation.
- Hiérarchie `parent_id` intra-domaine, table de closure et contrôles existants.
- Tables métier autonomes et clés propres : ne pas présumer une identité UUID simple ou un code globalement unique.
- Alias actuellement employés dans les filtres et les documents de recherche des fiches.
- Administration générique des référentiels et restrictions des taxonomies structurelles.
- Route partenaires `/api/public/catalog`, ses cinq champs, son authentification, son quota et sa journalisation.
- Crosswalks d’export existants et audit SQL des changements ; ils ne remplacent ni les correspondances sémantiques ni les publications durables.

Points d’entrée : `Base de donnée DLL et API/schema_unified.sql`, `migration_reference_catalog_rpc.sql`, `migration_ref_catalog_admin.sql`, `migration_ref_code_admin_rpcs.sql`, `bertel-tourism-ui/src/views/RefCatalogAdmin.tsx`, `src/services/explorer-reference.ts`, `src/lib/public-api.ts`, `src/lib/partner-auth.ts` et `src/app/api/public/catalog/route.ts`.

## 3. Identité et autorité des données

Chaque concept reçoit un `concept_id` public immuable, attribué une seule fois, et une URI pérenne. Les liaisons aux entrées existantes sont typées et protégées par de vraies clés étrangères, notamment composites pour `ref_code`. Initialement une entrée source correspond à un concept ; tout rapprochement ultérieur exige une décision explicite.

Les codes sont qualifiés par leur domaine/schéma/catégorie. Un code publié n’est jamais réattribué à un autre sens. Un changement de libellé conserve le concept ; un changement de code publié crée une nouvelle entrée et déprécie l’ancienne.

La base des URI est configurée par instance et indépendante de l’en-tête HTTP `Host`. Les identités sont propres à l’instance ; une égalité entre installations ne se déduit ni du code ni du libellé. Les rapprochements entre instances utilisent des correspondances explicites.

| Information | Autorité proposée |
|---|---|
| Libellé préféré, traductions et description existants | Source canonique actuelle, modifiée exclusivement par le workflow pour les domaines gouvernés |
| Synonymes et termes complémentaires localisés | Couche sémantique structurée |
| Ancêtres et descendants V1 | `parent_id` et closure actuels, projetés en relations SKOS |
| Termes associés, notes et provenance | Couche sémantique |
| Correspondances techniques d’export | Crosswalks existants, avec qualification sémantique complémentaire lorsque justifiée |
| Brouillons, validations et historique publié | Espace privé de révisions et de publications |

Les tables de travail et de publication résident dans un schéma privé, hors `public.ref_*`, afin d’éviter leur découverte comme catalogues éditables par l’administration générique.

Les anciens champs d’alias deviennent une projection gérée de compatibilité. Ils ne conservent pas un deuxième chemin d’édition indépendant.

## 4. Modèle sémantique et contrôles éditoriaux

Prévoir un registre des vocabulaires, une identité de concept, des liaisons typées aux sources, des libellés complémentaires par langue, des notes/provenances, des relations, des correspondances externes, des révisions et des instantanés de publication.

Règles de qualité :

- Au maximum un libellé préféré par langue et concept ; pas de libellé alternatif identique au préféré pour cette langue.
- Langues valides et règles Unicode/normalisation explicites ; la normalisation de recherche ne remplace pas le texte éditorial.
- Homonymes admis entre concepts : ne pas fusionner sur un texte identique.
- `related` symétrique ; `broader`/`narrower` fidèles à la hiérarchie publiée ; contrôle des cycles selon la règle Bertel.
- V1 conserve un parent dans le même domaine. Une relation supplémentaire ne crée pas une deuxième hiérarchie ignorée par les filtres.
- Remplacements résolvables, sans cycles ; aucun successeur imposé lorsqu’il n’existe pas de remplacement pertinent.
- Notes d’usage, définitions et sources obligatoires selon la politique du domaine.

Les alias importés non revus restent des termes de recherche hérités privés, avec leur provenance. Leur langue et leur nature sémantique ne sont pas inventées ; ils ne deviennent pas automatiquement `altLabel` ou `hiddenLabel` publiés. Leur retrait de la recherche nécessite un changement éditorial explicite.

Une correspondance externe précise la ressource cible, son vocabulaire/version, le type exact/proche/plus large/plus précis, la provenance et la validation. Une classe OWL DATAtourisme ou une règle d’export Tourinsoft n’est pas automatiquement un concept équivalent SKOS.

Le manifeste indique la licence effective, l’attribution et la provenance. Aucun droit de redistribution d’un vocabulaire externe n’est présumé.

## 5. Écriture et autorisations

Le registre marque explicitement les domaines gouvernés. Pour chacun, inventorier les anciennes RPC, l’administration générique, les imports, les migrations et les écritures applicatives.

Les champs publiables et les suppressions des sources gouvernées sont protégés côté base. L’administration générique les présente en lecture seule ; les modifications passent par les révisions et la publication.

La publication utilise une capacité portée par des privilèges et un propriétaire/rôle dédié, avec `GRANT`/`REVOKE` vérifiés. Un drapeau de session ou une GUC fournie par l’appelant ne constitue pas une autorisation. Les fonctions de confiance ont un `search_path` fixe, des entrées validées et des droits `EXECUTE` révoqués par défaut.

La frontière couvre les rôles applicatifs, y compris les super-administrateurs de l’application. Un propriétaire réel de la base peut modifier son schéma : les interventions de maintenance et migrations suivent donc une procédure gouvernée et auditée, avec publication correspondante et vérification de la remise en place des gardes.

Une évolution de contenu livrée par une nouvelle version de Bertel entre comme révision proposée sur une installation existante, avec le même contrôle de base/empreinte. Elle n’écrase pas automatiquement une adaptation éditoriale locale. Seule une installation vierge peut publier directement son corpus initial ; les migrations purement structurelles restent distinctes de ces propositions de contenu.

Publication réservée au superuser plateforme au démarrage. Contribution et validation peuvent être déléguées par capacités explicites ; la possession d’un rôle d’administration d’une ORG ne donne pas un droit implicite sur le vocabulaire global.

## 6. Révisions, concurrence et cycles de vie

Révision : `brouillon → validée → publiée`. Modifier une révision validée annule sa validation. Une sauvegarde transmet une version attendue ; une publication contrôle la version de base et l’empreinte des sources. Un état périmé produit un conflit explicite.

Les publications sont sérialisées par verrou de base, numérotées de manière monotone et protégées par une clé d’idempotence. Les affectations de fiches et la publication suivent un ordre de verrous compatible, défini et testé dans le lot technique.

Trois dimensions restent distinctes :

| Dimension | Règle |
|---|---|
| Cycle de vie | Actif, déprécié ou retiré ; changement par publication |
| Assignabilité | Une nouvelle affectation est autorisée seulement si l’état, les dates et les règles métier le permettent |
| Validité | `valid_from`/`valid_to` restent des propriétés explicites |

La dépréciation autorise la conservation durable d’un usage historique, avec recommandation de remplacement. Le retrait marque un usage à requalifier : les fiches concernées apparaissent obligatoirement dans la liste de reprise avec motif/priorité. Il conserve néanmoins leur lecture, leur résolution et la sauvegarde de champs sans rapport avec cette affectation. Aucun des deux états ne permet une nouvelle affectation.

Pour les sources qui possèdent `is_active`, l’adaptateur documente sa projection ; un concept déprécié/retiré n’est plus proposé comme nouveau choix. Une fiche conservant une ancienne affectation peut être lue et sauvegardée sans la perdre ; le serveur refuse en revanche une nouvelle affectation de cette valeur.

Les fonctions de sauvegarde distinguent réellement conservation et nouvelle affectation, y compris lorsqu’un ancien formulaire réconcilie une liste complète. Une stratégie de suppression/réinsertion technique ne doit pas transformer artificiellement une valeur conservée en nouvel usage interdit.

Tout concept déjà publié subsiste dans les publications suivantes, avec son état, son motif et ses éventuels successeurs. Son détail retourne `200`, même retiré. Un identifiant jamais publié/inconnu retourne `404`. La suppression physique d’un concept publié est interdite.

Les instantanés figent les dates et un `as_of` de publication ; ils ne réévaluent pas `current_date` pendant leur consultation. Les clients peuvent déterminer une validité courante à partir des dates exposées. La route historique `/catalog` conserve son filtrage dynamique à la date du jour : elle ne prétend pas être un instantané immuable.

## 7. Fiches existantes, fusions et scissions

V1 ne réaffecte automatiquement aucune fiche lors d’une fusion ou d’une scission. L’éditeur montre l’ancienne valeur et son état, permet de la conserver et propose une requalification explicite. Les fiches à reprendre forment une liste de travail.

Une fusion reconnue comme équivalence exacte peut déclarer un lien autorisant la recherche/le filtre du successeur à inclure les anciens codes. Ce lien est distinct de `replaced_by` et ne modifie pas fictivement l’arbre parent/enfant.

Une scission ou un remplacement de sens plus large/proche ne déclenche ni cette expansion ni une réaffectation arbitraire. Les anciennes valeurs restent filtrables pour permettre leur traitement.

L’inclusion des prédécesseurs exactement équivalents est une option explicite, commune au back-office et aux filtres partenaires, utilisant le même résolveur serveur. Par défaut, les filtres existants gardent leur comportement actuel ; la nouvelle option `include_equivalent_predecessors` est désactivée. Les tests vérifient l’identité des ensembles à droits/périmètre équivalents, avec et sans cette option. Une équivalence ne contourne jamais la visibilité des fiches.

Lorsque cette option est désactivée, l’écran signale les fiches encore attachées à des prédécesseurs exactement équivalents et donne accès à la liste de reprise. L’absence de ces fiches dans un filtre sur le successeur reste ainsi compréhensible.

Toute requalification ultérieure est une action autorisée et tracée qui actualise les caches nécessaires et les marqueurs de synchronisation des fiches. Un chantier de réaffectation en masse possède sa propre validation et son propre suivi.

## 8. Publication et données dérivées

L’inventaire classe chaque projection SQL, vue matérialisée, index de recherche et cache selon son rôle dans les filtres et les réponses. La liste des projections requises constitue un livrable bloquant avant l’activation.

Cet inventaire compte aussi chaque page Next.js mise en cache, export, widget, RPC et cache client qui doit reconnaître la génération. Le chiffrage est révisé à partir de ces chemins réels.

Protocole V1, mesuré sur le pilote :

1. Prendre le verrou de publication et contrôler droits, base et empreintes.
2. Appliquer les révisions aux sources canoniques et aux enrichissements.
3. Recalculer la closure et les projections SQL requises de filtrage et de recherche.
4. Actualiser les représentations dépendantes des fiches ; faire évoluer `object.updated_at` lorsque les libellés ou chemins publics sérialisés changent.
5. Construire un instantané complet des concepts, libellés, relations, sources, correspondances et états ; il contient les valeurs, pas seulement des liens vers du travail modifiable.
6. Vérifier qualité et intégrité, enregistrer les changements et l’événement outbox.
7. Basculer le pointeur de publication et valider la transaction.

Si une projection requise échoue ou reste obsolète, l’activation échoue intégralement. Un nouvel arbre ne devient pas visible avec des filtres correspondant à l’ancien.

Le pilote mesure une modification proche de la racine et des sauvegardes de fiches simultanées. Budget initial proposé : attente de verrou imputable à une publication au plus deux secondes sur le scénario pilote, sans perte de saisie et avec échec récupérable en cas de contention. Le lot 1 fixe aussi le volume témoin et la cible de durée de publication. Le dépassement bloque l’élargissement : réduire le lot ou concevoir la préparation générationnelle avant d’activer un périmètre plus grand, sans relâcher la cohérence.

Les caches hors base sont indexés par génération/publication. Une entrée d’une ancienne génération ne sert pas de représentation sous la nouvelle. Les données et leur génération sont obtenues dans une même lecture SQL/RPC cohérente, sans requête distincte susceptible de lire un autre pointeur.

L’éviction physique et les opérations non critiques passent par une outbox durable, rejouable et idempotente, avec état visible et alerte sur échec. L’éviction différée ne justifie pas de servir un ancien contenu sous une nouvelle génération. Tout consommateur incapable de vérifier la génération doit être corrigé avant l’activation du domaine concerné.

Si le volume exige ultérieurement une préparation asynchrone, les lecteurs continueront de servir une génération complète jusqu’à la préparation `READY` de la suivante et sa bascule atomique ; cette évolution nécessite une conception et des mesures propres.

Un nouveau concept gouverné devient publiquement assignable après son inclusion dans une publication activée. Le bootstrap couvre aussi les codes historiques inactifs déjà présents dans les fiches publiques.

## 9. Administration proposée

Étendre `Paramètres → Listes & référentiels` par une vue Thésaurus, en conservant les composants, couleurs et typographies de Bertel. Préparer une maquette isolée et la faire valider avant de modifier l’application.

```text
Thésaurus
[Domaine] [Rechercher un terme…]             [Préparer une publication]

Concepts et arborescence | Concept sélectionné et état publié
                        | Modification en brouillon éventuelle
                        | Libellés et langues
                        | Définition, notes et sources
                        | Relations et correspondances
                        | Historique et usages dans les fiches
                        | [Enregistrer le brouillon] [Soumettre]
```

Prévoir une comparaison simple avant/après, un rapport séparant erreurs et avertissements, le périmètre des changements et leur impact sur les fiches. L’action de publication appartient à la préparation de publication, avec vérification finale du contenu.

La prévisualisation compte les fiches dont les représentations partenaires changeront, en particulier lors d’un renommage d’ancêtre. Elle annonce le volume de resynchronisation attendu ; le guide partenaires explique ces mises à jour groupées.

Sur petit écran, consulter la liste puis le détail. Traiter navigation clavier, libellés longs, chargement, erreurs conservant la saisie, conflits d’édition et anciennes valeurs. Aucune garde d’interface ne remplace les contrôles serveur.

## 10. Recherche et caches des consommateurs

Harmoniser les recherches existantes autour des libellés préférés, synonymes et abréviations validés. Privilégier le libellé préféré ; présenter le domaine et le contexte pour les homonymes.

Préserver les termes hérités pendant leur revue. `related` sert à la navigation et n’élargit pas automatiquement la recherche. Maintenir les filtres hiérarchiques et tester sur de vraies fiches témoins.

Une publication identifie les porteurs et descendants affectés, actualise les documents de recherche et leurs projections nécessaires, puis rend les caches clients sensibles à la génération du vocabulaire. Comparer des requêtes représentatives avant/après.

## 11. API partenaires

Conserver les cinq clés et la sémantique de `/api/public/catalog`. Reprendre explicitement sa liste blanche initiale dans la politique publiée commune ; l’ancienne route et la nouvelle surface la consultent. Aucune découverte de table ou entrée de brouillon n’accorde une exposition publique.

Le guide distingue les usages : `/catalog` fournit les choix actifs au jour de l’appel ; le thésaurus résout aussi les codes historiques. Une fiche peut légitimement porter un code absent du catalogue courant mais présent dans le thésaurus publié.

La nouvelle API expose l’intersection de cette politique et du périmètre gouverné effectivement livré.

| Route proposée | Usage |
|---|---|
| `GET /api/public/thesaurus` | Vocabulaires disponibles et publication courante |
| `GET /api/public/thesaurus/releases/{releaseId}` | Manifeste d’une publication |
| `GET /api/public/thesaurus/releases/{releaseId}/concepts` | Liste paginée |
| `GET /api/public/thesaurus/releases/{releaseId}/concepts/{conceptId}` | Détail figé d’un concept |
| `GET /api/public/thesaurus/releases/{releaseId}/export` | JSON ou JSON-LD/SKOS |
| `GET /api/public/thesaurus/releases/{releaseId}/changes` | Changements depuis la publication précédente |

Le manifeste porte `contract_version`, `release_id`, `previous_release_id`, `as_of`, couverture, compteurs, empreinte, liens d’export/changements, licence et attribution. Les versions du contrat et des données sont distinctes.

Le détail expose identité/URI, codes qualifiés, langues et libellés, définition, notes, sources, relations qualifiées, correspondances validées, état, dates, assignabilité déclarée et remplacements.

Pagination : maximum 200 concepts, ordre déterministe et curseur attaché à la publication, aux filtres et à la représentation. Une nouvelle publication pendant un parcours ne change pas la version parcourue. Les publications sont conservées sans purge automatique en V1.

Le différentiel minimal est calculé sur les représentations complètes figées, relations inverses comprises. Il distingue ajout, modification, dépréciation et retrait ; un concept retiré conservé n’est pas annoncé comme supprimé physiquement. V1 permet d’enchaîner les publications successives plutôt que de comparer arbitrairement deux versions éloignées.

Erreurs documentées : paramètres/curseur incompatibles `400`, authentification `401`, concept/publication inconnus `404`, quota `429`. Les erreurs de domaine ne divulguent pas l’existence de vocabulaires internes. Les langues de repli sont explicites ; une traduction absente n’est jamais exportée avec une fausse étiquette de langue.

Réutiliser l’admission partenaires, les quotas et la journalisation existants. Ne pas imposer `thesaurus:read` aux clés existantes sans migration explicite. Contrôler authentification et quota avant tout `304`. L’ETag est déterministe pour la représentation exacte ; cache privé avec revalidation et en-têtes de variation appropriés.

L’URI pérenne résout vers le détail courant avec accès à la version figée. V1 réserve explicitement cette résolution aux partenaires authentifiés : sans clé, la réponse est `401`. Le caractère pérenne de l’identifiant ne signifie pas un accès anonyme ; aucune page publique de résolution n’est ajoutée implicitement.

Pour les domaines gouvernés, les réponses objets annoncent la publication/génération lue dans le même état SQL que le contenu. Cela ne promet pas un instantané global de toutes les fiches entre plusieurs requêtes. La conservation monotone des concepts garantit qu’une publication plus récente peut toujours résoudre un ancien code.

## 12. Migration, recette et déploiement

Migration additive, backfill réexécutable, identités conservées et rapport de dry-run. Comparer la lecture existante et la nouvelle sur un corpus témoin avant activation. Ne pas renommer/déplacer les clés actuelles pour réaliser le bootstrap.

Critères de recette obligatoires :

1. Les anciennes écritures de sources gouvernées échouent hors workflow ; les brouillons ne modifient aucun consommateur public.
2. Une validation périmée ou une édition concurrente produit un conflit explicite ; deux publications ne perdent aucun changement.
3. Un échec de closure/réindexation requise empêche toute bascule ; une répétition idempotente ne double pas l’application.
4. Un instantané reste identique malgré une nouvelle publication ou le passage d’une date de validité.
5. Renommage, fusion et scission conservent les identités historiques ; les anciennes valeurs dépréciées ou retirées restent lisibles et conservables mais non nouvellement assignables. Un simple renommage d’un concept actif ne retire pas son assignabilité.
6. Une scission n’élargit pas arbitrairement les filtres des successeurs ; les expansions d’équivalence sont explicitement validées.
7. Les clés composites et les hiérarchies inter-catalogues sont correctement qualifiées ; aucun code seul n’est présumé unique.
8. Aucun vocabulaire interne n’est exposé ; `/catalog` conserve son contrat et son périmètre initial.
9. Publication concurrente à une pagination : aucun mélange de versions, doublon ou omission.
10. Clé révoquée avec ETag valide : refus ; quota dépassé : `429`, jamais `304`.
11. JSON et JSON-LD représentent les mêmes données ; replis linguistiques et traductions absentes sont fidèles.
12. Une entrée de cache d’une ancienne génération n’est pas servie sous la nouvelle ; l’outbox peut être rejouée sans double effet.
13. Les objets dont une représentation publique change sont repris par la synchronisation partenaires.
14. Le fresh-install et les migrations sur données existantes réussissent ; la restauration est répétée en environnement d’essai.
15. Une mise à jour de contenu Bertel n’écrase pas une révision locale ; elle déclenche une proposition et, si nécessaire, un conflit explicite.
16. Les filtres back-office et partenaires partagent la même option d’équivalence ; les codes retirés figurent dans la liste de reprise.
17. Le budget de contention est vérifié sur un changement de racine ; le volume de fiches à resynchroniser est annoncé avant publication.

Exécuter les tests SQL, les tests significatifs de routes et parcours, le typecheck/build adapté et une recette pilote partenaire. Mettre à jour OpenAPI, guide, runbook, manifeste fresh-install et graphes de connaissance après les changements de code/schéma.

Ordre de déploiement : migration additive → bootstrap et contrôle → lecture comparative → pilote hébergement → ouverture des nouvelles routes → autres domaines `ref_code` → adaptateurs autonomes.

Un incident peut désactiver les nouvelles routes et passer l’interface en lecture seule. Une correction du contenu publié crée une nouvelle publication ; les anciennes ne sont pas réécrites. Les procédures de sauvegarde, restauration et reprise d’outbox sont documentées et répétées avant ouverture.

## 13. Lots et estimation

| Lot | Livrable | Dépendances |
|---|---|---|
| 1 | Inventaire live, responsables, couverture, politiques et projections requises | Aucune |
| 2 | Identité, modèle privé, autorisations, gardes et concurrence | 1 |
| 3 | Reprise, qualité et corpus pilote | 1–2 |
| 4 | Publication atomique, projections, outbox et générations de cache | 2–3 |
| 5 | Maquette validée puis administration | 1–2 ; publication avant mise en service |
| 6 | Recherche, filtres et conservation des valeurs dans l’éditeur | 3–4 |
| 7 | API, exports JSON/JSON-LD et changements | 3–4 |
| 8 | Recette, documentation et ouverture pilote | 4–7 |
| 9 | Adaptateurs autonomes et généralisation | Pilote accepté |

Ordre de grandeur à confirmer après inventaire : 30–45 jours de réalisation technique pour le pilote `ref_code` et ses mécanismes complets ; 8–15 jours supplémentaires pour les adaptateurs autonomes et la généralisation. Total indicatif : 38–60 jours techniques. L’éditorial est estimé séparément et conditionne la couverture déclarée complète. Ces fourchettes ne valent pas engagement de délai.

### Critères de passage du lot 1

Avant le lot 2, réunir :

1. **Inventaire vérifié des écritures et lectures du pilote**, avec un responsable et une décision garder/adapter/bloquer pour chaque chemin, y compris imports, migrations et réconciliations de listes.
2. **Politique publique reconstituée et référence de contrat `/catalog`**, avec simulation en lecture seule de la reprise de la liste blanche et données de comparaison. Le test réel avant/après est exécuté dès la modification et bloque l’activation en cas d’écart ; les domaines techniques/CRM sont explicitement non exposables.
3. **Corpus et performances de référence mesurés** : concepts, affectations, fiches publiques, profondeur, coût d’un changement proche de la racine et projections nécessaires. Si le budget de contention est manifestement hors de portée, revoir le périmètre ou la préparation générationnelle avant de démarrer le lot 2.
4. **Rapport de reprise à blanc** : alias hérités, doublons, cycles, valeurs inactives encore utilisées et correspondances classées export seulement/candidat sémantique. Aucune nouvelle identité publique persistée à ce stade.
5. **Réestimation technique et éditoriale présentée au PO**, avec les décisions métier restant à rendre sur les langues, définitions obligatoires et licence effective.

## 14. Références

- [SKOS Reference](https://www.w3.org/TR/skos-reference/).
- [SKOS Primer](https://www.w3.org/TR/skos-primer/).
- [Guide partenaires existant](../../guide-partenaires.md).
- [Administration des catalogues](../specs/2026-08-07-admin-catalogues-reference-design.md), à confronter au code actuel plutôt que reprendre son ancien statut d’implémentation.
- [Journal de revue croisée](../../audits/2026-11-06-thesaurus-plan-review.md).
