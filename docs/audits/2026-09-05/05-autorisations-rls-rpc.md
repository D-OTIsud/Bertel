# Audit — Autorisations, RLS et RPC PostgreSQL

Date : 5 septembre 2026. Révision : `5873ec69879e61ff34030d196c65f2eb0ac14de0`.

## Périmètre et méthode

Revue statique du catalogue documentaire et des définitions SQL : lecture publique/étendue, mutations canoniques, profils, fonctions `SECURITY DEFINER`, historique, secrets IA, privilèges EXECUTE et ordre d'installation. `DB_AGENT_INDEX.md`, `FUNCTIONS.md`, `POLICIES.md` et les pages de tables ont servi à orienter la recherche, puis les sources et redéfinitions du manifeste ont été vérifiées. Les skills Supabase et Postgres ont été consultés ; leurs conseils ont été recoupés avec la documentation officielle pertinente.

Aucun accès SQL distant ni test d'intrusion. Les politiques effectives du service déployé, rôles propriétaires et grants ne sont pas certifiés par un export historique. **Confirmé (code)** décrit un mécanisme visible ; **Risque** un impact dépendant de conditions explicites ; **À vérifier** ce qui nécessite un contrôle d'environnement. P0 critique, P1 élevée, P2 moyenne, P3 faible.

## Points solides et faux positifs écartés

- Les RPC de cartes filtrent les identifiants selon la visibilité de l'appelant avant les lectures privilégiées : `Base de donnée DLL et API/migration_cards_batch_authorize_definer.sql:113`. Le seul usage de `SECURITY DEFINER` ne démontre donc pas une fuite.
- Les trois helpers ensemblistes critiques ont reçu un `search_path` avec `pg_temp` en dernier : `Base de donnée DLL et API/migration_cards_batch_authorize_definer.sql:61`, `Base de donnée DLL et API/migration_actor_contacts_org_gate.sql:1`.
- Les mutations canoniques et les politiques par commande évitent de confondre un droit d'écriture avec un droit de lecture global : `Base de donnée DLL et API/ci_fresh_apply.sql:87`, `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql:403`.
- La lecture de la clé IA est explicitement réservée à `service_role` : `Base de donnée DLL et API/migration_ai_provider_config.sql:223`. Les tables internes sans policy sont parfois un verrouillage volontaire, pas une RLS manquante.
- **L'escalade historique par `raw_user_meta_data.role` n'est pas retenue.** `Base de donnée DLL et API/migration_unblock_team_legal_access.sql:242` n'utilise que `app_metadata` pour le rôle ; `Base de donnée DLL et API/migration_unblock_team_legal_access.sql:289` retire l'appel de synchronisation aux utilisateurs ordinaires. Ce correctif est appliqué par `Base de donnée DLL et API/ci_fresh_apply.sql:169`. Un commentaire ou le corps antérieur de `schema_unified.sql` ne suffit pas à établir une faille actuelle.

## Constats

### RLS-01 — Les révocations anon Q1a/Q1b restent hors du manifeste testé

**P2 — Confirmé (code), état déployé à vérifier.**

**Preuves.** `docs/SQL_ROLLOUT_RUNBOOK.md:293` et `docs/SQL_ROLLOUT_RUNBOOK.md:294` demandent explicitement d'appliquer les migrations de révocation après création des fonctions et précisent qu'elles sont hors de la gate fresh-apply. Le manifeste utilisé par `.github/workflows/sql-fresh-apply.yml:77` n'inclut aucun de ces deux fichiers. Des révocations spécifiques, par exemple `api.audit_legal_compliance`, apparaissent dans `Base de donnée DLL et API/migration_revoke_anon_q1b_denylist.sql:83` ; celles de `api.refresh_open_status` dans `Base de donnée DLL et API/migration_revoke_ops_grants_anon.sql:37`.

**Scénario et impact.** Une nouvelle base construite en suivant le manifeste et une base durcie manuellement peuvent exposer des surfaces RPC différentes alors que la CI est verte. PostgreSQL accorde par défaut EXECUTE à PUBLIC pour une nouvelle fonction ; un GRANT ciblé ne supprime pas cet héritage. Cela élargit les points d'entrée et les traitements déclenchables. Cela ne prouve pas que toutes les fonctions concernées permettent une écriture ou une lecture illicite : leurs gardes internes et la RLS restent à analyser individuellement. [Privilèges des fonctions PostgreSQL](https://www.postgresql.org/docs/current/sql-createfunction.html).

**Recommandation.** Intégrer une matrice ACL finale et des assertions `has_function_privilege` au parcours d'installation. Réconcilier les anciennes listes avant intégration : la ligne 124 de Q1b réaccorde `authenticated` à la synchronisation de profil, alors que le correctif juridique plus récent la réserve à `service_role` à la ligne 289. Ajouter aveuglément Q1b en dernier annulerait cette restriction de privilèges, même si le trigger de rôle apporte une protection supplémentaire.

