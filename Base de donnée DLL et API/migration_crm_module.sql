-- migration_crm_module.sql
-- §61 — Module CRM (P2.2) : vocabulaires + backfill + helpers + RPCs + RLS par commande
-- + modèle ACTEUR-CENTRÉ (révision design 2026-06-11, v2 — point 5 ci-dessous).
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
--    sous-sujets OTI (décision §61 ; ref_code_mood garde ses consommateurs object_taxonomy/closure).
-- 4) ACCÈS (décisions spec 2026-06-11) : RPC-only authorize-once+DEFINER (§36) ; lecture =
--    membres ORG publisher (api.current_user_crm_object_ids, set-based §35) ; écriture =
--    write_crm_notes OU admin ORG OU superuser. Tables verrouillées : famille admin par
--    commande (§47), prédicat wrappé (select auth.role()) (§39). PII jamais en PostgREST
--    direct ⇒ flags advisor security_definer attendus (même classe que get_object_cards_batch).
-- 5) ACTEUR-CENTRÉ (correction design 2026-06-11, v2) : l'entité CRM principale est l'ACTEUR,
--    pas l'objet. L'interaction est ancrée sur l'acteur (actor_id) ; le contexte objet
--    (object_id) devient OPTIONNEL — au moins un ancrage requis (object_id passe NULLABLE +
--    CHECK chk_crm_interaction_anchor). Périmètre acteurs DÉRIVÉ du périmètre objets publisher
--    (api.current_user_crm_actor_ids = acteurs liés via actor_object_role à un objet du
--    périmètre ∪ acteurs portant une interaction sur un objet du périmètre). Navigation
--    BIDIRECTIONNELLE : objet → acteurs liés → interactions de l'objet (list_object_crm,
--    clé 'actors') ; acteur → objets liés → interactions de l'acteur tous contextes
--    (api.list_actor_crm + annuaire list_crm_directory ré-écrit PAR ACTEUR). Autorisation
--    d'écriture : arme objet (user_can_write_crm) quand un contexte objet existe, sinon arme
--    acteur (user_can_write_crm_actor) — mêmes ingrédients (publisher + write_crm_notes/admin).
-- 6) RECTIFS PO (2026-06-11) : a) tâches rattachables à un acteur (save_crm_task accepte
--    actor_id — la colonne crm_task.actor_id existait, le RPC ne l'acceptait pas ; actor_id/
--    actor_name exposés par list_crm_tasks et la branche tâches de list_object_crm) ;
--    b) annuaire list_crm_directory filtrable côté serveur (sujet / statut / période) avec
--    KPI recalculés sur l'ensemble FILTRÉ — Actives = planned (à traiter), Traitées = done,
--    vocabulaire PO ; c) authoring acteur + canaux de contact (save_crm_actor /
--    save_actor_channel / delete_actor_channel + clé 'channels' de list_actor_crm) débloqué
--    par demande PO — l'item différé « contrat PII » reste pour actor_consent (jamais exposé
--    ici) ; mêmes armes d'autorisation (user_can_write_crm à la création via le lien objet,
--    user_can_write_crm_actor ensuite).
-- 6b) ASSIGNATION DE TÂCHE (demande PO 2026-06-12) : le référent d'une tâche n'est pas
--    forcément son créateur ⇒ save_crm_task accepte un `owner` sélectionnable (membre actif
--    d'une ORG du caller, validé par api.user_can_assign_crm — même ensemble que
--    api.list_crm_assignees qui peuple le select). INSERT : owner = COALESCE(owner, auth.uid())
--    (défaut = soi, comme avant, mais surchargeable) ; UPDATE partiel : clé présente + NULL =
--    désassignation. Superuser : tout app_user_profile existant (sinon membre d'ORG partagée).
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

-- ---------- 6b. Ancrage acteur-centré des interactions ----------
-- Modèle acteur-centré (design 2026-06-11) : l'interaction est ancrée sur l'acteur, le
-- contexte objet est OPTIONNEL ; au moins un ancrage requis (actor_id OU object_id).
ALTER TABLE crm_interaction ALTER COLUMN object_id DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_crm_interaction_anchor') THEN
    ALTER TABLE crm_interaction ADD CONSTRAINT chk_crm_interaction_anchor
      CHECK (actor_id IS NOT NULL OR object_id IS NOT NULL);
  END IF;
END$$;
-- Lectures par acteur (fiche acteur, annuaire, arme acteur de la timeline).
CREATE INDEX IF NOT EXISTS idx_crm_interaction_actor_occurred
  ON crm_interaction(actor_id, occurred_at DESC) WHERE actor_id IS NOT NULL;

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

-- Acteurs du périmètre CRM : liés (actor_object_role) à un objet du périmètre publisher,
-- + arme défensive : acteurs portant une interaction sur un objet du périmètre (couvre un
-- acteur dont le lien aurait été retiré mais dont l'historique reste rattaché à l'ORG).
CREATE OR REPLACE FUNCTION api.current_user_crm_actor_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT ar.actor_id
  FROM actor_object_role ar
  WHERE ar.object_id IN (SELECT api.current_user_crm_object_ids())
  UNION
  SELECT ci.actor_id
  FROM crm_interaction ci
  WHERE ci.actor_id IS NOT NULL
    AND ci.object_id IN (SELECT api.current_user_crm_object_ids());
$$;

CREATE OR REPLACE FUNCTION api.user_can_read_crm_actor(p_actor_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT api.is_platform_superuser()
      OR p_actor_id IN (SELECT api.current_user_crm_actor_ids());
$$;

-- Écriture ancrée acteur : mêmes ingrédients que user_can_write_crm (périmètre + permission
-- write_crm_notes OU rôle admin ORG actif OU superuser), l'arme périmètre étant l'acteur.
CREATE OR REPLACE FUNCTION api.user_can_write_crm_actor(p_actor_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT api.is_platform_superuser()
      OR (p_actor_id IN (SELECT api.current_user_crm_actor_ids())
          AND (api.user_has_permission('write_crm_notes')
               OR api.current_user_admin_rank() IS NOT NULL));
$$;

REVOKE ALL ON FUNCTION api.current_user_crm_actor_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.current_user_crm_actor_ids() TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.user_can_read_crm_actor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.user_can_read_crm_actor(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.user_can_write_crm_actor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.user_can_write_crm_actor(uuid) TO authenticated, service_role;

-- Assignabilité d'une tâche (demande PO 2026-06-12) : p_user est assignable ssi il partage
-- une ORG (membership actif) avec le caller — MÊME ensemble que api.list_crm_assignees, qui
-- peuple le select côté UI (une seule source de vérité). Superuser : tout app_user_profile
-- existant (un superuser sans membership renvoie [] depuis list_crm_assignees mais peut
-- assigner n'importe quel utilisateur connu — cohérent avec son périmètre non restreint).
CREATE OR REPLACE FUNCTION api.user_can_assign_crm(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT p_user IS NOT NULL
     AND (
       EXISTS (
         SELECT 1
         FROM user_org_membership me
         JOIN user_org_membership m
           ON m.org_object_id = me.org_object_id AND m.is_active
         WHERE me.user_id = auth.uid() AND me.is_active
           AND m.user_id = p_user
       )
       OR (api.is_platform_superuser()
           AND EXISTS (SELECT 1 FROM app_user_profile p WHERE p.id = p_user))
     );
$$;
REVOKE ALL ON FUNCTION api.user_can_assign_crm(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.user_can_assign_crm(uuid) TO authenticated, service_role;

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
  v_actor_scope uuid[];
  v_items jsonb;
  v_has_more boolean;
BEGIN
  -- Authorize once : superuser ⇒ pas de restriction (v_scope/v_actor_scope restent NULL).
  -- Les interactions SANS contexte objet (acteur-seul) passent par l'arme acteur.
  IF NOT api.is_platform_superuser() THEN
    v_scope := ARRAY(SELECT api.current_user_crm_object_ids());
    v_actor_scope := ARRAY(SELECT api.current_user_crm_actor_ids());
    IF COALESCE(array_length(v_scope, 1), 0) = 0
       AND COALESCE(array_length(v_actor_scope, 1), 0) = 0 THEN
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
    LEFT JOIN object o ON o.id = ci.object_id -- object_id nullable (acteur-seul) ⇒ LEFT JOIN
    LEFT JOIN actor a ON a.id = ci.actor_id
    LEFT JOIN ref_code_demand_topic t ON t.id = ci.demand_topic_id
    LEFT JOIN ref_code_crm_sentiment s ON s.id = ci.request_sentiment_id
    LEFT JOIN app_user_profile p ON p.id = ci.owner
    WHERE (v_scope IS NULL
           OR ci.object_id = ANY(v_scope)
           OR (ci.object_id IS NULL AND ci.actor_id = ANY(v_actor_scope)))
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

-- Assignataires possibles d'une tâche (demande PO 2026-06-12) : membres ACTIFS DISTINCTS des
-- ORG du caller (eux-mêmes inclus). Peuple le select « attribuer à » de l'UI. display_name
-- peut être NULL (profil non renseigné) ⇒ COALESCE vers un libellé court dérivé de l'uuid
-- (jamais de ligne sans étiquette). Superuser sans membership : [] (assignation par
-- user_can_assign_crm reste possible — documenté). Trié par display_name.
CREATE OR REPLACE FUNCTION api.list_crm_assignees()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'user_id', s.user_id,
           'display_name', COALESCE(p.display_name, 'Utilisateur ' || left(s.user_id::text, 8)))
         ORDER BY COALESCE(p.display_name, 'Utilisateur ' || left(s.user_id::text, 8))), '[]'::jsonb)
  FROM (
    SELECT DISTINCT m.user_id
    FROM user_org_membership me
    JOIN user_org_membership m
      ON m.org_object_id = me.org_object_id AND m.is_active
    WHERE me.user_id = auth.uid() AND me.is_active
  ) s
  LEFT JOIN app_user_profile p ON p.id = s.user_id;
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
      'actor_id', ct.actor_id, 'actor_name', act.display_name, -- rattachement acteur (rectif PO)
      'title', ct.title, 'description', ct.description,
      'status', ct.status, 'priority', ct.priority,
      'due_at', ct.due_at, 'created_at', ct.created_at,
      'owner_name', p.display_name,
      'related_interaction_subject', ri.subject
    ) AS item
    FROM crm_task ct
    JOIN object o ON o.id = ct.object_id
    LEFT JOIN actor act ON act.id = ct.actor_id
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
  -- Rattachement acteur (rectif PO 2026-06-11) : crm_task.actor_id (ON DELETE SET NULL).
  v_actor_id uuid := NULLIF(p_payload->>'actor_id','')::uuid;
  -- Assignation (demande PO 2026-06-12) : owner sélectionnable → auth.users (ON DELETE SET NULL).
  v_owner uuid := NULLIF(p_payload->>'owner','')::uuid;
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
    -- Rattachement acteur : l'acteur doit exister et être écrivable (arme acteur) ; le gate
    -- objet reste premier (object_id reste requis sur les tâches). Clé présente + NULL/vide
    -- ⇒ détachement explicite (pas de validation à faire).
    IF p_payload ? 'actor_id' AND v_actor_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM actor WHERE id = v_actor_id) THEN
        RAISE EXCEPTION 'acteur inconnu: %', v_actor_id USING ERRCODE = 'P0002';
      END IF;
      IF NOT api.user_can_write_crm_actor(v_actor_id) THEN
        RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
      END IF;
    END IF;
    -- Assignation (demande PO 2026-06-12) : clé présente + NULL = désassignation (pas de
    -- validation) ; non-NULL = doit être un membre d'une ORG du caller (user_can_assign_crm).
    IF p_payload ? 'owner' AND v_owner IS NOT NULL
       AND NOT api.user_can_assign_crm(v_owner) THEN
      RAISE EXCEPTION 'Assignataire hors de votre organisation' USING ERRCODE = '22023';
    END IF;

    UPDATE crm_task SET
      object_id   = COALESCE(v_object_id, object_id),
      actor_id    = CASE WHEN p_payload ? 'actor_id' THEN v_actor_id ELSE actor_id END,
      owner       = CASE WHEN p_payload ? 'owner' THEN v_owner ELSE owner END,
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
  -- Rattachement acteur optionnel (« ajouter une tâche depuis la fiche acteur ») : mêmes
  -- validations qu'à l'UPDATE — le gate objet ci-dessus reste premier.
  IF v_actor_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM actor WHERE id = v_actor_id) THEN
      RAISE EXCEPTION 'acteur inconnu: %', v_actor_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT api.user_can_write_crm_actor(v_actor_id) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
  END IF;
  -- Assignation (demande PO 2026-06-12) : owner optionnel ; défaut = soi (comme avant), mais
  -- surchargeable par un membre d'une ORG du caller (user_can_assign_crm).
  IF v_owner IS NOT NULL AND NOT api.user_can_assign_crm(v_owner) THEN
    RAISE EXCEPTION 'Assignataire hors de votre organisation' USING ERRCODE = '22023';
  END IF;

  v_id := gen_random_uuid();
  v_status := COALESCE(NULLIF(p_payload->>'status',''),'todo')::crm_task_status;
  v_priority := COALESCE(NULLIF(p_payload->>'priority',''),'medium')::crm_task_priority;
  INSERT INTO crm_task (id, object_id, actor_id, title, description, status, priority, due_at, owner)
  VALUES (v_id, v_object_id, v_actor_id, v_title,
          NULLIF(p_payload->>'description',''),
          v_status, v_priority,
          NULLIF(p_payload->>'due_at','')::timestamptz,
          COALESCE(v_owner, auth.uid()));
  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- Vue CRM d'un objet : interactions + tâches + répartition des sujets + acteurs liés
-- (navigation objet → acteurs du modèle acteur-centré ; cf. en-tête point 5).
CREATE OR REPLACE FUNCTION api.list_object_crm(p_object_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_interactions jsonb;
  v_tasks jsonb;
  v_topics jsonb;
  v_actors jsonb;
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
      'priority', ct.priority, 'due_at', ct.due_at,
      'actor_id', ct.actor_id, 'actor_name', act.display_name -- rattachement acteur (rectif PO)
    ) AS item
    FROM crm_task ct
    LEFT JOIN actor act ON act.id = ct.actor_id
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

  -- Acteurs liés à l'objet (actor_object_role), primaire d'abord puis alphabétique.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'actor_id', ar.actor_id, 'display_name', a.display_name,
           'role_code', r.code, 'role_name', r.name, 'is_primary', ar.is_primary)
         ORDER BY ar.is_primary DESC NULLS LAST, a.display_name), '[]'::jsonb)
  INTO v_actors
  FROM actor_object_role ar
  JOIN actor a ON a.id = ar.actor_id
  JOIN ref_actor_role r ON r.id = ar.role_id
  WHERE ar.object_id = p_object_id;

  RETURN jsonb_build_object('interactions', v_interactions, 'tasks', v_tasks,
                            'topics', v_topics, 'actors', v_actors);
