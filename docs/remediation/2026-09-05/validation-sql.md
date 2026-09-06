# Validation SQL locale — corrections RGPD et bornes d’âge

Validation effectuée les 5–6 septembre 2026 sur le seul projet Supabase local `bertel-audit-20260905`. **Les validations ciblées ci-dessous passent. Le fresh apply complet reste en échec sur une limite d’ACL du socle.** Cette page ne constitue ni une validation complète du manifeste ni une preuve de déploiement en production.

## Résultats

| Vérification | Résultat |
|---|---|
| Migration des 19 SELECT Tourinsoft, puis premier test régional I4f | Code 0 ; assertions et test réussis |
| Continuation du manifeste initial après I4f | Arrêt code 3 au test des contacts acteurs, avant la fin du manifeste |
| Préparation du catalogue après cet arrêt, scripts d’installation seuls | 13 inclusions réussies, code 0 ; 11 inclusions de tests volontairement omises |
| `20260905204133_audit_price_age_bounds.sql` | Application code 0 |
| `test_audit_price_age_bounds.sql` | Code 0, y compris réapplication et scénario d’ancienne ligne invalide |
| `20260905195257_gdpr_cleanup_operations.sql` | Application puis réapplication code 0 |
| `test_gdpr_cleanup_operations.sql`, fixture corrigée et renforcée | Code 0 ; nouveau passage code 0 après réapplication de la migration |
| Catalogue RGPD avant/après réapplication | Empreinte identique pour les quatre fonctions et leurs ACL, la table, les contraintes et les index |
| État après rollbacks des fixtures | Zéro tâche, opération RGPD, objet ou utilisateur de ces fixtures restant en base |

Les migrations applicatives n’ont pas été modifiées pendant cette validation. Les seules corrections de sources effectuées par le vérificateur concernent les deux fixtures décrites plus bas.

## Environnement et séparation des données

- CLI utilisée : Supabase **2.109.1** ; image PostgreSQL `public.ecr.aws/supabase/postgres:17.6.1.143`.
- Configuration : `scratch/remediation-2026-09-05/sql-local/supabase/config.toml`, `project_id = "bertel-audit-20260905"`.
- Conteneur : `supabase_db_bertel-audit-20260905`, identifiant vérifié `934cee86ecd34fc1b5c3ffc1588b22b980ec89ef0969ba4068624085314032e7`.
- Labels `com.supabase.cli.project` et `com.docker.compose.project` égaux à `bertel-audit-20260905` ; port hôte PostgreSQL **55322** ; état healthy avant chaque exécution.
- Vrais services Auth et Storage initialisés ; API 55321 et serveur mail local 55324. Analytics désactivé. Migrations et seeds automatiques désactivés dans la configuration scratch.
- Fin réussie de `supabase start` attendue **avant** tout SQL. Préflight : `auth.users`, `storage.buckets`, `storage.objects` présents et `public.object` absent avant l’application du socle.
- SQL exécuté par socket dans le conteneur avec `docker exec … psql -U postgres -d postgres`, sans DSN distant. Aucun conteneur du projet `bertel` ni aucune base distante modifiés.

Le socle initial est conservé dans `scratch/remediation-2026-09-05/sql-check-input`. Il n’a pas été remplacé par le manifeste courant pendant les révisions concurrentes. Les quatre fichiers ciblés ont été figés séparément dans `sql-targeted-input`, puis copiés sous `/tmp/bertel-targeted/` avec dossiers frères `sql/tests/` et `supabase/migrations/`.

## Limite du fresh apply et compatibilité des ACL

La CI du dépôt épingle encore Supabase CLI **2.78.1** dans `.github/workflows/sql-fresh-apply.yml:52`. La configuration générée par la CLI 2.109.1 explique que les nouvelles relations de `public` ne reçoivent plus automatiquement les grants Data API lorsque `auto_expose_new_tables` n’est pas défini. Le catalogue local confirme l’absence des droits SELECT/INSERT/UPDATE/DELETE par défaut pour `anon`, `authenticated` et `service_role`.

Les scripts du socle définissent de nombreuses policies RLS et des grants partiels, mais pas un contrat complet de privilèges de tables. Les 19 SELECT explicitement nécessaires au sérialiseur Tourinsoft ont été corrigés et vérifiés. La continuation s’arrête ensuite sur :

```text
tests/test_actor_contacts_org_gate.sql:868:
ERROR: permission denied for table actor
CONTEXT: api.get_actor_data(text), scénario authenticated
```

