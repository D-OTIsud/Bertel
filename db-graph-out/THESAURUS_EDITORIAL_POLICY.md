# Thésaurus — exigences éditoriales et recherches héritées

## État final vérifié — publication 25

Le relevé de production du **10 novembre 2026 à 10:11:17 UTC** observe la
publication **25**, les sept migrations de cette livraison et 27 signatures de
fonctions sans leurs corps. Les preuves sont séparées :

- [Catalogue final de métadonnées](THESAURUS_EDITORIAL_POLICY_FINAL_CATALOG.json).
- [Comparaison avec le premier relevé](THESAURUS_EDITORIAL_POLICY_COMPARISON.json).
- [Postflight éditorial complet](THESAURUS_EDITORIAL_CONTENT_POSTFLIGHT.json).

Les **152 SELECT** privés, tous rattachés à la publication 25, ont comparé les
**1 477 concepts** aux décisions éditoriales finales, avec **zéro divergence**.
Les quatre noms et définitions FR/EN/ES/DE, leurs alias de rendu, les synonymes,
notes, correspondances, états, identités et liens sont couverts. Les listes
sémantiques sont comparées sans tenir compte de l'ordre, sans supprimer leurs
doublons. Seules les sources de notes ou de correspondances absentes, nulles ou
exactement vides sont normalisées. Les **39 tableaux legacy non vides**, ainsi
que les tableaux vides des autres concepts, sont inchangés. L'empreinte
`source_fingerprint` et le conteneur natif `source_fields`, qui comprend notamment
des alias reconstruits, ne sont pas comparés comme des champs éditoriaux ;
ce périmètre est explicite dans la preuve JSON.

Les 78 domaines existants sont maintenant gouvernés, avec définition obligatoire
et FR/EN/ES/DE requis. Les deux contraintes éditoriales sont validées ; les défauts
de colonnes sont `require_definition = true` et les quatre langues. La gouvernance
a été étendue aux 12 domaines internes. **L'exposition publique reste inchangée :
66 domaines publics et 12 internes.** Le défaut `is_governed` reste distinct de
cette observation des domaines existants.

Les ACL, propriétaires et droits d'exécution des fonctions communes au premier
relevé sont inchangés. Les 17 tables privées gardent leurs 18 politiques RLS et
aucun accès SQL direct n'est accordé aux rôles applicatifs relevés. Les quatre
helpers de texte/définition, dont `normalize_editorial_text`, restent privés.
Les 16 triggers de garde et de verrouillage sont activés sur les huit sources
natives observées. Les **13 contrats de fonctions de préparation correspondent
à leurs empreintes réelles**.

L'index `thesaurus_public_target_lookup_idx` est présent, valide, prêt et vivant.
Il couvre la recherche existante par `(release_id, (concept_id::text))`, avec
`concept_id` inclus et le prédicat `is_public`, sans changement du noyau de
publication. Pour `activate`, `definition_md5` reste
`8ef02b665b4af4e45eb3f3d45bb2f75e` et `body_md5` reste
`985839358c6e0d68eb7db280f42bb6ed`. Les projections publiques conservent également
leurs empreintes de définition.

Le réglage `statement_timeout=30s` change le DDL de la façade administrative,
mais son corps reste strictement identique : `body_md5` et `prosrc_md5` de
`api.thesaurus_admin(text,jsonb)` valent tous deux
`74693eebd27b41db9afc57237c95ff28`. Ses ACL et son propriétaire sont conservés.
Les autres changements de corps relevés concernent uniquement le roundtrip
privé des termes hérités, son registre et les validateurs éditoriaux attendus.

La concordance mécanique ne constitue ni une certification des prestataires ni
une relecture humaine ou native des traductions. Ce complément ne régénère pas
le catalogue complet ni le graphe général.

## Premier relevé — 07:59 UTC, avant les dernières migrations

Capture de production par le connecteur Supabase Bertel, projet
`ryycrdhlkmzpxwwwwupy`, le **10 novembre 2026 à 07:59:30 UTC**.
Le [relevé de métadonnées](THESAURUS_EDITORIAL_POLICY_PHASE1_CATALOG.json)
contient 19 signatures de fonctions, les ACL/RLS de 17 tables privées et leurs
18 politiques. Aucun corps de fonction ni contenu de concept n'est exporté.

Il observe ces migrations :

