# Opening periods — migration diagnostic

**Date** : 2026-05-19
**Inspection** : read-only psql sur DB live + lecture des fichiers de migration et de schéma.
**Scope** : tables `public.opening_period`, `public.opening_schedule`, `public.opening_time_period`, `public.opening_time_frame`, `public.opening_time_period_weekday`, miroir `staging.opening_*_temp`.

---

## 1. Schéma cible actuel

### Tables et clés (extraites de `live-tables.csv`, `live-columns.csv`, `live-foreign-keys.csv`)

```
public.opening_period (257 rows, 192 kB)
  ├─ id uuid pk
  ├─ object_id text not null   → FK public.object(id) ON DELETE CASCADE
  ├─ name text
  ├─ date_start date
  ├─ date_end date
  ├─ source_period_id text
  ├─ all_years boolean not null default false
  ├─ name_i18n jsonb
  └─ extra jsonb

public.opening_schedule (257 rows)
  ├─ id uuid pk
  ├─ period_id uuid not null  → FK public.opening_period(id) ON DELETE CASCADE
  ├─ schedule_type_id uuid    → FK public.ref_code_opening_schedule_type(id) ON DELETE RESTRICT
  ├─ name text
  ├─ note text
  ├─ name_i18n jsonb
  ├─ note_i18n jsonb
  └─ extra jsonb

public.opening_time_period (257 rows)
  ├─ id uuid pk
  ├─ schedule_id uuid not null → FK public.opening_schedule(id) ON DELETE CASCADE
  ├─ closed boolean default false
  └─ note text

public.opening_time_frame (257 rows)
  ├─ id uuid pk
  ├─ time_period_id uuid not null → FK public.opening_time_period(id) ON DELETE CASCADE
  ├─ start_time time
  ├─ end_time time
  └─ recurrence interval

public.opening_time_period_weekday (1 051 rows)
  ├─ time_period_id uuid → FK public.opening_time_period(id) ON DELETE CASCADE
  └─ weekday_id uuid     → FK public.ref_code_weekday(id) ON DELETE CASCADE
```

Référentiel des types de planning (`public.ref_code_opening_schedule_type`) : `regular`, `by_appointment`, `continuous_service`, `exceptional`, `seasonal`.

---

## 2. Modèle canonique attendu

Une période d'ouverture **valide** doit représenter :

- **1 ligne `opening_period`** par (objet × intervalle calendaire significatif)
  - avec un `name` métier OU `name = NULL` (cas légitime « horaires habituels »)
  - avec un `date_start` / `date_end` non-NULL **OU** `all_years = true` exclusivement
  - `source_period_id` traçable vers le système source
- **1 ou plusieurs `opening_schedule`** par période (1 par planning de référence — habituel, exceptionnel, saisonnier)
- **1 ou plusieurs `opening_time_period`** par schedule (1 par tranche horaire — matin, après-midi, soirée)
- **1 `opening_time_frame`** par tranche (start_time / end_time / recurrence éventuelle)
- **N `opening_time_period_weekday`** par tranche (1 par jour applicable, lundi → dimanche)

**Règle métier** : si une période n'a ni nom métier réel, ni date_start, ni date_end, **et** `all_years=false`, elle ne devrait pas être exposée à l'UI comme une période réelle. La canonique B1/B2 de la carte workspace exige aussi que `opening_period` soit cohérent avec `business_timezone` de l'objet.

---

## 3. Comportement réel de la migration

### 3.1 Pipeline observé

```
Source CSV : Old_data_cleaned/berta2_all_20260501/opening_period_temp.csv
            (257 lignes, source = sheet « form_j_h »)
                          │
                          ▼
Staging   : staging.opening_period_temp          (257 lignes — chargées par
                                                  13_opening_period_temp__01.sql)
            staging.opening_schedule_temp        (0 ligne — JAMAIS chargée)
            staging.opening_time_period_temp     (0 ligne — JAMAIS chargée)
            staging.opening_time_frame_temp      (0 ligne — JAMAIS chargée)
            staging.opening_time_period_weekday_temp (0 ligne — JAMAIS chargée)
                          │
                          ▼  ?  (transformation NON présente dans le repo)
                          │
Live     : public.opening_period               (257 lignes)
           public.opening_schedule             (257 lignes)
           public.opening_time_period          (257 lignes)
           public.opening_time_frame           (257 lignes)
           public.opening_time_period_weekday  (1 051 lignes)
```

