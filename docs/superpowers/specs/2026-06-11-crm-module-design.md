# Module CRM — design (P2.2)

**Date :** 2026-06-11
**Statut :** validé en brainstorming (6 décisions de cadrage confirmées par d.philippe@otisud.com)
**Référence roadmap :** `lot1_mapping_decisions.md` §24, Phase 2 — P2.2 « CRM (B3): RPCs over `crm_task`/`crm_interaction` (+ `incident_report`); wire kanban list + move-write + timeline. **L.** »

---

## 1. État des lieux (vérifié live le 2026-06-11)

### Backend
- `crm_interaction` : **3 175 lignes live** (import Berta 2 complet, batch `old-data-berta2-all-20260501-01`), couvrant **520 objets**. Toutes de type `note` ; 3 172 avec `actor_id` ; toutes datées.
- `crm_task`, `incident_report`, `actor_consent` : **0 ligne**.
- RLS : `admin_crm_interaction` / `admin_crm_task` / `admin_incident_report` = `FOR ALL USING (auth.role() IN ('service_role','admin'))` — **les agents OTI authentifiés ne peuvent ni lire ni écrire**. `auth.role()` non wrappé (reliquat §39).
- **Aucune RPC** CRM ; les seules fonctions touchant ces tables sont des triggers : `api.auto_populate_interaction_subject()` (sujet auto), `api.create_crm_artifacts_from_incident()` (incident → interaction+task), `api.log_publication_proof_interaction()`.
- Permission **`write_crm_notes` déjà seedée** dans `ref_permission` (« Écrire des notes CRM », 0 grant). Helper `api.user_has_permission(p_permission_code)` opérationnel (SP-2).

### Dette d'import documentée (`lot1_crm_import_plan.md` §4)
- `demand_topic_id` : **NULL partout**. La résolution est stockée dans `extra.oti_demand_topic_id` / `extra.oti_demand_topic_code` (**1 344 lignes** en portent une) parce que les 20 sujets OTI ont été seedés sous le domaine `crm_demand_topic_oti` → partition **`ref_code_other`** (DEFAULT), alors que la FK cible la partition `ref_code_demand_topic` (domaine `demand_topic`, 11 codes génériques jamais référencés).
- `request_mood_id` / `response_mood_id` : **NULL partout**. Humeurs brutes dans `extra.humeur_raw` (🙂 ×1146, 😃 ×909, `ok` ×575, 🤔 ×502, 😡 ×33, 😭 ×7, 😨 ×3) ; `extra.humeur_apres_raw` toujours NULL. La FK cible `ref_code_mood` qui est un **vocabulaire d'envies touristiques** (aventure, bien-être, détente…) — sémantiquement inadapté au sentiment relationnel : mapper dessus serait un contresens (principe « pas d'enum ambigu »).

### Vérifications de non-référence (live, 2026-06-11)
- 0 ligne `object_taxonomy` ou `ref_code_taxonomy_closure` ne référence ni les 20 codes OTI ni les 11 `demand_topic` génériques ni les 22 `demand_subtopic`.
- 0 ligne `crm_interaction.demand_subtopic_id` non NULL.
- Partitionnement `ref_code` : LIST par `domain`, partitions dédiées par domaine + `ref_code_other` DEFAULT. Le domaine `crm_sentiment` n'existe pas (0 ligne) → créer sa partition est sans déplacement de données.

### Frontend
- `src/views/CrmPage.tsx` (route `/crm`) : kanban + timeline branchés sur les stubs `listCrmTasks` / `listCrmTimeline` (`rpc.ts:447-474`) qui renvoient `[]` hors mode démo. Le déplacement kanban est purement local (état React, rien persisté). Présence temps réel (`usePresenceRoom('crm:tasks')`) fonctionnelle. Bouton « Simuler une note » = artefact démo.
- `types/domain.ts` : `CrmTask.status = 'todo'|'doing'|'done'` — **désaligné** de l'enum DB `crm_task_status = todo/in_progress/done/canceled/blocked`.
- Éditeur §19 `SectionCrm.tsx` : lecture seule assumée (raison affichée via `interactionsUnavailableReason`, posée en dur par le parser) ; les chips sujets et le select humeur sont des mocks ; boutons d'authoring désactivés. Conforme no-write-trap, mais sans données réelles.
- README : prétend que les modules non câblés « show an explicit error » — faux (rendu vide silencieux), inexactitude déjà tracée (§24).

