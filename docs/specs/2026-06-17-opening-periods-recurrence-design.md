# Périodes d'ouverture — récurrence explicite + cascade de priorité

- **Date** : 2026-06-17
- **Statut** : design validé (brainstorming) — prêt pour le plan d'implémentation
- **Surface** : `bertel-tourism-ui` éditeur §14 « Périodes d'ouverture » + tables `opening_*` + RPC API + moteur de statut
- **Journal canonique** : à consigner dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (nouveau §)

---

## 1. Problème

La modale « Ajouter une période » ne permet pas d'exprimer une **saison qui se répète chaque année**. L'utilisateur veut :

1. Choisir un type (ex. haute saison) et définir **au moins le mois de début et de fin**, **répété d'année en année** (cyclique).
2. Pour les périodes non cycliques, définir des **dates complètes (jour + mois + année)**, ponctuelles.
3. **Ne pas pouvoir créer de périodes qui se chevauchent** (évolué en cours de brainstorming vers un modèle de priorité, voir §3).

### Diagnostic (vérifié contre la base live)

La base **sait déjà** distinguer cyclique vs absolu — le bug est entièrement côté éditeur :

- `api.is_opening_period_active_on_date(all_years, date_start, date_end, local_date)` (`schema_unified.sql` ~4779) :
  - `all_years = TRUE` → compare **MM-JJ uniquement** (ignore l'année), avec gestion du chevauchement déc.→fév. = **récurrence annuelle**.
  - `all_years = FALSE` → compare la **date complète** (ponctuel).
- Côté éditeur, deux défauts :
  1. `isOpeningPeriodAllYears()` (`src/features/object-drawer/utils.ts:128`) confond `allYears` avec « aucune date » → une période cyclique *avec* plage est rétrogradée en « dates fixes ». Aucun état ne correspond à « cyclique avec plage de mois ».
  2. Les champs de date sont en `JJ/MM/AAAA` complet, et `all_years` est piloté par les **métadonnées du type** (`year_round.metadata.all_year`), jamais par un choix utilisateur. Choisir « Haute saison » force une date **avec année**, enregistrée `all_years=FALSE` → **ne se répète pas**.
- Le menu « **Période (cycle) : Courante / N+1 / Sans date** » (`bucket`) est **mal nommé et cosmétique** : la lecture re-déduit l'année à partir de la date et **ignore** ce menu (`extra.workspace_bucket` non relu).

### État live (peu de risque)

`SELECT … FROM opening_period` : **187 périodes / 130 objets, toutes `all_years=TRUE`, sans dates, sans type, `is_closure` (à créer) = FALSE par défaut**. Personne n'a saisi de période saisonnière/datée. Migration additive sans backfill.

---

## 2. Modèle temporel (verrouillé)

Trois **modes de récurrence** explicites par période :

| Mode | UI | Stockage (`opening_period`) | Moteur |
|------|----|-----------------------------|--------|
| ♾️ **Toute l'année** (base) | aucune date | `all_years=TRUE`, dates `NULL`, `is_closure=FALSE` | toujours actif |
| 🔁 **Cyclique** | mois + **jour optionnel**, début→fin | `all_years=TRUE`, dates en **année-sentinelle**, `is_closure=FALSE` | MM-JJ chaque année |
| 📅 **Dates fixes** | jour/mois/**année**, début→fin | `all_years=FALSE`, dates complètes, `is_closure=FALSE` | absolu, une fois |
| 🔒 **Fermeture** | date isolée **ou** plage, + « chaque année » | `is_closure=TRUE` (cyclique ou fixe selon récurrence) | voir cascade §3 |

- **Granularité cyclique** : mois + jour, **jour optionnel** (défaut : début = 1er du mois, fin = dernier jour). Couvre « au moins les mois » tout en permettant le précis (ex. 15 juin → 14 sept.).
- **Type de période** (`period_type_id` → `ref_code_opening_period_type`) devient une **étiquette sémantique optionnelle** (haute/mi/hors saison, couleur du ruban, admin-extensible). Le type **« Annuelle » (`year_round`) est retiré** du seed (redondant avec le mode « Toute l'année »). Sa `metadata.all_year` n'est plus utilisée pour piloter l'UI.

### Convention année-sentinelle (cyclique)

- Année fixe **`2000`** (bissextile → 29 fév. valide).
- Non-chevauchant (ex. mai→sept.) : `date_start = 2000-05-01`, `date_end = 2000-09-30`.
- Chevauchant l'an neuf (ex. déc.→fév.) : `date_start = 2000-12-15`, `date_end = 2001-02-15` (fin en `2001`) pour respecter le `CHECK (date_end >= date_start)` **existant** (aucun changement du CHECK).
- Le moteur ignore déjà l'année pour `all_years=TRUE`. Constante partagée front/back (`OPENING_CYCLIC_SENTINEL_YEAR = 2000`).

---

## 3. Cascade de priorité (verrouillé)

Modèle en couches type « cascade CSS ». Pour un jour donné, **la couche la plus spécifique active gagne** et **elle seule** dicte ouvert/fermé + horaires affichés.

```
🔒 Fermetures        (rang 4 — gagne toujours)
📅 Dates fixes       (rang 3)
🔁 Cyclique          (rang 2)
♾️ Toute l'année     (rang 1 — base)
```

Règles :

- **Chevauchement entre couches différentes = autorisé**, résolu par priorité (ex. un festival 📅 « prime » la haute saison 🔁).
- **Même couche** : croisement partiel **bloqué** ; **imbrication autorisée** (fenêtre la plus étroite = la plus spécifique → gagne, ex. « canicule août » dans « haute saison »).
- **Base « toute l'année »** : **au plus une** par objet, **surchargeable** (non exclusive).
- **Fermetures** : couvrent **dates isolées et plages**, **prioritaires sur tout**, **pas de contrôle de chevauchement entre elles** (fermé + fermé = fermé). Une fermeture peut être ponctuelle (`all_years=FALSE`) ou récurrente (`all_years=TRUE`, ex. chaque 25 déc.).
- Rang effectif = (`is_closure`?4 : `all_years=FALSE`?3 : dates présentes?2 : 1), puis **fenêtre la plus étroite** à rang égal.

Les **fermetures hebdomadaires** (« fermé chaque lundi en haute saison ») restent **internes à la période** (un jour sans créneau = fermé ce jour) — distinctes des fermetures de dates (couche objet).

---

## 4. Architecture & flux de données

### 4.1 Schéma (`opening_period`)
- **Ajout** : `is_closure BOOLEAN NOT NULL DEFAULT FALSE` + index partiel optionnel `WHERE is_closure`.
- Inchangé : `all_years`, `date_start`, `date_end`, `period_type_id`, `name`, `extra`, `CHECK chk_opening_period_dates`.
- Migration **nouveau fichier** `migration_opening_period_recurrence.sql` (manifest étape à attribuer, ex. 14j) → **folded dans `schema_unified.sql`** + runbook + fresh-apply gate (règle deploy-integrity CLAUDE.md).

### 4.2 Moteur de statut (réécriture de la résolution)
- `api.refresh_open_status()` (`schema_unified.sql` ~4886) : aujourd'hui « OU » de toutes les périodes actives → devient **« retenir la couche la plus prioritaire active par objet »** puis n'évaluer **que sa grille**.
  - Étapes : (1) date/heure locale (`get_local_now_for_timezone`, inchangé) ; (2) périodes actives (`is_opening_period_active_on_date`, inchangé) ; (3) si une **fermeture** active → fermé ; (4) sinon `DISTINCT ON (object)` ordonné par (rang DESC, largeur de fenêtre ASC) → période gagnante ; (5) ouvert/fermé selon ses `opening_time_period`/`opening_time_frame`.
  - **Contrainte perf (§37)** : rester **set-based**, aucun scan de catalogue par ligne. La sélection « top période par objet » = window function / `DISTINCT ON`.
- **Largeur de fenêtre** : pour cyclique, durée MM-JJ (avec wrap) ; pour fixe, `date_end - date_start` ; base = ∞ (la plus large).

### 4.3 Lecture
- `api.build_opening_period_json` (version courante dans `migration_opening_period_type.sql:206`) : **ajouter `is_closure`** à la sortie. Le reste (`all_years`, `date_start/end`, `period_type_code`, `weekday_slots`) est déjà émis.
- `api.get_object_resource` (section opening ~`api_views_functions.sql:4311`) : les fermetures (is_closure) remontent dans la **même liste** ; l'éditeur les répartit (périodes vs fermetures).

### 4.4 Écriture
- `api.save_object_openings` (version courante dans `migration_opening_period_type.sql:62`) :
  - Persister `is_closure` dans l'INSERT `opening_period`.
  - **Validation anti-chevauchement serveur** (garantie dure) : nouvelle fonction `internal.assert_no_period_overlap(p_object_id, periods)` (ou inline) qui rejette (`ERRCODE 23514` / message) tout croisement partiel de même couche (imbrication tolérée ; fermetures exclues). Appelée avant/après le delete+reinsert sur l'ensemble du payload.

### 4.5 Frontend
- **Modèle** `ObjectWorkspaceOpeningPeriod` (`object-workspace-parser.ts:615`) : ajouter `recurrence: 'always' | 'cyclic' | 'fixed'` et `isClosure: boolean` (+ pour fermeture, `recurringClosure: boolean`). Conserver `startDate/endDate` (cyclique = MM-JJ année-sentinelle ; helpers month/day).
- **Parser** (`parseWorkspaceOpeningPeriodRecord` ~2256) : mapper `is_closure`→`isClosure`, `(all_years, dates)`→`recurrence` ; cyclique → extraire mois/jour des dates sentinelles. **Corriger / retirer** la confusion `isOpeningPeriodAllYears` (`utils.ts:128`) : lire `all_years`+`is_closure` explicites, ne plus inférer depuis « aucune date ».
- **Builder** (`saveObjectWorkspaceOpenings` `object-workspace.ts:4305`) : mapper `recurrence`→`(all_years, date_start, date_end)` (année-sentinelle pour cyclique, wrap → +1), `isClosure`→`is_closure`. Supprimer l'envoi de `extra.workspace_bucket`.
- **Modale** (`widgets/OpeningPeriodEditModal.tsx`) :
  - Sélecteur **Récurrence** (3 modes) ; zone de dates adaptative (mois+jour optionnel / date complète / aucune).
  - **Type optionnel** (haute/mi/hors saison ; « Annuelle » retiré).
  - **Supprimer** le menu « Période (cycle) » (`OPENING_BUCKET_OPTIONS`).
  - Validation de chevauchement **dans la modale** (message « recoupe *Haute saison* en août–sept. »), via **fonction pure** `findPeriodConflicts(candidate, existing)` (miroir de la garantie serveur).
- **Fermetures au niveau objet** : extraire « Dates de fermeture exceptionnelle » de la modale période vers une **liste objet** (`SectionOpenings.tsx`), entrées date isolée **+ plage** + « chaque année » → périodes `is_closure`.
- **Présentation** (`OpeningPeriodsEditor.tsx`) : ruban annuel + indication de la couche/priorité ; les fermetures listées à part.

---

## 5. Découpage en unités (isolation / testabilité)

Fonctions pures (front) — chacune testable isolément :
- `encodeCyclicDates(month/day…)` / `decodeCyclicDates(date_start, date_end)` ↔ année-sentinelle + wrap.
- `periodRank(period)` et `periodWindowWidth(period)`.
- `periodsOverlap(a, b)` (cyclique+wrap, fixe, croisé) et `isContained(a, b)`.
- `findPeriodConflicts(candidate, existing[])` → conflits de même couche (croisement, hors imbrication).
- `resolveActivePeriod(periods[], date)` → période gagnante (pour aperçu UI).
- `mapRecurrenceToStorage` / `mapStorageToRecurrence`.

SQL :
- `internal.assert_no_period_overlap(...)` (validation écriture).
- Résolution priorité dans `refresh_open_status` (set-based).

---

## 6. Tests (TDD)

- **Front (Jest)** : encode/decode sentinelle (dont wrap déc.→fév.), `periodsOverlap` (cyclique partiel/imbriqué/croisé-mode, fixe même/différente année), `findPeriodConflicts` (bloque croisement, tolère imbrication, ignore fermetures), `resolveActivePeriod` (3 jours types), parser (round-trip `is_closure`+récurrence), builder (mapping inverse), modale (champs adaptatifs, blocage chevauchement). Suite existante (~1273) verte.
- **SQL** : `test_opening_recurrence.sql` (round-trip `is_closure`, résolution priorité sur dates types, `assert_no_period_overlap` rejette/accepte les bons cas, perf set-based). Réutiliser le harnais `test_open_status_timezone.sql`.
- **Web** (règles ECC) : régression visuelle de la modale aux breakpoints si pertinent ; a11y des nouveaux sélecteurs.

---

## 7. Déploiement & doc

- Migration folded dans `schema_unified.sql`, listée dans `docs/SQL_ROLLOUT_RUNBOOK.md` (ordre de dépendances), couverte par le **fresh-apply gate**.
- `lot1_mapping_decisions.md` : nouveau § (modèle récurrence + cascade + `is_closure` + année-sentinelle + retrait `year_round` type + suppression bucket).
- Proposer ajout d'invariant à `CLAUDE.md` : « périodes d'ouverture = cascade de priorité (fermeture > fixe > cyclique > base) ; même couche sans croisement partiel ; cyclique en année-sentinelle 2000 ».

---

## 8. Périmètre & risques

- **Pas un patch UI** : schéma (1 colonne), **moteur de statut** (réécriture résolution), RPC lecture/écriture (+ validation), refonte éditeur (modale + extraction fermetures).
- **Risque données** : faible — 187 périodes live = base pure, migration additive, 0 backfill.
- **Risque perf** : la résolution priorité doit rester set-based (préserver §37). À EXPLAIN-vérifier.
- **Round-trip fermetures de dates aujourd'hui cassé** (les dates ISO de `closedDays` ne se persistent pas — `normalizeOpeningWeekdayCode` les filtre) : **corrigé de fait** par les périodes `is_closure`.

## 9. Points d'implémentation à confirmer pendant le plan
- Index exact pour `is_closure` (partiel vs simple) selon le plan de la résolution.
- Matérialiser la constante `OPENING_CYCLIC_SENTINEL_YEAR` (2000) côté SQL (commentaire/CHECK doux) ou la garder comme simple convention front ?
- Nettoyage optionnel du modèle `closedDays` hebdo (jour sans créneau = fermé) — hors cœur, à décider.
- Énumérer **tous** les consommateurs d'horaires « aujourd'hui » à aligner sur la résolution priorité (cards/Explorer/drawer), au-delà de `cached_is_open_now`.
