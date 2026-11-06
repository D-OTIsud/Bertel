# Thésaurus — complément du catalogue de schéma

**État local validé le 6 novembre 2026 à 13:14 UTC ; pas encore appliqué en production.**
Ce document complète le graphe historique ; il ne constitue ni une nouvelle extraction
du catalogue de production, ni une régénération de `graph.json`/`dbdoc` à partir des anciens
entrants. Les constats ci-dessous proviennent d'une introspection en lecture seule de
`bertel_thesaurus_test`, PostgreSQL **17.10**, après application locale des deux migrations.
Les scénarios de test utilisent des transactions annulées ; ils ne constituent pas un
corpus éditorial publié en production.

Sources canoniques :

- [Modèle éditorial et publication](../supabase/migrations/20261106112948_thesaurus_publication.sql).
- [Consommateurs et compatibilité des catalogues](../supabase/migrations/20261106113509_thesaurus_consumers.sql).
- [Manifeste fresh-install et tests](<../Base de donnée DLL et API/ci_fresh_apply.sql>).
- [Audit de réalisation et limites de recette](../docs/audits/2026-11-06-thesaurus-implementation.md).

## Tables privées et clés

L'introspection trouve **16 tables** dans `thesaurus`, toutes avec RLS activée.
Les références à `concept` et `release` dans ce tableau désignent ce même schéma.

| Table | Clé primaire | Relations et contraintes utiles |
|---|---|---|
| `instance` | `singleton` | Une ligne `CHECK(singleton)` ; préfixe URI, licence, attribution, génération courante. |
| `vocabulary` | `domain` | Politique publique/historique, gouvernance, exigences éditoriales et langues. |
| `concept` | `concept_id` UUID | FK `domain → vocabulary` ; uniques `(domain,code,context_key)` et `(source_kind,source_id,domain)` ; cycle de vie contrôlé. |
| `source_link` | `concept_id` | FK vers concept et une source native typée ; exactement un adaptateur renseigné ; index uniques partiels par source. |
| `label` | `(concept_id,lang,kind,value)` | FK concept ; `kind ∈ {alt,hidden}`, langue et texte contrôlés. |
| `localized_field` | `(concept_id,lang,field)` | FK concept ; `field ∈ {name,description}` pour les champs sans colonne native adaptée. |
| `note` | `id` | FK concept ; type `scope/definition/history/source`, texte non vide et provenance. |
| `relation` | `(concept_id,type,target_id)` | Deux FK concept ; pas d'autoréférence ; types `related/exact_equivalent/replaced_by`. |
| `mapping` | `id` | FK concept ; unique `(concept_id,type,target_uri)` ; cinq types SKOS et URI HTTP(S)/URN contrôlés. |
| `revision` | `revision_id` UUID | FK concept ; version positive, statut `draft/validated/published`, documents/empreinte de base ; un index partiel limite à une révision non publiée par concept. |
| `release` | `release_id` bigint | FK précédente vers release ; clé d'idempotence unique, empreinte de requête, manifeste, empreinte d'instantané et compte d'objets affectés. |
| `release_concept` | `(release_id,concept_id)` | FK release et concept ; document complet figé, empreinte et politique d'exposition de l'instantané. |
| `release_change` | `(release_id,concept_id)` | FK release et concept ; avant/après et type `added/modified/deprecated/retired`. |
| `outbox` | `id` | FK release ; unique `(release_id,type)` ; statut, tentatives, bail et jeton de réclamation. |
| `assignment_retention` | `(transaction_id,table_oid,object_id,concept_id)` | FK concept ; conservation des affectations historiques lors d'une réconciliation dans la même transaction. |
| `ownership_retention` | `(transaction_id,table_oid,row_key)` | Propriétaires conservés avant les suppressions en cascade ; cache transactionnel interne. |

Les trois tables de publication sont protégées par `thesaurus.guard_immutable` : les
instantanés terminés ne sont pas réécrits. Une correction crée une nouvelle publication.
Les identifiants numériques peuvent avoir des trous après un rollback ; la continuité
des numéros n'est pas un contrat.

## Adaptateurs et clés étrangères natives

`source_link` porte des **vraies FK**, avec suppression restreinte, et non une simple
référence textuelle polymorphe. Les FK clonées par PostgreSQL sur les partitions de
`ref_code` ne représentent pas des adaptateurs supplémentaires.

