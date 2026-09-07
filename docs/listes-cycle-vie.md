# Listes personnelles, mise à la une et cycle de vie — note de déploiement

Date : 2026-09-07. Réalisation : Claude Sonnet 5 ; architecture, revue et validation indépendante : Codex.
Cadrage : `docs/superpowers/specs/2026-09-07-listes-personnelles-une-cycle-vie-design.md`.
Contrat : `docs/superpowers/plans/2026-09-07-listes-implementation-contract.md`.

Le SQL a été appliqué en production le 7 septembre 2026 sur le projet
`ryycrdhlkmzpxwwwwupy`, sous la version `20260907044528`. Le code fait partie
de la publication sur `master` ; le déploiement de l'application via Codify
reste à réaliser par le propriétaire. Les limites des validations sont
précisées ci-dessous.

## Comportement livré

- Tous les membres d'une organisation peuvent créer des listes statiques
  et dynamiques depuis Listes ou Explorer. La page affiche « À la une » puis
  « Mes listes », avec un accès volontaire aux archives et, pour les admins,
  aux propositions. Les cartes indiquent le créateur.
- La couverture automatique utilise la première photo disponible parmi les
  lieux effectifs. La personne autorisée à modifier la liste peut choisir une autre
  photo de la sélection, puis revenir au mode automatique. Une image cassée
  possède un repli visuel.
- Après 21 jours sans modification effective ni envoi accepté, une liste
  personnelle est archivée. La consultation, l'impression, le partage du
  lien et le rafraîchissement des résultats dynamiques ne prolongent pas
  cette période. Modifier, envoyer ou restaurer réactive la liste.
- Les liens des archives restent soumis à leur activation et expiration
  existantes. À un an d'inactivité, la purge supprime la liste et rend son
  lien inaccessible. Les listes à la une sont exemptées de ces deux seuils
  jusqu'au retrait par un admin, qui relance la période active.
- Le créateur propose une liste ; l'admin accepte ou refuse. Un admin peut
  mettre directement ses propres listes à la une. Les membres utilisent
  les listes à la une, mais seuls les admins modifient l'original.
- La duplication crée une liste personnelle indépendante : ordre et notes
  statiques ou filtres dynamiques conservés ; destinataire, token, historique
  d'envoi, proposition et mise à la une ne sont pas copiés.
- L'aide intégrée décrit ces règles. Les propositions restent internes à
  l'interface et ne déclenchent aucune notification externe.

## Fichiers du lot

| Rôle | Chemin |
|---|---|
| Migration | `supabase/migrations/20260907044528_listes_personnelles_une_cycle_vie.sql` |
| Rollback | `Base de donnée DLL et API/rollback/rollback_listes_personnelles_une_cycle_vie.sql` |
| Test SQL | `Base de donnée DLL et API/tests/test_listes_cycle_vie.sql` |
| Acceptation SQL indépendante | `Base de donnée DLL et API/tests/test_listes_dynamic_cover_realm.sql` |
| Cron (guard renforcé) | `Base de donnée DLL et API/maintenance.sql` (bloc `purge-expired-lists`) |
| Intégration SQL | `Base de donnée DLL et API/ci_fresh_apply.sql`, étape 19d |
| Interface et envoi | `bertel-tourism-ui/src/views/ListsManageView.tsx`, `ListComposeView.tsx`, `src/services/lists.ts`, `src/app/api/lists/send/route.ts` |

`Base de donnée DLL et API/tests/test_object_list.sql` (fixtures historiques,
pré-migration) est **préservé tel quel** — il documente l'état d'avant ce lot
et n'est pas mis à jour pour la forme finale.

## Dépendances d'apply (ordre)

Cette migration **suppose déjà appliqués**, dans cet ordre :

1. `migration_object_list.sql` (module de base : tables, `list_effective_object_ids`,
   `list_item_contacts`, `get_public_list_by_token`, `share_list`, `delete_list`).
2. `migration_list_resolver_internal.sql` (§211 — split interne du résolveur
   dynamique ; non modifié par ce lot, doit exister pour que
   `api.resolve_list_object_ids` fonctionne).
3. `migration_list_write_creator_only.sql` (17k) et
   `migration_list_create_superuser_only.sql` (17l) — **leurs fonctions sont
   entièrement remplacées par cette migration** ; les appliquer avant n'est
   pas strictement nécessaire pour la correction de CE lot (`CREATE OR REPLACE`
   écrase quel que soit le corps précédent), mais l'ordre canonique du
   manifeste les place avant.
