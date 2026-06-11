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
--    Conservés volontairement (vides) : la partition ref_code_demand_subtopic, la colonne
--    crm_interaction.demand_subtopic_id et sa FK — emplacement d'un futur vocabulaire de
--    sous-sujets OTI (décision §58 ; ref_code_mood garde ses consommateurs object_taxonomy/closure).
-- 4) ACCÈS (décisions spec 2026-06-11) : RPC-only authorize-once+DEFINER (§36) ; lecture =
--    membres ORG publisher (api.current_user_crm_object_ids, set-based §35) ; écriture =
--    write_crm_notes OU admin ORG OU superuser. Tables verrouillées : famille admin par
--    commande (§47), prédicat wrappé (select auth.role()) (§39). PII jamais en PostgREST
--    direct ⇒ flags advisor security_definer attendus (même classe que get_object_cards_batch).
--
-- PREREQUISITES : schema_unified.sql (tables crm_*), rls_policies.sql (user_has_permission,
-- is_platform_superuser, current_user_admin_rank). seeds_data.sql est édité dans la MÊME
-- passe (Task 4 — topics OTI seedés sous 'demand_topic', blocs génériques retirés) : sur un
-- build fresh post-passe, les UPDATE/DELETE/backfills convergent vers le même état final
-- (gate fresh-apply).
-- Manifest step 8z. IDEMPOTENT (IF NOT EXISTS / IF EXISTS / ON CONFLICT / WHERE-guarded).
-- REVERSIBLE : renommages inverses + ré-INSERT des 33 codes retirés depuis l'historique git
-- de seeds_data.sql (état pré-8z).
-- Couvert par tests/test_crm_module.sql (Task 5 de la même passe).
BEGIN;

-- ---------- 1. Partition + seeds 'crm_sentiment' ----------
CREATE TABLE IF NOT EXISTS ref_code_crm_sentiment
  PARTITION OF ref_code FOR VALUES IN ('crm_sentiment');
-- FK-cible : même mécanisme d'unicité que ref_code_demand_topic / ref_code_mood.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_crm_sentiment_id ON ref_code_crm_sentiment(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_crm_sentiment_code ON ref_code_crm_sentiment(code);
-- RLS comme les partitions sœurs (les policies du parent ne couvrent PAS les accès directs à
-- une partition) : paire FOR ALL maison des ref_* — l'exception documentée CLAUDE.md, le
-- USING(true) de lecture court-circuite. Flag advisor rls_disabled_in_public sinon.
ALTER TABLE ref_code_crm_sentiment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pub_ref_code_read" ON ref_code_crm_sentiment;
DROP POLICY IF EXISTS "admin_ref_code_write" ON ref_code_crm_sentiment;
CREATE POLICY "pub_ref_code_read" ON ref_code_crm_sentiment FOR SELECT USING (true);
CREATE POLICY "admin_ref_code_write" ON ref_code_crm_sentiment FOR ALL
  USING (auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]));

INSERT INTO ref_code (domain, code, name, description, position) VALUES
 ('crm_sentiment','tres_positif',  'Très positif',  'Source import : 😃', 1),
 ('crm_sentiment','positif',       'Positif',       'Source import : 🙂 / ok', 2),
 ('crm_sentiment','interrogatif',  'Interrogatif',  'Source import : 🤔', 3),
 ('crm_sentiment','inquiet',       'Inquiet',       'Source import : 😨', 4),
 ('crm_sentiment','mecontent',     'Mécontent',     'Source import : 😡', 5),
 ('crm_sentiment','tres_mecontent','Très mécontent','Source import : 😭', 6)
ON CONFLICT DO NOTHING;