| Adaptateur | FK native | Parent typé dans `source_rows` |
|---|---|---|
| `ref_code` | `(ref_code_id,ref_code_domain) → public.ref_code(id,domain)` | `parent_id`, même domaine. |
| `amenity` | `amenity_id → public.ref_amenity(id)` | `family_id → ref_code`, domaine `amenity_family`. |
| `classification_scheme` | `classification_scheme_id → public.ref_classification_scheme(id)` | Aucun. |
| `classification_value` | `classification_value_id → public.ref_classification_value(id)` | Autre valeur du même schéma, sinon schéma de classification. |
| `language` | `language_id → public.ref_language(id)` | Aucun. |
| `commune` | `commune_code → public.ref_commune(insee_code)` | Aucun ; identité native textuelle. |
| `sustainability_action` | `sustainability_action_id → public.ref_sustainability_action(id)` | `category_id → sustainability_category`. |
| `sustainability_category` | `sustainability_category_id → public.ref_sustainability_action_category(id)` | Aucun. |

`context_key` qualifie les codes des valeurs de classification et des actions de
durabilité. Le code seul n'est pas une identité globale ; l'identité publique est le
UUID de concept et son URI configurée. `source_rows` est une vue interne qui fournit
les clés natives, documents sources et triples de parent ; elle ne publie pas ces
documents aux partenaires.

`source_descendant_ids(uuid[])` suit ces parents avec une récursion dédupliquée. La
prévisualisation et la publication prennent en compte les objets affectés par le
renommage d'un parent, y compris famille d'équipements et catégorie de durabilité.
`usage_objects` et `object_ids_for_row` couvrent les FK réelles, les liens imbriqués,
les médias rattachés à un lieu, les acteurs reliés aux objets et le tableau
`object_classification.subvalue_ids`.

## Points d'entrée SQL et droits effectifs

| Fonction `api.*` | Exécution applicative | Effet/contrat |
|---|---|---|
| `thesaurus_admin(text,jsonb)` | `authenticated` ; contrôle obligatoire `auth.uid()` + superuser plateforme | Routeur éditorial `VOLATILE`, invoker ; appelle `thesaurus.admin_dispatch`, definer avec garde d'autorisation. |
| `thesaurus_public(text,bigint,jsonb)` | `service_role` uniquement, hors propriétaire/capacité privée | Routeur public `STABLE`, invoker ; instantané publié, périmètre public figé, jamais de brouillon. |
| `thesaurus_generation()` | `anon/authenticated/service_role` | Numéro courant uniquement ; lecture definer limitée. |
| `thesaurus_object_release()` | mêmes rôles | Numéro de publication utilisé par les consommateurs. |
| `thesaurus_reference_statuses()` | mêmes rôles | Projection publique limitée : cycle de vie, disponibilité au jour courant et assignabilité. |
| `thesaurus_reference_snapshot(text[])` | mêmes rôles | Références autorisées + génération dans un même état SQL ; invoker. |
| `thesaurus_expand_taxonomy_codes(text[])` | mêmes rôles | Expansion explicite d'équivalences exactes dans l'instantané courant. |
| `thesaurus_taxonomy_matches(text[],text[],jsonb)` | mêmes rôles | Prédicat commun ; expansion seulement avec l'option explicite. |
| `get_partner_object_with_vocabulary(...)` | `service_role` uniquement | Objet publié réel, enrichissements et génération dans une même requête stable. |
| `list_partner_objects_with_vocabulary(...)` | `service_role` uniquement | Page d'objets publiés, pivots et génération ; filtre taxonomique/équivalence optionnels. |
| `list_catalog(text,text)` | `anon/authenticated/service_role` | Cinq champs historiques ; serializer original conservé privé, puis filtre de cycle de vie/date pour les domaines gouvernés. |
| `list_reference_bundle(text[],text)` | surface historique de lecture | Continue d'appeler `list_catalog` ; liste blanche initiale conservée. |
| `public_catalog_domains()` | `anon/authenticated/service_role` | Liste blanche historique capturée ; pas de publication automatique d'un nouveau vocabulaire. |

Les droits ci-dessus concernent les rôles applicatifs ; les propriétaires et le rôle
privé de publication disposent des droits d'installation/exécution nécessaires. Les
helpers exposés en lecture ont `PUBLIC EXECUTE` révoqué, sauf la surface historique
`list_reference_bundle` dont le grant antérieur est conservé. `USAGE` sur les schémas
et les politiques de lecture des sources restent également requis.

Actions admin : `workspace`, `configure_instance`, `configure_domain`, `bootstrap`,
`save_draft`, `validate_draft`, `preview`, `publish`, `rebase_draft`, `discard_draft`,
`requalification`, `retry_outbox`, `claim_outbox`, `deliver_outbox`, `ack_outbox`.
`save_draft` accepte les préconditions optionnelles `expected_source_fingerprint` et
`only_if_no_revision`, avec version optimiste et verrou du concept. `workspace` avec
`read_only:true` n'initialise aucune identité et annonce ses capacités.