| Migration | Contrat concerné |
|---|---|
| `20261110075054` — `thesaurus_required_definitions` | Définition obligatoire dans tous les vocabulaires et vérification avant finalisation d'une publication. |
| `20261110075103` — `thesaurus_complete_admin_batches` | Espace privé complet du superuser et lots éditoriaux bornés, utilisant les validations et conflits existants. |
| `20261110075111` — `thesaurus_simple_business_names` | Intitulés métier français des domaines. |

Au moment de ce relevé, les migrations `thesaurus_legacy_search_term_roundtrip`
et `thesaurus_complete_editorial_definitions` ne figurent pas encore au registre.
Cette observation ne les déclare donc pas installées.

## Exigences observées au premier relevé

Les **78 vocabulaires** ont `require_definition = true`. La colonne a désormais
la valeur par défaut `true` et la contrainte validée
`thesaurus_vocabulary_definition_required` impose `require_definition IS TRUE`.
Les domaines privés font partie de cette obligation.

Les langues obligatoires observées restent `['fr']` à cette étape, avec ce même
défaut. Le passage aux quatre langues ne doit être annoncé qu'après installation
et vérification de la seconde phase. Une exigence de définition non vide ne
constitue pas une validation du sens métier ou de la qualité d'une traduction.

L'exposition publique reste pilotée par les flags distincts `is_public` et
`is_governed` : 66 vocabulaires sont publics et gouvernés, 12 sont internes.
La lecture optionnelle des catalogues internes dans l'administration ne leur
attribue pas une exposition publique.

## Fonctions et droits au premier relevé

| Surface | Propriété observée |
|---|---|
| `api.thesaurus_admin(text,jsonb)` | Wrapper `SECURITY INVOKER`, exécutable par `authenticated` ; l'autorisation métier reste dans le dispatch privé existant. |
| `thesaurus.admin_dispatch(text,jsonb)` | Dispatch `SECURITY DEFINER`, avec contrôle du compte superuser existant ; les nouveaux lots ne publient pas. |
| `api.thesaurus_public(text,bigint,jsonb)` | Wrapper `SECURITY INVOKER`, réservé à `service_role` parmi les rôles applicatifs relevés. |
| `thesaurus.public_dispatch(text,bigint,jsonb)` | Dispatch de lecture publique géré, distinct de la lecture privée des brouillons. |
| `thesaurus.has_editorial_text(jsonb)` | Helper privé `IMMUTABLE SECURITY INVOKER` contrôlant le type texte et les valeurs vides ou invisibles. |
| `thesaurus.definition_errors(jsonb,jsonb,text[])` | Helper privé `IMMUTABLE SECURITY INVOKER` évaluant noms et définitions des langues requises. |
| `thesaurus.assert_release_definitions(bigint)` | Garde privé `STABLE SECURITY INVOKER` pour les définitions de l'instantané de publication. |
| `thesaurus.activate(uuid[],text[],text,bigint,jsonb)` | Noyau `SECURITY DEFINER` appartenant à `bertel_thesaurus_publisher`. Son empreinte est relevée pour la comparaison finale. |

Les trois helpers de définition ne sont exécutables directement par aucun des
rôles `anon`, `authenticated` et `service_role`. Le rôle de publication et le
propriétaire d'installation gardent leur accès. Les 17 tables privées ont RLS
activée ; aucun de ces trois rôles applicatifs ne dispose d'un accès SQL direct
de lecture ou d'écriture sur ces tables dans le relevé.

Le rôle `bertel_thesaurus_publisher` est observé `NOLOGIN`, `NOINHERIT`, sans
superuser ni contournement RLS. Les appartenances relevées ne comprennent aucun
rôle applicatif. Les droits, propriétaires, réglages et empreintes exacts figurent
dans le JSON ; aucune nouvelle capacité n'est déduite d'un nom de fonction.

## Portée de fraîcheur

Ce supplément ne régénère pas le catalogue complet, les nœuds et arêtes du graphe,
les pages `dbdoc/`, ni la référence API/DB HTML. Leur provenance complète du
8 novembre et leurs compléments du 9 novembre restent valables dans leur périmètre.
L'installation des migrations, la revue éditoriale des concepts, la publication
du contenu et la recette HTTP sont des preuves distinctes.

La [requête et la procédure de capture](../tools/db-graph/THESAURUS_EDITORIAL_POLICY.md)
ont permis de compléter ce premier relevé par les preuves finales ci-dessus,
en distinguant l'extension de gouvernance privée de l'exposition publique,
et en vérifiant les projections publiques et le noyau de publication.