### 3.2 Caractéristiques des 257 lignes live

Résultats `psql` (read-only) sur `public.opening_period` :

| Métrique | Valeur |
|---|---:|
| Total | 257 |
| `name IS NULL` | 0 |
| `name LIKE 'Berta v2 %'` | **257 (100 %)** |
| `date_start IS NULL` | **257 (100 %)** |
| `date_end IS NULL` | **257 (100 %)** |
| `all_years = true` | **257 (100 %)** |
| `source_period_id LIKE '%:am'` | 191 |
| `source_period_id LIKE '%:pm'` | 66 |
| Distinct objects | **131** |
| Distinct horaires_ids (préfixe avant `:`) | **191** |

Le ratio 1:1:1:1 sur opening_period / opening_schedule / opening_time_period / opening_time_frame (257 partout) montre que la transformation a créé une **chaîne triviale par ligne source**.

### 3.3 Répartition AM/PM par objet

```
periods_per_object  objects
1                   53
2                   54
3                   10
4                    7
5                    4
6                    3
```

**54 objets ont exactement 2 périodes** — il s'agit dans la plupart des cas d'un slot AM et d'un slot PM du même horaires source qui auraient dû être deux `opening_time_period` sous **une seule** `opening_period`.

Vérifié sur l'horaires `9f00ebaf` (objet `LOIRUN00000000RB`) :

| Live ligne | period name | source_period_id | tranche | weekdays |
|---|---|---|---|---|
| 1 | `Berta v2 AM` | `9f00ebaf:am` | 09:00–12:00 | mon,tue,wed,thu,fri,sat,sun |
| 2 | `Berta v2 PM` | `9f00ebaf:pm` | 12:00–18:00 | mon,tue,wed,thu,fri,sat,sun |

Devraient être **une seule période** avec **deux** `opening_time_period` (matin / après-midi).

### 3.4 Couverture par type d'objet (gap massif)

Total objets actifs : **848** (draft + published). Objets avec au moins 1 période : **131 (~15 %)**.

| `object_type` | Total objets | Avec opening | % | Origin old-data |
|---|---:|---:|---:|---|
| **HLO** (locations) | 485 | **0** | **0 %** | 485 (100 %) |
| **HOT** (hôtels) | 9 | **0** | **0 %** | 9 (100 %) |
| **CAMP** (campings) | 3 | **0** | **0 %** | 3 (100 %) |
| RES (restaurants) | 137 | 74 | 54 % | 137 |
| LOI (loisirs) | 142 | 43 | 30 % | 142 |
| ACT (activités) | 52 | 12 | 23 % | 52 |
| PSV (prestataires) | 18 | 2 | 11 % | 18 |
| COM (commerces) | 1 | 0 | 0 % | 1 |
| ORG | 1 | 0 | 0 % | 0 |

> **Conclusion** : la totalité du segment hébergement (497 objets = 53 % du parc actif) n'a **aucune** donnée d'ouverture.

---

## 4. Exemples de lignes cassées

### 4.1 Source vs target — slot AM seul

Source (`staging.opening_period_temp`) :
```
staging_object_key  = 'recKw9Ovn2xu93E1C'
object_id           = NULL (colonne ajoutée mais jamais remplie dans staging)
period_name         = 'Berta v2 AM'
source_period_id    = '9f00ebaf:am'
weekdays            = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday'
start_time          = '09:00:00'
end_time            = '12:00:00'
schedule_text       = 'regular'
source_sheet        = 'form_j_h'
all_years           = TRUE (en staging.all_years)
```

Live (`public.opening_period`) :
```
object_id           = 'LOIRUN00000000RB'
name                = 'Berta v2 AM'       ← placeholder
date_start          = NULL
date_end            = NULL
all_years           = TRUE
source_period_id    = '9f00ebaf:am'
```

Et le PM frère vit en ligne séparée (`source_period_id = '9f00ebaf:pm'`), avec un name `'Berta v2 PM'`.

### 4.2 Cassures observées