END;
$$;

-- Upsert interaction (id présent = UPDATE partiel ; topic/sentiment par code, clé présente
-- + valeur vide ⇒ effacement explicite). Modèle acteur-centré : ancrage acteur OU objet (au
-- moins un) ; autorisation par l'arme objet quand un contexte objet existe, sinon arme acteur.
CREATE OR REPLACE FUNCTION api.save_crm_interaction(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id','')::uuid;
  v_object_id text := NULLIF(btrim(COALESCE(p_payload->>'object_id','')),'');
  v_actor_id uuid := NULLIF(p_payload->>'actor_id','')::uuid;
  v_existing_object text;
  v_existing_actor uuid;
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
    -- object_id est nullable (interaction acteur-seul) ⇒ existence testée par FOUND,
    -- jamais par v_existing_object IS NULL.
    SELECT object_id, actor_id INTO v_existing_object, v_existing_actor
    FROM crm_interaction WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'crm_interaction inconnue: %', v_id USING ERRCODE = 'P0002';
    END IF;
    -- Autorisation par l'ancrage existant : arme objet si contexte présent, sinon arme acteur.
    IF v_existing_object IS NOT NULL THEN
      IF NOT api.user_can_write_crm(v_existing_object) THEN
        RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
      END IF;
    ELSIF v_existing_actor IS NULL OR NOT api.user_can_write_crm_actor(v_existing_actor) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
    -- Refus explicite plutôt qu'object_id accepté-puis-ignoré (contrairement à save_crm_task,
    -- le déplacement d'une interaction n'est pas un cas métier supporté). En revanche AJOUTER
    -- un contexte objet là où il n'y en avait pas (NULL → valeur) est permis — le contexte est
    -- optionnel par design — sous réserve du droit d'écriture CRM sur la cible.
    IF v_object_id IS NOT NULL AND v_existing_object IS NOT NULL
       AND v_object_id <> v_existing_object THEN
      RAISE EXCEPTION 'Re-parentage d''une interaction non supporté' USING ERRCODE = '22023';
    END IF;
    IF v_object_id IS NOT NULL AND v_existing_object IS NULL
       AND NOT api.user_can_write_crm(v_object_id) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;

    UPDATE crm_interaction SET
      -- COALESCE(object_id, v_object_id) : conserve le contexte existant, n'accepte une valeur
      -- entrante que pour COMBLER un contexte absent (le retrait de contexte n'est pas supporté).
      object_id            = COALESCE(object_id, v_object_id),
      interaction_type     = CASE WHEN p_payload ? 'interaction_type' THEN (p_payload->>'interaction_type')::crm_interaction_type ELSE interaction_type END,
      direction            = CASE WHEN p_payload ? 'direction' THEN (p_payload->>'direction')::crm_direction ELSE direction END,
      status               = CASE WHEN p_payload ? 'status' THEN (p_payload->>'status')::crm_status ELSE status END,
      subject              = CASE WHEN p_payload ? 'subject' THEN NULLIF(p_payload->>'subject','') ELSE subject END,
      body                 = CASE WHEN p_payload ? 'body' THEN NULLIF(p_payload->>'body','') ELSE body END,
      occurred_at          = CASE WHEN p_payload ? 'occurred_at' THEN NULLIF(p_payload->>'occurred_at','')::timestamptz ELSE occurred_at END,
      actor_id             = CASE WHEN p_payload ? 'actor_id' THEN v_actor_id ELSE actor_id END,
      demand_topic_id      = CASE WHEN p_payload ? 'topic_code' THEN v_topic_id ELSE demand_topic_id END,
      request_sentiment_id = CASE WHEN p_payload ? 'sentiment_code' THEN v_sentiment_id ELSE request_sentiment_id END,
      updated_at           = NOW()
    WHERE id = v_id;
    -- Un effacement d'actor_id sur une interaction sans contexte objet viole
    -- chk_crm_interaction_anchor (23514) — garde-fou DB, pas de reset silencieux.
    RETURN jsonb_build_object('id', v_id);
  END IF;

  -- INSERT : au moins un ancrage (acteur OU objet).
  IF v_object_id IS NULL AND v_actor_id IS NULL THEN
    RAISE EXCEPTION 'objet ou acteur requis' USING ERRCODE = '22023';
  END IF;
  IF v_object_id IS NOT NULL THEN
    IF NOT api.user_can_write_crm(v_object_id) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT api.user_can_write_crm_actor(v_actor_id) THEN
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
          v_actor_id,
          v_topic_id, v_sentiment_id,
          auth.uid(), 'bertel_ui');
  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- Annuaire relationnel ACTEUR-CENTRÉ (correction design 2026-06-11, v2) : un agrégat par
