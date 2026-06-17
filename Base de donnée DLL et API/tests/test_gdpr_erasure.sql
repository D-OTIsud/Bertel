-- =====================================================================
-- test_gdpr_erasure.sql — vérifie api.rpc_gdpr_erase_subject (Art. 17)
-- Exécution privilégiée (psql / MCP / CI) : pas de JWT → la garde D4 est contournée.
-- Auto-nettoyant : tout est encapsulé dans une transaction terminée par ROLLBACK.
-- Pré-requis : au moins un object pour ancrer une interaction CRM (vrai sur live + seeds).
-- =====================================================================
BEGIN;
DO $$
DECLARE
  v_obj        TEXT;
  v_actor      UUID;
  v_chan       UUID;
  v_int        UUID;
  v_email_kind UUID;
  v_n          INTEGER;
BEGIN
  v_obj := (SELECT id FROM object LIMIT 1);
  IF v_obj IS NULL THEN RAISE EXCEPTION 'test_gdpr_erasure: aucun object pour ancrer le test'; END IF;
  v_email_kind := (SELECT id FROM ref_code_contact_kind WHERE lower(code) = 'email' LIMIT 1);
  IF v_email_kind IS NULL THEN RAISE EXCEPTION 'test_gdpr_erasure: ref_code_contact_kind email manquant'; END IF;

  -- --- Seed : un acteur + un canal email + une interaction CRM avec PII ---
  INSERT INTO actor(display_name, first_name, last_name, photo_url)
    VALUES ('TEST Jean Dupont', 'Jean', 'Dupont', 'https://example/p.jpg')
    RETURNING id INTO v_actor;
  INSERT INTO actor_channel(actor_id, kind_id, value)
    VALUES (v_actor, v_email_kind, 'jean.test@example.com')
    RETURNING id INTO v_chan;
  INSERT INTO crm_interaction(object_id, actor_id, interaction_type, subject, body)
    VALUES (v_obj, v_actor, 'note', 'Sujet test', 'Note privée mentionnant Jean Dupont')
    RETURNING id INTO v_int;

  -- --- Générer des lignes de journal d'audit (triggers AFTER UPDATE) portant la PII ---
  UPDATE actor           SET gender = 'm' WHERE id = v_actor;
  UPDATE actor_channel   SET position = 1 WHERE id = v_chan;
  UPDATE crm_interaction SET status = 'done' WHERE id = v_int;

  -- --- Effacement (anonymisation) ---
  PERFORM api.rpc_gdpr_erase_subject('actor', v_actor::text, 'anonymize', 'test RGPD');

  -- ===================== Assertions : lignes vivantes =====================
  IF (SELECT display_name FROM actor WHERE id = v_actor) <> '[Donnée effacée]' THEN
    RAISE EXCEPTION 'actor.display_name non anonymisé'; END IF;
  IF (SELECT first_name FROM actor WHERE id = v_actor) IS NOT NULL THEN
    RAISE EXCEPTION 'actor.first_name non effacé'; END IF;
  IF (SELECT photo_url FROM actor WHERE id = v_actor) IS NOT NULL THEN
    RAISE EXCEPTION 'actor.photo_url non effacé'; END IF;
  IF EXISTS (SELECT 1 FROM actor_channel WHERE actor_id = v_actor) THEN
    RAISE EXCEPTION 'actor_channel non supprimé'; END IF;
  IF (SELECT actor_id FROM crm_interaction WHERE id = v_int) IS NOT NULL THEN
    RAISE EXCEPTION 'crm_interaction.actor_id non délié'; END IF;
  IF (SELECT body FROM crm_interaction WHERE id = v_int) IS NOT NULL THEN
    RAISE EXCEPTION 'crm_interaction.body non effacé'; END IF;

  -- ===================== Assertions : journal d'audit rédigé =====================
  SELECT count(*) INTO v_n FROM audit.audit_log
    WHERE table_name = 'actor' AND (row_pk ->> 'id') = v_actor::text
      AND (before_data ? 'display_name' OR after_data ? 'display_name'
        OR before_data ? 'first_name'   OR after_data ? 'first_name');
  IF v_n > 0 THEN RAISE EXCEPTION 'audit actor non rédigé (% lignes PII restantes)', v_n; END IF;

  SELECT count(*) INTO v_n FROM audit.audit_log
    WHERE table_name = 'actor_channel' AND (before_data ->> 'actor_id') = v_actor::text
      AND before_data ? 'value';
  IF v_n > 0 THEN RAISE EXCEPTION 'audit actor_channel.value non rédigé (% restantes)', v_n; END IF;

  SELECT count(*) INTO v_n FROM audit.audit_log
    WHERE table_name = 'crm_interaction' AND (before_data ->> 'actor_id') = v_actor::text
      AND before_data ? 'body';
  IF v_n > 0 THEN RAISE EXCEPTION 'audit crm_interaction.body non rédigé (% restantes)', v_n; END IF;

  -- ===================== Assertion : registre des effacements =====================
  SELECT count(*) INTO v_n FROM gdpr_erasure_log
    WHERE subject_kind = 'actor' AND subject_id = v_actor::text AND mode = 'anonymize';
  IF v_n <> 1 THEN RAISE EXCEPTION 'gdpr_erasure_log : attendu 1, obtenu %', v_n; END IF;

  RAISE NOTICE 'test_gdpr_erasure: OK — acteur anonymisé, canaux supprimés, CRM délié, audit rédigé, log écrit.';
END $$;
ROLLBACK;
