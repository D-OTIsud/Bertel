# Opening periods — plan de réparation

**Statut** : plan à valider — **AUCUNE EXÉCUTION**.
**À lire avant** : [`opening-periods-migration-diagnostic.md`](opening-periods-migration-diagnostic.md).
**Hard rule** : aucune écriture en production tant que ce plan n'a pas été revu et que le SQL draft n'a pas été testé sur un environnement de staging isolé.

---

## 0. Périmètre et hors-périmètre

### Périmètre — phase 1 (cette doc + le SQL draft)
- **Réparation structurelle** des 257 lignes `public.opening_period` issues de l'import legacy `berta_v2_csv_export`, source sheet `form_j_h`.
- Collapse des slots AM / PM jumeaux en **une seule période** par `horaires_id`.
- Nettoyage des noms placeholder (`Berta v2 AM` / `Berta v2 PM`).
- Conservation intégrale des informations utiles (horaires, jours, type de planning).
- Aucune modification de structure (DDL).

### Hors périmètre
- **Phase 2** — comblement de la couverture pour les 497 objets HLO / HOT / CAMP qui n'ont AUCUNE période. Projet produit + données séparé.
- **Phase 3** — règles UI (badges « incomplet », fallback explicite). Repris après validation phase 1.
- Modification de tables `ref_*`.
- Modification du schéma DDL.
- Changement de la fonction `api.commit_staging_to_public` ou autre RPC.

---

## 1. Pré-requis

| # | Pré-requis | Statut |
|---|---|---|
| P1 | Diagnostic validé par produit + tech | À faire |
| P2 | Accès à un environnement Supabase **staging** isolé (jamais prod directement) | À vérifier |
| P3 | Backup `pg_dump --schema-only --schema=public --table='opening_*'` + `pg_dump --data-only --schema=public --table='opening_*'` avant exécution | À planifier |
| P4 | Snapshot des compteurs avant exécution (voir §4) | Inclus dans le SQL draft |
| P5 | Fenêtre de maintenance ou freeze des écritures `opening_*` durant la transaction | À planifier |
| P6 | Validation que `staging.opening_period_temp` contient toujours les 257 lignes intactes | OUI (vérifié 2026-05-19) |

---

## 2. Invariants à respecter

| # | Invariant | Vérification post-repair |
|---|---|---|
| I1 | Aucune perte de couples (object_id × horaires_id source) | `SELECT COUNT(DISTINCT split_part(source_period_id,':',1)||'-'||object_id) = 191` avant et après |
| I2 | Aucun perdu côté heures saisies | Comparaison des tuples (start_time, end_time, weekday) avant / après — checksum |
| I3 | Aucune FK violation (CASCADE OK) | Aucune ligne orpheline `opening_schedule` / `opening_time_period` / `opening_time_frame` / `opening_time_period_weekday` |
| I4 | Pas d'élévation de privilège, pas de désactivation de RLS | Aucun `ALTER ... DISABLE ROW LEVEL SECURITY` dans le draft |
| I5 | Aucun objet `public.object` impacté | Les `object_id` ne sont jamais modifiés ; uniquement les lignes `opening_*` |
| I6 | Aucun trigger désactivé hors transaction de réparation | Si désactivation nécessaire, ré-activation forcée dans `EXCEPTION` block |
| I7 | Idempotence | Re-exécution doit être no-op si état déjà réparé |

---

## 3. Stratégie de réparation

### 3.1 Vue d'ensemble

L'approche **« reconstruction par regroupement »** :

1. Construire en CTE / table temp les **191 horaires_ids canoniques** déduits de `public.opening_period` (préfixe `source_period_id` avant `:`).
2. Pour chacun, agréger ses slots AM / PM existants (1 ou 2 lignes).
3. Créer **une nouvelle** ligne `opening_period` (sans `:am`/`:pm` dans `source_period_id`).
4. Y rattacher **une nouvelle** ligne `opening_schedule` avec le `schedule_type_id` déduit.
5. Pour chaque slot existant, créer **un nouveau** `opening_time_period` avec `note='AM'` ou `'PM'`, puis y recopier le `opening_time_frame` et les `opening_time_period_weekday`.
6. **Supprimer** les anciennes lignes `opening_period` cassées (CASCADE supprime la chaîne descendante).

Toute la transaction enveloppée dans un `BEGIN; ... COMMIT;` avec checkpoints d'assertion.

### 3.2 Pourquoi pas un simple `UPDATE` ?

L'éclatement AM / PM crée deux **chaînes complètes** côté DB : un simple `UPDATE` ne peut pas fusionner deux `opening_period` car les sous-tables sont rattachées via FK. Il faut reconstruire la chaîne nouvelle et supprimer l'ancienne — toujours dans la même transaction.