Cette erreur est conservée dans `sql-baseline-continuation-19-grants.log:188` ; code final 3 à la ligne 269. Aucun GRANT global ni modification de `get_actor_data` n’a été utilisé pour la masquer. Rétablir des lectures intégrales des tables acteurs demanderait un examen séparé des accès directs aux champs personnels, au-delà du caviardage effectué dans le JSON du RPC.

Pour préparer uniquement le catalogue nécessaire aux validations ciblées, `ci_ddl_after_actor_test.sql` a repris les 13 inclusions d’installation situées après la ligne 428 du **manifeste initial figé**, en excluant `tests/`. Les deux rafraîchissements finaux de vues matérialisées et le message « Fresh apply complete » ont également été omis. Ces scripts peuvent comporter leurs assertions internes et leurs mises à jour de données ; aucun test autonome omis n’est réputé réussi.

Les 11 inclusions non exécutées à ces positions sont :

| Ligne du manifeste initial | Test omis |
|---:|---|
| 431 | `test_actor_link_note_carryover.sql` |
| 437 | `test_explorer_name_relevance.sql` |
| 443 | `test_search_objects_by_name.sql` |
| 452 | `test_org_link_reconcile_editor.sql` |
| 461 | `test_ref_catalog_admin.sql` |
| 467 | `test_crm_task_multi_assignee.sql` |
| 476 | `test_crm_interaction_status.sql` |
| 482 | `test_crm_assignee_eligibility.sql` |
| 488 | `test_crm_notes_probe.sql` |
| 497 | `test_actor_channel_visibility.sql` |
| 500 | `test_tourinsoft_reunion_regional_v1.sql`, passage final après migrations aval |

Le premier passage Tourinsoft antérieur reste réussi ; cela ne remplace pas son passage final omis. Le test acteurs en échec à la ligne 428 n’a pas été relancé.

## Couverture des fixtures ciblées

**Bornes d’âge — DB-02.** Acceptation des valeurs NULL et des maxima positifs ; refus des maxima enfant et junior négatifs avec minimum NULL ; maintien du contrôle min ≤ max ; réapplication sans doublon. Une transaction séparée simule une ligne héritée négative avant création de la contrainte : la migration conserve cette ligne, laisse `chk_age_max_nonneg` en `NOT VALID` et produit un NOTICE. Après rollback, les deux contraintes d’âge sont validées et aucune fixture ne subsiste.

**Effacement RGPD — PRIV-01/02.** Les scénarios vérifient la mise en file de l’avatar et des médias d’incident, le nettoyage de la tâche CRM liée, la suppression des documents privés devenus orphelins et la conservation explicite des documents encore partagés. Ils contrôlent la rédaction de l’audit après le DELETE d’un document, les traces où seul `after_data` porte l’acteur et l’historique d’interactions et de tâches créé avant toute liaison à l’acteur.

Les scénarios d’autorisation couvrent les garde-fous self/owner/super_admin, le mode NULL, un JWT malformé et un rôle `authenticated` sans claims sur une session initialement `postgres`. Les deux RPC de nettoyage refusent réellement `anon` et `authenticated`, acceptent `service_role`, refusent un mauvais couple opération/tâche et gardent une tâche réussie inchangée lors d’un acquittement répété. Un sabotage transactionnel de l’écriture des tâches prouve que l’échec annule aussi la mutation du sujet et l’opération de journal.

Le catalogue final confirme :

- `audit.redact_subject` et les deux RPC de nettoyage : EXECUTE réservé à `service_role`, hors propriétaire SQL ; refus `anon`/`authenticated`.
- `rpc_gdpr_erase_subject` : EXECUTE `authenticated`/`service_role`, refus `anon`, avec garde interne testée.
- Les quatre fonctions ont un `search_path` explicite, avec `pg_catalog` en premier et `pg_temp` en dernier.
- `internal.gdpr_cleanup_task` a RLS activé, zéro policy et aucun SELECT/INSERT/UPDATE/DELETE pour `anon` ou `authenticated`.

L’empreinte du catalogue comparé avant/après réapplication est `7b9734ad382031c98fbfe35fa9d661b7`. Les deux mesures comptent zéro tâche et zéro opération persistante.

### Adaptations et renforcement des fixtures

- Dans `test_audit_price_age_bounds.sql`, les deux `\i` sont devenus `\ir` : les chemins de migration sont résolus depuis la fixture, indépendamment du répertoire de lancement de `psql`.
- Dans `test_gdpr_cleanup_operations.sql`, le sujet CRM est comparé au libellé exact `Note interne`, et le corps à NULL : le trigger réel `auto_populate_interaction_subject` régénère ce libellé générique lorsqu’un sujet est vidé. Exiger `subject IS NULL` contredisait ce comportement sans mieux vérifier l’effacement de PII.
- Le scénario de sabotage restaure les claims de maintenance après les personas de refus ; les claims du compte ordinaire de la section précédente ne doivent pas contaminer ce test autorisé.
- Ajout de témoins et d’assertions non vacants sur le rôle sans claims, l’historique CRM antérieur à la liaison, la trace DELETE du document, les refus des deux RPC et le mauvais couple opération/tâche.

