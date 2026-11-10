# Thésaurus — exigences éditoriales et recherches héritées

## Observation ciblée du 10 novembre 2026

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

## Exigences observées

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

## Fonctions et droits

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
permettent de compléter cette observation après les deux dernières migrations,
en vérifiant notamment que les projections publiques, le noyau de publication
et les flags d'exposition n'ont pas changé.