### 3.3 Nommage des nouvelles périodes

- `name = NULL` : conforme à la règle canonique « si aucun nom métier réel, ne pas inventer ».
- `name_i18n = NULL`.
- `source_period_id = horaires_id` (sans suffixe `:am`/`:pm`).
- `all_years = true`, `date_start = NULL`, `date_end = NULL` : conforme à la source qui n'a fourni aucune date.
- `extra = jsonb_build_object('legacy_repair', 'opening-periods-repair-2026-05-19', 'source_sheet', 'form_j_h')` pour traçabilité.

### 3.4 Nommage des `opening_time_period.note`

- `note = 'AM'` si le slot vient d'un suffixe `:am`.
- `note = 'PM'` si le slot vient d'un suffixe `:pm`.
- `closed = false`.

### 3.5 `opening_schedule`

- `name = NULL`, `name_i18n = NULL`.
- `note = NULL`, `note_i18n = NULL`.
- `schedule_type_id` repris de la première ligne du groupe (les AM/PM jumeaux partagent toujours le même schedule_text).
- `extra = jsonb_build_object('legacy_repair', 'opening-periods-repair-2026-05-19')`.

---

## 4. Snapshot avant / après (assertions)

Le SQL draft inclut :

```sql
-- AVANT
SELECT 'before' AS phase,
       (SELECT COUNT(*) FROM public.opening_period)              AS n_period,
       (SELECT COUNT(*) FROM public.opening_schedule)            AS n_sched,
       (SELECT COUNT(*) FROM public.opening_time_period)         AS n_tp,
       (SELECT COUNT(*) FROM public.opening_time_frame)          AS n_tf,
       (SELECT COUNT(*) FROM public.opening_time_period_weekday) AS n_tpw,
       (SELECT COUNT(DISTINCT split_part(source_period_id,':',1)||'-'||object_id)
          FROM public.opening_period)                            AS n_horaires_ids;

-- APRÈS (attendu)
-- n_period           = 191   (1 par horaires_id × object)
-- n_sched            = 191
-- n_tp               = 257   (1 par slot AM/PM original)
-- n_tf               = 257
-- n_tpw              = 1051
-- n_horaires_ids     = 191
```

Le rapport `n_tpw` doit rester **identique** (1 051) : on ne perd aucune association jour ↔ tranche.

---

## 5. Sécurité d'exécution

| # | Mesure | Détail |
|---|---|---|
| S1 | `BEGIN; ... COMMIT;` enveloppant | Toute la repair en une transaction. Rollback automatique en cas d'erreur. |
| S2 | `LOCK TABLE` sur les 5 tables `opening_*` en mode `EXCLUSIVE` (mais pas `ACCESS EXCLUSIVE`) | Empêche les écritures concurrentes pendant la réparation. Permet les lectures uniquement via une vue read-uncommitted, sinon bloque. |
| S3 | Assertions DO/RAISE EXCEPTION | Si après la transaction `COUNT(opening_period) ≠ 191` ou `COUNT(opening_time_period_weekday) ≠ 1051`, ROLLBACK. |
| S4 | Préfixe ID standardisé | Les nouvelles UUID sont générées via `uuid_generate_v4()` ; identifiables a posteriori via `extra->>'legacy_repair'`. |
| S5 | Pas de désactivation RLS | Le compte d'exécution doit avoir `BYPASSRLS` (rôle `postgres` / superuser) ; sinon la transaction échouera proprement. |
| S6 | Pas de `TRUNCATE` | Suppression uniquement par `DELETE` ciblé avec `WHERE source_period_id LIKE '%:am' OR source_period_id LIKE '%:pm'`. |
| S7 | Rejouabilité | La requête de DELETE finale est ciblée précisément ; si la repair est rejouée, le second passage ne trouve plus de ligne à supprimer. |

---

## 6. Plan d'exécution proposé

### Étape 1 — Dry-run sur staging
1. Restaurer un dump récent de production dans un environnement Supabase staging isolé.
2. Lancer le SQL draft (voir [`opening-periods-repair-draft.sql`](opening-periods-repair-draft.sql)) avec un `ROLLBACK` final au lieu de `COMMIT`.
3. Comparer les snapshots avant / après.
4. Vérifier manuellement 5 cas (3 avec AM+PM, 2 avec AM seul).

