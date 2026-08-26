-- test_search_objects_by_name.sql
-- Garde permanente du RPC de concordance directe (spec 2026-08-26, migration 16w).
--
-- Ce que ce fichier prouve :
--   A. Anon : les PUBLIÉS seuls, dans l'ordre exact > préfixe > infixe, la saisie étant
--      normalisée (accents/casse). Le brouillon ne fuit pas.
--   B. Authentifié ÉTRANGER (aucune adhésion) : strictement comme anon.
--   C. Membre ÉDITEUR de l'ORG publisher : les publiés + SON brouillon.
--   D. Gardes d'entrée : moins de 2 caractères ⇒ vide ; `%` saisi est échappé (il ne
--      ramène pas le corpus) ; `p_limit` est borné.
--   E. Privilèges : EXECUTE retiré à PUBLIC (§204 — accordé par défaut sur toute
--      fonction neuve, et un GRANT ciblé ne le retire pas).
--
-- HARNAIS (§204) — `request.jwt.claims` ET `SET LOCAL ROLE`, jamais l'un sans l'autre :
--   * `SET ROLE` SEUL ne peut pas éprouver ces chemins : hors contexte HTTP `auth.uid()`
--     et `auth.role()` rendent NULL, chaque persona s'effondre sur la même branche
--     fail-closed, et toutes les assertions passent sur des ensembles vides — vacuité
--     parfaite (vert pour rien).
--   * `set_config` SEUL ne suffit pas non plus : le rôle de connexion du harnais est
--     superuser/BYPASSRLS, donc les GRANT ne seraient pas contrôlés (le bloc E porte
--     précisément sur un privilège).
--   Le périmètre étendu dérive de `auth.uid()` via `user_org_membership` : le persona
--   éditeur porte donc un `sub` RÉEL, avec adhésion active. Vérifié en amont :
--   `service_role` SANS `sub` a `can_edit = TRUE` mais un périmètre étendu VIDE — il ne
--   peut pas servir à éprouver le bras brouillon (le test serait vacant sur ce bras).
--
-- Transactionnel : ROLLBACK, rien ne persiste.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org    text := 'ORGRUN9999999850';
  v_exact  text := 'HLORUN9999999851';  -- publié, nom EXACTEMENT la saisie
  v_prefix text := 'LOIRUN9999999852';  -- publié, le nom COMMENCE par la saisie
  v_infix  text := 'RESRUN9999999853';  -- publié, le nom CONTIENT la saisie
  v_draft  text := 'HLORUN9999999854';  -- BROUILLON de l'ORG, nom exact
  v_arch   text := 'HLORUN9999999855';  -- ARCHIVÉ, nom exact — ne doit JAMAIS sortir
  v_role_pub uuid;
  v_editor uuid := '9e111111-1111-4111-8111-111111111111';
  v_stranger uuid := '9e222222-2222-4222-8222-222222222222';
  v_membership uuid; v_role_admin uuid;
  v_ids text[]; n int; v_can boolean;