-- ACTEUR du périmètre — lié (actor_object_role) à un objet du périmètre OU portant ≥1
-- interaction du périmètre — avec ses objets liés, volumes, dernière interaction, top sujets.
-- Les agrégats couvrent TOUTES les interactions de l'acteur dont l'objet est dans le périmètre
-- OU sans contexte objet (acteur-seul). Volume borné (~700 acteurs) ⇒ retour intégral.
-- Filtres SERVEUR (rectif PO 2026-06-11) : sujet / statut / période s'appliquent au MÊME
-- ensemble d'interactions pour TOUS les agrégats (interaction_count, interactions_12m,
-- last_*, top_topics) — les KPI de l'UI suivent le filtre. Règle d'inclusion : dès qu'un
-- filtre est posé, seuls les acteurs avec ≥1 interaction correspondante restent (les acteurs
-- « lien seul » disparaissent) ; sans filtre, comportement inchangé (liens ∪ interagissants).
-- La signature change (filtres ajoutés) : DROP de l'ancienne zéro-arg pour éviter une
-- surcharge résiduelle ambiguë côté PostgREST sur une base ayant appliqué la révision
-- précédente (même leçon que list_crm_timeline).
DROP FUNCTION IF EXISTS api.list_crm_directory();
CREATE OR REPLACE FUNCTION api.list_crm_directory(
  p_topic_code text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_scope text[];        -- objets du périmètre (NULL = superuser, sans restriction)
  v_actor_scope uuid[];  -- acteurs du périmètre (NULL = superuser)
  v_items jsonb;
  v_topic_id uuid;
  v_status crm_status;
  v_filtered boolean := (p_topic_code IS NOT NULL OR p_status IS NOT NULL
                         OR p_from IS NOT NULL OR p_to IS NOT NULL);
BEGIN
  -- Validation des filtres AVANT le périmètre (le contrat 22023 vaut même à périmètre vide).
  IF p_topic_code IS NOT NULL THEN
    SELECT id INTO v_topic_id FROM ref_code_demand_topic WHERE code = p_topic_code;
    IF v_topic_id IS NULL THEN
      RAISE EXCEPTION 'topic_code inconnu: %', p_topic_code USING ERRCODE = '22023';
    END IF;
  END IF;
  -- Actives = planned (à traiter), Traitées = done — vocabulaire PO.
  IF p_status IS NOT NULL THEN
    IF p_status = 'active' THEN v_status := 'planned';
    ELSIF p_status = 'done' THEN v_status := 'done';
    ELSE
      RAISE EXCEPTION 'p_status invalide: % (attendu: active | done)', p_status USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NOT api.is_platform_superuser() THEN
    v_scope := ARRAY(SELECT api.current_user_crm_object_ids());
    v_actor_scope := ARRAY(SELECT api.current_user_crm_actor_ids());
    IF COALESCE(array_length(v_actor_scope, 1), 0) = 0 THEN
      RETURN '[]'::jsonb;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY last_at DESC NULLS LAST), '[]'::jsonb) INTO v_items
  FROM (
    SELECT agg.last_at,
      jsonb_build_object(
        'actor_id', a.id, 'display_name', a.display_name,
        'objects', COALESCE(links.objects, '[]'::jsonb),
        'object_count', COALESCE(links.n, 0),
        'interaction_count', COALESCE(agg.n_total, 0),
        'interactions_12m', COALESCE(agg.n_12m, 0),
        'last_interaction_at', agg.last_at,
        'last_interaction_type', last_i.itype,
        'last_interaction_subject', last_i.subject,
        'last_interaction_object_name', last_i.object_name,
        'top_topics', COALESCE(topics.names, '[]'::jsonb)
      ) AS item
    FROM (
      -- base = acteurs du périmètre : non-superuser ⇒ v_actor_scope (déjà « lié OU
      -- interagissant ») ; superuser ⇒ tous les acteurs ayant ≥1 lien OU ≥1 interaction.
      -- Sous filtre (v_filtered) : ≥1 interaction CORRESPONDANTE exigée en plus — les
      -- acteurs « lien seul » disparaissent (règle d'inclusion PO, cf. en-tête fonction).
      SELECT a0.id AS actor_id
      FROM actor a0
      WHERE (a0.id = ANY(v_actor_scope)
             OR (v_actor_scope IS NULL
                 AND (EXISTS (SELECT 1 FROM actor_object_role ar0 WHERE ar0.actor_id = a0.id)
                      OR EXISTS (SELECT 1 FROM crm_interaction ci0 WHERE ci0.actor_id = a0.id))))
        AND (NOT v_filtered
             OR EXISTS (SELECT 1 FROM crm_interaction cf
                        WHERE cf.actor_id = a0.id
                          AND (v_scope IS NULL OR cf.object_id IS NULL OR cf.object_id = ANY(v_scope))
                          AND (v_topic_id IS NULL OR cf.demand_topic_id = v_topic_id)
                          AND (v_status IS NULL OR cf.status = v_status)
                          AND (p_from IS NULL OR cf.occurred_at >= p_from)
                          AND (p_to IS NULL OR cf.occurred_at < p_to)))
    ) base
    JOIN actor a ON a.id = base.actor_id
    -- Objets liés du périmètre (TOUS les liens vers des objets en périmètre, primaire d'abord).
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
               'object_id', ar.object_id, 'object_name', o.name, 'object_type', o.object_type,
               'role_name', r.name, 'is_primary', ar.is_primary)
             ORDER BY ar.is_primary DESC NULLS LAST, o.name) AS objects,
             count(*) AS n
      FROM actor_object_role ar
      JOIN object o ON o.id = ar.object_id
      JOIN ref_actor_role r ON r.id = ar.role_id
      WHERE ar.actor_id = base.actor_id
        AND (v_scope IS NULL OR ar.object_id = ANY(v_scope))
    ) links ON TRUE
    -- Volumes sur les interactions FILTRÉES de l'acteur en périmètre (contexte objet du
    -- périmètre OU interaction générale sans contexte) — interactions_12m = fenêtre 12 mois
    -- intersectée avec la période demandée.
    LEFT JOIN LATERAL (
      SELECT count(*) AS n_total,
             count(*) FILTER (WHERE ci.occurred_at >= NOW() - interval '12 months') AS n_12m,
             max(ci.occurred_at) AS last_at
      FROM crm_interaction ci
      WHERE ci.actor_id = base.actor_id
        AND (v_scope IS NULL OR ci.object_id IS NULL OR ci.object_id = ANY(v_scope))
        AND (v_topic_id IS NULL OR ci.demand_topic_id = v_topic_id)
        AND (v_status IS NULL OR ci.status = v_status)
        AND (p_from IS NULL OR ci.occurred_at >= p_from)
        AND (p_to IS NULL OR ci.occurred_at < p_to)
    ) agg ON TRUE
    LEFT JOIN LATERAL (
      SELECT ci2.interaction_type::text AS itype, ci2.subject, o2.name AS object_name
      FROM crm_interaction ci2
      LEFT JOIN object o2 ON o2.id = ci2.object_id
      WHERE ci2.actor_id = base.actor_id
        AND (v_scope IS NULL OR ci2.object_id IS NULL OR ci2.object_id = ANY(v_scope))
        AND (v_topic_id IS NULL OR ci2.demand_topic_id = v_topic_id)
        AND (v_status IS NULL OR ci2.status = v_status)
        AND (p_from IS NULL OR ci2.occurred_at >= p_from)
        AND (p_to IS NULL OR ci2.occurred_at < p_to)
      ORDER BY ci2.occurred_at DESC NULLS LAST, ci2.id DESC
      LIMIT 1
    ) last_i ON TRUE
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(x.name ORDER BY x.n DESC) AS names
      FROM (
        SELECT rt.name, count(*) AS n
        FROM crm_interaction ci3
        JOIN ref_code_demand_topic rt ON rt.id = ci3.demand_topic_id
        WHERE ci3.actor_id = base.actor_id
          AND (v_scope IS NULL OR ci3.object_id IS NULL OR ci3.object_id = ANY(v_scope))
          AND (v_topic_id IS NULL OR ci3.demand_topic_id = v_topic_id)
          AND (v_status IS NULL OR ci3.status = v_status)
          AND (p_from IS NULL OR ci3.occurred_at >= p_from)
          AND (p_to IS NULL OR ci3.occurred_at < p_to)
        GROUP BY rt.name
        ORDER BY count(*) DESC
        LIMIT 2
      ) x
    ) topics ON TRUE
  ) q;

  RETURN v_items;
