-- migration_crm_module.sql
-- §58 — Module CRM (P2.2) : vocabulaires + backfill + helpers + RPCs + RLS par commande.
--
-- 1) DETTE D'IMPORT (lot1_crm_import_plan.md §4) : demand_topic_id / request_mood_id NULL
--    partout ; sujets résolus stockés dans extra.oti_demand_topic_id (1 344 lignes), humeurs
--    emoji brutes dans extra.humeur_raw (3 175 lignes). Cause : les 20 sujets OTI étaient
--    seedés sous le domaine 'crm_demand_topic_oti' (partition DEFAULT ref_code_other) alors
--    que la FK cible la partition ref_code_demand_topic ; et ref_code_mood est un vocabulaire
--    d'ENVIES TOURISTIQUES (aventure/détente/famille), pas de sentiment relationnel.
-- 2) FUSION SUJETS : les 20 codes OTI migrent vers domain='demand_topic' (row movement
--    automatique vers la bonne partition ; UUID stables ⇒ extra.oti_demand_topic_id reste
--    résoluble). Les 11 demand_topic génériques + les 22 demand_subtopic, JAMAIS référencés
--    (vérifié live 2026-06-11 : 0 object_taxonomy / 0 closure / 0 crm_interaction), sont
--    supprimés — une seule source de vérité (DO block fail-closed re-vérifie avant DELETE).
-- 3) SENTIMENT : nouveau domaine 'crm_sentiment' (partition dédiée), colonnes renommées
--    request_mood_id→request_sentiment_id / response_mood_id→response_sentiment_id (0
--    consommateur), FK re-pointées. Mapping : 😃 tres_positif · 🙂/ok positif ·
--    🤔 interrogatif · 😡 mecontent · 😭 tres_mecontent · 😨 inquiet. extra.humeur_raw
--    conservé (source préservée).
-- 4) ACCÈS (décisions spec 2026-06-11) : RPC-only authorize-once+DEFINER (§36) ; lecture =
--    membres ORG publisher (api.current_user_crm_object_ids, set-based §35) ; écriture =
--    write_crm_notes OU admin ORG OU superuser. Tables verrouillées : famille admin par
--    commande (§47), prédicat wrappé (select auth.role()) (§39). PII jamais en PostgREST
--    direct ⇒ flags advisor security_definer attendus (même classe que get_object_cards_batch).
--
-- PREREQUISITES : schema_unified.sql (tables crm_*), rls_policies.sql (user_has_permission,
-- is_platform_superuser, current_user_admin_rank), seeds_data.sql ÉDITÉ dans la même passe
-- (topics OTI seedés sous 'demand_topic' ; blocs génériques retirés) — sur un build fresh les
-- UPDATE/DELETE/backfills sont des no-op et l'état final est identique (gate fresh-apply).
-- Manifest step 8z. IDEMPOTENT (IF NOT EXISTS / IF EXISTS / ON CONFLICT / WHERE-guarded).
-- REVERSIBLE : renommages inverses + ré-INSERT des codes retirés (archivés dans ce fichier).
-- Couvert par tests/test_crm_module.sql.
BEGIN;

-- ---------- 1. Partition + seeds 'crm_sentiment' ----------
CREATE TABLE IF NOT EXISTS ref_code_crm_sentiment
  PARTITION OF ref_code FOR VALUES IN ('crm_sentiment');
-- FK-cible : même mécanisme d'unicité que ref_code_demand_topic / ref_code_mood.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_crm_sentiment_id ON ref_code_crm_sentiment(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_crm_sentiment_code ON ref_code_crm_sentiment(code);

INSERT INTO ref_code (domain, code, name, description, position) VALUES
 ('crm_sentiment','tres_positif',  'Très positif',  'Source import : 😃', 1),
 ('crm_sentiment','positif',       'Positif',       'Source import : 🙂 / ok', 2),
 ('crm_sentiment','interrogatif',  'Interrogatif',  'Source import : 🤔', 3),
 ('crm_sentiment','inquiet',       'Inquiet',       'Source import : 😨', 4),
 ('crm_sentiment','mecontent',     'Mécontent',     'Source import : 😡', 5),
 ('crm_sentiment','tres_mecontent','Très mécontent','Source import : 😭', 6)
ON CONFLICT DO NOTHING;

-- ---------- 2. Retrait fail-closed des 11 demand_topic génériques + 22 demand_subtopic ----------
DO $$
DECLARE
  v_refs bigint;
  c_generic_topics text[] := ARRAY['accessibilite','evenement','groupe','information',
    'logistique','marketing','partenariat','presse','reclamation','reservation','urgence'];