### Étape 2 — Run réel sur staging
1. Lancer le SQL draft avec `COMMIT`.
2. Re-générer les CSV d'inventaire (`live-tables.csv`, `live-columns.csv` filtrés sur opening_*) et comparer.
3. Vérifier que les fonctions `api.build_opening_period_json`, `api.get_opening_time_slots`, `api.is_object_open_now` renvoient des résultats cohérents pour 5 objets test.

### Étape 3 — Run en production
1. Backup `pg_dump --data-only` des 5 tables `opening_*` (rétention 30 jours min.).
2. Fenêtre de maintenance avec freeze des écritures `opening_*` (5–10 min suffisent).
3. Lancer le SQL draft avec `COMMIT`.
4. Vérifier les snapshots.
5. Re-générer les CSV d'inventaire et `bertel-object-surface-report.md` pour acter le repair dans le workbench.

### Étape 4 — Communication
- Annoncer la repair dans `docs/schema-workbench/mapping-vs-live-schema-gaps.md` (G-OPENING-1 passe de `blocker` à `resolved phase 1, phase 2 pending`).
- Ouvrir un ticket dédié à la phase 2 (coverage accommodation).

---

## 7. Critères de succès phase 1

Tous doivent être vrais après exécution :

- ✅ `COUNT(public.opening_period) = 191` (et plus jamais 257)
- ✅ Aucune ligne `opening_period` avec `name LIKE 'Berta v2 %'`
- ✅ Aucune ligne `opening_period` avec `source_period_id LIKE '%:am' OR LIKE '%:pm'`
- ✅ Chaque `opening_period` du repair a `source_period_id` = un horaires_id canonique
- ✅ Chaque `opening_period` du repair a `extra->>'legacy_repair' = 'opening-periods-repair-2026-05-19'`
- ✅ `COUNT(public.opening_time_period_weekday) = 1051` (inchangé)
- ✅ Les 78 objets précédemment éclatés ont maintenant **une seule** période chacun
- ✅ Pour chacun de ces 78 objets, leur unique `opening_schedule` a **2 (ou +) `opening_time_period`** (un par slot original)
- ✅ Aucune erreur retournée par `api.build_opening_period_json` sur un échantillon de 50 objets

---

## 8. Plan de rollback

Si la phase 1 cause un problème détecté après le COMMIT :

1. `pg_dump` data-only des tables `opening_*` à disposition (backup étape 3.1).
2. Procédure de restore :
   ```sql
   BEGIN;
   DELETE FROM public.opening_time_period_weekday;
   DELETE FROM public.opening_time_frame;
   DELETE FROM public.opening_time_period;
   DELETE FROM public.opening_schedule;
   DELETE FROM public.opening_period;
   -- restore depuis pg_dump
   \i opening_periods_backup_pre_repair.sql
   COMMIT;
   ```
3. Re-générer `live-tables.csv` pour vérifier que les comptes initiaux sont restaurés (257 / 257 / 257 / 257 / 1 051).

---

## 9. Risques résiduels acceptés

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Un trigger en cours d'écriture sur `opening_*` durant la fenêtre | basse | moyen | LOCK TABLE EXCLUSIVE |
| Un PR frontend en cours créerait des `opening_period` parallèlement | basse | bas | Communication équipe pendant la fenêtre |
| Le repair valide structurellement mais produit du contenu vide en UI | basse | basse | Les noms `NULL` sont la nouvelle vérité ; l'UI doit afficher « Horaires d'ouverture » par défaut (à coordonner côté UI ensuite) |
| Un futur batch d'import re-ferait l'erreur 1-source-row=1-period | moyen | élevé | Ne pas réexécuter le pipeline historique sans patch ; à terme, écrire une fonction `api.commit_staging_to_public_opening_v2` correcte et la versionner |

---

## 10. Décisions à prendre (à valider avant exécution)

| # | Décision | Recommandation par défaut |
|---|---|---|
| D1 | Garder `extra.legacy_repair` ou non | Garder (traçabilité) |
| D2 | `opening_period.name` après repair : NULL ou label métier | NULL ; le label vient d'une décision produit |
| D3 | `opening_schedule.name` après repair : NULL ou hérité | NULL |
| D4 | `opening_time_period.note` : `'AM'` / `'PM'` ou `'matin'` / `'après-midi'` | `'AM'` / `'PM'` pour rester ASCII, l'UI traduit |
| D5 | Exécuter directement sur prod après staging OK, ou demander revue PR | **Demander revue PR + sign-off produit** |
| D6 | Phase 2 (coverage hébergement) commence quand | Après validation phase 1 et avant fixtures éditeur |

---

## 11. Lien vers le SQL draft

[`opening-periods-repair-draft.sql`](opening-periods-repair-draft.sql) — **marqué NON EXÉCUTÉ** en en-tête.
