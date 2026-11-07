# Opening periods — execution result (phase 1)

**Date d'exécution** : 2026-05-19, 08:26:07 UTC
**Cible** : DB live Supabase / Postgres 17.6 (test DB, opérateur unique — voir contexte)
**Script exécuté** : [`opening-periods-repair-executed.sql`](opening-periods-repair-executed.sql) (copie auditée du draft)
**Statut** : ✅ **COMMITTED**

---

## 1. Tables de backup créées

Snapshot pris hors transaction de repair, avant exécution. Suffixe horodaté `20260519_082607Z` (UTC).

| Table source | Table de backup |
|---|---|
| `public.opening_period` | `public.opening_period_bak_20260519_082607Z` |
| `public.opening_schedule` | `public.opening_schedule_bak_20260519_082607Z` |
| `public.opening_time_period` | `public.opening_time_period_bak_20260519_082607Z` |
| `public.opening_time_frame` | `public.opening_time_frame_bak_20260519_082607Z` |
| `public.opening_time_period_weekday` | `public.opening_time_period_weekday_bak_20260519_082607Z` |

Vérification post-backup (`SELECT COUNT(*)`):

| Table de backup | Rows |
|---|---:|
| `opening_period_bak_20260519_082607Z` | 257 |
| `opening_schedule_bak_20260519_082607Z` | 257 |
| `opening_time_period_bak_20260519_082607Z` | 257 |
| `opening_time_frame_bak_20260519_082607Z` | 257 |
| `opening_time_period_weekday_bak_20260519_082607Z` | 1 051 |

Backup créé via `CREATE TABLE ... AS TABLE public.opening_*;` (copie de données, pas de FK / index — usage strictement de restore manuel). Conservation recommandée : 30 jours minimum.

---

## 2. Comptes avant / après

### 2.1 Snapshots issus du script (RAISE NOTICE)

```
BEFORE: period=257, sched=257, tp=257, tf=257, tpw=1051, horaires=191
AFTER : period=191, sched=191, tp=257, tf=257, tpw=1051, legacy_remaining=0
ALL-YEAR-ROUND: repair_rows=191, all_year_round=191, accidentally_dated=0
```

### 2.2 Comparaison

| Métrique | Avant | Après | Attendu | Statut |
|---|---:|---:|---:|---|
| `public.opening_period` | 257 | **191** | 191 | ✅ |
| `public.opening_schedule` | 257 | **191** | 191 | ✅ |
| `public.opening_time_period` | 257 | **257** | 257 | ✅ |
| `public.opening_time_frame` | 257 | **257** | 257 | ✅ |
| `public.opening_time_period_weekday` | 1 051 | **1 051** | 1 051 | ✅ |
| Lignes legacy restantes (`name LIKE 'Berta v2 %'` OR `:am`/`:pm` suffix) | 257 | **0** | 0 | ✅ |
| Distinct objects with period | 131 | **131** | 131 | ✅ (aucun objet perdu) |
| Distinct `source_period_id` après repair | n/a | **191** | 191 | ✅ |

### 2.3 Distribution post-repair par objet

```
periods_per_object  objects
1                   88   (était 53 avant — gain : 35 objets fusionnés)
2                   32   (était 54)
3                    5   (était 10)
4                    6   (était 7)
```

**78 objets** étaient surchargés par l'éclatement AM/PM ; après repair, ils ont leur nombre canonique de périodes.

### 2.4 Distribution time_periods par schedule

```
time_periods_per_schedule  schedules
1                          125   (objets avec AM seul)
2                           66   (objets avec AM + PM)
```

`time_period.note` : 191 `AM` + 66 `PM` = 257.

### 2.5 Sample (objet `LOIRUN00000000RB`, `horaires_id = 9f00ebaf`)

| period_id | source_period_id | name | all_years | slot | start | end | weekdays |
|---|---|---|---|---|---|---|---|
| (uuid) | `9f00ebaf` | `NULL` | true | `AM` | 09:00 | 12:00 | mon,tue,wed,thu,fri,sat,sun |
| (uuid) | `9f00ebaf` | `NULL` | true | `PM` | 12:00 | 18:00 | mon,tue,wed,thu,fri,sat,sun |

