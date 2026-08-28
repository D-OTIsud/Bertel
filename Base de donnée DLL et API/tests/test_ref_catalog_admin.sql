-- test_ref_catalog_admin.sql
-- Garde permanente §211 — administration générée des catalogues de référence.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_n integer; v_cols jsonb;
BEGIN
  -- Compte EXACT, calculé : un « >= 80 » masquerait la disparition de vingt catalogues.
  SELECT count(*) INTO v_n FROM internal.v_ref_catalog;
  ASSERT v_n = (
      (SELECT count(*) FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'ref\_%'
         AND c.relname <> 'ref_code'
         AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid))
    + (SELECT count(DISTINCT domain) FROM public.ref_code)),
    format('une entrée par table et par domaine ; obtenu %s', v_n);

  -- ref_code et ses partitions ne sont pas des catalogues autonomes…
  ASSERT NOT EXISTS (SELECT 1 FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code'),
         'ref_code est servi domaine par domaine, pas comme table';
  ASSERT NOT EXISTS (SELECT 1 FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code_media_type'),
         'les partitions de ref_code ne sont pas des catalogues autonomes';
  -- … mais ces deux-là en sont, malgré leur préfixe : c'est pg_inherits qui tranche, pas le nom.
  ASSERT EXISTS (SELECT 1 FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code_domain_registry'),
         'ref_code_domain_registry porte le préfixe sans être une partition';
  ASSERT EXISTS (SELECT 1 FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code_taxonomy_closure'),
         'ref_code_taxonomy_closure porte le préfixe sans être une partition';

  -- LE PIÈGE : un domaine DOIT être identifiable et décrit, sinon il est verrouillé en silence.
  ASSERT (SELECT is_identifiable FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code:cuisine_type'),
         'un domaine ref_code doit être identifiable : sinon le helper d''accès le verrouille';
  ASSERT (SELECT primary_key_columns->0->>'name' FROM internal.v_ref_catalog
          WHERE catalog_key = 'ref_code:cuisine_type') = 'id',
         'un domaine ref_code s''identifie par ref_code.id';
  ASSERT jsonb_array_length(
           (SELECT columns FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code:cuisine_type')) = 5,
         'un domaine ref_code doit porter la forme éditable synthétisée de ref_code';

  -- Formes de clé primaire réelles.
  ASSERT jsonb_array_length((SELECT primary_key_columns FROM internal.v_ref_catalog
          WHERE catalog_key = 'ref_capacity_applicability')) = 2,
         'une PK composite doit être décrite en entier';
  ASSERT (SELECT primary_key_columns->0->>'name' FROM internal.v_ref_catalog
          WHERE catalog_key = 'ref_commune') = 'insee_code',
         'ref_commune s''identifie par insee_code, pas par un uuid';
  ASSERT (SELECT is_identifiable FROM internal.v_ref_catalog
          WHERE catalog_key = 'ref_interop_crosswalk') = false,
         'une relation sans clé primaire doit être marquée non identifiable';

  -- Description des colonnes d'une table.
  SELECT columns INTO v_cols FROM internal.v_ref_catalog WHERE catalog_key = 'ref_legal_type';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_cols) c
                 WHERE c->>'name' = 'review_interval_days' AND c->>'type' = 'integer'),
         'le type PostgreSQL doit remonter tel quel (il sert au cast du SQL dynamique)';

  -- Cible de FK NORMALISÉE en catalog_key, pas en nom de partition.
  ASSERT (SELECT f->>'target' FROM internal.v_ref_catalog v, jsonb_array_elements(v.outgoing_fk) f
          WHERE v.catalog_key = 'ref_amenity' AND f->>'column' = 'family_id')
         = 'ref_code:amenity_family',
         'une FK vers une partition de ref_code doit être normalisée en ref_code:<domaine>, '
         'sinon la liste déroulante interroge un catalogue qui n''existe pas';

  -- FK entrantes : elles portent le compteur d'usage.
  ASSERT EXISTS (SELECT 1 FROM internal.v_ref_catalog v, jsonb_array_elements(v.incoming_fk) f
                 WHERE v.catalog_key = 'ref_legal_type' AND f->>'table' = 'object_legal'),
         'object_legal référence ref_legal_type : la FK entrante doit être découverte';

  -- Angle mort de la première revue : l'espèce 'table' (ref_legal_type ci-dessus) a un
  -- reloid direct et « marchait déjà » ; l'espèce 'ref_code_domain' pose reloid=NULL dans le
  -- CTE cat, donc `k.confrelid = cat.reloid` n'était jamais vrai et incoming_fk valait '[]'
  -- pour LES 71 DOMAINES, quelles que soient leurs FK entrantes réelles. object_cuisine_type
  -- référence bien ref_code_cuisine_type(id) (schema_unified.sql) : nommer cette table précise
  -- rend l'assertion non vacante (un simple compte > 0 aurait pu passer par accident).
  ASSERT EXISTS (SELECT 1 FROM internal.v_ref_catalog v, jsonb_array_elements(v.incoming_fk) f
                 WHERE v.catalog_key = 'ref_code:cuisine_type' AND f->>'table' = 'object_cuisine_type'),
         'object_cuisine_type référence ref_code_cuisine_type : un domaine ref_code doit '
         'découvrir ses FK entrantes via sa partition, pas rester vide faute de reloid';

  RAISE NOTICE 'v_ref_catalog assertions passed';
END$$;

DO $$
BEGIN
  -- Un verrouillage sans motif est refusé : un écran qui dit « lecture seule » sans
  -- dire pourquoi transforme une décision en mystère.
  BEGIN
    INSERT INTO ref_catalog_registry (catalog_key, label, family, access)
    VALUES ('ref_legal_type', 'Test', 'Juridique', 'readonly');
    RAISE EXCEPTION 'GARDE VACANTE : access=readonly sans readonly_reason accepté';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  ASSERT (SELECT access FROM ref_catalog_registry WHERE catalog_key = 'ref_permission') = 'readonly',
         'ref_permission : ses codes sont lus en dur par le contrôle d''accès';
  ASSERT (SELECT length(readonly_reason) FROM ref_catalog_registry
          WHERE catalog_key = 'ref_permission') > 20,
         'le motif doit être une phrase affichable, pas un mot';

  -- Les verrouillages DÉRIVÉS ne doivent PAS être seedés : les dupliquer ferait croire
  -- que le seed est la garde, et un oubli deviendrait une ouverture.
  ASSERT NOT EXISTS (SELECT 1 FROM ref_catalog_registry WHERE catalog_key = 'ref_interop_crosswalk'),
         'sans clé primaire = verrouillage DÉRIVÉ, pas une ligne de registre';
  ASSERT NOT EXISTS (SELECT 1 FROM ref_catalog_registry WHERE catalog_key LIKE 'ref_code:taxonomy%'),
         'domaine non éditable = verrouillage DÉRIVÉ via api.ref_code_domain_is_editable';

  -- Le registre ne référence QUE des catalogues réels.
  ASSERT NOT EXISTS (
    SELECT 1 FROM ref_catalog_registry r
    WHERE NOT EXISTS (SELECT 1 FROM internal.v_ref_catalog v WHERE v.catalog_key = r.catalog_key)),
    'le registre contient une clé qui ne correspond à aucun catalogue découvert';

  RAISE NOTICE 'ref_catalog_registry assertions passed';
END$$;

-- ----------------------------------------------------------------------------
-- Tâche 3 — RPC de lecture + helpers dérivés.
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_list jsonb; v_cat jsonb; r record;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_list := api.list_ref_catalogs();
  ASSERT jsonb_array_length(v_list) = (SELECT count(*) FROM internal.v_ref_catalog),
         'le maître doit lister TOUS les catalogues découverts';

  -- Le maître et le détail ne doivent JAMAIS diverger sur l'accès.
  FOR r IN SELECT catalog_key FROM internal.v_ref_catalog LOOP
    ASSERT (SELECT c->>'access' FROM jsonb_array_elements(v_list) c
            WHERE c->>'catalog_key' = r.catalog_key)
           = (api.get_ref_catalog(r.catalog_key)->>'access'),
           format('accès divergent entre maître et détail sur %s', r.catalog_key);
  END LOOP;

  -- LE PIÈGE : un domaine plat doit être ÉDITABLE.
  ASSERT api.get_ref_catalog('ref_code:cuisine_type')->>'access' = 'editable',
         'un domaine ref_code plat doit rester éditable — is_identifiable synthétisé';
  -- … et un domaine structurel verrouillé PAR DÉRIVATION.
  ASSERT api.get_ref_catalog('ref_code:taxonomy_hlo')->>'access' = 'readonly',
         'un domaine non éditable selon api.ref_code_domain_is_editable est verrouillé';
  ASSERT api.get_ref_catalog('ref_interop_crosswalk')->>'access' = 'readonly',
         'une relation sans clé primaire est verrouillée d''office';

  -- outgoing_fk émis ET normalisé : sans lui, saisie d'UUID à la main.
  ASSERT (SELECT f->>'target'
          FROM jsonb_array_elements(api.get_ref_catalog('ref_amenity')->'outgoing_fk') f
          WHERE f->>'column' = 'family_id') = 'ref_code:amenity_family',
         'la cible de FK doit être un catalog_key exploitable par le front';

  -- Cascade de libellé.
  ASSERT api.get_ref_catalog('ref_sustainability_action')->>'label_column' = 'label',
         'la cascade doit trouver `label` quand `name` est absente';
  ASSERT api.get_ref_catalog('ref_capacity_applicability')->>'label_column' IS NULL,
         'une matrice n''a pas de colonne de libellé : le front compose depuis la clé';

  -- BALAYAGE EXHAUSTIF : chaque catalogue doit se décrire sans erreur.
  FOR r IN SELECT catalog_key FROM internal.v_ref_catalog LOOP
    BEGIN
      PERFORM api.get_ref_catalog(r.catalog_key);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'get_ref_catalog casse sur % : % (%)', r.catalog_key, SQLERRM, SQLSTATE;
    END;
  END LOOP;

  v_cat := api.get_ref_catalog('ref_legal_type');
  ASSERT jsonb_array_length(v_cat->'rows') = 20,
         format('ref_legal_type porte 20 valeurs ; obtenu %s', jsonb_array_length(v_cat->'rows'));

  RAISE NOTICE 'lecture assertions passed';
END$$;

-- Compteur d'usage : NON VACANT, et sur DEUX tables consommatrices DISTINCTES.
-- ref_language est référencée par object_language ET object_review : c'est la FUSION
-- entre deux FK entrantes qu'on teste ici, pas deux lignes dans la même table.
DO $$
DECLARE
  v_lang uuid; v_key text; v_before bigint; v_after bigint; v_source uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT id INTO v_lang FROM ref_language WHERE code = 'fr';
  v_key := v_lang::text;

  v_before := COALESCE((api.get_ref_catalog('ref_language')->'usage'->>v_key)::bigint, 0);

  INSERT INTO object (id, object_type, name, status)
    VALUES ('CATMFK9999999901', 'HLO', 'Témoin multi-FK', 'draft');
  INSERT INTO object_language (object_id, language_id) VALUES ('CATMFK9999999901', v_lang);
  -- object_review.source_id est NOT NULL (FK ref_review_source) : ref_legal_type était
  -- le seul champ obligatoire cité par le brief, mais le schéma réel exige aussi une
  -- source d'avis. On prend une source seedée existante — l'intention du test (deux
  -- tables DISTINCTES référençant ref_language) n'en est pas changée.
  SELECT id INTO v_source FROM ref_review_source LIMIT 1;
  INSERT INTO object_review (object_id, source_id, language_id, rating)
    VALUES ('CATMFK9999999901', v_source, v_lang, 5);

  v_after := COALESCE((api.get_ref_catalog('ref_language')->'usage'->>v_key)::bigint, 0);

  ASSERT v_after = v_before + 2,
         format('le compteur doit FUSIONNER deux FK entrantes distinctes ; avant %s, après %s',
                v_before, v_after);

  RAISE NOTICE 'compteur multi-FK assertion passed';
END$$;

-- ----------------------------------------------------------------------------
-- Tâche 4 — RPC d'écriture, de suppression et de réordonnancement.
-- ----------------------------------------------------------------------------

-- (1) CYCLE RÉEL, clé uuid simple.
DO $$
DECLARE v_id uuid; v_key jsonb; v_ok boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_id := (api.rpc_upsert_ref_row('ref_legal_type', NULL,
            '{"code":"temoin_211","name":"Témoin §211","category":"business","is_required":false}'::jsonb)
           ->>'id')::uuid;
  v_key := jsonb_build_object('id', v_id);
  -- Le cast typé fonctionne : sans lui, is_required (boolean) refuserait le texte de ->>.
  ASSERT (SELECT is_required FROM ref_legal_type WHERE id = v_id) = false,
         'une colonne booléenne doit être castée au type découvert';

  PERFORM api.rpc_upsert_ref_row('ref_legal_type', v_key, '{"name":"Témoin modifié"}'::jsonb);
  ASSERT (SELECT name FROM ref_legal_type WHERE id = v_id) = 'Témoin modifié', 'l''édition doit persister';

  -- Renvoyer le MÊME code est toléré (formulaire pré-rempli) ; un code différent est refusé.
  PERFORM api.rpc_upsert_ref_row('ref_legal_type', v_key,
            '{"code":"temoin_211","name":"Témoin bis"}'::jsonb);
  ASSERT (SELECT name FROM ref_legal_type WHERE id = v_id) = 'Témoin bis',
         'renvoyer le même code ne doit pas bloquer l''enregistrement';
  v_ok := false;
  BEGIN PERFORM api.rpc_upsert_ref_row('ref_legal_type', v_key, '{"code":"autre"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%CODE_IMMUTABLE%'; END;
  ASSERT v_ok, 'changer le code doit lever CODE_IMMUTABLE';

  -- Colonne inconnue : ÉCHOUE, jamais ignorée (piège d'écriture).
  v_ok := false;
  BEGIN PERFORM api.rpc_upsert_ref_row('ref_legal_type', v_key, '{"nexiste_pas":"x"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%UNKNOWN_COLUMN%'; END;
  ASSERT v_ok, 'une colonne inconnue doit faire échouer l''appel';

  -- Colonne obligatoire sans défaut absente à la création : garde SERVEUR.
  v_ok := false;
  BEGIN PERFORM api.rpc_upsert_ref_row('ref_legal_type', NULL, '{"name":"Sans code"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%REQUIRED_HIDDEN_COLUMN%'; END;
  ASSERT v_ok, 'une colonne obligatoire sans défaut absente doit lever REQUIRED_HIDDEN_COLUMN';

  -- Suppression : refusée référencée, acceptée à 0, ROW_NOT_FOUND au second passage.
  INSERT INTO object (id, object_type, name, status) VALUES ('CATTST9999999901','HLO','T','draft');
  -- ÉCART constaté avec le brief (schéma réel) : validity_mode défaut = 'fixed_end_date'
  -- et chk_fixed_end_date_validity exige alors valid_to NOT NULL. Le brief insérait sans
  -- préciser validity_mode ; on force 'forever' (chk_forever_validity n'exige rien de plus
  -- que valid_to NULL, déjà le cas) pour isoler l'intention du test (une référence existe).
  INSERT INTO object_legal (object_id, type_id, value, validity_mode)
    VALUES ('CATTST9999999901', v_id, '{}'::jsonb, 'forever');
  v_ok := false;
  BEGIN PERFORM api.rpc_delete_ref_row('ref_legal_type', v_key);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%STILL_REFERENCED%'; END;
  ASSERT v_ok, 'supprimer une valeur référencée doit lever STILL_REFERENCED';

  DELETE FROM object_legal WHERE type_id = v_id;
  PERFORM api.rpc_delete_ref_row('ref_legal_type', v_key);
  ASSERT NOT EXISTS (SELECT 1 FROM ref_legal_type WHERE id = v_id), 'à 0 référence, la suppression passe';

  v_ok := false;
  BEGIN PERFORM api.rpc_delete_ref_row('ref_legal_type', v_key);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%ROW_NOT_FOUND%'; END;
  ASSERT v_ok, 'supprimer une ligne inexistante doit lever ROW_NOT_FOUND, pas réussir en silence';

  RAISE NOTICE 'cycle uuid assertions passed';
END$$;

-- (2) L'IDENTITÉ GÉNÉRIQUE : clé naturelle non-uuid, clé composite, absence de clé.
DO $$
DECLARE v_ok boolean; v_metric uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- Clé naturelle varchar(5). insee_code est une colonne de PK SANS défaut : elle doit
  -- être acceptée au payload de création, sinon ref_commune est inéditable.
  PERFORM api.rpc_upsert_ref_row('ref_commune', NULL,
            '{"insee_code":"97499","name":"Commune témoin §211"}'::jsonb);
  PERFORM api.rpc_upsert_ref_row('ref_commune', '{"insee_code":"97499"}'::jsonb,
            '{"name":"Commune modifiée"}'::jsonb);
  ASSERT (SELECT name FROM ref_commune WHERE insee_code = '97499') = 'Commune modifiée',
         'une clé primaire naturelle varchar doit permettre l''édition';
  PERFORM api.rpc_delete_ref_row('ref_commune', '{"insee_code":"97499"}'::jsonb);
  ASSERT NOT EXISTS (SELECT 1 FROM ref_commune WHERE insee_code = '97499'), 'et la suppression';

  -- Clé COMPOSITE.
  SELECT id INTO v_metric FROM ref_capacity_metric LIMIT 1;
  DELETE FROM ref_capacity_applicability WHERE metric_id = v_metric AND object_type = 'PRD';
  PERFORM api.rpc_upsert_ref_row('ref_capacity_applicability', NULL,
            jsonb_build_object('metric_id', v_metric, 'object_type', 'PRD'));
  ASSERT EXISTS (SELECT 1 FROM ref_capacity_applicability
                 WHERE metric_id = v_metric AND object_type = 'PRD'),
         'une matrice à clé composite doit être créable';
  PERFORM api.rpc_delete_ref_row('ref_capacity_applicability',
            jsonb_build_object('metric_id', v_metric, 'object_type', 'PRD'));
  ASSERT NOT EXISTS (SELECT 1 FROM ref_capacity_applicability
                     WHERE metric_id = v_metric AND object_type = 'PRD'), 'et supprimable';

  -- Sans clé primaire : verrouillée d'office, sans ligne de registre.
  v_ok := false;
  BEGIN PERFORM api.rpc_upsert_ref_row('ref_interop_crosswalk', NULL, '{"source_system":"x"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%LOCKED_CATALOG%'; END;
  ASSERT v_ok, 'une relation sans clé primaire doit être verrouillée d''office';

  RAISE NOTICE 'identité générique assertions passed';
END$$;

-- (3) DÉLÉGATION ref_code : nom/code non inversés, activation ET réordonnancement câblés.
DO $$
DECLARE v_a uuid; v_b uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_a := (api.rpc_upsert_ref_row('ref_code:cuisine_type', NULL,
           '{"code":"temoin_a_211","name":"Témoin A"}'::jsonb)->>'id')::uuid;
  v_b := (api.rpc_upsert_ref_row('ref_code:cuisine_type', NULL,
           '{"code":"temoin_b_211","name":"Témoin B"}'::jsonb)->>'id')::uuid;

  ASSERT (SELECT code FROM ref_code WHERE id = v_a) = 'temoin_a_211',
         'le code doit atterrir dans `code` — un appel positionnel l''écrirait dans `name`';
  ASSERT (SELECT name FROM ref_code WHERE id = v_a) = 'Témoin A',
         'le libellé doit atterrir dans `name`';

  PERFORM api.rpc_upsert_ref_row('ref_code:cuisine_type',
            jsonb_build_object('id', v_a), '{"is_active":false}'::jsonb);
  ASSERT (SELECT is_active FROM ref_code WHERE id = v_a) = false,
         'l''interrupteur « actif » des domaines doit rester câblé après absorption de RefCodeEditor';

  PERFORM api.rpc_reorder_ref_rows('ref_code:cuisine_type',
            (SELECT jsonb_agg(jsonb_build_object('id', rc.id) ORDER BY rc.id)
             FROM ref_code rc WHERE rc.domain = 'cuisine_type'));
  ASSERT (SELECT count(DISTINCT position) FROM ref_code WHERE domain = 'cuisine_type')
       = (SELECT count(*) FROM ref_code WHERE domain = 'cuisine_type'),
         'le réordonnancement des domaines doit rester câblé et produire des rangs distincts';

  PERFORM api.rpc_delete_ref_row('ref_code:cuisine_type', jsonb_build_object('id', v_a));
  PERFORM api.rpc_delete_ref_row('ref_code:cuisine_type', jsonb_build_object('id', v_b));
  RAISE NOTICE 'délégation ref_code assertions passed';
END$$;

-- Réordonnancement d'une TABLE : permutation sous index unique partiel, et refus des
-- listes incomplètes, dupliquées ou porteuses d'une clé inconnue.
DO $$
DECLARE v_keys jsonb; v_ok boolean; v_first uuid; v_second uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- ref_language porte uq_ref_language_position (UNIQUE partiel) : une écriture en une
  -- seule passe violerait l'unicité dès la première permutation. C'est CE test qui
  -- rougit si l'écriture en deux phases disparaît.
  SELECT jsonb_agg(jsonb_build_object('id', l.id) ORDER BY l.position NULLS LAST, l.id)
    INTO v_keys FROM ref_language l;
  SELECT (v_keys->0->>'id')::uuid, (v_keys->1->>'id')::uuid INTO v_first, v_second;

  PERFORM api.rpc_reorder_ref_rows('ref_language',
    jsonb_build_array(v_keys->1, v_keys->0) || (SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
      FROM jsonb_array_elements(v_keys) WITH ORDINALITY AS t(e, ord) WHERE ord > 2));
  ASSERT (SELECT position FROM ref_language WHERE id = v_second)
       < (SELECT position FROM ref_language WHERE id = v_first),
         'la permutation doit passer malgré l''index unique partiel sur position';

  -- Liste INCOMPLÈTE : refusée, sinon on réordonnerait silencieusement de travers.
  v_ok := false;
  BEGIN PERFORM api.rpc_reorder_ref_rows('ref_language', jsonb_build_array(v_keys->0));
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%INCOMPLETE_ORDER%'; END;
  ASSERT v_ok, 'une liste partielle doit lever INCOMPLETE_ORDER';

  -- p_keys NULL : piège à trois valeurs. jsonb_array_length(NULL) rend NULL, donc
  -- `v_given <> v_n` s'évalue à NULL et un IF non gardé le traite comme faux — succès
  -- silencieux, rien réordonné. Sans la garde explicite `p_keys IS NULL`, cet appel ne
  -- lève RIEN (PERFORM réussit) et l'ASSERT ci-dessous tombe sur `v_ok = false`.
  v_ok := false;
  BEGIN PERFORM api.rpc_reorder_ref_rows('ref_language', NULL);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%INCOMPLETE_ORDER%'; END;
  ASSERT v_ok, 'p_keys NULL doit lever INCOMPLETE_ORDER, pas réussir en silence';

  -- DOUBLON : refusé.
  v_ok := false;
  BEGIN PERFORM api.rpc_reorder_ref_rows('ref_language',
    (SELECT jsonb_agg(e) FROM jsonb_array_elements(v_keys || jsonb_build_array(v_keys->0)) e));
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%INCOMPLETE_ORDER%'; END;
  ASSERT v_ok, 'une liste avec doublon doit lever INCOMPLETE_ORDER';

  -- Clé INCONNUE : refusée.
  v_ok := false;
  BEGIN
    PERFORM api.rpc_reorder_ref_rows('ref_language',
      (SELECT jsonb_agg(e) FROM jsonb_array_elements(v_keys) WITH ORDINALITY AS t(e, ord)
       WHERE ord > 1) || jsonb_build_array(jsonb_build_object('id', gen_random_uuid())));
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM LIKE '%UNKNOWN_ROW%'; END;
  ASSERT v_ok, 'une clé inconnue doit lever UNKNOWN_ROW';

  RAISE NOTICE 'réordonnancement assertions passed';
END$$;

-- (4) ASSERTION DE SÉCURITÉ — si elle disparaît, le RPC devient une écriture arbitraire.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    PERFORM api.rpc_upsert_ref_row('object', NULL, '{"name":"pwn"}'::jsonb);
    RAISE EXCEPTION 'GARDE VACANTE : écriture sur `object` acceptée';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%UNKNOWN_CATALOG%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM api.rpc_delete_ref_row('auth.users', '{"id":"00000000-0000-0000-0000-000000000000"}'::jsonb);
    RAISE EXCEPTION 'GARDE VACANTE : suppression dans auth.users acceptée';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%UNKNOWN_CATALOG%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM api.rpc_upsert_ref_row('ref_permission', NULL, '{"code":"x","name":"x"}'::jsonb);
    RAISE EXCEPTION 'GARDE VACANTE : écriture sur un catalogue verrouillé acceptée';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%LOCKED_CATALOG%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM api.rpc_upsert_ref_row('ref_code:taxonomy_hlo', NULL, '{"code":"x","name":"x"}'::jsonb);
    RAISE EXCEPTION 'GARDE VACANTE : écriture sur une taxonomie acceptée';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%LOCKED_CATALOG%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'écriture assertions passed';
END$$;

DO $$
BEGIN
  -- Le registre SE DECOUVRE LUI-MEME : c'est une table public.ref_* non partitionnee, donc la
  -- vue l'emet comme n'importe quel catalogue. Consequence assumee de la conception (33 tables,
  -- pas 32) — mais il doit etre CLASSE, sinon il apparait en « A classer » ou son role est
  -- illisible pour l'agent qui ouvre l'ecran.
  ASSERT EXISTS (SELECT 1 FROM internal.v_ref_catalog WHERE catalog_key = 'ref_catalog_registry'),
         'le registre doit se decouvrir lui-meme : c''est une table public.ref_* comme une autre';
  ASSERT (SELECT family FROM public.ref_catalog_registry WHERE catalog_key = 'ref_catalog_registry')
         = 'Structure',
         'le registre doit etre classe explicitement, pas laisse en « A classer »';
  ASSERT internal.ref_catalog_access('ref_catalog_registry') = 'editable',
         'le registre reste editable : reclasser un catalogue depuis l''ecran est son service meme';

  -- Les cinq helpers internes figent leur search_path. ref_catalog_cast_expr construit du SQL
  -- dynamique : c'est le dernier endroit ou laisser flotter la resolution de noms.
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'internal' AND p.proname LIKE 'ref\_catalog%' AND p.proconfig IS NULL),
    'un helper interne sans SET search_path : la resolution de noms doit etre figee partout';

  RAISE NOTICE 'auto-decouverte et search_path assertions passed';
END$$;

ROLLBACK;