4. **`migration_test_org_isolation.sql`** (étape 18c : cloisonnement du bac à sable,
   `object.is_test` et `api.current_user_test_realm()`), avec les définitions
   canoniques de `api.get_filtered_object_ids` dans `api_views_functions.sql`
   et de `migration_cards_batch_authorize_definer.sql` qui filtrent ce corpus.
   La migration d'isolation ne réémet pas elle-même tous ces corps de fonctions.
   Ces prérequis sont nécessaires : `api.list_effective_object_ids` (section 5b de
   la migration) filtre désormais `is_test = current_user_test_realm()` en plus
   de `status = 'published'`. Sans ce prérequis, le `CREATE OR REPLACE` de
   `api.list_effective_object_ids` échoue à la création (`column o.is_test
   does not exist`), et toute la migration s'arrête là (`ON_ERROR_STOP`).
   Le manifeste intègre le présent lot en **19d**, après 18c et après toutes
   les fixtures des anciennes permissions de listes. Les deux nouveaux
   fichiers de tests SQL suivent immédiatement la migration.

`api.list_selection_emails` (§211) n'est pas touché et n'est pas un prérequis
de ce lot (elle continue de fonctionner indépendamment).

## Ce que fait la migration

1. **Création rouverte** (règle 1 du cadrage) : tout membre connecté d'une ORG,
   lecteurs compris, peut créer une liste — révoque le superuser-only de 17l.
2. **Cycle de vie** : `is_featured`, `feature_requested_at`, `last_activity_at`
   (horloge métier DISTINCTE de `updated_at`, backfillée sans bumper
   `updated_at` — trigger `trg_object_list_touch` désactivé pendant le
   backfill puis réactivé).