BEGIN
  -- `object_org_link.role_id` cible `ref_org_role`, PAS une partition `ref_code` :
  -- se tromper de catalogue fait échouer l'INSERT sur la contrainte NOT NULL, avec un
  -- message qui ne dit pas la cause. On résout explicitement, et on échoue fort si le
  -- seed manque — sans ce rôle le bloc C n'aurait rien à éprouver.
  SELECT id INTO v_role_pub FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_role_pub IS NULL THEN
    RAISE EXCEPTION 'ref_org_role[publisher] introuvable — le bloc C serait vacant';
  END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org,    'ORG', 'ORG Temoin Concordance',       'published'),
    (v_exact,  'HLO', 'Concordance Temoin',           'published'),
    (v_prefix, 'LOI', 'Concordance Temoin Annexe',    'published'),
    (v_infix,  'RES', 'Kaz Concordance Temoin',       'published'),
    (v_draft,  'HLO', 'Concordance Temoin Brouillon', 'draft'),
    (v_arch,   'HLO', 'Concordance Temoin Archive',   'archived');

  INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary) VALUES
    (v_draft, v_org, v_role_pub, TRUE);

  INSERT INTO auth.users (id, email) VALUES
    (v_editor,   'editeur16w@test.local'),
    (v_stranger, 'etranger16w@test.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role, display_name) VALUES
    (v_editor,   'tourism_agent', 'Editeur 16w'),
    (v_stranger, 'tourism_agent', 'Etranger 16w')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;
  -- SEUL l'éditeur est membre : c'est ce qui sépare le bloc C du bloc B.
  INSERT INTO user_org_membership (user_id, org_object_id, is_active)
    VALUES (v_editor, v_org, TRUE)
    RETURNING id INTO v_membership;

  -- Une adhésion NE SUFFIT PAS à faire un éditeur : `api.current_user_can_edit_objects()`
  -- exige superuser plateforme, OU un rôle d'administration d'ORG actif, OU l'une des 4
  -- permissions d'édition — et il n'existe encore AUCUN octroi de permission en base
  -- (dette connue, SP-2). On passe donc par le rôle d'ORG `org_admin`, qui est le chemin
  -- qu'emprunte un vrai éditeur aujourd'hui. Sans cette ligne, le bloc C serait vacant :
  -- le persona retomberait sur la branche lecteur et n'asserterait que des publiés.
  SELECT id INTO v_role_admin FROM ref_org_admin_role WHERE code = 'org_admin' LIMIT 1;
  IF v_role_admin IS NULL THEN
    RAISE EXCEPTION 'ref_org_admin_role[org_admin] introuvable — le bloc C serait vacant';
  END IF;
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active)
    VALUES (v_membership, v_role_admin, TRUE);

  ----------------------------------------------------------------------------
  -- A. ANON : publiés seuls, ordre exact > préfixe > infixe, accents normalisés.
  ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;

  SELECT array_agg(r.id ORDER BY r.ord) INTO v_ids
  FROM api.search_objects_by_name('Concordance Témoin', 10)
       WITH ORDINALITY AS r(id, name, object_type, status, city, image_url, ord);

  ASSERT v_ids = ARRAY[v_exact, v_prefix, v_infix],
    format('anon: attendu exact>prefixe>infixe sur les 3 publies, vu %s', v_ids);

  -- D (partie 1) : garde de longueur, et `%` échappé (sinon tout le corpus sortirait).
  SELECT count(*) INTO n FROM api.search_objects_by_name('C', 10);
  ASSERT n = 0, format('garde <2 caracteres violee: %s lignes', n);
  SELECT count(*) INTO n FROM api.search_objects_by_name('%', 10);
  ASSERT n = 0, format('le %% saisi doit etre echappe et ne rien ramener, vu %s lignes', n);
  SELECT count(*) INTO n FROM api.search_objects_by_name('Concordance Temoin', 2);
  ASSERT n = 2, format('p_limit=2 doit borner a 2, vu %s', n);

  RESET ROLE;

  ----------------------------------------------------------------------------
  -- B. AUTHENTIFIÉ ÉTRANGER : aucune adhésion ⇒ strictement comme anon.
  ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    format('{"role":"authenticated","sub":"%s"}', v_stranger), true);
  SET LOCAL ROLE authenticated;

  SELECT array_agg(r.id ORDER BY r.ord) INTO v_ids
  FROM api.search_objects_by_name('Concordance Temoin', 10)
       WITH ORDINALITY AS r(id, name, object_type, status, city, image_url, ord);

  ASSERT NOT (v_ids @> ARRAY[v_draft]),
    format('FUITE: un authentifie etranger voit le brouillon (%s)', v_ids);
  ASSERT v_ids = ARRAY[v_exact, v_prefix, v_infix],
    format('etranger: attendu les 3 publies seuls, vu %s', v_ids);

  RESET ROLE;

  ----------------------------------------------------------------------------
  -- C. MEMBRE ÉDITEUR de l'ORG publisher : les publiés + SON brouillon.
  --    La garde se mesure des DEUX côtés : montrer que le persona autorisé voit
  --    TOUJOURS la donnée, pas seulement que l'anonyme ne la voit plus.
  ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    format('{"role":"authenticated","sub":"%s"}', v_editor), true);
  SET LOCAL ROLE authenticated;

  v_can := COALESCE(api.current_user_can_edit_objects(), FALSE);
  ASSERT v_can, 'le persona editeur doit avoir can_edit=TRUE, sinon le bloc C est vacant';
  SELECT count(*) INTO n
  FROM api.current_user_extended_object_ids() r WHERE r = v_draft;
  ASSERT n = 1,
    'le brouillon doit etre dans le perimetre etendu de l editeur, sinon le bloc C est vacant';

  SELECT array_agg(r.id ORDER BY r.ord) INTO v_ids
  FROM api.search_objects_by_name('Concordance Temoin', 10)
       WITH ORDINALITY AS r(id, name, object_type, status, city, image_url, ord);

  ASSERT v_ids @> ARRAY[v_draft],
    format('l editeur DOIT voir son brouillon, vu %s', v_ids);
  ASSERT array_length(v_ids, 1) = 4,
    format('l editeur doit voir 3 publies + 1 brouillon, vu %s', v_ids);
  ASSERT NOT (v_ids @> ARRAY[v_arch]),
    format('l archive ne doit JAMAIS sortir, meme pour un editeur, vu %s', v_ids);

  RESET ROLE;

  RAISE NOTICE 'A-D/ perimetre et gardes OK (anon=3 publies, etranger=3, editeur=4 dont son brouillon, archive jamais)';
END $$;

-- E. Privilèges : EXECUTE retiré à PUBLIC. Sans le REVOKE, PostgreSQL l'accorde par
--    défaut à toute fonction neuve et le GRANT ciblé ne le retire pas (§204).
DO $$
DECLARE v_public boolean;
BEGIN
  SELECT has_function_privilege('public', p.oid, 'EXECUTE') INTO v_public
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'api' AND p.proname = 'search_objects_by_name';

  ASSERT v_public IS NOT NULL, 'api.search_objects_by_name introuvable';
  ASSERT v_public = FALSE, 'EXECUTE doit etre RETIRE a PUBLIC (REVOKE manquant)';

  RAISE NOTICE 'E/ privileges OK (PUBLIC sans EXECUTE)';
END $$;

ROLLBACK;