**Validation attendue.** Sur une base neuve, vérifier l'interdiction effective des fonctions ops/admin prévues à `anon`, la synchronisation de profil réservée au service, puis les parcours publics autorisés. Comparer la matrice ACL à une base mise à niveau. Faire échouer la CI si une révocation est retirée.

### RLS-02 — Les RPC de gestion IA ne refusent pas une autorisation NULL

**P2 — Risque conditionnel ; branche SQL confirmée, exploit HTTP non démontré.**

**Preuves.** `Base de donnée DLL et API/rls_policies.sql:1853` définit `is_platform_superuser()` par `auth.role() IN (...) OR EXISTS(...)`, sans COALESCE final. Sans rôle JWT ni identité, le résultat peut être NULL. `Base de donnée DLL et API/migration_ai_provider_config.sql:70` utilise `IF NOT api.is_platform_superuser()` et poursuit ensuite vers les écritures de configuration et de secret, sans garde initiale `auth.uid()`. L'EXECUTE est accordé à `authenticated` à la ligne 131.

**Scénario et impact.** Une session SQL ou un worker ayant le rôle `authenticated`, le droit EXECUTE et aucun contexte de claims peut traverser la garde. `IF NOT NULL` ne déclenche pas la branche de refus. Une requête HTTP Supabase normale avec JWT fournit les claims ; cet audit n'établit donc pas qu'un utilisateur Web puisse obtenir ce contexte. L'écart devient pertinent avec un accès SQL délégué, un pool ou un test qui utilise SET ROLE sans claims. [Condition IF en PL/pgSQL](https://www.postgresql.org/docs/current/plpgsql-control-structures.html#PLPGSQL-CONDITIONALS).

**Recommandation.** Rendre les prédicats d'autorisation strictement booléens et utiliser `IS NOT TRUE` pour les gardes privilégiées. Exiger une identité lorsqu'une opération doit être imputable à une personne ; conserver une voie service explicitement définie si nécessaire.

**Validation attendue.** Dans une base isolée, tester administrateur valide, utilisateur ordinaire, claims absents, claims vides et service. Les contextes absents doivent refuser avant toute écriture. Vérifier que les appels administrateur restent possibles.

### RLS-03 — La visibilité actuelle d'un objet ouvre aussi ses anciens snapshots

**P2 — Risque de divulgation historique ; règle produit à confirmer.**

**Preuves.** `Base de donnée DLL et API/api_views_functions.sql:10771` autorise `get_object_version_snapshot` au moyen du jeu `current_user_readable_object_ids`. Ce jeu inclut tous les objets actuellement publiés : `Base de donnée DLL et API/migration_cards_batch_authorize_definer.sql:63`. Le snapshot est renvoyé entier, sans filtrage des propriétés, à `Base de donnée DLL et API/api_views_functions.sql:10782`. Sa capture utilise `to_jsonb(NEW/OLD)` sur la ligne objet : `Base de donnée DLL et API/schema_unified.sql:4022`. La RPC est accessible à `authenticated`, avec révocation `anon`, à `Base de donnée DLL et API/api_views_functions.sql:10787`.

**Scénario et impact.** Un compte authentifié sans droit éditorial sur un objet actuellement publié peut demander une version antérieure correspondant à son brouillon. Il reçoit le contenu historique de la ligne objet, potentiellement un ancien nom, `extra` ou des informations ensuite retirées. Les tables enfants ne sont pas incluses par ce trigger : il ne faut pas étendre ce constat à tout le dossier juridique ou CRM. Le risque dépend du caractère public ou interne attendu de l'historique.

**Recommandation.** Décider explicitement si l'historique est réservé au périmètre éditorial. Si oui, utiliser une permission d'historique ou la lecture étendue appropriée. Si un historique public est voulu, produire une projection publique distincte au lieu de retourner le snapshot brut.

**Validation attendue.** Créer une fixture « brouillon contenant un champ interne, puis publié après retrait de ce champ ». Tester utilisateur d'une autre organisation, lecteur, éditeur et administrateur. Le résultat doit respecter la décision métier, y compris après archivage et republication.

## Vérifications complémentaires et limites

Une matrice par persona doit couvrir anon, utilisateur sans organisation, membre simple, éditeur, administrateur d'organisation, autorité plateforme et service. Prioriser les refus inter-organisations, les changements de rôle et les fonctions privilégiées. Les ACL de vues, droits TEMP/CREATE, propriétaires des fonctions et toutes les variations de `search_path` demandent une inspection du catalogue effectif. Les corrections déjà présentes sur quelques helpers ne prouvent pas un durcissement exhaustif.

La documentation Supabase confirme que grants et RLS sont deux couches distinctes et qu'une vue/fonction privilégiée doit être analysée selon son propre contexte : [guide RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Aucun P0/P1 ni compromission de production n'est établi par cette revue. Les points RLS-02 et RLS-03 ne doivent pas être présentés comme des exploitations réalisées.