---

## 2. Décisions de cadrage (verrouillées ce jour)

| # | Question | Décision |
|---|----------|----------|
| 1 | Périmètre | **P2.2 + §19 éditeur** : page CRM réelle (timeline + kanban + authoring) ET §19 en données réelles avec authoring. `incident_report` reste différé (0 ligne, trigger prêt). |
| 2 | Modèle d'accès | **Lecture = membres de l'ORG publisher de l'objet** (jamais anon, jamais cross-ORG). **Écriture = permission `write_crm_notes`** + admin ORG + superuser. |
| 3 | Dette d'import | **Backfill complet** : sujets ET sentiments deviennent des FK peuplées. |
| 4 | Architecture | **A — RPC-only, authorize-once + SECURITY DEFINER (§36)** ; tables de base verrouillées, PII jamais en PostgREST direct. |
| 5 | Vocabulaire sujets | **Fusion + retrait** : les 20 codes OTI migrent vers le domaine `demand_topic` (partition cible de la FK) ; les 11 génériques + 22 sous-sujets non référencés sont supprimés. Une seule source de vérité. |
| 6 | Vocabulaire sentiments | **Nouveau domaine `crm_sentiment`** (partition dédiée) + **renommage** `request_mood_id`/`response_mood_id` → `request_sentiment_id`/`response_sentiment_id` (0 consommateur aujourd'hui) + FK re-pointées. |

---

## 3. Design

### 3.1 Autorisation (nouveaux helpers, patterns SP-1/SP-2/§35)

- `api.current_user_crm_object_ids()` → `SETOF text` : ids des objets dont une ORG de l'utilisateur est **publisher** (`object_org_link` rôle publisher × `user_org_membership`). Forme **set-based** (§35) : consommée uniquement en `IN (SELECT …)`, un seul InitPlan. `STABLE`, `SECURITY DEFINER`.
- `api.user_can_read_crm(p_object_id text)` → bool : superuser OU `p_object_id IN current_user_crm_object_ids()`. Scalaire par-ligne réservé aux gardes ponctuelles (jamais dans un scan large).
- `api.user_can_write_crm(p_object_id text)` → bool : superuser OU admin de l'ORG publisher OU (membre de l'ORG publisher ET `api.user_has_permission('write_crm_notes')`).

Toute RPC CRM **s'auto-autorise** (§36) : jamais confiance dans la liste d'ids du client ; filtrage d'entrée une seule fois puis lecture RLS-free. Aucun gate field-level à répliquer (les données CRM n'ont pas d'arme « published » — elles sont org-internes par nature).

### 3.2 RPCs (SECURITY DEFINER, `SET search_path = public, api, internal` ⇒ `gen_random_uuid()`, invariant §29 ; GRANT EXECUTE à `authenticated` seulement — pas `anon`)

| RPC | Rôle | Notes |
|-----|------|-------|
| `api.list_crm_timeline(p_object_id text DEFAULT NULL, p_topic_code text DEFAULT NULL, p_interaction_type text DEFAULT NULL, p_sentiment_code text DEFAULT NULL, p_before timestamptz DEFAULT NULL, p_limit int DEFAULT 50)` | Timeline org-wide (ou mono-objet) enrichie : nom objet, nom acteur, libellé sujet, sentiment, auteur. | Pagination **keyset** sur `occurred_at DESC, id` (3 175 lignes et ça grossira). Scope = `object_id IN (SELECT api.current_user_crm_object_ids())`. |
| `api.list_crm_tasks()` | Tâches kanban de l'ORG, enrichies (nom objet, interaction liée). | Même scope. |
| `api.save_crm_task(p_payload jsonb)` | Upsert tâche (création + édition + déplacement de lane = même RPC, `status` dans le payload). | Assert `user_can_write_crm(object_id)` ; valide `status`/`priority` contre les enums. |
| `api.list_object_crm(p_object_id text)` | Interactions + tâches d'UN objet pour la §19 éditeur. | PII volontairement **hors** de `get_object_resource`. Assert `user_can_read_crm`. |
| `api.save_crm_interaction(p_payload jsonb)` | Upsert interaction (type, sujet via code, corps, sentiment, direction, dates, acteur). | Assert `user_can_write_crm` ; le trigger sujet-auto existant complète. `owner` = `auth.uid()` à la création. |
| `api.delete_crm_interaction(p_id uuid)` | Suppression (corrections de saisie). | Assert `user_can_write_crm` sur l'objet de la ligne. Les lignes importées (`source='import_berta2_crm'`) sont supprimables — historique métier, pas archive légale. |