BEGIN
  SELECT count(*) INTO v_refs FROM (
    SELECT 1 FROM object_taxonomy ot
      WHERE ot.ref_code_id IN (SELECT id FROM ref_code
        WHERE (domain='demand_topic' AND code = ANY(c_generic_topics)) OR domain='demand_subtopic')
    UNION ALL
    SELECT 1 FROM ref_code_taxonomy_closure c
      WHERE c.ancestor_id IN (SELECT id FROM ref_code
        WHERE (domain='demand_topic' AND code = ANY(c_generic_topics)) OR domain='demand_subtopic')
         OR c.descendant_id IN (SELECT id FROM ref_code
        WHERE (domain='demand_topic' AND code = ANY(c_generic_topics)) OR domain='demand_subtopic')
    UNION ALL
    SELECT 1 FROM crm_interaction ci
      WHERE ci.demand_topic_id IN (SELECT id FROM ref_code
        WHERE domain='demand_topic' AND code = ANY(c_generic_topics))
         OR ci.demand_subtopic_id IS NOT NULL
  ) refs;
  IF v_refs > 0 THEN
    RAISE EXCEPTION 'migration_crm_module: % référence(s) vers les codes demand_topic/subtopic à retirer — abandon (fail-closed)', v_refs;
  END IF;
  DELETE FROM ref_code WHERE domain='demand_topic' AND code = ANY(c_generic_topics);
  DELETE FROM ref_code WHERE domain='demand_subtopic';
END$$;

-- ---------- 3. Fusion : les 20 sujets OTI deviennent LE domaine demand_topic ----------
-- Row movement automatique ref_code_other → ref_code_demand_topic ; UUID stables.
UPDATE ref_code SET domain = 'demand_topic' WHERE domain = 'crm_demand_topic_oti';

-- ---------- 4. Renommage + re-pointage FK sentiment ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='crm_interaction' AND column_name='request_mood_id') THEN
    ALTER TABLE crm_interaction RENAME COLUMN request_mood_id TO request_sentiment_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='crm_interaction' AND column_name='response_mood_id') THEN
    ALTER TABLE crm_interaction RENAME COLUMN response_mood_id TO response_sentiment_id;
  END IF;
END$$;
ALTER TABLE crm_interaction DROP CONSTRAINT IF EXISTS crm_interaction_request_mood_id_fkey;
ALTER TABLE crm_interaction DROP CONSTRAINT IF EXISTS crm_interaction_response_mood_id_fkey;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crm_interaction_request_sentiment_id_fkey') THEN
    ALTER TABLE crm_interaction ADD CONSTRAINT crm_interaction_request_sentiment_id_fkey
      FOREIGN KEY (request_sentiment_id) REFERENCES ref_code_crm_sentiment(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crm_interaction_response_sentiment_id_fkey') THEN
    ALTER TABLE crm_interaction ADD CONSTRAINT crm_interaction_response_sentiment_id_fkey
      FOREIGN KEY (response_sentiment_id) REFERENCES ref_code_crm_sentiment(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ---------- 5. Backfills (idempotents : WHERE ... IS NULL) ----------
-- Sujets : ~1 344 lignes attendues (extra.oti_demand_topic_id posé par l'import).
UPDATE crm_interaction ci
SET demand_topic_id = rc.id
FROM ref_code_demand_topic rc
WHERE ci.demand_topic_id IS NULL
  AND NULLIF(ci.extra->>'oti_demand_topic_id','') IS NOT NULL
  AND rc.id = (ci.extra->>'oti_demand_topic_id')::uuid;

-- Sentiments : 3 175 lignes attendues (7 valeurs brutes, toutes couvertes).
UPDATE crm_interaction ci
SET request_sentiment_id = rc.id
FROM (VALUES
  ('😃','tres_positif'), ('🙂','positif'), ('ok','positif'),
  ('🤔','interrogatif'), ('😡','mecontent'), ('😭','tres_mecontent'), ('😨','inquiet')
) m(raw, code)
JOIN ref_code_crm_sentiment rc ON rc.code = m.code
WHERE ci.request_sentiment_id IS NULL
  AND ci.extra->>'humeur_raw' = m.raw;

-- ---------- 6. Index (crm_interaction n'en avait AUCUN) ----------
CREATE INDEX IF NOT EXISTS idx_crm_interaction_object_occurred
  ON crm_interaction(object_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_interaction_occurred
  ON crm_interaction(occurred_at DESC, id DESC); -- keyset timeline org-wide