Les deux premiers échecs de la fixture RGPD sont conservés (`sql-gdpr-fixture-test.log` et `sql-gdpr-fixture-test-v2.log`). La version adaptée passe dans `sql-gdpr-fixture-test-v3.log`, puis à nouveau dans `sql-gdpr-fixture-after-reapply.log`.

## Commandes ciblées exécutées

Le nom, les labels, l’état et le port ont été vérifiés avant les commandes. `$dbAuditId` représente exclusivement l’identifiant complet du conteneur indiqué plus haut ; ces commandes ne choisissent aucun projet ou DSN implicitement.

```powershell
docker exec $dbAuditId psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/bertel-targeted/supabase/migrations/20260905204133_audit_price_age_bounds.sql
docker exec $dbAuditId psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/bertel-targeted/sql/tests/test_audit_price_age_bounds.sql
docker exec $dbAuditId psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/bertel-targeted/supabase/migrations/20260905195257_gdpr_cleanup_operations.sql
docker exec $dbAuditId psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/bertel-targeted/sql/tests/test_gdpr_cleanup_operations.sql
# Réapplication, puis répétition de la fixture :
docker exec $dbAuditId psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/bertel-targeted/supabase/migrations/20260905195257_gdpr_cleanup_operations.sql
docker exec $dbAuditId psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/bertel-targeted/sql/tests/test_gdpr_cleanup_operations.sql
```

## Empreintes des fichiers exécutés

SHA256 des copies figées, consignés aussi dans `sql-targeted-input-sha256.log` :

| Fichier | SHA256 |
|---|---|
| `20260905195257_gdpr_cleanup_operations.sql` | `DCCA23BC8590AF01BF6B1DDD21A0BECDB91FE22FE37B8E9BF7D5F878E99627F7` |
| `20260905204133_audit_price_age_bounds.sql` | `58CB6E181A22C49118F6DED0A900D00F9E5B0E070865D904F5FF71724593865D` |
| `test_gdpr_cleanup_operations.sql`, version finale testée | `137699001384C90547A3EFFCB4B12C2796432F10A6D782672120CE587D2C7FCD` |
| `test_audit_price_age_bounds.sql` | `759334875A3C30F08622E55BAE495A9524AEBCCE3E97936AF2E8D74DCCBCC97E` |
| `20260905200731_tourinsoft_service_read_grants.sql`, 19 SELECT | `CC0BA97D3FBF764A82A4F5EF1889C8D9111AFD4EF57AB3636A4706413ADAB52F` |
| Manifeste initial figé `ci_fresh_apply.initial.sql` | `8E1C2E0119774D14201F8A187710330097B728ACB39A81A308F11431575926E2` |

## Traces et limites

Les journaux locaux se trouvent sous `scratch/remediation-2026-09-05/` : `sql-local-recovery-commands.log`, `sql-local-storage-preflight.log`, `sql-age-migration-apply.log`, `sql-age-fixture-test.log`, `sql-gdpr-migration-apply.log`, `sql-gdpr-migration-reapply.log`, `sql-gdpr-fixture-test-v3.log`, `sql-gdpr-fixture-after-reapply.log`, `sql-gdpr-idempotence-catalogue.log` et `sql-targeted-final-permissions.log`. Les listes exactes de préparation du catalogue sont `sql-catalogue-selected-includes.txt` et `sql-catalogue-skipped-tests.txt`.

Ces validations SQL vérifient les mutations, le journal durable et les tâches en file. Elles n’exécutent pas les suppressions physiques via Storage ni l’Admin API Auth et ne valent pas validation HTTP de la route. Les orphelins Storage historiques, les uploads concurrents, les sauvegardes/caches et l’examen métier des documents partagés restent les limites déclarées du correctif. La branche utilisateur `anonymize` conserve le compte Auth ; `delete` demande sa suppression asynchrone et ne prouve pas ici son achèvement.

Le graphe DB canonique `db-graph-out/` et `dbdoc/` provient du catalogue LIVE, dont la base de production n’a pas été migrée par cette session. Il n’a pas été régénéré depuis cette base de fixtures et ne doit pas être mélangé avec elle. Après déploiement, sa mise à jour demandera le DSN de la **source cible appropriée**, conformément à `tools/db-graph/README.md`. La mise à jour du graphe de code Graphify est coordonnée séparément par l’agent principal.

