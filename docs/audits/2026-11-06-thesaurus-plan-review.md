# Revue croisée du plan de thésaurus Bertel

Date : 6 novembre 2026. Demande : faire critiquer le plan par Claude, évaluer ses remarques indépendamment, réviser et solliciter une nouvelle revue jusqu’à un accord argumenté.

Le plan courant se trouve dans [Thésaurus Bertel et API partenaires](../superpowers/plans/2026-11-06-thesaurus-api-partenaires-plan.md). Ce journal porte sur l’architecture proposée, pas sur une implémentation réalisée.

## Méthode

Le CLI Claude Code installé n’était pas authentifié. La revue a donc été menée dans l’application Claude connectée, dans une nouvelle conversation intitulée **Thésaurus Bertel : relecture de plan**, avec le modèle affiché **Opus 5.5 Moyen**. Le plan et les faits pertinents tirés du dépôt ont été transmis en texte collé. Claude a été informé qu’il ne disposait pas du dépôt dans cette conversation et invité à ne lancer aucun outil ni modifier aucun fichier.

Les réponses ont été lues dans l’interface. Les remarques ci-dessous en sont une synthèse ; les verdicts entre guillemets reprennent le texte visible. La validation du plan n’est pas une preuve d’exécution de tests SQL ou de conformité d’un futur déploiement.

## Tour 1

Verdict de Claude : **« RÉVISER »**.

| Objection | Évaluation Codex | Évolution retenue |
|---|---|---|
| Sources canoniques encore modifiables hors workflow | Bloquant confirmé | Domaines gouvernés, garde DB, chemins d’écriture inventoriés, administration générique en lecture seule |
| `is_active`/validité et cycle éditorial sans correspondance | Bloquant confirmé | Séparer état, assignabilité et dates ; figer les publications ; conserver le comportement temporel legacy de `/catalog` |
| Sort des affectations de fiches lors des fusions/scissions | Bloquant confirmé | Conservation des usages historiques, refus des nouvelles affectations, requalification explicite |
| Atomicité annoncée sans frontière pour les dérivés | Bloquant confirmé | Projections SQL requises dans la bascule ; caches hors base par génération ; outbox réservée aux opérations non critiques |

Autres améliorations retenues : termes de recherche hérités préservés pendant la revue, différentiel minimal dès V1, URI configurée par instance, politique publique unique, licence/attribution et phasage des adaptateurs autonomes.

## Désaccords argumentés de Codex

1. **Drapeau de session comme autorisation** : refusé. Une GUC positionnable par l’appelant n’est pas une capacité de publication ; utiliser des privilèges/rôles et fonctions de confiance, en reconnaissant le pouvoir du propriétaire réel de la base.
2. **Inclure tous les prédécesseurs dans les filtres d’un successeur** : formulation trop large. Seule une équivalence exacte validée autorise cette expansion ; une scission ou un remplacement de sens différent ne la déclenche pas.
3. **Convergence différée de tous les dérivés** : refusée pour les projections requises par les filtres hiérarchiques. La cohérence de l’arbre, de la closure et des caches SQL doit être conservée au moment de l’activation.

## Tour 2

Verdict visible de Claude : **« VALIDÉ au niveau de l’architecture »**.

Claude indique que les quatre défauts bloquants du premier tour sont traités et qu’il n’en identifie pas de nouveau à ce niveau. Il accepte les trois désaccords argumentés ci-dessus.

Ses points de cadrage restants sont examinés et intégrés :

- Les évolutions de contenu livrées par Bertel entrent comme propositions et n’écrasent pas les adaptations locales ; seul le fresh-install initialise directement son corpus.
- L’inventaire compte les consommateurs qui doivent vérifier la génération, afin d’affiner réellement le chiffrage.
- Le pilote mesure la contention d’un changement de racine ; un budget de verrouillage conditionne l’élargissement du périmètre.
- Le retrait crée une obligation de reprise visible, tandis que la dépréciation permet de conserver durablement l’usage historique.
- `/catalog` sert les choix actifs ; le thésaurus résout les codes historiques.
- L’expansion d’équivalence est une option explicite commune au back-office et à l’API, désactivée par défaut pour conserver les filtres actuels.
- Les URI V1 sont réservées aux partenaires authentifiés ; aucun accès anonyme implicite.
- La prévisualisation annonce le nombre de fiches dont le contenu partenaire changera et le guide explique les resynchronisations groupées.

## Tour 3

Verdict visible de Claude : **« VALIDÉ. La V3 est un plan d’architecture et de réalisation cohérent. »**

Claude confirme avoir vérifié les huit précisions par rapport à V2 et n’y trouve ni régression ni contradiction. Sa seule vigilance non bloquante porte sur l’option d’équivalence désactivée par défaut : les écrans doivent signaler l’existence de fiches attachées aux prédécesseurs et donner accès à la reprise. Ce comportement est ajouté au lot interface.

Il fixe cinq critères de passage du lot 1 : inventaire complet des chemins d’écriture/lecture ; politique publique reconstituée ; volume pilote et performances mesurés ; rapport de reprise à blanc ; réestimation technique et éditoriale présentée au PO. Ils sont intégrés au plan. La comparaison `/catalog` possède une référence dès l’inventaire, puis un test réel avant/après lors de la modification, avant activation.

## Conclusion de Codex

Codex partage la validation du plan V3 : les quatre défauts initiaux ont une règle de traitement et des critères de recette ; les trois désaccords ont été résolus de façon argumentée ; les points d’inventaire restants ont un livrable et une condition de passage explicites.

Une dernière lecture indépendante ne relève aucun blocage supplémentaire. Elle précise seulement que la non-assignabilité concerne les valeurs dépréciées/retirées, pas un concept actif simplement renommé ; le critère de recette est corrigé en ce sens.

Le résultat produit comprend deux documents préparatoires. Aucune modification de l’application, de la base de données, des clés partenaires ou de la production n’a été réalisée pendant cette revue. Aucun test d’implémentation n’est revendiqué.