→ **une seule** `opening_period`, **deux** `opening_time_period`, conforme au modèle canonique.

### 2.6 Vérification API

`api.build_opening_period_json` sur un objet repaired (`RESRUN00000000TM`) renvoie une structure cohérente avec `date_start: null`, `date_end: null`, `weekday_slots` correctement peuplés. (`api.is_object_open_now` accepté l'object_id sans erreur ; la valeur de retour dépend de l'heure locale au moment du test.)

---

## 3. Assertions

Toutes les assertions du script (DO blocs avec `RAISE EXCEPTION`) ont **passé** sans erreur :

| Étape | Assertion | Statut |
|---|---|---|
| Step 0 | `BEFORE`: `period = 257` | ✅ |
| Step 0 | `BEFORE`: `tpw = 1051` | ✅ |
| Step 2 | `_legacy_rows = 257` | ✅ |
| Step 3 | `_new_periods = 191` | ✅ |
| Step 6 | `_slot_remap = 257` | ✅ |
| Step 8 | `AFTER`: `period = 191` | ✅ |
| Step 8 | `AFTER`: `sched = 191` | ✅ |
| Step 8 | `AFTER`: `tp = 257` | ✅ |
| Step 8 | `AFTER`: `tf = 257` | ✅ |
| Step 8 | `AFTER`: `tpw = 1051` | ✅ |
| Step 8 | `AFTER`: `legacy_remaining = 0` | ✅ |
| Step 8b | `repair_rows = 191` | ✅ |
| Step 8b | `all_year_round = 191` | ✅ |
| Step 8b | `accidentally_dated = 0` | ✅ |
| Step 9 | `COMMIT` | ✅ |

---

## 4. Confirmation : règle « ouverture toute l'année » préservée

**Préservation explicite.** Le script (Step 4 + Step 8b) garantit et vérifie que :

- Les 191 lignes canoniques issues du repair ont toutes `all_years = true`.
- Les 191 lignes canoniques ont toutes `date_start IS NULL` et `date_end IS NULL`.
- Zéro ligne du repair n'a été coercée vers une date saisonnière fictive.
- Chaque ligne porte `extra->>'all_year_round_preserved' = 'true'` pour traçabilité.

**Aucune période n'a été écartée parce qu'elle n'avait pas de `date_start` / `date_end`.** La règle est appliquée comme suit :

| Cas | Traitement |
|---|---|
| `all_years=true` + `date_start IS NULL` + `date_end IS NULL` | ✅ **Période valide** — c'est la forme canonique « ouverture toute l'année ». Préservée. |
| Pas de `opening_time_frame` pour un `opening_time_period` | ⚠ **Horaires inconnus / incomplets** — le script ne crée pas de tranche 00:00–24:00 par défaut. |
| `date_start` / `date_end` réels (saisonnier) | Pas concerné — le repair ne touche que les lignes legacy `Berta v2 *` / `:am`/`:pm`. |

> **Ce que le script ne fait jamais :**
> - Inventer un `date_start` / `date_end` quand la source dit `all_years=true`.
> - Confondre « toute l'année » avec « 24h/24 » : aucune tranche horaire artificielle n'est créée.
> - Supprimer une période sous prétexte qu'elle n'a pas de bornes saisonnières.

---

## 5. État global après phase 1

### 5.1 Ce qui est désormais conforme

- ✅ Toutes les périodes legacy `Berta v2 *` ont été remplacées par des périodes canoniques anonymes (`name = NULL`).
- ✅ Plus aucun éclatement AM/PM artificiel : 66 paires AM/PM ont été fusionnées sous une seule période.
- ✅ Les 1 051 associations weekday ↔ time_period sont préservées intactes.
- ✅ Les `schedule_type_id` (regular / by_appointment) restent corrects.
- ✅ Le marqueur `extra->>'legacy_repair' = 'opening-periods-repair-2026-05-19'` identifie sans ambiguïté les lignes issues du repair pour audit ultérieur.
- ✅ Le « tout l'année » est explicitement codé via `all_years=true + date_start/end NULL`.

### 5.2 Limites restantes (hors périmètre phase 1)