END;
$$;

-- Fiche acteur (navigation acteur → objets → interactions tous contextes) : identité, objets
-- liés du périmètre, canaux de contact (rectif PO 2026-06-11), TOUTES les interactions de
-- l'acteur (contexte objet du périmètre OU générale), répartition des sujets.
-- Superuser : sans restriction de périmètre.
CREATE OR REPLACE FUNCTION api.list_actor_crm(p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_scope text[];
  v_actor jsonb;
  v_objects jsonb;
  v_channels jsonb;
  v_interactions jsonb;
  v_topics jsonb;
BEGIN
  IF p_actor_id IS NULL OR NOT api.user_can_read_crm_actor(p_actor_id) THEN
    RAISE EXCEPTION 'CRM non autorisé pour cet acteur' USING ERRCODE = '42501';
  END IF;
  IF NOT api.is_platform_superuser() THEN
    v_scope := ARRAY(SELECT api.current_user_crm_object_ids());
  END IF;

  SELECT jsonb_build_object('id', a.id, 'display_name', a.display_name,
                            'first_name', a.first_name, 'last_name', a.last_name)
  INTO v_actor
  FROM actor a WHERE a.id = p_actor_id;
  IF v_actor IS NULL THEN
    -- Superuser sur un uuid inexistant (l'arme périmètre a déjà refusé les autres).
    RAISE EXCEPTION 'actor inconnu: %', p_actor_id USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_objects
  FROM (
    SELECT jsonb_build_object(
      'object_id', ar.object_id, 'object_name', o.name, 'object_type', o.object_type,
      'role_code', r.code, 'role_name', r.name, 'is_primary', ar.is_primary
    ) AS item
    FROM actor_object_role ar
    JOIN object o ON o.id = ar.object_id
    JOIN ref_actor_role r ON r.id = ar.role_id
    WHERE ar.actor_id = p_actor_id
      AND (v_scope IS NULL OR ar.object_id = ANY(v_scope))
    ORDER BY ar.is_primary DESC NULLS LAST, o.name
  ) qo;

  -- Canaux de contact de l'acteur (rectif PO 2026-06-11) : la lecture est couverte par le
  -- gate acteur déjà passé (user_can_read_crm_actor) — PII réservée au périmètre publisher.
  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_channels
  FROM (
    SELECT jsonb_build_object(
      'id', ch.id, 'kind_code', k.code, 'kind_name', k.name,
      'value', ch.value, 'is_primary', ch.is_primary
    ) AS item
    FROM actor_channel ch
    JOIN ref_code_contact_kind k ON k.id = ch.kind_id
    WHERE ch.actor_id = p_actor_id
    ORDER BY ch.is_primary DESC NULLS LAST, k.code
  ) qc;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_interactions
  FROM (
    SELECT jsonb_build_object(
      'id', ci.id, 'interaction_type', ci.interaction_type, 'direction', ci.direction,
      'status', ci.status, 'subject', ci.subject, 'body', ci.body,
      'occurred_at', ci.occurred_at, 'created_at', ci.created_at,
      'object_id', ci.object_id, 'object_name', o.name, -- contexte (NULLs si générale)
      'topic_code', t.code, 'topic_name', t.name,
      'sentiment_code', s.code, 'sentiment_name', s.name,
      'owner_name', p.display_name, 'source', ci.source
    ) AS item
    FROM crm_interaction ci
    LEFT JOIN object o ON o.id = ci.object_id
    LEFT JOIN ref_code_demand_topic t ON t.id = ci.demand_topic_id
    LEFT JOIN ref_code_crm_sentiment s ON s.id = ci.request_sentiment_id
    LEFT JOIN app_user_profile p ON p.id = ci.owner
    WHERE ci.actor_id = p_actor_id
      AND (v_scope IS NULL OR ci.object_id IS NULL OR ci.object_id = ANY(v_scope))
    ORDER BY ci.occurred_at DESC NULLS LAST, ci.id DESC
  ) qi;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_topics
  FROM (
    SELECT jsonb_build_object('code', g.code, 'name', g.name, 'count', g.n) AS item
    FROM (
      SELECT t.code, t.name, count(*) AS n
      FROM crm_interaction ci
      JOIN ref_code_demand_topic t ON t.id = ci.demand_topic_id
      WHERE ci.actor_id = p_actor_id
        AND (v_scope IS NULL OR ci.object_id IS NULL OR ci.object_id = ANY(v_scope))
      GROUP BY t.code, t.name
    ) g
    ORDER BY g.n DESC
  ) qg;

  RETURN jsonb_build_object('actor', v_actor, 'objects', v_objects, 'channels', v_channels,
                            'interactions', v_interactions, 'topics', v_topics);
END;
$$;

-- Suppression d'une interaction (même gate d'écriture ; arme objet si contexte, sinon arme
-- acteur — object_id nullable ⇒ existence par FOUND, pas par IS NULL).
CREATE OR REPLACE FUNCTION api.delete_crm_interaction(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_object_id text;
  v_actor_id uuid;
BEGIN
  SELECT object_id, actor_id INTO v_object_id, v_actor_id
  FROM crm_interaction WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'crm_interaction inconnue: %', p_id USING ERRCODE = 'P0002';
  END IF;
  IF v_object_id IS NOT NULL THEN
    IF NOT api.user_can_write_crm(v_object_id) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
  ELSIF v_actor_id IS NULL OR NOT api.user_can_write_crm_actor(v_actor_id) THEN
    RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
  END IF;
  DELETE FROM crm_interaction WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$$;

-- ---------- 8b. Authoring acteur + canaux de contact (rectifs PO 2026-06-11) ----------
-- « il manque les contacts et information… et la possibilité d'edition ! » + « il manque
-- l'ajout de nouveaux acteur ». Mêmes conventions que les RPCs ci-dessus (DEFINER,
-- authorize-once, gen_random_uuid, update partiel « clé présente ⇒ écrite »).
-- actor_consent reste HORS périmètre (item différé « contrat PII », décision §61).

-- Upsert acteur. INSERT : display_name + object_id requis — l'acteur ENTRE dans le périmètre
-- CRM PAR son lien actor_object_role (gate = arme objet user_can_write_crm) ; role_code
-- optionnel (défaut 'operator'). UPDATE : partiel display_name/first_name/last_name, gate =
-- arme acteur user_can_write_crm_actor (l'acteur est déjà dans le périmètre).
CREATE OR REPLACE FUNCTION api.save_crm_actor(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id','')::uuid;
  v_display_name text := NULLIF(btrim(COALESCE(p_payload->>'display_name','')),'');
  v_object_id text := NULLIF(btrim(COALESCE(p_payload->>'object_id','')),'');
  v_role_code text := COALESCE(NULLIF(btrim(COALESCE(p_payload->>'role_code','')),''), 'operator');
  v_role_id uuid;
BEGIN
  IF v_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM actor WHERE id = v_id) THEN
      RAISE EXCEPTION 'actor inconnu: %', v_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT api.user_can_write_crm_actor(v_id) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
    -- display_name est NOT NULL : clé présente + valeur vide = erreur explicite, pas un
    -- 23502 cryptique ni un reset silencieux.
    IF p_payload ? 'display_name' AND v_display_name IS NULL THEN
      RAISE EXCEPTION 'display_name requis' USING ERRCODE = '22023';
    END IF;
    UPDATE actor SET
      display_name = CASE WHEN p_payload ? 'display_name' THEN v_display_name ELSE display_name END,
      first_name   = CASE WHEN p_payload ? 'first_name' THEN NULLIF(p_payload->>'first_name','') ELSE first_name END,
      last_name    = CASE WHEN p_payload ? 'last_name' THEN NULLIF(p_payload->>'last_name','') ELSE last_name END,
      updated_at   = NOW()
    WHERE id = v_id;
    RETURN jsonb_build_object('id', v_id);
  END IF;

  -- INSERT : le lien objet est ce qui place l'acteur dans le périmètre — sans lui, l'acteur
  -- créé serait invisible/inéditable par son propre créateur (arme acteur dérivée des liens).
  IF v_display_name IS NULL THEN
    RAISE EXCEPTION 'display_name requis' USING ERRCODE = '22023';
  END IF;
  IF v_object_id IS NULL THEN
    RAISE EXCEPTION 'object_id requis (l''acteur entre dans le périmètre par son lien objet)' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_role_id FROM ref_actor_role WHERE code = v_role_code;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'role_code inconnu: %', v_role_code USING ERRCODE = '22023';
  END IF;
  IF NOT api.user_can_write_crm(v_object_id) THEN
    RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
  END IF;

  v_id := gen_random_uuid();
  INSERT INTO actor (id, display_name, first_name, last_name, created_by)
  VALUES (v_id, v_display_name,
          NULLIF(p_payload->>'first_name',''),
          NULLIF(p_payload->>'last_name',''),
          auth.uid());
  -- Primaire seulement si la place est libre : uq_actor_object_role_primary est UNIQUE
  -- (object_id, role_id) WHERE is_primary — un INSERT is_primary inconditionnel casserait
  -- (23505) dès qu'un primaire existe pour ce (objet, rôle).
  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary)
  VALUES (v_id, v_object_id, v_role_id,
          NOT EXISTS (SELECT 1 FROM actor_object_role x
                      WHERE x.object_id = v_object_id AND x.role_id = v_role_id
                        AND x.is_primary));
  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- Upsert canal de contact. INSERT : actor_id + kind_code + value requis ; UPDATE partiel
-- value/kind_code/is_primary. Gate = arme acteur (l'acteur de la ligne pour l'update).
-- Les triggers de la table s'appliquent et leurs erreurs remontent TELLES QUELLES :
-- trg_prevent_duplicate_actor_email (e-mail déjà porté par un autre acteur),
-- trg_actor_channel_email (forme d'e-mail), uq_actor_channel_primary (un primaire par
-- (acteur, kind)), uq_actor_channel_unique (doublon exact).
CREATE OR REPLACE FUNCTION api.save_actor_channel(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id','')::uuid;
  v_actor_id uuid := NULLIF(p_payload->>'actor_id','')::uuid;
  v_existing_actor uuid;
  v_kind_id uuid;
  v_value text := NULLIF(btrim(COALESCE(p_payload->>'value','')),'');
BEGIN
  IF NULLIF(p_payload->>'kind_code','') IS NOT NULL THEN
    SELECT id INTO v_kind_id FROM ref_code_contact_kind
    WHERE code = p_payload->>'kind_code' AND is_active;
    IF v_kind_id IS NULL THEN
      RAISE EXCEPTION 'kind_code inconnu: %', p_payload->>'kind_code' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT actor_id INTO v_existing_actor FROM actor_channel WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'actor_channel inconnu: %', v_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT api.user_can_write_crm_actor(v_existing_actor) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
    -- value (NOT NULL) et kind_id (NOT NULL) : clé présente + vide = erreur explicite.
    IF p_payload ? 'value' AND v_value IS NULL THEN
      RAISE EXCEPTION 'value requis' USING ERRCODE = '22023';
    END IF;
    IF p_payload ? 'kind_code' AND v_kind_id IS NULL THEN
      RAISE EXCEPTION 'kind_code requis' USING ERRCODE = '22023';
    END IF;
    UPDATE actor_channel SET
      value      = CASE WHEN p_payload ? 'value' THEN v_value ELSE value END,
      kind_id    = CASE WHEN p_payload ? 'kind_code' THEN v_kind_id ELSE kind_id END,
      is_primary = CASE WHEN p_payload ? 'is_primary' THEN COALESCE((p_payload->>'is_primary')::boolean, FALSE) ELSE is_primary END,
      updated_at = NOW()
    WHERE id = v_id;
    RETURN jsonb_build_object('id', v_id);
  END IF;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id requis' USING ERRCODE = '22023';
  END IF;
  IF v_kind_id IS NULL THEN
    RAISE EXCEPTION 'kind_code requis' USING ERRCODE = '22023';
  END IF;
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'value requis' USING ERRCODE = '22023';
  END IF;
  IF NOT api.user_can_write_crm_actor(v_actor_id) THEN
    RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
  END IF;

  v_id := gen_random_uuid();
  INSERT INTO actor_channel (id, actor_id, kind_id, value, is_primary)
  VALUES (v_id, v_actor_id, v_kind_id, v_value,
          COALESCE((p_payload->>'is_primary')::boolean, FALSE));
  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- Suppression d'un canal (gate par l'acteur de la ligne, mêmes erreurs P0002/42501).
CREATE OR REPLACE FUNCTION api.delete_actor_channel(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  SELECT actor_id INTO v_actor_id FROM actor_channel WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'actor_channel inconnu: %', p_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT api.user_can_write_crm_actor(v_actor_id) THEN
    RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
  END IF;
  DELETE FROM actor_channel WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION api.list_crm_timeline(text, text, text, text, timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_crm_timeline(text, text, text, text, timestamptz, uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.list_crm_tasks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_crm_tasks() TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.list_crm_assignees() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_crm_assignees() TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.save_crm_task(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.save_crm_task(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.list_object_crm(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_object_crm(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.save_crm_interaction(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.save_crm_interaction(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.delete_crm_interaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.delete_crm_interaction(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.list_crm_directory(text, text, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_crm_directory(text, text, timestamptz, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.list_actor_crm(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_actor_crm(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.save_crm_actor(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.save_crm_actor(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.save_actor_channel(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.save_actor_channel(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.delete_actor_channel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.delete_actor_channel(uuid) TO authenticated, service_role;
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