3. **Lecture/écriture resserrées** : plus de grille générale « tout l'ORG lit
   tout ». Pour un utilisateur ordinaire, chaque garde (`user_can_read_list` / `user_can_use_list` /
   `user_can_write_list` / `user_is_list_org_admin`) est scopée à l'ORG DE LA
   LIGNE (`internal.org_membership_active` / `internal.org_admin_rank` /
   `internal.org_is_admin`, jointure directe vers `ref_org_admin_role.rank`)
   ET au contexte org ACTIF de l'appelant (`l.org_object_id =
   api.current_user_org_id()`) — jamais l'agrégat global
   `api.current_user_admin_rank()` (qui ignore l'ORG et couvre TOUTES les
   organisations d'un même utilisateur). L'exception de reprise existante
   du superutilisateur de plateforme est conservée dans les gardes prévues
   au contrat ; elle n'ouvre ni une grille générale, ni la mise à la une
   directe d'une liste de collègue sans proposition.
4. **RPCs de cycle de vie** : `list_featured_lists`, `list_list_proposals`,
   `request_list_feature`, `review_list_feature`, `set_list_featured`,
   `restore_list`, `duplicate_list`, `ensure_list_share_link`.
5. **`api.mark_list_sent`** : nouvelle signature `(uuid, uuid)`,
   `service_role` UNIQUEMENT ; l'ancienne `(uuid)` (grantée `authenticated`)
   est supprimée. Le sender est vérifié via `internal.list_sender_authorized`
   — existence du compte ET adhésion active exigées avant tout bras
   propriétaire/featured (un compte supprimé ou un ancien membre ne peut
   jamais faire marquer une liste comme envoyée).
6. **Fuite photo/contacts fermée à la source** (`api.list_effective_object_ids`,
   branche statique) : `status = published ET is_test = current_user_test_realm()`
   — pas seulement « publié ». Comme les 3 grilles, le détail et le lien
   public dérivent TOUS leur ensemble effectif de cette même fonction, la
   fuite est fermée une seule fois pour toute lecture, y compris les lignes
   déjà en base avant ce lot.
7. **Concurrence** : `update_list`, `set_list_items`, `delete_list`,
   `share_list`, `review_list_feature`, `set_list_featured`, `restore_list`,
   `request_list_feature`, `ensure_list_share_link` verrouillent la ligne
   (`FOR UPDATE`) AVANT toute décision dépendant de `is_featured`/proposition.
8. **Coût des grilles** : `internal.list_grid_summary` résout l'ensemble
   effectif UNE fois (CTE `MATERIALIZED`) et en dérive compte/répartition/
   couverture — au lieu de 3 résolutions séparées par ligne de liste.
9. **Purge annuelle** : `internal.purge_expired_lists()` — `DELETE` au
   prédicat direct (PostgreSQL réévalue ce prédicat contre la dernière
   version de chaque ligne au moment de l'écriture — EvalPlanQual — sans code
   de verrouillage applicatif dédié). Inaccessible à tout client (`REVOKE ALL
   FROM PUBLIC, anon, authenticated, service_role`, aucun `GRANT`). Planifiée
   en cron quotidien UNIQUEMENT si `pg_cron` est installé — contrôle par nom
   de job, idempotent.
10. **`pg_temp` explicitement en dernier** (§208) sur TOUTES les fonctions
    `SECURITY DEFINER` nouvelles/remplacées de ce lot (org helpers, grilles,
    détail, actions, sender, purge, `list_effective_object_ids`).

## Ce qui N'EST PAS touché

`api.list_item_contacts`, `api.get_public_list_by_token`,
`api.resolve_list_object_ids` / `internal.resolve_list_object_ids`,
`api.list_selection_emails` — signatures ET corps strictement inchangés.

## Prérequis pour lecture published + corpus de test

`api.list_effective_object_ids` (statique) est la SEULE fonction modifiée hors
du périmètre strict "Listes" — elle appartient historiquement au module de
base (`migration_object_list.sql`), mais est réécrite ici pour fermer la
fuite décrite au point 6. Signature, ACL et branche DYNAMIQUE (délégation à
`api.resolve_list_object_ids`, non touchée) restent identiques.

## Validation locale exécutée

Conteneur `supabase_db_bertel`, base `postgres`, transaction annulée
(`BEGIN; … ROLLBACK;`), aucun `COMMIT`. Harnais :
`scratch/listes-2026-09-07/run-sql-review.cjs` (architecte) — charge les
prérequis canoniques (`migration_object_hard_delete.sql`,
`migration_test_org_isolation.sql`, la forme canonique de
`api.get_filtered_object_ids`, `migration_cards_batch_authorize_definer.sql`,
17k, 17l), puis la migration, puis `test_listes_cycle_vie.sql`.

- **Apply simple + tests** : `node scratch/listes-2026-09-07/run-sql-review.cjs`
  → S0 à S14 tous verts (voir `scratch/listes-2026-09-07/backend-report.md`
  pour le détail des cas couverts).
- **Double apply (idempotence)** :
  `node scratch/listes-2026-09-07/run-sql-review.cjs --twice` → même run vert,
  PLUS la preuve dédiée de l'architecte (semée avant le premier apply) :
  le backfill dérive `last_activity_at` de `last_sent_at` en préservant
  `updated_at` d'origine, ET la réapplication ne remplace PAS une horloge
  d'activité métier déjà établie par une valeur générique, ET le job cron
  reste unique après réapplication, ET le trigger `trg_object_list_touch`
  reste actif. `NOTICE: ARCHITECT backfill timestamp preservation and
  reapplication with existing business activity: PASS`.
- **Rollback** : `node scratch/listes-2026-09-07/run-rollback-review.cjs`
  (harnais local ad hoc, scratch uniquement — charge les mêmes prérequis,
  applique la migration, PUIS le corps du fichier rollback avec son `BEGIN;`/
  `COMMIT;` propre RETIRÉS EN MÉMOIRE, jamais sur le fichier committé, pour
  rester dans la MÊME transaction annulée) → colonnes de cycle de vie
  absentes, `api.mark_list_sent(uuid)` restaurée et `(uuid,uuid)` disparue,
  `api.list_featured_lists`/`internal.org_is_admin` disparues,
  `api.list_effective_object_ids` ne référence plus `is_test`, ET
  comportementalement `api.create_list` redevient superuser-only (17l) pour
  un lecteur ordinaire. `EXIT=0`, rien ne persiste (`object_list` vide et
  `object.is_test` absente après le `ROLLBACK` final).

Une sonde d'acceptation INDÉPENDANTE déposée par l'architecte,
`Base de donnée DLL et API/tests/test_listes_dynamic_cover_realm.sql`
(exécutable via `--fixture=` sur le même harnais), utilise le VRAI mécanisme
`org_config.is_test_org` + trigger de propagation (pas une fixture manuelle)
pour vérifier l'admission/la fuite cross-realm et la cohérence
grille/détail/rafraîchissement dynamique. Deux `NOTICE … PASS`, aucune fuite
de la sentinelle `REALM-SECRET`.

### Ce qui n'est PAS prouvé par ces tests

- **Le cron ne tourne pas réellement en quotidien** dans cette validation :
  seul son ENREGISTREMENT idempotent (`cron.job`, un seul job, bon nom/
  planification) est vérifié à l'intérieur d'une transaction annulée. Aucune
  exécution planifiée réelle n'a eu lieu.
- **Aucune concurrence multi-session réelle** n'a été exercée (deux
  connexions simultanées sur le même verrou `FOR UPDATE`) : le harnais est
  transactionnel et séquentiel. La protection contre la course est vérifiée
  par LECTURE du code (verrou posé avant toute décision) et par un test
  séquentiel de réutilisation de lien (S13), pas par une exécution parallèle
  réelle.
- **« État EXACT de production » n'est pas prouvé.** Le rollback restaure les
  corps SOURCES historiques copiés verbatim depuis `migration_object_list.sql`,
  17k et 17l. La revue vérifie leur provenance ; les assertions exécutées
  vérifient la structure et les comportements détaillés ci-dessus, sans
  comparer exhaustivement tous les corps octet par octet. Aucune capture
  des définitions LIVE n'avait été faite lors des essais locaux ; le préflight
  (`scratch/listes-2026-09-07/live-preflight-verified.md`) est un agrégat de
  catalogue/comptages (lecture seule), pas un dump de corps de fonction. Une
  éventuelle divergence entre les fichiers sources et le live réel (patch
  appliqué en direct, non reporté dans un fichier) ne serait pas détectée par
  ce rollback. Une capture des définitions live et une sauvegarde des tables
  ont ensuite été réalisées juste avant le déploiement effectif (voir ci-dessous).

### Interface et envoi — vérification indépendante finale

- `npm run typecheck` réussit avec le véritable `tsconfig.app.json`, tests
  compris. La compilation initiale avec le seul `tsconfig.json` n'était pas
  suffisante ; les fixtures incorrectement typées ont été corrigées.
- 19 suites Jest concernées réussissent : 208 tests lors du passage complet
  (services, composition, grille, Explorer, permissions, couvertures, route
  d'envoi, modèle d'e-mail et aide). Trois cas ont ensuite été ajoutés
  (confirmation de duplication et droits perdus pendant une sauvegarde en
  file). Les cinq suites de composition ont été relancées : 33 tests réussis,
  dont 15 de cycle de vie. Cela couvre 211 cas distincts au total.
- Parcours Edge avec le vrai serveur Next local, un contexte navigateur
  isolé et des réponses Auth/RPC/SMTP simulées : membre et admin, grilles,
  archives, propositions, couvertures, envoi sans écriture en lecture seule,
  écran de 320 et 390 pixels sans débordement horizontal.
- Contre-vérification navigateur des derniers correctifs : révocation du
  lien après ouverture du modal, erreur visible et aucune copie ; copie du
  token fraîchement renvoyé ; sauvegarde différée qui bloque la duplication
  jusqu'à sa résolution ; droits retirés avec une note locale, refus de la
  copie conservant note et page, puis acceptation copiant uniquement la
  version enregistrée sans écrire sur l'original. Aucune erreur JavaScript.
- Nom, destinataire et introduction sont bien non modifiables en lecture
  seule dans le navigateur. Une sauvegarde en attente revalide `canEdit`
  avant son exécution ; le test dédié échoue sans cette garde et réussit
  après sa restauration. Les vrais échecs réseau restent signalés.
- Le bandeau expliquant le brouillon non enregistrable a été inspecté sur
  capture. Le presse-papiers et l'envoi sont simulés : aucun message réel
  n'a été envoyé et aucun lien réel n'a été créé par ces essais.

Harnais et résultats : `scratch/listes-2026-09-07/visual-review.cjs`
(options `--admin`, `--edge-cases`, `--rights-loss`) et fichiers
`visual-review-*-results.json`. Ces fichiers de travail sont ignorés par Git.
Le manifeste SQL frais complet et le build Next de production n'ont pas été
relancés pour ce lot ; les contrôles exécutés ci-dessus sont ciblés. La
validation d'Auth et de SMTP réels reste une vérification après déploiement.

## État live constaté avant ce lot (lecture seule, préflight architecte)

Source : `scratch/listes-2026-09-07/live-preflight-verified.md`, instant
2026-09-07T05:09:28Z. Aucun DDL/DML/RPC exécuté pour ce préflight.

- 12 listes ; 10 dont `max(created_at, updated_at, last_sent_at)` est déjà
  antérieur au seuil de 21 jours (deviendront `is_archived` dès le premier
  calcul post-migration — c'est un résultat ATTENDU et déjà validé par le PO
  dans le cadrage, pas une régression).
- 0 liste au seuil d'un an à cet instant ; comptes à revérifier au déploiement.
- 0 lien de partage activé ; 12 couvertures explicites vides (la couverture
  effective calculée prendra le relais pour l'affichage).
- `pg_cron` installé ; `object.cached_main_image_url` présent.
- `object_list` : 23 colonnes préexistantes, les 3 nouvelles colonnes absentes
  (backfill à exécuter par cette migration).
- Seul trigger utilisateur : `trg_object_list_touch` (activé).
- Ancienne signature `mark_list_sent(uuid)` présente et exécutable par
  `authenticated` ; `internal.purge_expired_lists` absente.
- Les ACL `service_role` n'ont PAS été interrogées par ce préflight — ne pas
  déduire « authenticated seul » de la seule vérification anon/authenticated.

## Application effective — 7 septembre 2026

- Préflight à 06:48 UTC : cible primaire confirmée, 12 listes, 10 au seuil
  d'archivage, aucune au seuil de suppression ; migration encore absente.
- Avant application : sauvegarde PostgreSQL au format custom de
  `public.object_list` et `public.object_list_item` (27 546 octets), et capture
  des définitions/propriétaires/ACL des fonctions remplacées. Les fichiers
  restent locaux dans `scratch/listes-2026-09-07/`, hors Git.
- Application atomique de la seule migration ciblée, avec enregistrement dans
  `supabase_migrations.schema_migrations`. SHA-256 du fichier appliqué :
  `860f2a1668a68e4890a8a86e6121f5b5c857bccfbd1592cf6c78762ecb855352`.
- Contrôle en lecture seule à 06:53 UTC : les 12 listes existent toujours,
  10 sont archivées, aucune n'est éligible à la purge, aucune activité n'est
  nulle. L'ancienne signature `mark_list_sent(uuid)` est absente ; la nouvelle
  est exécutable par `service_role`, pas par `authenticated`.
- Un seul job `purge-expired-lists` est actif à `0 4 * * *` (04:00 UTC).
  La migration n'a exécuté aucune purge. L'exécution quotidienne effective
  et les parcours réels après déploiement de l'application restent à observer.

Les journaux locaux sont `deploy-preflight.log`, `deploy-apply.log` et
`deploy-verify.log` dans le même dossier de travail. Les sauvegardes ne sont
pas publiées avec le code. La route d'envoi mise à jour doit être déployée
avec l'interface via Codify pour utiliser la nouvelle signature serveur.

## Procédure de déploiement et retour arrière

1. Revérifier les comptes d'archivage et de suppression, les sauvegardes
   habituelles et les prérequis d'isolation en cible. Présenter le périmètre
   réel conformément au cadrage avant toute application distante.
2. Coordonner la publication de l'interface et de la route d'envoi avec
   `supabase/migrations/20260907044528_listes_personnelles_une_cycle_vie.sql`.
   La nouvelle route utilise `mark_list_sent(uuid, uuid)` côté serveur ;
   l'ancienne signature est supprimée. Ne pas rejouer le manifeste complet.
3. Vérifier `to_regprocedure('internal.purge_expired_lists()') IS NOT NULL`
   avant de laisser `maintenance.sql` (re)programmer le job — le bloc de
   `maintenance.sql` porte désormais cette garde explicitement.
4. Confirmer via `SELECT * FROM cron.job WHERE jobname='purge-expired-lists';`
   qu'un seul job existe, avec la planification attendue (`0 4 * * *`).
5. Vérifier les parcours membre et administrateur en cible et l'exécution
   ultérieure du job. La migration n'exécute aucune purge immédiate ; les
   listes seulement archivées conservent leurs liens selon leurs réglages.
6. Rollback disponible : `Base de donnée DLL et API/rollback/rollback_listes_personnelles_une_cycle_vie.sql`
   — restaure les corps sources historiques (17k/17l/base) et supprime les
   3 colonnes de cycle de vie (perte définitive de tout `is_featured`/
   `feature_requested_at`/`last_activity_at` posé depuis l'application).
   Revenir également à la version précédente de l'interface et de la route
   serveur. Ce script ne restaure pas les listes déjà supprimées par le cron.
7. Régénérer le graphe DB depuis le catalogue vivant après application,
   conformément à `tools/db-graph/README.md`. Les fixtures locales annulées
   ne constituent pas un nouveau catalogue de production.