| Limite | Détail | Suite |
|---|---|---|
| **L1 — Coverage hébergement** | 497 objets `HLO` (485) + `HOT` (9) + `CAMP` (3) — **53 % du parc actif** — n'ont aucune période. La source `form_j_h` ne contenait que les fiches activités / restaurants / loisirs. | **Phase 2** : projet produit + données séparé. Identifier la source d'origine pour les horaires d'hébergement, ou définir une règle métier par défaut. |
| **L2 — `opening_period.name` est NULL** | Les 191 périodes canoniques n'ont pas de libellé métier. C'est intentionnel : la source n'en fournissait aucun. Côté UI, prévoir un label par défaut (« Horaires d'ouverture », « Horaires habituels »). | À traiter côté UI lors du chantier éditeur. |
| **L3 — Slot AM/PM redondants dans la source** | Quelques objets (ex. `RESRUN00000000TM`) ont AM et PM avec exactement les mêmes horaires. Le repair les préserve fidèlement ; l'UI peut choisir de dédupliquer à la lecture. | Pas un bug du repair. |
| **L4 — Pas de pipeline de transformation versionné** | La transformation `staging → public.opening_*` reste hors repo. Si un nouvel import est rejoué, il faudra écrire et versionner un `api.commit_staging_opening_v2` propre. | Ticket à ouvrir avant tout nouveau ré-import. |
| **L5 — 717 / 848 objets actifs sans aucune période** (incluant L1) | Au-delà de l'accommodation, certains LOI/RES/ACT/PSV n'ont pas non plus de période — par non-saisie côté source. | À cadrer avec produit : règle par défaut ou saisie manuelle. |

### 5.3 Mise à jour du gap report

[`mapping-vs-live-schema-gaps.md`](mapping-vs-live-schema-gaps.md) doit être mis à jour pour :
- passer **G-OPENING-1** de « blocker phase 1 » à « **resolved phase 1, phase 2 pending** » ;
- créer **G-OPENING-2** : coverage hébergement, suite produit ;
- débloquer la suite de travail (accessibilité G-A11Y-1, puis fixtures éditeur).

---

## 6. Procédure de rollback (si nécessaire)

Si un défaut est détecté plus tard, restauration depuis les backups :

```sql
BEGIN;
LOCK TABLE public.opening_period                IN EXCLUSIVE MODE;
LOCK TABLE public.opening_schedule              IN EXCLUSIVE MODE;
LOCK TABLE public.opening_time_period           IN EXCLUSIVE MODE;
LOCK TABLE public.opening_time_frame            IN EXCLUSIVE MODE;
LOCK TABLE public.opening_time_period_weekday   IN EXCLUSIVE MODE;

-- Purger l'état repaired
DELETE FROM public.opening_time_period_weekday;
DELETE FROM public.opening_time_frame;
DELETE FROM public.opening_time_period;
DELETE FROM public.opening_schedule;
DELETE FROM public.opening_period;

-- Restaurer depuis les backups
INSERT INTO public.opening_period
  SELECT * FROM public.opening_period_bak_20260519_082607Z;
INSERT INTO public.opening_schedule
  SELECT * FROM public.opening_schedule_bak_20260519_082607Z;
INSERT INTO public.opening_time_period
  SELECT * FROM public.opening_time_period_bak_20260519_082607Z;
INSERT INTO public.opening_time_frame
  SELECT * FROM public.opening_time_frame_bak_20260519_082607Z;
INSERT INTO public.opening_time_period_weekday
  SELECT * FROM public.opening_time_period_weekday_bak_20260519_082607Z;

-- Vérifier puis COMMIT
COMMIT;
```

À ne tenter qu'en dernier recours et après revue.

---

## 7. Prochain pas

Mettre à jour [`mapping-vs-live-schema-gaps.md`](mapping-vs-live-schema-gaps.md) (G-OPENING-1 → resolved phase 1, ajout G-OPENING-2 pour coverage hébergement), puis :

1. **Soit** ouvrir la phase 2 (coverage hébergement HLO/HOT/CAMP) en tant que projet produit + données séparé.
2. **Soit** débloquer le traitement de **G-A11Y-1** (décision sur le modèle accessibilité) avant tout chantier éditeur.

La phase 1 ne nécessite plus aucune action côté DB tant que les limites L1–L5 sont acceptées telles quelles.
