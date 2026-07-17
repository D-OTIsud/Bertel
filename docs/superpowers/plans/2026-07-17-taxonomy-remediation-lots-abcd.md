# Plan d'exécution — Remédiation taxonomique lots A/B/C/D (§187)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Appliquer les corrections de l'audit taxonomique tous-domaines (`docs/taxonomy-audit-all-domains-2026-07-17.md`) : 23 corrections de sous-catégories (lot A), 18 retypes d'objets LOI→ACT/PRD/PSV + création du nœud ACT `guided_tour` (lot B), transmission des 17 arbitrages à l'OTI (lot C), hygiène du catalogue (lot D).

**Architecture :** Chaque lot = une migration SQL idempotente appliquée sur la base **live** Supabase (via MCP `apply_migration` ou l'éditeur SQL du Dashboard), PUIS mise en conformité du dépôt (fichier migration + `ci_fresh_apply.sql` + runbook + snapshot des arbres) pour que « base fraîche == live ». Précédents à imiter : `migration_act_taxonomy_recategorization.sql` (13f, corrections de données) et `migration_loi_prd_cleanup_retype.sql` (13d, retypes).

**Tech stack :** PostgreSQL (Supabase), pas de psql local (utiliser le MCP Supabase ou le Dashboard). Dépôt : `C:\Users\dphil\Bertel3.0`, dossier SQL `Base de donnée DLL et API/`.

## Global Constraints

- **UNE sous-catégorie par objet et par domaine** : `object_taxonomy` porte `UNIQUE (object_id, domain)`. Jamais deux codes pour une même fiche.
- **Ordre de retype forcé** (trigger `validate_object_taxonomy_assignment` : le domaine d'une assignation doit correspondre au type COURANT de l'objet) : capture → DELETE des anciens liens → UPDATE du type → INSERT des nouveaux liens, le tout dans UNE transaction. Un UPDATE croisé naïf est rejeté (23514).
- **Toute migration est idempotente** : re-run = no-op. Gardes fail-closed (`RAISE EXCEPTION`) sur les incohérences ; un objet ABSENT de la base ne fait PAS échouer (base fraîche sans données d'import = no-op).
- **Après chaque lot de données** : `api.refresh_object_filter_caches(object_id)` par objet touché (dans la migration), puis `REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;` et `internal.mv_ref_data_json;` (hors transaction, sur live).
- **Conformité dépôt obligatoire** : chaque migration ajoutée = fichier dans `Base de donnée DLL et API/` + entrée `\ir` dans `Base de donnée DLL et API/ci_fresh_apply.sql` + entrée dans `docs/SQL_ROLLOUT_RUNBOOK.md`. Tout nouveau nœud de taxonomie doit AUSSI être ajouté au snapshot `Base de donnée DLL et API/migration_taxonomy_trees_seed.sql` (Phase 1 + Phase 2).
- **Commits** : format conventionnel (`fix(db): …`, `docs: …`), **sans trailer Co-Authored-By**, stage+commit par **pathspec explicite** dans la même commande (dépôt partagé multi-sessions). **Ne pas pousser** (le PO pousse).
- **Journal de décisions** : à la fin, ajouter une entrée `## §<n>` dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (grep `^## §` pour trouver le prochain numéro — ne pas se fier au dernier vu).
- **À NE JAMAIS FAIRE** : `DELETE FROM object` direct ; supprimer un `ref_code` qui a des porteurs (désactiver seulement) ; corriger une fiche du lot C sans réponse OTI ; modifier le type d'un objet hors de la transaction 13d ; toucher au bucket Storage.

---

### Task 0 : Pré-vol — vérifier que l'état de la base correspond à l'audit

L'audit date du 2026-07-17. Si des fiches ont bougé depuis, les corrections ci-dessous peuvent être périmées.

- [ ] **Step 1 : Vérifier l'état attendu des fiches des lots A et B**

Exécuter (MCP `execute_sql` ou Dashboard) :

```sql
WITH expected(object_id, exp_type, exp_domain, exp_code) AS (VALUES
  -- lot A (exp_code = code ACTUEL attendu ; NULL = aucune sous-catégorie attendue)
  ('RESRUN00000000XP','RES','taxonomy_res','chambre_d_hote'),
  ('RESRUN00000000X9','RES','taxonomy_res','chambre_d_hote'),
  ('RESRUN00000000OG','RES','taxonomy_res','salle_de_reception'),
  ('RESRUN000000019W','RES','taxonomy_res','auberge_de_campagne'),
  ('RESRUN00000000SY','RES','taxonomy_res','restauration_traditionnelle'),
  ('RESRUN00000000WC','RES','taxonomy_res','gato_pei'),
  ('RESRUN00000001B1','RES','taxonomy_res',NULL),
  ('RESRUN00000001B6','RES','taxonomy_res',NULL),
  ('LOIRUN000000013W','LOI','taxonomy_loi','artisanat_bijoux'),
  ('LOIRUN000000019H','LOI','taxonomy_loi','atelier'),
  ('LOIRUN000000016S','LOI','taxonomy_loi','restauration_traditionnelle'),
  ('LOIRUN00000001AY','LOI','taxonomy_loi',NULL),
  ('LOIRUN00000001B4','LOI','taxonomy_loi',NULL),
  ('LOIRUN00000001AW','LOI','taxonomy_loi',NULL),
  ('LOIRUN00000001AJ','PRD','taxonomy_prd','agrotourisme'),
  ('LOIRUN000000016Z','PRD','taxonomy_prd','exploitation_agricole'),
  ('PRDRUN00000001AX','PRD','taxonomy_prd',NULL),
  ('PRDRUN00000001B9','PRD','taxonomy_prd',NULL),
  ('PSVRUN000000014A','PSV','taxonomy_psv','vtc'),
  ('HLORUN00000001BH','HLO','taxonomy_hlo',NULL),
  ('HLORUN00000001B5','HLO','taxonomy_hlo',NULL),
  ('HLORUN00000001B3','HLO','taxonomy_hlo',NULL),
  ('HLORUN00000001BE','HLO','taxonomy_hlo',NULL),
  -- lot B (tous typés LOI aujourd'hui)
  ('LOIRUN00000001AQ','LOI','taxonomy_loi','randonnee_pedestre'),
  ('LOIRUN000000019U','LOI','taxonomy_loi','randonnee_pedestre'),
  ('LOIRUN0000000191','LOI','taxonomy_loi','visite_guidee'),
  ('LOIRUN00000001AH','LOI','taxonomy_loi','speleologie_tunnels_de_lave'),
  ('LOIRUN0000000198','LOI','taxonomy_loi','guide_accompagnateur_touristique'),
  ('LOIRUN000000017M','LOI','taxonomy_loi','visite_guidee'),
  ('LOIRUN00000000YC','LOI','taxonomy_loi','visite_guidee'),
  ('LOIRUN0000000177','LOI','taxonomy_loi','visite_guidee'),
  ('LOIRUN00000000S6','LOI','taxonomy_loi','visite_guidee'),
  ('LOIRUN000000017I','LOI','taxonomy_loi','visite_guidee'),
  ('LOIRUN000000015J','LOI','taxonomy_loi','visite_guidee'),
  ('LOIRUN00000000U5','LOI','taxonomy_loi','terroir'),
  ('LOIRUN00000000VE','LOI','taxonomy_loi','visite_guidee'),
  ('LOIRUN000000010R','LOI','taxonomy_loi','visite_guidee'),
  ('LOIRUN000000019G','LOI','taxonomy_loi','horticulture'),
  ('LOIRUN00000001AZ','LOI','taxonomy_loi',NULL),
  ('LOIRUN000000019P','LOI','taxonomy_loi','v_t_t_autres_cycles'),
  ('LOIRUN00000001A0','LOI','taxonomy_loi',NULL)
)
SELECT e.object_id, e.exp_type, o.object_type::text AS type_reel,
       e.exp_code, rc.code AS code_reel
FROM expected e
LEFT JOIN object o ON o.id = e.object_id
LEFT JOIN object_taxonomy ot ON ot.object_id = e.object_id AND ot.domain = e.exp_domain
LEFT JOIN ref_code rc ON rc.id = ot.ref_code_id
WHERE o.id IS NULL
   OR o.object_type::text <> e.exp_type
   OR COALESCE(rc.code,'∅') <> COALESCE(e.exp_code,'∅');
```

Attendu : **0 ligne**. Si des lignes sortent → **STOP**, signaler au PO (l'état a bougé depuis l'audit — ne rien corriger en aveugle).

- [ ] **Step 2 : Vérifier que la branche git est propre pour les fichiers du chantier**

```bash
git status --porcelain -- "Base de donnée DLL et API/" docs/
```

Attendu : aucun fichier du chantier déjà modifié (des fichiers d'autres sessions peuvent apparaître : ne pas y toucher, committer uniquement par pathspec).

---

### Task 1 : Lot A — écrire la migration `migration_taxonomy_audit_lot_a.sql`

**Files:**
- Create: `Base de donnée DLL et API/migration_taxonomy_audit_lot_a.sql`

**Interfaces:**
- Produces: la migration 13g, consommée par Task 2 (apply live) et Task 3 (manifest).

- [ ] **Step 1 : Créer le fichier avec ce contenu exact**

```sql
-- =============================================================================
-- migration_taxonomy_audit_lot_a.sql — §187 lot A : 23 corrections intra-domaine (2026-07-17)
-- Manifest step 13g. Idempotent — re-run = no-op. Après seeds (step 11) + 13f.
-- Audit source : docs/taxonomy-audit-all-domains-2026-07-17.md (§A).
-- Un objet ABSENT = no-op (base fraîche) ; un objet PRÉSENT au mauvais type = RAISE.
-- =============================================================================
BEGIN;

CREATE TEMP TABLE _lot_a (
  object_id text PRIMARY KEY,
  exp_type  text NOT NULL,
  domain    text NOT NULL,
  new_code  text NOT NULL
) ON COMMIT DROP;

INSERT INTO _lot_a (object_id, exp_type, domain, new_code) VALUES
  -- RES
  ('RESRUN00000000XP','RES','taxonomy_res','table_d_hote'),      -- La Ferme du Kilimandjaro (était chambre_d_hote)
  ('RESRUN00000000X9','RES','taxonomy_res','table_d_hote'),      -- Le Caloupilé (était chambre_d_hote)
  ('RESRUN00000000OG','RES','taxonomy_res','restaurant'),        -- L'Orchidéa (était salle_de_reception)
  ('RESRUN000000019W','RES','taxonomy_res','table_d_hote'),      -- Fleur de Vanille (était auberge_de_campagne)
  ('RESRUN00000000SY','RES','taxonomy_res','restaurant'),        -- LABEL FOURCHETTE (était restauration_traditionnelle)
  ('RESRUN00000000WC','RES','taxonomy_res','bar_a_jus'),         -- Kaban'a Jus (était gato_pei)
  ('RESRUN00000001B1','RES','taxonomy_res','restaurant'),        -- Allon Manger (aucune)
  ('RESRUN00000001B6','RES','taxonomy_res','restaurant'),        -- Chez Mamie Poulette (aucune)
  -- LOI
  ('LOIRUN000000013W','LOI','taxonomy_loi','wellness'),          -- Mon Voyage Fleuri (était artisanat_bijoux)
  ('LOIRUN000000019H','LOI','taxonomy_loi','divertissement'),    -- GAMIKIT (était atelier)
  ('LOIRUN000000016S','LOI','taxonomy_loi','patrimoine_culturel'),-- Assoc. Tradition et Passions (était restauration_traditionnelle)
  ('LOIRUN00000001AY','LOI','taxonomy_loi','atelier'),           -- Bat'Karèv & Trois Petits Points (aucune)
  ('LOIRUN00000001B4','LOI','taxonomy_loi','art_artisanat'),     -- La Récup de TiCha (aucune)
  ('LOIRUN00000001AW','LOI','taxonomy_loi','wellness'),          -- Les Passerelles du Bien-Être (aucune)
  -- PRD
  ('LOIRUN00000001AJ','PRD','taxonomy_prd','apiculture'),        -- Apiculture Reunion (était agrotourisme)
  ('LOIRUN000000016Z','PRD','taxonomy_prd','apiculture'),        -- Le Rucher du Petit Piton (était exploitation_agricole)
  ('PRDRUN00000001AX','PRD','taxonomy_prd','apiculture'),        -- APIC974 (aucune)
  ('PRDRUN00000001B9','PRD','taxonomy_prd','produits_terroir'),  -- L'instant Philippine (aucune)
  -- PSV
  ('PSVRUN000000014A','PSV','taxonomy_psv','location_vehicule'), -- HGL Location (était vtc)
  -- HLO
  ('HLORUN00000001BH','HLO','taxonomy_hlo','bungalow_chalet'),   -- Fanjan (aucune)
  ('HLORUN00000001B5','HLO','taxonomy_hlo','gite_villa'),        -- L'Océan de Brilune (aucune)
  ('HLORUN00000001B3','HLO','taxonomy_hlo','gite_villa'),        -- Villa Evilou (aucune)
  ('HLORUN00000001BE','HLO','taxonomy_hlo','gite_villa');        -- Villa Les Margosiers (aucune)

-- Gardes fail-closed : type inattendu (objet présent) OU code cible inconnu ⇒ abort.
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(m.object_id || '(' || o.object_type || ')', ', ') INTO v
  FROM _lot_a m JOIN object o ON o.id = m.object_id
  WHERE o.object_type::text <> m.exp_type;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'lot A: type inattendu (audit périmé ?): %', v;
  END IF;

  SELECT string_agg(DISTINCT m.domain || '/' || m.new_code, ', ') INTO v
  FROM _lot_a m
  LEFT JOIN ref_code rc ON rc.domain = m.domain AND rc.code = m.new_code
  WHERE rc.id IS NULL;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'lot A: codes cibles inconnus: %', v;
  END IF;
END $$;

-- Corrections des assignations existantes.
UPDATE object_taxonomy ot
SET ref_code_id = rc.id,
    source = 'taxonomy_audit_lot_a_20260717',
    note = 'Correction §187 lot A (audit tous domaines)',
    updated_at = NOW()
FROM _lot_a m
JOIN ref_code rc ON rc.domain = m.domain AND rc.code = m.new_code
WHERE ot.object_id = m.object_id
  AND ot.domain = m.domain
  AND ot.ref_code_id <> rc.id;

-- Fiches sans sous-catégorie (le JOIN object garantit le no-op sur base fraîche).
INSERT INTO object_taxonomy (object_id, domain, ref_code_id, source, note)
SELECT m.object_id, m.domain, rc.id,
       'taxonomy_audit_lot_a_20260717',
       'Correction §187 lot A — fiche sans sous-catégorie avant la passe'
FROM _lot_a m
JOIN object o ON o.id = m.object_id
JOIN ref_code rc ON rc.domain = m.domain AND rc.code = m.new_code
WHERE NOT EXISTS (
  SELECT 1 FROM object_taxonomy ot
  WHERE ot.object_id = m.object_id AND ot.domain = m.domain
)
ON CONFLICT (object_id, domain) DO NOTHING;

-- Caches de filtre par objet touché.
DO $$
DECLARE v_id text;
BEGIN
  FOR v_id IN SELECT m.object_id FROM _lot_a m JOIN object o ON o.id = m.object_id
  LOOP
    PERFORM api.refresh_object_filter_caches(v_id);
  END LOOP;
END $$;

COMMIT;

-- Sur live, exécuter ensuite (hors transaction) :
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
```

- [ ] **Step 2 : Relire le fichier** — vérifier que les 23 lignes du mapping correspondent exactement au tableau §A de `docs/taxonomy-audit-all-domains-2026-07-17.md` (même ids, mêmes codes cibles).

---

### Task 2 : Lot A — appliquer sur live et vérifier

- [ ] **Step 1 : Appliquer** — via MCP Supabase `apply_migration` avec `name: taxonomy_audit_lot_a` et le contenu du fichier (sans les 3 lignes de commentaire final), OU coller le contenu dans le Dashboard SQL editor. Attendu : succès sans erreur.

- [ ] **Step 2 : Rafraîchir les MV** (deux requêtes séparées) :

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
```
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
```

- [ ] **Step 3 : Vérifier le résultat**

```sql
SELECT count(*) AS corrigees FROM object_taxonomy WHERE source = 'taxonomy_audit_lot_a_20260717';
```
Attendu : `corrigees = 23`.

```sql
-- Fiches publiées encore sans sous-catégorie (hors ORG) :
SELECT o.id, o.object_type::text, o.name FROM object o
WHERE o.status='published' AND o.object_type <> 'ORG'
  AND NOT EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.object_id=o.id);
```
Attendu : exactement 4 lignes — `HLORUN00000001B8` (L'Or du Temps) et `HLORUN00000001BF` (La Kaz Bon Dimanche) qui attendent l'arbitrage lot C, plus `LOIRUN00000001AZ` (Ti Kaz Épices) et `LOIRUN00000001A0` (Au temps pour vous) qui seront réglées par le retype du lot B.

- [ ] **Step 4 : Re-run d'idempotence** — ré-exécuter le script complet (via `execute_sql`, pas une 2e migration). Attendu : succès, et la requête du Step 3 renvoie les mêmes résultats (0 changement).

---

### Task 3 : Lot A — conformité dépôt + commit

**Files:**
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql` (après le bloc 13f)
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (après l'entrée 13f)

- [ ] **Step 1 : Ajouter l'étape 13g dans `ci_fresh_apply.sql`**, juste après les deux lignes du bloc `13f` :

```
\echo '== 13g    migration_taxonomy_audit_lot_a.sql  (§187 lot A: 23 corrections intra-domaine RES/LOI/PRD/PSV/HLO issues de l audit tous domaines; data-only, no-op fresh) =='
\ir migration_taxonomy_audit_lot_a.sql
```

- [ ] **Step 2 : Ajouter l'entrée 13g dans `docs/SQL_ROLLOUT_RUNBOOK.md`**, après l'entrée `13f.` :

```
13g. `migration_taxonomy_audit_lot_a.sql` — **§187 lot A (2026-07-17 ; données seules)** : 23 corrections de sous-catégories issues de l'audit taxonomique tous domaines (`docs/taxonomy-audit-all-domains-2026-07-17.md` §A) — RES 8 (dont 2 fiches restaurant codées « chambre d'hôte »), LOI 6, PRD 4 (les apiculteurs rejoignent `apiculture`, resté à 0 usage), PSV 1 (HGL Location vtc→location_vehicule), HLO 4 (fiches récentes sans sous-catégorie). Mapping fiche par fiche commenté dans le fichier ; `source='taxonomy_audit_lot_a_20260717'` ; gardes fail-closed type/code, objet absent = no-op ; `refresh_object_filter_caches` par objet. Après step 11 + 13f. Sur live : rafraîchir ensuite les 2 MV CONCURRENTLY. Idempotent. Live-applied 2026-07-XX (MCP `taxonomy_audit_lot_a`).
```

(Remplacer `2026-07-XX` par la date réelle d'application.)

- [ ] **Step 3 : Commit**

```bash
git add "Base de donnée DLL et API/migration_taxonomy_audit_lot_a.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md && git commit -m "fix(db): §187 lot A — 23 corrections de sous-catégories (audit tous domaines)" -- "Base de donnée DLL et API/migration_taxonomy_audit_lot_a.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md
```

---

### Task 4 : Lot B — écrire la migration `migration_loi_type_boundary_retype.sql`

**Files:**
- Create: `Base de donnée DLL et API/migration_loi_type_boundary_retype.sql`

**Interfaces:**
- Consumes: le nœud `taxonomy_act/root` (seeds) ; les nœuds cibles PRD/PSV existants.
- Produces: le nœud `taxonomy_act/guided_tour` (utilisé par Task 6 pour le snapshot) ; 18 objets retypés.

- [ ] **Step 1 : Créer le fichier avec ce contenu exact**

```sql
-- =============================================================================
-- migration_loi_type_boundary_retype.sql — §187 lot B : frontières de type LOI (2026-07-17)
-- Manifest step 13h. Idempotent — re-run = no-op. Après seeds + 13f + 13g.
-- 18 fiches typées LOI sont en réalité des prestations encadrées (11 → ACT),
-- des producteurs (5 → PRD, règle d'arbitrage §57) ou des loueurs/transporteurs
-- (2 → PSV). Audit : docs/taxonomy-audit-all-domains-2026-07-17.md (§B).
-- ORDRE FORCÉ par validate_object_taxonomy_assignment (13d precedent) :
-- delete anciens liens → retype → re-insert, dans UNE transaction.
-- Les ids gardent leur préfixe LOIRUN (classe cosmétique documentée §186).
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Nouveau nœud ACT `guided_tour` (7 porteurs immédiats : guides/accompagnateurs)
-- ---------------------------------------------------------------------------
WITH act_root AS (
  SELECT id FROM ref_code WHERE domain = 'taxonomy_act' AND code = 'root'
)
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, metadata, name_i18n, description_i18n)
SELECT 'taxonomy_act', 'guided_tour',
       'Visite guidée / accompagnement touristique',
       'Guides, accompagnateurs et visites guidées (hors randonnée montagne)',
       20, act_root.id, TRUE,
       jsonb_build_object('source', 'loi_type_boundary_20260717'),
       jsonb_build_object('fr', 'Visite guidée / accompagnement touristique', 'en', 'Guided tour'),
       jsonb_build_object('fr', 'Guides, accompagnateurs et visites guidées (hors randonnée montagne)')
FROM act_root
ON CONFLICT (domain, code) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, position = EXCLUDED.position,
    parent_id = EXCLUDED.parent_id, is_assignable = TRUE,
    name_i18n = COALESCE(ref_code.name_i18n, '{}'::jsonb) || COALESCE(EXCLUDED.name_i18n, '{}'::jsonb),
    description_i18n = COALESCE(ref_code.description_i18n, '{}'::jsonb) || COALESCE(EXCLUDED.description_i18n, '{}'::jsonb);

SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_act');

-- ---------------------------------------------------------------------------
-- 2. Mapping des retypes
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _retype (
  object_id  text PRIMARY KEY,
  new_type   text NOT NULL,
  new_domain text NOT NULL,
  new_code   text NOT NULL
) ON COMMIT DROP;

INSERT INTO _retype (object_id, new_type, new_domain, new_code) VALUES
  -- LOI → ACT (prestations encadrées, règle §57)
  ('LOIRUN00000001AQ','ACT','taxonomy_act','guided_hiking'), -- AGENCE AVENTURE LA REUNION (accompagnateur ARGAT)
  ('LOIRUN0000000191','ACT','taxonomy_act','guided_hiking'), -- Rando Péizaj 974 (accompagnateur moyenne montagne)
  ('LOIRUN00000001AH','ACT','taxonomy_act','caving'),        -- Ricaric (tunnels de lave)
  ('LOIRUN000000019U','ACT','taxonomy_act','guided_tour'),   -- Découvertes en Terres Signées
  ('LOIRUN0000000198','ACT','taxonomy_act','guided_tour'),   -- Ti Karé Dan Péi
  ('LOIRUN000000017M','ACT','taxonomy_act','guided_tour'),   -- Alexandre DIJOUX - Guide Conférencier
  ('LOIRUN00000000YC','ACT','taxonomy_act','guided_tour'),   -- Enis Rockel
  ('LOIRUN0000000177','ACT','taxonomy_act','guided_tour'),   -- Insel Tours
  ('LOIRUN00000000S6','ACT','taxonomy_act','guided_tour'),   -- Naturev
  ('LOIRUN000000017I','ACT','taxonomy_act','guided_tour'),   -- Dalon La Kour
  ('LOIRUN000000015J','ACT','taxonomy_act','guided_tour'),   -- Au Coeur de La Réunion
  -- LOI → PRD (production + accueil, règle §57)
  ('LOIRUN00000000U5','PRD','taxonomy_prd','produits_terroir'),      -- Papilles des Hauts
  ('LOIRUN00000000VE','PRD','taxonomy_prd','produits_terroir'),      -- Maison du Curcuma
  ('LOIRUN000000010R','PRD','taxonomy_prd','plantation'),            -- Escale Bleue - Atelier Vanille
  ('LOIRUN000000019G','PRD','taxonomy_prd','exploitation_agricole'), -- Entre Fleurs et Plantes
  ('LOIRUN00000001AZ','PRD','taxonomy_prd','exploitation_agricole'), -- Ti Kaz Épices
  -- LOI → PSV (location / transport)
  ('LOIRUN000000019P','PSV','taxonomy_psv','cycle_scooter_rental'),  -- RODBIKELOC
  ('LOIRUN00000001A0','PSV','taxonomy_psv','vtc');                   -- Au temps pour vous

-- Idempotence : retirer du mapping les objets absents (fresh) ou déjà migrés.
DELETE FROM _retype m WHERE NOT EXISTS (SELECT 1 FROM object o WHERE o.id = m.object_id);
DELETE FROM _retype m USING object o WHERE o.id = m.object_id AND o.object_type::text = m.new_type;

-- Garde fail-closed : ce qui reste DOIT être typé LOI (sinon l'audit est périmé).
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(m.object_id || '(' || o.object_type || ')', ', ') INTO v
  FROM _retype m JOIN object o ON o.id = m.object_id
  WHERE o.object_type::text <> 'LOI';
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'lot B: objets ni LOI ni déjà migrés: %', v;
  END IF;

  SELECT string_agg(DISTINCT m.new_domain || '/' || m.new_code, ', ') INTO v
  FROM _retype m
  LEFT JOIN ref_code rc ON rc.domain = m.new_domain AND rc.code = m.new_code
  WHERE rc.id IS NULL;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'lot B: codes cibles inconnus: %', v;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Ordre 13d : delete liens → retype → re-insert
-- ---------------------------------------------------------------------------
DELETE FROM object_taxonomy ot
USING _retype m
WHERE ot.object_id = m.object_id AND ot.domain = 'taxonomy_loi';

UPDATE object o
SET object_type = m.new_type::object_type, updated_at = NOW()
FROM _retype m
WHERE o.id = m.object_id;

INSERT INTO object_taxonomy (object_id, domain, ref_code_id, source, note)
SELECT m.object_id, m.new_domain, rc.id,
       'loi_type_boundary_20260717',
       'Retype §187 lot B — frontière de type (règle §57)'
FROM _retype m
JOIN ref_code rc ON rc.domain = m.new_domain AND rc.code = m.new_code
ON CONFLICT (object_id, domain) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Caches par objet retypé
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_id text;
BEGIN
  FOR v_id IN SELECT object_id FROM _retype
  LOOP
    PERFORM api.refresh_object_filter_caches(v_id);
  END LOOP;
END $$;

COMMIT;

-- Sur live, exécuter ensuite (hors transaction) :
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
```

- [ ] **Step 2 : Relire** — vérifier les 18 lignes contre le tableau §B de l'audit (Bouillon d'Aventure `LOIRUN00000000YR` n'y est PAS : il est au lot C).

---

### Task 5 : Lot B — appliquer sur live et vérifier

- [ ] **Step 1 : Appliquer** — MCP `apply_migration`, `name: loi_type_boundary_retype`, contenu du fichier. Attendu : succès.

- [ ] **Step 2 : Rafraîchir les 2 MV** (mêmes requêtes que Task 2 Step 2).

- [ ] **Step 3 : Vérifier**

```sql
SELECT
  (SELECT count(*) FROM object WHERE object_type='ACT' AND status='published') AS act_pub,
  (SELECT count(*) FROM object WHERE object_type='LOI' AND status='published') AS loi_pub,
  (SELECT count(*) FROM object WHERE object_type='PRD' AND status='published') AS prd_pub,
  (SELECT count(*) FROM object WHERE object_type='PSV' AND status='published') AS psv_pub,
  (SELECT count(*) FROM object_taxonomy ot JOIN ref_code rc ON rc.id=ot.ref_code_id
   WHERE rc.domain='taxonomy_act' AND rc.code='guided_tour') AS guided_tour_usage,
  (SELECT count(*) FROM object_taxonomy WHERE source='loi_type_boundary_20260717') AS retypes;
```

Attendu (si l'état de départ est celui de l'audit) : `act_pub = 63` (52+11), `loi_pub = 85` (103−18), `prd_pub = 41` (36+5), `psv_pub = 20` (18+2), `guided_tour_usage = 7`, `retypes = 18`.

```sql
-- Aucun résidu taxonomy_loi sur les retypés :
SELECT count(*) AS residus FROM object_taxonomy ot
WHERE ot.domain='taxonomy_loi'
  AND ot.object_id IN ('LOIRUN00000001AQ','LOIRUN0000000191','LOIRUN00000001AH','LOIRUN000000019U',
    'LOIRUN0000000198','LOIRUN000000017M','LOIRUN00000000YC','LOIRUN0000000177','LOIRUN00000000S6',
    'LOIRUN000000017I','LOIRUN000000015J','LOIRUN00000000U5','LOIRUN00000000VE','LOIRUN000000010R',
    'LOIRUN000000019G','LOIRUN00000001AZ','LOIRUN000000019P','LOIRUN00000001A0');
```
Attendu : `residus = 0`.

- [ ] **Step 4 : Re-run d'idempotence** — ré-exécuter le script via `execute_sql`. Attendu : succès (le mapping se vide par les deux DELETE d'idempotence), compteurs inchangés.

- [ ] **Step 5 : Vérification visuelle (Explorer)** — ouvrir l'app, filtrer le bucket Activités : les guides (« Enis Rockel », « Insel Tours »…) doivent apparaître sous « Visite guidée / accompagnement touristique » ; « Maison du Curcuma » doit apparaître sous Producteurs.

---

### Task 6 : Lot B — conformité dépôt + commit

**Files:**
- Modify: `Base de donnée DLL et API/migration_taxonomy_trees_seed.sql` (snapshot : +`guided_tour`)
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql` (bloc 13h)
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (entrée 13h)

- [ ] **Step 1 : Snapshot Phase 1** — dans `migration_taxonomy_trees_seed.sql`, après la ligne `('taxonomy_act','craft_workshop',…)`, ajouter cette ligne (une seule ligne, même format que ses voisines) :

```sql
INSERT INTO ref_code (domain,code,name,description,position,is_assignable,name_i18n,description_i18n,icon_url) VALUES ('taxonomy_act','guided_tour','Visite guidée / accompagnement touristique','Guides, accompagnateurs et visites guidées (hors randonnée montagne)','20','t','{"en": "Guided tour", "fr": "Visite guidée / accompagnement touristique"}'::jsonb,'{"fr": "Guides, accompagnateurs et visites guidées (hors randonnée montagne)"}'::jsonb,NULL) ON CONFLICT (domain,code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,position=EXCLUDED.position,is_assignable=EXCLUDED.is_assignable,name_i18n=EXCLUDED.name_i18n,description_i18n=EXCLUDED.description_i18n,icon_url=EXCLUDED.icon_url;
```

- [ ] **Step 2 : Snapshot Phase 2** — dans le bloc `-- Phase 2` du même fichier, ajouter dans la liste `taxonomy_act` (ordre alphabétique, après `('taxonomy_act','guided_snorkeling','root'),`) :

```sql
  ('taxonomy_act','guided_tour','root'),
```

- [ ] **Step 3 : Mettre à jour les compteurs du header du snapshot** — `218 ref_code nodes` → `219`, `199 parent links` → `200` (deux occurrences : header du fichier ET l'écho `taxo` de `ci_fresh_apply.sql` + l'entrée `taxo.` du runbook).

- [ ] **Step 4 : Ajouter le bloc 13h dans `ci_fresh_apply.sql`** (après 13g) :

```
\echo '== 13h    migration_loi_type_boundary_retype.sql  (§187 lot B: 18 retypes LOI→ACT(11)/PRD(5)/PSV(2) méthode 13d + nouveau noeud taxonomy_act guided_tour; ids gardent le préfixe LOIRUN; no-op fresh) =='
\ir migration_loi_type_boundary_retype.sql
```

- [ ] **Step 5 : Ajouter l'entrée 13h dans le runbook** (après 13g) :

```
13h. `migration_loi_type_boundary_retype.sql` — **§187 lot B (2026-07-17 ; catalogue + retypes)** : 18 fiches typées LOI étaient des prestations encadrées, des producteurs ou des loueurs/transporteurs (audit §B) — 11 → ACT (dont 7 sous le NOUVEAU nœud `taxonomy_act/guided_tour` « Visite guidée / accompagnement touristique », position 20 ; les accompagnateurs montagne → `guided_hiking`, Ricaric → `caving`), 5 → PRD (règle §57 production+accueil), 2 → PSV. Ordre 13d FORCÉ par `validate_object_taxonomy_assignment` (delete liens → retype → re-insert, une transaction) ; idempotent (les objets déjà migrés sortent du mapping) ; gardes fail-closed ; `refresh_object_filter_caches` par objet ; les ids gardent leur préfixe LOIRUN (classe cosmétique §186). `guided_tour` est AUSSI dans le snapshot `taxo` (219 nœuds / 200 liens). Après 13g. Sur live : rafraîchir ensuite les 2 MV CONCURRENTLY. Live-applied 2026-07-XX (MCP `loi_type_boundary_retype`).
```

- [ ] **Step 6 : Commit**

```bash
git add "Base de donnée DLL et API/migration_loi_type_boundary_retype.sql" "Base de donnée DLL et API/migration_taxonomy_trees_seed.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md && git commit -m "fix(db): §187 lot B — 18 retypes LOI→ACT/PRD/PSV + nœud ACT guided_tour" -- "Base de donnée DLL et API/migration_loi_type_boundary_retype.sql" "Base de donnée DLL et API/migration_taxonomy_trees_seed.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md
```

---

### Task 7 : Lot C — transmettre les arbitrages à l'OTI (POINT D'ARRÊT)

**Aucun SQL dans cette tâche.** Le lot C ne s'applique QU'APRÈS réponse de l'OTI.

- [ ] **Step 1 : Extraire le tableau** de la section « C. Arbitrages PO » de `docs/taxonomy-audit-all-domains-2026-07-17.md` (16 fiches + 3 paires de doublons + le cas Bouillon d'Aventure `LOIRUN00000000YR` → ASC `sports_club` ou LOI `divertissement`).

- [ ] **Step 2 : Le mettre en forme** (mail ou tableau partagé) avec 3 colonnes à remplir par l'OTI : `Décision` / `Commentaire` / `Qui a vérifié`. Une ligne par fiche, avec le lien Explorer (`https://<app>/?fiche=<object_id>`) pour que l'OTI voie la fiche.

- [ ] **Step 3 : À réception des réponses** — appliquer les décisions avec le MÊME pattern que le lot A (une petite migration `migration_taxonomy_audit_lot_c.sql`, temp table (object_id, exp_type, domain, new_code), gardes, UPDATE/INSERT, caches, MV) ; les éventuelles fusions de doublons passent par l'archivage du doublon (`status='archived'`) — **jamais** de `DELETE FROM object` direct ; si une suppression définitive est demandée, utiliser `api.rpc_delete_object` (voie §108, superuser).

---

### Task 8 : Lot D — hygiène du catalogue (APRÈS lots A et B uniquement)

**Files:**
- Create: `Base de donnée DLL et API/migration_taxonomy_catalog_hygiene.sql`
- Modify: `Base de donnée DLL et API/migration_taxonomy_trees_seed.sql` (flips `is_assignable`)
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql` + `docs/SQL_ROLLOUT_RUNBOOK.md` (bloc 13i)

- [ ] **Step 1 : Créer `migration_taxonomy_catalog_hygiene.sql`**

```sql
-- =============================================================================
-- migration_taxonomy_catalog_hygiene.sql — §187 lot D : hygiène du catalogue (2026-07-17)
-- Manifest step 13i. Idempotent. APRÈS 13g + 13h (les désactivations supposent
-- que les porteurs ont été recodés/retypés). On DÉSACTIVE (is_active=false,
-- is_assignable=false), on ne supprime JAMAIS un code (FK potentielles + historique).
-- Garde fail-closed : un code à désactiver qui a encore des porteurs ⇒ abort.
-- Exclusions volontaires : taxonomy_loi/chocolatier (1 porteur archivé),
-- taxonomy_res/autre_type_de_restauration (fourre-tout conservé).
-- =============================================================================
BEGIN;

-- ZAMPONE : dernier porteur du quasi-doublon `artisanat` → `art_artisanat`.
UPDATE object_taxonomy ot
SET ref_code_id = rc2.id,
    source = 'taxonomy_hygiene_20260717',
    note = 'Fusion §187 lot D — artisanat → art_artisanat',
    updated_at = NOW()
FROM ref_code rc1, ref_code rc2
WHERE rc1.domain = 'taxonomy_loi' AND rc1.code = 'artisanat'
  AND rc2.domain = 'taxonomy_loi' AND rc2.code = 'art_artisanat'
  AND ot.object_id = 'LOIRUN00000000V1' AND ot.domain = 'taxonomy_loi'
  AND ot.ref_code_id = rc1.id;

CREATE TEMP TABLE _deact (domain text, code text, PRIMARY KEY (domain, code)) ON COMMIT DROP;
INSERT INTO _deact (domain, code) VALUES
  -- RES : doublon orthographique + concept d'hébergement
  ('taxonomy_res', 'table_d_hotes'),
  ('taxonomy_res', 'chambre_d_hote'),
  -- LOI : codes « prestation » qui doublonnent ACT/PSV (0 usage après lot B) + quasi-doublons
  ('taxonomy_loi', 'randonnee_pedestre'),
  ('taxonomy_loi', 'speleologie_tunnels_de_lave'),
  ('taxonomy_loi', 'guide_accompagnateur_touristique'),
  ('taxonomy_loi', 'v_t_t_autres_cycles'),
  ('taxonomy_loi', 'restauration_traditionnelle'),
  ('taxonomy_loi', 'terre'),
  ('taxonomy_loi', 'terroir'),
  ('taxonomy_loi', 'horticulture'),
  ('taxonomy_loi', 'art'),
  ('taxonomy_loi', 'artisanat'),
  ('taxonomy_loi', 'visite_guidee'),
  -- HLO : doublon + code orphelin
  ('taxonomy_hlo', 'gite_d_etape_et_de_randonnee'),
  ('taxonomy_hlo', 'auberge'),
  -- ORG : domaine hérité entier (une ORG ne porte pas de taxonomie métier)
  ('taxonomy_org', 'autocar_compagnie'),
  ('taxonomy_org', 'services'),
  ('taxonomy_org', 'excursion_touristique'),
  ('taxonomy_org', 'location_de_voiture_avec_chauffeur'),
  ('taxonomy_org', 'massage_bien_etre'),
  ('taxonomy_org', 'v_t_t_autres_cycles'),
  ('taxonomy_org', 'vtc');

-- AUTO-RETRAIT (codes qui peuvent encore porter des fiches légitimement) :
--  * visite_guidee : porteurs LÉGITIMES restants (lieux qui se visitent — Domaine
--    Archambaud, Entre 2 Songes, jardins…) ; ne se désactivera que si l'OTI les recode.
--  * terre : encore porté par Bouillon d'Aventure (LOIRUN00000000YR), en arbitrage
--    lot C (ASC sports_club vs LOI divertissement) ; se libérera après la réponse OTI.
-- Ces deux codes sortent du lot s'ils ont des porteurs, au lieu de faire échouer la garde.
DELETE FROM _deact d
USING ref_code rc
WHERE rc.domain = d.domain AND rc.code = d.code
  AND EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id)
  AND d.code IN ('visite_guidee', 'terre');

-- Garde fail-closed pour tout le reste : porteurs restants ⇒ abort.
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(d.domain || '/' || d.code || '=' ||
         (SELECT count(*) FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id)::text, ', ') INTO v
  FROM _deact d
  JOIN ref_code rc ON rc.domain = d.domain AND rc.code = d.code
  WHERE EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id);
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'lot D: codes encore portés (lots A/B pas appliqués ?): %', v;
  END IF;
END $$;

UPDATE ref_code rc
SET is_active = FALSE, is_assignable = FALSE, updated_at = NOW()
FROM _deact d
WHERE rc.domain = d.domain AND rc.code = d.code
  AND (rc.is_active OR rc.is_assignable);

UPDATE ref_code_domain_registry
SET is_active = FALSE, updated_at = NOW()
WHERE domain = 'taxonomy_org' AND is_active;

COMMIT;

-- Sur live, exécuter ensuite (hors transaction) :
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
```

- [ ] **Step 2 : Appliquer sur live** (MCP `apply_migration`, `name: taxonomy_catalog_hygiene`) + rafraîchir les 2 MV. Attendu : succès. Si la garde lève avec `visite_guidee` dans la liste → bug : la ligne d'auto-retrait n'a pas fonctionné, STOP.

- [ ] **Step 3 : Vérifier**

```sql
SELECT rc.domain, rc.code FROM ref_code rc
WHERE rc.domain LIKE 'taxonomy_%' AND (NOT rc.is_active OR NOT rc.is_assignable)
ORDER BY rc.domain, rc.code;
```
Attendu : les codes de `_deact` effectivement désactivés (moins `visite_guidee` s'il porte encore des fiches) + les 19 racines techniques `root` (is_assignable=false, normal).

```sql
-- L'éditeur §01 ne doit plus proposer les codes désactivés :
SELECT jsonb_array_length(api.list_catalog('taxonomy_loi')) AS loi_nodes;
```
Noter la valeur avant/après (elle doit baisser du nombre de codes LOI désactivés). Ouvrir l'éditeur d'une fiche LOI (§01) et vérifier que « Terre », « Terroir », « Restauration traditionnelle » n'apparaissent plus dans le sélecteur de sous-catégorie.

- [ ] **Step 4 : Snapshot — flips `is_assignable`** : dans `migration_taxonomy_trees_seed.sql`, pour CHAQUE code désactivé au Step 3 (la liste effective retournée par la requête de vérification), trouver sa ligne Phase 1 et remplacer le 6ᵉ champ des VALUES `'t'` par `'f'`. Exemple complet pour `terre` — avant :

```sql
INSERT INTO ref_code (domain,code,name,description,position,is_assignable,name_i18n,description_i18n,icon_url) VALUES ('taxonomy_loi','terre','Terre',…,'t',…
```
après :
```sql
INSERT INTO ref_code (domain,code,name,description,position,is_assignable,name_i18n,description_i18n,icon_url) VALUES ('taxonomy_loi','terre','Terre',…,'f',…
```
(Ne toucher qu'au champ `'t'`→`'f'` en 6ᵉ position ; le reste de la ligne est inchangé. Raison : le snapshot `taxo` se ré-applique en fin de manifest et écraserait `is_assignable` sinon ; il ne touche pas `is_active`.)

- [ ] **Step 5 : Bloc 13i dans `ci_fresh_apply.sql`** (après 13h) :

```
\echo '== 13i    migration_taxonomy_catalog_hygiene.sql  (§187 lot D: desactivation des codes 0-usage — dupes RES table_d_hotes/chambre_d_hote, codes LOI prestation doublonnant ACT, HLO gite_d_etape/auberge, domaine taxonomy_org entier; fusion ZAMPONE artisanat→art_artisanat; garde 0-usage fail-closed; APRES 13g+13h) =='
\ir migration_taxonomy_catalog_hygiene.sql
```

- [ ] **Step 6 : Entrée 13i dans le runbook** (après 13h) :

```
13i. `migration_taxonomy_catalog_hygiene.sql` — **§187 lot D (2026-07-17 ; hygiène du catalogue)** : désactive (`is_active=false` + `is_assignable=false` — JAMAIS de DELETE) les codes de taxonomie à 0 usage après les lots A/B : doublons RES (`table_d_hotes`, `chambre_d_hote`), codes LOI « prestation » doublonnant ACT/PSV (`randonnee_pedestre`, `speleologie_tunnels_de_lave`, `guide_accompagnateur_touristique`, `v_t_t_autres_cycles`, `restauration_traditionnelle`, `terre`, `terroir`, `horticulture`, `art`, `artisanat`), HLO (`gite_d_etape_et_de_randonnee`, `auberge`), et le domaine hérité `taxonomy_org` entier (7 codes + registre). `visite_guidee` s'auto-retire du lot tant qu'il porte des lieux légitimes. ZAMPONE recodé `artisanat`→`art_artisanat` au passage. Garde 0-usage fail-closed ; les flips `is_assignable` sont reportés dans le snapshot `taxo` (sinon il les ré-activerait en fin de manifest). Exclusions : `chocolatier` (1 porteur archivé), `autre_type_de_restauration` (fourre-tout conservé). Après 13g+13h. Sur live : rafraîchir les 2 MV. Live-applied 2026-07-XX (MCP `taxonomy_catalog_hygiene`).
```

- [ ] **Step 7 : Commit**

```bash
git add "Base de donnée DLL et API/migration_taxonomy_catalog_hygiene.sql" "Base de donnée DLL et API/migration_taxonomy_trees_seed.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md && git commit -m "fix(db): §187 lot D — hygiène du catalogue de taxonomie (désactivations 0-usage + fusion artisanat)" -- "Base de donnée DLL et API/migration_taxonomy_catalog_hygiene.sql" "Base de donnée DLL et API/migration_taxonomy_trees_seed.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md
```

---

### Task 9 : Documentation de clôture

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (nouvelle entrée §)
- Modify: `.claude/WORKFLOW.md` (tracker — local, non versionné)

- [ ] **Step 1 : Journal de décisions** — trouver le prochain numéro : `grep -n "^## §" bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md | tail -3`, puis ajouter à la fin du fichier :

```markdown
## §<n> — Remédiation taxonomique lots A/B/D exécutés (2026-07-XX)

Exécution du plan `docs/superpowers/plans/2026-07-17-taxonomy-remediation-lots-abcd.md` (audit §187) : lot A = 23 corrections intra-domaine (migrations 13g, source `taxonomy_audit_lot_a_20260717`) ; lot B = 18 retypes LOI→ACT(11)/PRD(5)/PSV(2) méthode 13d + nouveau nœud `taxonomy_act/guided_tour` (13h, 7 porteurs) ; lot D = désactivation des codes 0-usage + fusion `artisanat`→`art_artisanat` + domaine `taxonomy_org` désactivé (13i). Compteurs post-lot B vérifiés : ACT publiés 63, LOI 85, PRD 41, PSV 20. Lot C (16 arbitrages + 3 paires de doublons HLO + Bouillon d'Aventure) transmis à l'OTI le <date>, en attente de réponses. [Adapter si un écart a été rencontré — le documenter ici.]
```

- [ ] **Step 2 : Tracker** — dans `.claude/WORKFLOW.md`, mettre à jour la ligne « Audit taxonomique tous domaines » : lots A/B/D → DONE avec la date ; lot C → en attente OTI.

- [ ] **Step 3 : Commit du journal** (le decision log est dans le dépôt UI ; vérifier `git check-ignore` avant — s'il est ignoré, ne pas committer) :

```bash
git check-ignore bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md || git add bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md && git commit -m "docs: §<n> remédiation taxonomique lots A/B/D" -- bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md
```

- [ ] **Step 4 : Signaler au PO** — résumé : lots appliqués, compteurs vérifiés, lot C envoyé, tout écart rencontré.