| # | Type de cassure | Critère de détection | Lignes affectées |
|---|---|---|---:|
| C1 | Nom placeholder | `name LIKE 'Berta v2 %'` | **257 / 257** |
| C2 | Aucune date | `date_start IS NULL AND date_end IS NULL AND all_years = true` | **257 / 257** |
| C3 | Sur-éclatement AM/PM | `source_period_id ~ ':(am|pm)$'` | **257 / 257** |
| C4 | Chaîne triviale 1:1:1:1 | un `opening_period` → 1 schedule → 1 time_period → 1 time_frame | **257 / 257** |
| C5 | Coverage gap accommodation | type ∈ (HLO, HOT, CAMP) sans aucune période | **497 objets** |
| C6 | Coverage gap général | objets actifs sans période | **717 / 848 (~85 %)** |
| C7 | Staging chain non utilisé | tables `opening_schedule_temp` / `opening_time_period_temp` / `opening_time_frame_temp` / `opening_time_period_weekday_temp` vides | 4 tables |

### 4.3 Ce qui fonctionne quand même

| OK | Détail |
|---|---|
| ✅ object_id résolution | Le mapping `staging_object_key` (Airtable rec…) → `public.object.id` (`LOIRUNxxxxxxxxxx`) a fonctionné via `object_origin` / `object_external_id`. |
| ✅ `schedule_type_id` | Renseigné correctement : 186 `regular` + 71 `by_appointment` = 257. |
| ✅ weekdays | Correctement éclatées en 1 051 lignes `opening_time_period_weekday`, FK valides vers `ref_code_weekday`. |
| ✅ `start_time` / `end_time` | Présents et cohérents avec la source. |
| ✅ FK et CASCADE | Toutes les FK de la chaîne `opening_*` sont OK et CASCADE-correct. |
| ✅ RLS | Les 5 tables `opening_*` ont leur RLS activé (voir `live-rls-policies.csv`). |

---

## 5. Estimation de l'ampleur

| Indicateur | Valeur |
|---|---:|
| Lignes target structurellement cassées (cassures C1+C2+C3 simultanées) | **257 / 257 (100 %)** |
| Objets affectés par l'éclatement AM/PM (devrait être 1 période, en a ≥2) | **78** (54 avec 2 + 10 avec 3 + 7 avec 4 + 4 avec 5 + 3 avec 6) |
| Périodes redondantes à supprimer après collapse AM/PM | **66** (les PM slots, dont le AM frère existe déjà) |
| Périodes restantes après repair (estimation) | **191** (= nb distinct horaires_ids source) |
| Objets concernés par le coverage gap accommodation | **497** (HLO + HOT + CAMP) |
| Objets actifs total sans aucune période | **717 / 848** |

---

## 6. Hypothèse de cause racine

### Cause racine principale (R1) — *Transformation 1 ligne staging = 1 chaîne complète*

La transformation `staging.opening_period_temp` → `public.opening_period + opening_schedule + opening_time_period + opening_time_frame + opening_time_period_weekday` a été exécutée avec une logique **« une ligne source = une chaîne complète »**, sans regrouper par `split_part(source_period_id, ':', 1)` (le préfixe horaires_id avant `:am` / `:pm`).

Conséquences :
- Chaque slot AM crée sa propre `opening_period`.
- Chaque slot PM crée sa propre `opening_period`.
- Le nom de période est copié du `period_name` source (`Berta v2 AM` / `Berta v2 PM`) — qui était lui-même un placeholder du script d'export Airtable, **pas** un nom métier réel.

### Cause racine secondaire (R2) — *Source CSV ne couvre qu'un sous-ensemble de types*

Le `source_sheet` unique est `form_j_h` (form **j**ours et **h**oraires). Ce sheet semble avoir été le formulaire des activités / restaurants / loisirs. Le segment **hébergement** (HLO / HOT / CAMP) avait probablement une fiche d'admission différente, dont les horaires n'ont **jamais été extraits** dans la source nettoyée `Old_data_cleaned/berta2_all_20260501/`.

### Cause racine tertiaire (R3) — *Script de transformation hors repo*

Aucun fichier `.sql` dans `Base de donnée DLL et API/` ne contient l'INSERT vers `public.opening_period` / `opening_schedule` / etc. La fonction `api.commit_staging_to_public` (531 lignes, dumpée depuis le live) ne mentionne ni `opening_period` ni `opening_period_temp`. Aucune fonction live ne référence `opening_period_temp`. **La transformation a été exécutée par un script externe / SQL ad-hoc non versionné**, ce qui explique pourquoi elle n'est pas auditable depuis le repo et pourquoi elle reste à reprendre.