## Complément du 6 septembre 2026 — préflight MCP sur Bertel

À la demande de l’utilisateur, une inspection distante **en lecture seule** a été effectuée sur `ryycrdhlkmzpxwwwwupy`, URL confirmée par `get_project_url`. Le MCP direct de cette session Codex retourne `Auth required` pendant l’initialisation ; la connexion Supabase du projet dans Claude Code fonctionne. Le préflight a utilisé cette connexion, avec Claude Sonnet 5 et une liste limitée d’outils MCP autorisés. Aucun schéma ni aucune donnée métier n’a été modifié ; aucun RPC applicatif n’a été exécuté.

### Ce que le catalogue distant confirme

- **Le premier blocage local ne se retrouve pas dans les privilèges de Bertel.** `authenticated` dispose déjà de SELECT et de USAGE sur le schéma pour les six relations directement lues par `api.get_actor_data` : `actor`, `actor_object_role`, `ref_actor_role`, `actor_channel`, `ref_code_contact_kind`, `ref_contact_role`. RLS est activée sur les six et la fonction reste `SECURITY INVOKER`. Cela ne remplace pas un test fonctionnel des périmètres de lecture ni des fonctions utilisées par les policies.
- Les trois versions `20260905195257`, `20260905200731`, `20260905204133` sont absentes de l’historique retourné par `list_migrations`. La dernière version enregistrée est `20260905105019_revoke_default_acl_rpc_only_18h`.
- La table `internal.gdpr_cleanup_task` et les deux nouveaux RPC de suivi/acquittement sont absents. `api.rpc_gdpr_erase_subject` existe dans une version antérieure ; son existence ne signifie pas que le correctif a été déployé.
- `object_price` porte `chk_age_ranges_valid`, validée ; la nouvelle contrainte `chk_age_max_nonneg` est absente.
- Les six relations RGPD contrôlées (`gdpr_erasure_log`, `audit.audit_log`, `actor_document`, `crm_task`, `crm_interaction`, `ref_document`) sont présentes. Les colonnes `actor_document.promoted_document_id`, `ref_document.storage_bucket/storage_path/access_scope` et les deux maxima d’âge sont présentes. Ce contrôle ne couvre pas toutes les dépendances des corps PL/pgSQL ni la validité des données existantes.

### Prérequis de déploiement réellement manquant

**`api.tourinsoft_reunion_regional_documents(text[])` est absente du catalogue distant.** Les 19 tables sources contrôlées existent, mais la migration de grants `20260905200731_tourinsoft_service_read_grants.sql:43` convertit cette signature en `regprocedure` pour ses assertions : elle échouerait sur la cible actuelle et sa transaction serait annulée.

La fonction est définie dans `supabase/migrations/20260731041455_tourinsoft_reunion_regional_v1.sql:636`. Le runbook décrit ce module régional comme implémenté, validé en rollback et **non déployé** ; son installation exige d’abord le module hébergement I4e (`20260730081425_tourinsoft_reunion_export_v1.sql`). L’absence observée est donc cohérente avec le statut documenté du module. Il faut constituer un lot Tourinsoft incluant ses prérequis après revue, ou conserver ce correctif de grants avec le module optionnel jusqu’à son déploiement. Ne pas appliquer ce fichier isolément et ne pas rejouer le manifeste fresh apply sur Bertel.

Ce prérequis Tourinsoft ne concerne pas les migrations RGPD et bornes d’âge. Leurs principaux prérequis inspectés sont présents ; leur déploiement demande encore la comparaison des fonctions existantes remplacées, la vérification des autres dépendances et les contrôles après application. **Aucune migration n’a été appliquée pendant ce diagnostic.**

### Preuves et limites de collecte

- `scratch/remediation-2026-09-05/mcp-sql-blocker-preflight.prompt.txt` et `.json` : identité du projet et historique, diagnostic initial. Le batch SQL initial ne renvoyait que son dernier SELECT ; les privilèges ont donc été récupérés dans un second appel.
- `scratch/remediation-2026-09-05/mcp-sql-blocker-catalog.prompt.txt` et `.jsonl` : requête unique avec résultats JSON agrégés et réponse MCP brute. Le présent complément se fonde sur ces lignes de catalogue, pas uniquement sur la synthèse du modèle.
- La lecture des ACL ne prouve pas les lignes accessibles aux utilisateurs. Aucun test avec données de personnes, aucune suppression, aucune migration ni inspection exhaustive de la base distante n’a été effectué.