-- ---------- 2. Retrait fail-closed des 11 demand_topic génériques + 22 demand_subtopic ----------
-- Legs 1-2 valident aussi les codes DÉPLACÉS (object_taxonomy/closure n'ont pas ON UPDATE CASCADE) ; leg 3 ne probe que les codes supprimés — les interactions backfillées référencent légitimement les codes déplacés.
DO $$
DECLARE
  v_refs bigint;
  c_generic_topics text[] := ARRAY['accessibilite','evenement','groupe','information',
    'logistique','marketing','partenariat','presse','reclamation','reservation','urgence'];
BEGIN
  SELECT count(*) INTO v_refs FROM (
    SELECT 1 FROM object_taxonomy ot
      WHERE ot.ref_code_id IN (SELECT id FROM ref_code
        WHERE (domain='demand_topic' AND code = ANY(c_generic_topics)) OR domain='demand_subtopic' OR domain='crm_demand_topic_oti')
    UNION ALL
    SELECT 1 FROM ref_code_taxonomy_closure c
      WHERE c.ancestor_id IN (SELECT id FROM ref_code
        WHERE (domain='demand_topic' AND code = ANY(c_generic_topics)) OR domain='demand_subtopic' OR domain='crm_demand_topic_oti')
         OR c.descendant_id IN (SELECT id FROM ref_code
        WHERE (domain='demand_topic' AND code = ANY(c_generic_topics)) OR domain='demand_subtopic' OR domain='crm_demand_topic_oti')
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

-- ---------- 7. Helpers d'autorisation (style current_user_extended_object_ids, §35) ----------
-- Périmètre CRM = objets dont une ORG du user (membership actif) est PUBLISHER.
-- Volontairement plus étroit que extended (pas d'arme acteur, pas d'arme all_published) :
-- le CRM est le pilotage interne de l'ORG publicatrice, pas un droit d'édition.
CREATE OR REPLACE FUNCTION api.current_user_crm_object_ids()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT ool.object_id
  FROM user_org_membership uom
  JOIN object_org_link ool ON ool.org_object_id = uom.org_object_id
  JOIN ref_org_role r      ON r.id = ool.role_id AND r.code = 'publisher'
  WHERE uom.user_id = auth.uid()
    AND uom.is_active = TRUE;
$$;

CREATE OR REPLACE FUNCTION api.user_can_read_crm(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT api.is_platform_superuser()
      OR p_object_id IN (SELECT api.current_user_crm_object_ids());
$$;

-- Écriture : superuser OU (membre ORG publisher ET (permission write_crm_notes OU rôle
-- admin ORG actif — current_user_admin_rank() IS NOT NULL, cf. rls_policies.sql:331)).
CREATE OR REPLACE FUNCTION api.user_can_write_crm(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT api.is_platform_superuser()
      OR (p_object_id IN (SELECT api.current_user_crm_object_ids())
          AND (api.user_has_permission('write_crm_notes')
               OR api.current_user_admin_rank() IS NOT NULL));
$$;

REVOKE ALL ON FUNCTION api.current_user_crm_object_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.current_user_crm_object_ids() TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.user_can_read_crm(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.user_can_read_crm(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.user_can_write_crm(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.user_can_write_crm(text) TO authenticated, service_role;

-- ---------- 8. RPCs DEFINER authorize-once (§36) ----------
-- Chaque RPC s'auto-autorise UNE fois (jamais confiance aux ids du caller), puis lit/écrit
-- RLS-free. Les écritures utilisent gen_random_uuid() (JAMAIS uuid_generate_v4 — §29 :
-- search_path restreint sans 'extensions').

-- Timeline org-wide (ou par objet), keyset composite (occurred_at, id) — les ex æquo de
-- timestamp ne sont plus perdus en bord de page —, filtres topic/type/sentiment.
-- La signature change (p_before_id ajouté) : DROP de l'ancienne pour éviter une surcharge
-- résiduelle ambiguë côté PostgREST sur une base ayant appliqué la révision précédente.
DROP FUNCTION IF EXISTS api.list_crm_timeline(text, text, text, text, timestamptz, integer);
CREATE OR REPLACE FUNCTION api.list_crm_timeline(
  p_object_id text DEFAULT NULL,
  p_topic_code text DEFAULT NULL,
  p_interaction_type text DEFAULT NULL,
  p_sentiment_code text DEFAULT NULL,
  p_before timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_scope text[];
  v_items jsonb;
  v_has_more boolean;
BEGIN
  -- Authorize once : superuser ⇒ pas de restriction (v_scope reste NULL).
  IF NOT api.is_platform_superuser() THEN
    v_scope := ARRAY(SELECT api.current_user_crm_object_ids());
    IF COALESCE(array_length(v_scope, 1), 0) = 0 THEN
      RETURN jsonb_build_object('items', '[]'::jsonb, 'has_more', false);
    END IF;
    IF p_object_id IS NOT NULL AND NOT (p_object_id = ANY(v_scope)) THEN
      RAISE EXCEPTION 'CRM non autorisé pour cet objet' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Une seule requête (pas de second probe à dériver) : v_limit + 1 lignes, la ligne
  -- excédentaire signale has_more puis est retranchée.
  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'id', ci.id, 'object_id', ci.object_id, 'object_name', o.name,
      'interaction_type', ci.interaction_type, 'direction', ci.direction,
      'status', ci.status, 'subject', ci.subject, 'body', ci.body,
      'occurred_at', ci.occurred_at, 'created_at', ci.created_at,
      'actor_id', ci.actor_id, 'actor_name', a.display_name,
      'topic_code', t.code, 'topic_name', t.name,
      'sentiment_code', s.code, 'sentiment_name', s.name,
      'owner_name', p.display_name, 'source', ci.source
    ) AS item
    FROM crm_interaction ci
    JOIN object o ON o.id = ci.object_id
    LEFT JOIN actor a ON a.id = ci.actor_id
    LEFT JOIN ref_code_demand_topic t ON t.id = ci.demand_topic_id
    LEFT JOIN ref_code_crm_sentiment s ON s.id = ci.request_sentiment_id
    LEFT JOIN app_user_profile p ON p.id = ci.owner
    WHERE (v_scope IS NULL OR ci.object_id = ANY(v_scope))
      AND (p_object_id IS NULL OR ci.object_id = p_object_id)
      AND (p_topic_code IS NULL OR t.code = p_topic_code)
      AND (p_interaction_type IS NULL OR ci.interaction_type::text = p_interaction_type)
      AND (p_sentiment_code IS NULL OR s.code = p_sentiment_code)
      -- Curseur row-wise (aligné sur idx_crm_interaction_occurred) ; sans p_before_id le
      -- fallback uuid-zéro dégrade vers l'ancien occurred_at < p_before (id < zéro jamais vrai).
      AND (p_before IS NULL
           OR (ci.occurred_at, ci.id) < (p_before, COALESCE(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    ORDER BY ci.occurred_at DESC NULLS LAST, ci.id DESC
    LIMIT v_limit + 1
  ) q;

  v_has_more := jsonb_array_length(v_items) > v_limit;
  IF v_has_more THEN
    v_items := (
      SELECT COALESCE(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
      FROM jsonb_array_elements(v_items) WITH ORDINALITY AS t(value, ord)
      WHERE ord <= v_limit
    );
  END IF;

  RETURN jsonb_build_object('items', v_items, 'has_more', v_has_more);
END;
$$;

-- Tâches CRM du périmètre (échéance croissante, NULLS LAST).
CREATE OR REPLACE FUNCTION api.list_crm_tasks()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_scope text[];
  v_items jsonb;
BEGIN
  IF NOT api.is_platform_superuser() THEN
    v_scope := ARRAY(SELECT api.current_user_crm_object_ids());
    IF COALESCE(array_length(v_scope, 1), 0) = 0 THEN
      RETURN '[]'::jsonb;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'id', ct.id, 'object_id', ct.object_id, 'object_name', o.name,
      'title', ct.title, 'description', ct.description,
      'status', ct.status, 'priority', ct.priority,
      'due_at', ct.due_at, 'created_at', ct.created_at,
      'owner_name', p.display_name,
      'related_interaction_subject', ri.subject
    ) AS item
    FROM crm_task ct
    JOIN object o ON o.id = ct.object_id
    LEFT JOIN app_user_profile p ON p.id = ct.owner
    LEFT JOIN crm_interaction ri ON ri.id = ct.related_interaction_id
    WHERE (v_scope IS NULL OR ct.object_id = ANY(v_scope))
    ORDER BY ct.due_at ASC NULLS LAST, ct.created_at DESC
  ) q;

  RETURN v_items;
END;
$$;

-- Upsert tâche (id présent = UPDATE partiel « clé présente ⇒ écrite », sinon INSERT).
CREATE OR REPLACE FUNCTION api.save_crm_task(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id','')::uuid;
  v_object_id text := NULLIF(btrim(COALESCE(p_payload->>'object_id','')),'');
  v_existing_object text;
  -- Défauts 'todo'/'medium' appliqués au seul INSERT ; sur UPDATE la valeur brute est castée
  -- (vide/invalide ⇒ 22P02, cohérent avec save_crm_interaction — pas de reset silencieux).
  v_status crm_task_status;
  v_priority crm_task_priority;
  v_title text := NULLIF(btrim(COALESCE(p_payload->>'title','')),'');
BEGIN
  IF v_id IS NOT NULL THEN
    SELECT object_id INTO v_existing_object FROM crm_task WHERE id = v_id;
    IF v_existing_object IS NULL THEN
      RAISE EXCEPTION 'crm_task inconnue: %', v_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT api.user_can_write_crm(v_existing_object) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
    -- Déplacement d'objet : il faut aussi le droit d'écriture sur la cible.
    IF v_object_id IS NOT NULL AND v_object_id <> v_existing_object
       AND NOT api.user_can_write_crm(v_object_id) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;

    UPDATE crm_task SET
      object_id   = COALESCE(v_object_id, object_id),
      title       = COALESCE(v_title, title),
      description = CASE WHEN p_payload ? 'description' THEN NULLIF(p_payload->>'description','') ELSE description END,
      status      = CASE WHEN p_payload ? 'status' THEN (p_payload->>'status')::crm_task_status ELSE status END,
      priority    = CASE WHEN p_payload ? 'priority' THEN (p_payload->>'priority')::crm_task_priority ELSE priority END,
      due_at      = CASE WHEN p_payload ? 'due_at' THEN NULLIF(p_payload->>'due_at','')::timestamptz ELSE due_at END,
      updated_at  = NOW()
    WHERE id = v_id;
    RETURN jsonb_build_object('id', v_id);
  END IF;

  IF v_object_id IS NULL THEN
    RAISE EXCEPTION 'object_id requis' USING ERRCODE = '22023';
  END IF;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'title requis' USING ERRCODE = '22023';
  END IF;
  IF NOT api.user_can_write_crm(v_object_id) THEN
    RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
  END IF;

  v_id := gen_random_uuid();
  v_status := COALESCE(NULLIF(p_payload->>'status',''),'todo')::crm_task_status;
  v_priority := COALESCE(NULLIF(p_payload->>'priority',''),'medium')::crm_task_priority;
  INSERT INTO crm_task (id, object_id, title, description, status, priority, due_at, owner)
  VALUES (v_id, v_object_id, v_title,
          NULLIF(p_payload->>'description',''),
          v_status, v_priority,
          NULLIF(p_payload->>'due_at','')::timestamptz,
          auth.uid());
  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- Vue CRM d'un objet : interactions + tâches + répartition des sujets.
CREATE OR REPLACE FUNCTION api.list_object_crm(p_object_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_interactions jsonb;
  v_tasks jsonb;
  v_topics jsonb;
BEGIN
  IF p_object_id IS NULL OR NOT api.user_can_read_crm(p_object_id) THEN
    RAISE EXCEPTION 'CRM non autorisé pour cet objet' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_interactions
  FROM (
    SELECT jsonb_build_object(
      'id', ci.id, 'interaction_type', ci.interaction_type, 'direction', ci.direction,
      'status', ci.status, 'subject', ci.subject, 'body', ci.body,
      'occurred_at', ci.occurred_at, 'created_at', ci.created_at,
      'actor_name', a.display_name,
      'topic_code', t.code, 'topic_name', t.name,
      'sentiment_code', s.code, 'sentiment_name', s.name,
      'owner_name', p.display_name, 'source', ci.source
    ) AS item
    FROM crm_interaction ci
    LEFT JOIN actor a ON a.id = ci.actor_id
    LEFT JOIN ref_code_demand_topic t ON t.id = ci.demand_topic_id
    LEFT JOIN ref_code_crm_sentiment s ON s.id = ci.request_sentiment_id
    LEFT JOIN app_user_profile p ON p.id = ci.owner
    WHERE ci.object_id = p_object_id
    ORDER BY ci.occurred_at DESC NULLS LAST, ci.id DESC
  ) qi;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_tasks
  FROM (
    SELECT jsonb_build_object(
      'id', ct.id, 'title', ct.title, 'status', ct.status,
      'priority', ct.priority, 'due_at', ct.due_at
    ) AS item
    FROM crm_task ct
    WHERE ct.object_id = p_object_id
    ORDER BY ct.due_at ASC NULLS LAST
  ) qt;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_topics
  FROM (
    SELECT jsonb_build_object('code', g.code, 'name', g.name, 'count', g.n) AS item
    FROM (
      SELECT t.code, t.name, count(*) AS n
      FROM crm_interaction ci
      JOIN ref_code_demand_topic t ON t.id = ci.demand_topic_id
      WHERE ci.object_id = p_object_id
      GROUP BY t.code, t.name
    ) g
    ORDER BY g.n DESC
  ) qg;

  RETURN jsonb_build_object('interactions', v_interactions, 'tasks', v_tasks, 'topics', v_topics);
END;
$$;

-- Upsert interaction (id présent = UPDATE partiel ; topic/sentiment par code, clé présente
-- + valeur vide ⇒ effacement explicite).
CREATE OR REPLACE FUNCTION api.save_crm_interaction(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id','')::uuid;
  v_object_id text := NULLIF(btrim(COALESCE(p_payload->>'object_id','')),'');
  v_existing_object text;
  v_topic_id uuid;
  v_sentiment_id uuid;
BEGIN
  IF NULLIF(p_payload->>'topic_code','') IS NOT NULL THEN
    SELECT id INTO v_topic_id FROM ref_code_demand_topic
    WHERE code = p_payload->>'topic_code' AND is_active;
    IF v_topic_id IS NULL THEN
      RAISE EXCEPTION 'topic_code inconnu: %', p_payload->>'topic_code' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF NULLIF(p_payload->>'sentiment_code','') IS NOT NULL THEN
    SELECT id INTO v_sentiment_id FROM ref_code_crm_sentiment
    WHERE code = p_payload->>'sentiment_code' AND is_active;
    IF v_sentiment_id IS NULL THEN
      RAISE EXCEPTION 'sentiment_code inconnu: %', p_payload->>'sentiment_code' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT object_id INTO v_existing_object FROM crm_interaction WHERE id = v_id;
    IF v_existing_object IS NULL THEN
      RAISE EXCEPTION 'crm_interaction inconnue: %', v_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT api.user_can_write_crm(v_existing_object) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
    -- Refus explicite plutôt qu'object_id accepté-puis-ignoré (contrairement à save_crm_task,
    -- le déplacement d'une interaction n'est pas un cas métier supporté).
    IF v_object_id IS NOT NULL AND v_object_id <> v_existing_object THEN
      RAISE EXCEPTION 'Re-parentage d''une interaction non supporté' USING ERRCODE = '22023';
    END IF;

    UPDATE crm_interaction SET
      interaction_type     = CASE WHEN p_payload ? 'interaction_type' THEN (p_payload->>'interaction_type')::crm_interaction_type ELSE interaction_type END,
      direction            = CASE WHEN p_payload ? 'direction' THEN (p_payload->>'direction')::crm_direction ELSE direction END,
      status               = CASE WHEN p_payload ? 'status' THEN (p_payload->>'status')::crm_status ELSE status END,
      subject              = CASE WHEN p_payload ? 'subject' THEN NULLIF(p_payload->>'subject','') ELSE subject END,
      body                 = CASE WHEN p_payload ? 'body' THEN NULLIF(p_payload->>'body','') ELSE body END,
      occurred_at          = CASE WHEN p_payload ? 'occurred_at' THEN NULLIF(p_payload->>'occurred_at','')::timestamptz ELSE occurred_at END,
      actor_id             = CASE WHEN p_payload ? 'actor_id' THEN NULLIF(p_payload->>'actor_id','')::uuid ELSE actor_id END,
      demand_topic_id      = CASE WHEN p_payload ? 'topic_code' THEN v_topic_id ELSE demand_topic_id END,
      request_sentiment_id = CASE WHEN p_payload ? 'sentiment_code' THEN v_sentiment_id ELSE request_sentiment_id END,
      updated_at           = NOW()
    WHERE id = v_id;
    RETURN jsonb_build_object('id', v_id);
  END IF;

  IF v_object_id IS NULL THEN
    RAISE EXCEPTION 'object_id requis' USING ERRCODE = '22023';
  END IF;
  IF NOT api.user_can_write_crm(v_object_id) THEN
    RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
  END IF;

  v_id := gen_random_uuid();
  INSERT INTO crm_interaction (id, object_id, interaction_type, direction, status,
                               subject, body, occurred_at, actor_id,
                               demand_topic_id, request_sentiment_id, owner, source)
  VALUES (v_id, v_object_id,
          COALESCE(NULLIF(p_payload->>'interaction_type',''),'note')::crm_interaction_type,
          COALESCE(NULLIF(p_payload->>'direction',''),'internal')::crm_direction,
          COALESCE(NULLIF(p_payload->>'status',''),'done')::crm_status,
          NULLIF(p_payload->>'subject',''),
          NULLIF(p_payload->>'body',''),
          COALESCE(NULLIF(p_payload->>'occurred_at','')::timestamptz, NOW()),
          NULLIF(p_payload->>'actor_id','')::uuid,
          v_topic_id, v_sentiment_id,
          auth.uid(), 'bertel_ui');
  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- Suppression d'une interaction (même gate d'écriture).
CREATE OR REPLACE FUNCTION api.delete_crm_interaction(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_object_id text;
BEGIN
  SELECT object_id INTO v_object_id FROM crm_interaction WHERE id = p_id;
  IF v_object_id IS NULL THEN
    RAISE EXCEPTION 'crm_interaction inconnue: %', p_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT api.user_can_write_crm(v_object_id) THEN
    RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
  END IF;
  DELETE FROM crm_interaction WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION api.list_crm_timeline(text, text, text, text, timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_crm_timeline(text, text, text, text, timestamptz, uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.list_crm_tasks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_crm_tasks() TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.save_crm_task(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.save_crm_task(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.list_object_crm(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_object_crm(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.save_crm_interaction(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.save_crm_interaction(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.delete_crm_interaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.delete_crm_interaction(uuid) TO authenticated, service_role;
-- Le front interroge user_has_permission('write_crm_notes') pour le gating UI global
-- (ré-affirme un grant déjà posé par rls_policies.sql — idempotent).
GRANT EXECUTE ON FUNCTION api.user_has_permission(text) TO authenticated, service_role;

-- ---------- 9. RLS : FOR ALL admin → famille par commande (§47), prédicat wrappé (§39) ----------
-- Sémantique INCHANGÉE pour les rôles PostgREST : seuls service_role/admin lisent/écrivent en
-- direct (les triggers create_crm_artifacts_from_incident / log_publication_proof_interaction
-- ne tournaient déjà que sous ces rôles — pas de régression). Les agents OTI passent par les
-- RPCs DEFINER ci-dessus, qui bypassent RLS après auto-autorisation.
DROP POLICY IF EXISTS "admin_crm_interaction" ON crm_interaction;
DROP POLICY IF EXISTS "admin_crm_task" ON crm_task;
DROP POLICY IF EXISTS "admin_read_crm_interaction" ON crm_interaction;
DROP POLICY IF EXISTS "admin_ins_crm_interaction" ON crm_interaction;
DROP POLICY IF EXISTS "admin_upd_crm_interaction" ON crm_interaction;
DROP POLICY IF EXISTS "admin_del_crm_interaction" ON crm_interaction;
DROP POLICY IF EXISTS "admin_read_crm_task" ON crm_task;
DROP POLICY IF EXISTS "admin_ins_crm_task" ON crm_task;
DROP POLICY IF EXISTS "admin_upd_crm_task" ON crm_task;
DROP POLICY IF EXISTS "admin_del_crm_task" ON crm_task;

CREATE POLICY "admin_read_crm_interaction" ON crm_interaction FOR SELECT
  USING ((select auth.role()) IN ('service_role','admin'));
CREATE POLICY "admin_ins_crm_interaction" ON crm_interaction FOR INSERT
  WITH CHECK ((select auth.role()) IN ('service_role','admin'));
CREATE POLICY "admin_upd_crm_interaction" ON crm_interaction FOR UPDATE
  USING ((select auth.role()) IN ('service_role','admin'))
  WITH CHECK ((select auth.role()) IN ('service_role','admin'));
CREATE POLICY "admin_del_crm_interaction" ON crm_interaction FOR DELETE
  USING ((select auth.role()) IN ('service_role','admin'));

CREATE POLICY "admin_read_crm_task" ON crm_task FOR SELECT
  USING ((select auth.role()) IN ('service_role','admin'));
CREATE POLICY "admin_ins_crm_task" ON crm_task FOR INSERT
  WITH CHECK ((select auth.role()) IN ('service_role','admin'));
CREATE POLICY "admin_upd_crm_task" ON crm_task FOR UPDATE
  USING ((select auth.role()) IN ('service_role','admin'))
  WITH CHECK ((select auth.role()) IN ('service_role','admin'));
CREATE POLICY "admin_del_crm_task" ON crm_task FOR DELETE
  USING ((select auth.role()) IN ('service_role','admin'));

COMMIT;