Les colonnes `id`, `object_id`, `name`, `source_period_id`, `all_years`, `name_i18n`, `extra` ajoutées à `staging.opening_period_temp` (au-delà des colonnes nominales du fichier `13_opening_period_temp__01.sql`) montrent que le script externe a aussi modifié le schéma staging avant d'exécuter la transformation.

---

## 7. Fichiers et fonctions responsables

| Élément | Fichier / objet | Statut |
|---|---|---|
| Source CSV | `Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/opening_period_temp.csv` | OK |
| Manifest de cleaning | `Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/manifest.json` | À relire pour confirmer périmètre |
| Chargement staging | `Base de donnée DLL et API/old_data_supabase_import_20260501/13_opening_period_temp__01.sql` | OK (charge bien 257 lignes en staging) |
| **Transformation staging → public** | **NON présent dans le repo** | **MANQUANT** — script ad-hoc à reconstruire |
| `api.commit_staging_to_public` | live DB (531 lignes) | Ne touche pas les opening_* |
| Fonctions de lecture côté API | `Base de donnée DLL et API/api_views_functions.sql` (`api.build_opening_period_json`, `api.get_opening_time_slots`, `api.get_all_opening_time_slots`, `api.is_opening_period_active_*`, etc.) | OK |
| Enrichissement | `Base de donnée DLL et API/old_data_enrichment_20260512/01_enrich_imported_old_data.sql` | Ne touche pas les opening_* |

---

## 8. Stratégie de réparation recommandée

### Phase 1 — Réparation structurelle (script SQL, à exécuter sur staging puis prod après revue)

Voir [`opening-periods-repair-plan.md`](opening-periods-repair-plan.md) et [`opening-periods-repair-draft.sql`](opening-periods-repair-draft.sql) (draft, **NON EXÉCUTÉ**).

Idée générale :

1. Pour chaque `horaires_id = split_part(source_period_id, ':', 1)` × `object_id`, créer **une** nouvelle ligne `opening_period` (`source_period_id = horaires_id`, `name = NULL`, `date_start = NULL`, `date_end = NULL`, `all_years = true`).
2. Créer **une** ligne `opening_schedule` correspondante avec le bon `schedule_type_id` (déduit de `schedule_text`).
3. Pour chaque slot AM / PM rattaché à ce `horaires_id`, créer un `opening_time_period` avec `note = 'AM'` ou `note = 'PM'`, puis un `opening_time_frame` (start_time / end_time) et les `opening_time_period_weekday` correspondants.
4. Supprimer (CASCADE) les anciennes lignes `opening_period` cassées (`name LIKE 'Berta v2 %'`).

Toutes ces opérations doivent être **transactionnelles** et exécutées en **dry-run d'abord** sur une copie staging.

### Phase 2 — Comblement de la couverture (séparé)

Un travail produit / données est nécessaire pour ramener les horaires des hébergements (HLO / HOT / CAMP — 497 objets). Plusieurs pistes :
- Identifier la source d'origine (Berta v2, autre tableur) qui contenait potentiellement les horaires d'accueil ou de check-in / check-out.
- Définir si pour ce segment, l'« opening_period » a un sens : un hôtel est généralement « ouvert toute l'année » avec des horaires de réception. La carte canonique C6 indique que ce module est applicable à « la plupart des types ».
- Décider une règle par défaut (par ex. `all_years = true` + plage de réception 8h–20h) appliquée si aucune source ne couvre.

### Phase 3 — Garde-fou UI

Le frontend ne doit pas masquer le problème par des fallbacks. Recommandation à appliquer après repair :
- Si `opening_period` existe et a une chaîne valide (≥ 1 schedule, ≥ 1 time_period, ≥ 1 time_frame, ≥ 1 weekday) → afficher.
- Si `opening_period` existe avec une chaîne incomplète → afficher un badge « horaires incomplets ».
- Si **aucune** `opening_period` → afficher l'état « pas d'horaires renseignés » avec CTA d'édition.

---

## 9. Prochaines étapes

1. Valider le diagnostic produit + tech (cadrage avec opérateur de l'import historique).
2. Geler toute autre tâche éditeur / accessibilité tant que la phase 1 n'a pas été exécutée et vérifiée.
3. Exécuter la phase 1 sur environnement staging (jamais directement en production).
4. Vérifier la santé via re-run des CSVs `live-*` du workbench.
5. Lancer la phase 2 (coverage hébergement) — projet produit à part.
6. Mettre à jour `mapping-vs-live-schema-gaps.md` une fois la phase 1 validée.