Actions partenaires : `manifest`, `release`, `concepts`, `concept`, `resolve`, `export`,
`changes`. L'authentification partenaire, le quota, le curseur signé et l'ETag sont
appliqués par les routes Next ; le simple droit SQL `service_role` ne remplace pas
l'admission HTTP. Aucun nouveau scope n'est imposé aux clés partenaires existantes.

## RLS, capacité de publication et gardes

Les 16 politiques privées observées sont `publisher_only`, `FOR ALL TO
bertel_thesaurus_publisher USING(true) WITH CHECK(true)`. Les tables/séquences privées
ne sont pas accordées à `PUBLIC`, `anon`, `authenticated` ou `service_role`. Les tables
sont possédées par le rôle d'installation ; l'accès applicatif passe par les fonctions
gérées, et non par les tables.

`bertel_thesaurus_publisher` est une capacité **NOLOGIN/NOINHERIT**, sans possibilité
de `SET ROLE` ou d'héritage accordée aux rôles applicatifs. `activate` et les writers
de projections lui appartiennent. Ses droits sur `public.object` concernent seulement
les colonnes de caches/recherche et `updated_at` ; une publication ne fabrique pas de
nouvelle version canonique d'une fiche. Les permissions de maintenance des MV sont
explicites. Les fonctions privées sont révoquées de `PUBLIC` après leur création.

Les gardes protègent les anciennes écritures de sources gouvernées, l'immuabilité
des publications, les nouvelles affectations de valeurs historiques et les transferts
vers un nouveau propriétaire. Les affectations conservées peuvent être réenregistrées
ou retirées explicitement. Le verrou exclusif de publication et les verrous partagés
d'écriture sont pris avant les verrous de lignes concernés.

`list_catalog` reste invoker et réutilise `thesaurus.legacy_list_catalog` ; son filtre
privé ne peut qu'enlever des lignes déjà visibles au caller. Les catégories structurelles
actives sont conservées même si non assignables ; les valeurs retirées et hors dates
disparaissent des choix courants, mais restent résolubles dans le thésaurus publié.

L'outbox réclame au plus 20 événements par appel, avec `SKIP LOCKED`, jeton et bail
de dix minutes. `deliver_outbox` émet `pg_notify('bertel_thesaurus_generation',...)`
et termine l'événement dans la même transaction ; le même reçu terminé est idempotent.
L'outbox et ses reçus sont durables ; le signal est éphémère et ne prouve pas la
réception par un abonné absent. La cohérence des lectures repose sur les générations,
pas sur un abonné externe supposé. Voir le [guide des outils](../tools/thesaurus-content/README.md).

## Tests par catégorie

| Catégorie | Preuve exécutable |
|---|---|
| Bootstrap, adaptateurs, révisions, publication, langues, instantanés, autorisations | [test_thesaurus_publication.sql](<../Base de donnée DLL et API/tests/test_thesaurus_publication.sql>) |
| Compatibilité `/catalog`, vrai rôle anon, objets publics, génération, filtres | [test_thesaurus_consumers.sql](<../Base de donnée DLL et API/tests/test_thesaurus_consumers.sql>) |
| 15 usages imbriqués/tableaux, nouvelles affectations, six transferts, cascades et conservation | [test_thesaurus_nested_consumers.sql](<../Base de donnée DLL et API/tests/test_thesaurus_nested_consumers.sql>) |
| Workspace sans écriture, empreintes, révisions locales, claim/bail/reprise/livraison | [test_thesaurus_editorial_tools.sql](<../Base de donnée DLL et API/tests/test_thesaurus_editorial_tools.sql>) |
| Parents typés et synchronisation ; échec de projection obligatoire sans bascule ni effet partiel | [test_thesaurus_parent_impacts.sql](<../Base de donnée DLL et API/tests/test_thesaurus_parent_impacts.sql>) |
| Proposition de contenus, simulation et conflits sans réseau | [propose-content.test.mjs](../tools/thesaurus-content/propose-content.test.mjs) |
| API partenaires : admission, curseurs, cache, champs privés, JSON-LD, langues | [thesaurus-api.test.ts](../bertel-tourism-ui/src/lib/thesaurus-api.test.ts) |
| Drain HTTP admin et reprise après erreur | [notify-drain/route.test.ts](../bertel-tourism-ui/src/app/api/admin/thesaurus/notify-drain/route.test.ts) |

Pour reproduire l'introspection : consulter `pg_class.relrowsecurity`, `pg_constraint`
avec `pg_get_constraintdef`, `pg_policies`, `pg_proc` avec `pg_get_function_identity_arguments`
et `pg_get_function_result`, ainsi que les ACL et propriétaires. Les anciens compteurs
globaux du graphe restent ceux de leur extraction historique ; ils ne sont pas incrémentés
artificiellement par ce complément. Une extraction complète doit être effectuée depuis
le catalogue réellement déployé, avec les outils de [tools/db-graph](../tools/db-graph/README.md).