Flags advisor `security_definer_function_executable` **attendus et documentés** (même classe que `get_object_cards_batch`, §36).

### 3.3 Migration vocabulaires + backfill (`migration_crm_module.sql`, idempotente)

1. **Partition** `ref_code_crm_sentiment FOR VALUES IN ('crm_sentiment')` + seeds (6 codes) :
   `tres_positif` 😃, `positif` 🙂 + `ok`, `interrogatif` 🤔, `mecontent` 😡, `tres_mecontent` 😭, `inquiet` 😨 (libellés FR ; l'emoji source reste dans `extra.humeur_raw` — source préservée).
2. **Fusion sujets** : `UPDATE ref_code SET domain='demand_topic' WHERE domain='crm_demand_topic_oti'` (le row-movement inter-partitions est automatique). Positions conservées ; pas de collision de codes (vérifié).
3. **Retrait** des 11 `demand_topic` génériques + 22 `demand_subtopic` : DO block **fail-closed** qui re-vérifie 0 référence (object_taxonomy, closure, crm_interaction) avant DELETE.
4. **Renommage + re-pointage FK** : `request_mood_id`→`request_sentiment_id`, `response_mood_id`→`response_sentiment_id` ; DROP des FK vers `ref_code_mood`, ADD FK vers `ref_code_crm_sentiment(id)`.
5. **Backfill sujets** : `demand_topic_id = (extra->>'oti_demand_topic_id')::uuid` quand l'id existe dans `ref_code_demand_topic` (~1 344 lignes attendues) ; compteur de non-résolus journalisé.
6. **Backfill sentiments** : mapping `extra->>'humeur_raw'` → code (table VALUES inline) → `request_sentiment_id`. Attendu : 3 175 lignes mappées (7 valeurs distinctes, toutes couvertes).
7. **Hygiène RLS** : DROP des 2 `FOR ALL` `admin_crm_*` → familles par commande `admin_ins/upd/del_crm_interaction|crm_task` + `admin_read_*`, prédicat wrappé `(select auth.role())` (§39/§47). Les tables restent verrouillées pour `authenticated` (accès uniquement via RPC). `incident_report` non touché (hors périmètre).
8. **Index** : vérifier/créer `crm_interaction (object_id, occurred_at DESC)` (timeline + §19) et `crm_task (object_id)`, `crm_task (status)` (kanban).

### 3.4 Frontend

- **Service** : nouveau `src/services/crm.ts` (appels RPC + parsers + types payload) ; les stubs de `rpc.ts` re-exportent/délèguent ; mode démo conservé (mocks existants réalignés sur les vrais enums).
- **Types** : `CrmTask.status` réaligné sur `todo/in_progress/done/canceled/blocked` ; nouveau type `CrmInteraction` (sujet, type, sentiment, objet, acteur, auteur, dates).
- **`CrmPage`** : timeline réelle paginée (« charger plus », filtres sujet/type/objet) ; kanban réel 3 lanes principales (todo / in_progress / done ; `blocked`/`canceled` accessibles via le détail de tâche) ; déplacement de lane **persisté** (optimistic update + rollback) ; création de tâche et d'interaction (formulaires modaux) ; bouton « Simuler une note » supprimé ; présence temps réel conservée. Contrôles d'écriture désactivés avec raison si `write_crm_notes` absent (no-write-trap).
- **§19 `SectionCrm`** : loader dédié via `list_object_crm` (hors `get_object_resource`, pattern `Promise.allSettled` + `unavailableReason` gracieux) ; chips sujets = **distribution réelle** des sujets de l'objet ; journal = interactions réelles (sujet, sentiment réel, auteur, date) ; « + Nouvelle interaction » actif avec permission, sinon désactivé avec raison ; le faux select humeur devient l'affichage/édition du sentiment réel ; stats recalculées sur les vraies données.
- **README** : corriger la phrase « show an explicit error » pour le CRM (résorbe l'inexactitude tracée §24).

### 3.5 Vérification & déploiement

- **Tests SQL CI** : `tests/test_crm_module.sql` — fixtures personas (membre ORG publisher lit ses interactions ; étranger/anon lit zéro ; écriture refusée sans `write_crm_notes`, acceptée avec ; admin ORG passe) + assertions backfill (≥1 344 sujets, 3 175 sentiments, 0 code générique restant, partition sentiment peuplée) + idempotence (double apply).
- **Tests FE (Jest, TDD)** : parsers `crm.ts`, mapping lanes/enums, `CrmPage` (move persisté, gating permission), `SectionCrm` (rendu réel, gating, raison affichée).
- **Déploiement** : migration via MCP `apply_migration` + `NOTIFY pgrst, 'reload schema'` ; ajout **manifeste + runbook** (`docs/SQL_ROLLOUT_RUNBOOK.md`, étape suivante du manifeste — invariant deploy-integrity P0.1, gate fresh-apply) ; vérification live (comptages, probe persona, advisor).
- **Documentation** : entrée §56 au journal `lot1_mapping_decisions.md` (décisions 1-6 + mapping sentiments) ; tracker `WORKFLOW.md` (P2.2 fait ; différés : incident_report, actor_consent, humeur_apres jamais peuplée) ; proposition CLAUDE.md : invariant d'accès CRM (lecture = membres ORG publisher, écriture = `write_crm_notes` ; PII jamais en PostgREST direct — RPC-only).
- **Mémoire MCP** : rafraîchie après le journal, conformément au workflow.

---

## 4. Non-objectifs (différés documentés)

| Différé | Raison | Débloqué par |
|---------|--------|--------------|
| `incident_report` (déclaration d'incident → artefacts CRM via trigger existant) | 0 ligne, hors décision de périmètre #1 | Besoin métier réel ; le trigger est prêt |
| `actor_consent` / canaux | Passe contrat PII/consentement déjà trackée (WORKFLOW.md) | Contrat PII |
| `response_sentiment_id` (humeur après) | Source toujours NULL dans l'import ; la colonne existe, l'UI ne l'expose pas | Premier usage métier |
| Notifications / temps réel au-delà de la présence existante | Hors périmètre P2.2 | Phase ultérieure |
| Policy `incident_report` FOR ALL → par commande | Table hors périmètre | Sa propre passe (avec le module incidents) |

---

## 5. Critères d'acceptation

1. Un membre OTI **avec** `write_crm_notes` crée une interaction depuis `/crm` et depuis §19 ; elle apparaît dans la timeline et le journal §19 avec sujet et sentiment.
2. Un membre OTI **sans** la permission voit la timeline et le kanban (lecture) mais les contrôles d'écriture sont désactivés avec raison ; toute tentative RPC directe échoue proprement.
3. Un utilisateur d'une autre ORG (ou anon) ne lit **aucune** donnée CRM, ni par RPC ni par PostgREST direct.
4. Le déplacement d'une carte kanban persiste (`crm_task.status`) et survit au rechargement.
5. ≥ 1 344 interactions ont un `demand_topic_id` résolu ; 3 175 ont un `request_sentiment_id` ; les filtres timeline par sujet/sentiment fonctionnent en SQL (pas de JSONB).
6. Le domaine `demand_topic` contient exactement les 20 sujets OTI ; `crm_demand_topic_oti` et les 33 codes génériques n'existent plus.
7. Gate fresh-apply CI vert (migration au manifeste/runbook) ; `test_crm_module.sql` vert ; suite Jest verte ; tsc propre.

---

## 6. Risques & points d'attention

- **Row-movement partitionné** (étape 2) : l'UPDATE de domaine déplace physiquement les lignes `ref_code_other` → `ref_code_demand_topic` ; les UUID sont stables donc `extra.oti_demand_topic_id` reste résoluble. Vérifier qu'aucun trigger sur `ref_code` ne s'y oppose.
- **`auth.role() = 'admin'`** dans les policies actuelles : vocabulaire JWT legacy ; la famille par commande conservera la même sémantique service_role/admin, wrappée — sans élargir.
- **Suppression d'interactions importées** : autorisée (décision : historique métier corrigeable). Si l'OTI veut un verrou sur l'historique importé, ajouter plus tard un gate sur `source`.
- **`subject` auto-généré** : le trigger remplit « Note interne » etc. ; après backfill des sujets, les subjects existants ne sont **pas** régénérés (données importées telles quelles) — seul l'affichage utilise le libellé du sujet résolu.
