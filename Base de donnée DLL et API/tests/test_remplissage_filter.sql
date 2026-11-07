-- test_remplissage_filter.sql
-- Garde permanente du filtre « Remplissage » (§204, manifest 16r).
--
-- NON VACUITÉ : chaque bloc crée des fiches témoins aux trous CONNUS et exécute
-- le VRAI RPC. Asserter qu'une clé est acceptée ne prouverait rien.
--
-- HARNAIS DE CONTEXTE — indispensable, et non trivial :
--   api.current_user_can_edit_objects() est à TROIS valeurs. Sa chaîne de OR
--   passe par auth.role(), qui est NULL hors contexte HTTP : dans une session
--   psql/pooler la fonction rend NULL, même en superuser. Un test qui se
--   contenterait de `SET ROLE` ne verrait donc JAMAIS le chemin éditeur et
--   n'assertrait que des ensembles vides — vacuité parfaite.
--   On simule donc les deux contextes par `request.jwt.claims` :
--     éditeur  : {"role":"service_role"}   → is_platform_superuser() TRUE
--     lecteur  : {"role":"authenticated"}  + sub inconnu → FALSE (pas NULL)
--
-- Self-contained + transactionnel (ROLLBACK ; rien ne persiste).
\set ON_ERROR_STOP on
BEGIN;

-- Contexte ÉDITEUR pour toute la partie « le filtre fonctionne ».
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  v_missing text[];
BEGIN
  -- ---------- Témoins ----------
  -- RMP…01 : complète (0 manquant). RMP…02 : sans photo uniquement (1 manquant).
  -- RMP…03 : sans photo, sans contact, sans tag, sans descriptif (4 manquants).
  --
  -- Les catalogues se résolvent par sous-requête, jamais par un UUID en dur.
  -- ATTENTION aux colonnes obligatoires, vérifiées en base :
  --   object_taxonomy : (object_id, domain, ref_code_id) — FK COMPOSITE (ref_code_id, domain)
  --   contact_channel : kind_id (uuid → ref_code domaine 'contact_kind'), PAS une colonne `kind`
  --   media           : media_type_id (uuid → ref_code domaine 'media_type') est NOT NULL
  --
  -- LE BLOC TYPE DÉPEND DU TYPE D'OBJET. Les témoins sont des HLO : pour cette
  -- famille, `e_typeblock` exige une CAPACITÉ `max_capacity` ou une CHAMBRE —
  -- `object_amenity` ne compte que pour la branche ELSE (les autres types). Y
  -- mettre une commodité donnerait un témoin « complet » à 1 manquant et un
  -- témoin « à 4 » à 5 : le test échouerait sans que la cause soit lisible.
  INSERT INTO object (id, object_type, name, status, published_at) VALUES
    ('RMPLIS9999999901', 'HLO', 'Remplissage complete',  'published', now()),
    ('RMPLIS9999999902', 'HLO', 'Remplissage sans photo','published', now()),
    ('RMPLIS9999999903', 'HLO', 'Remplissage tres vide', 'published', now());

  -- 01 : tout présent.
  INSERT INTO object_taxonomy (object_id, domain, ref_code_id)
    SELECT 'RMPLIS9999999901', 'taxonomy_hlo', id FROM ref_code WHERE domain = 'taxonomy_hlo' AND is_assignable ORDER BY code LIMIT 1;
  INSERT INTO object_location (object_id, city, is_main_location)
    VALUES ('RMPLIS9999999901', 'Saint-Pierre', TRUE);
  INSERT INTO contact_channel (object_id, kind_id, value, is_public)
    SELECT 'RMPLIS9999999901', id, '0262000001', TRUE
    FROM ref_code WHERE domain = 'contact_kind' LIMIT 1;
  INSERT INTO object_description (object_id, description, description_chapo)
    VALUES ('RMPLIS9999999901', 'Descriptif complet.', 'Chapo.');
  INSERT INTO media (object_id, media_type_id, url)          -- cible HLO = 4
    SELECT 'RMPLIS9999999901', (SELECT id FROM ref_code WHERE domain = 'media_type' LIMIT 1),
           'https://exemple.test/' || g
    FROM generate_series(1, 4) g;
  INSERT INTO object_capacity (object_id, metric_id, value_integer)
    SELECT 'RMPLIS9999999901', id, 4 FROM ref_capacity_metric WHERE code = 'max_capacity';
  INSERT INTO tag_link (target_table, target_pk, tag_id)
    SELECT 'object', 'RMPLIS9999999901', id FROM ref_tag LIMIT 1;

  -- 02 : identique à 01 SAUF les photos (0).
  INSERT INTO object_taxonomy (object_id, domain, ref_code_id)
    SELECT 'RMPLIS9999999902', 'taxonomy_hlo', id FROM ref_code WHERE domain = 'taxonomy_hlo' AND is_assignable ORDER BY code LIMIT 1;
  INSERT INTO object_location (object_id, city, is_main_location)
    VALUES ('RMPLIS9999999902', 'Saint-Pierre', TRUE);
  INSERT INTO contact_channel (object_id, kind_id, value, is_public)
    SELECT 'RMPLIS9999999902', id, '0262000002', TRUE
    FROM ref_code WHERE domain = 'contact_kind' LIMIT 1;
  INSERT INTO object_description (object_id, description, description_chapo)
    VALUES ('RMPLIS9999999902', 'Descriptif complet.', 'Chapo.');
  INSERT INTO object_capacity (object_id, metric_id, value_integer)
    SELECT 'RMPLIS9999999902', id, 4 FROM ref_capacity_metric WHERE code = 'max_capacity';
  INSERT INTO tag_link (target_table, target_pk, tag_id)
    SELECT 'object', 'RMPLIS9999999902', id FROM ref_tag LIMIT 1;

  -- 03 : seulement sous-catégorie, lieu et bloc type.
  INSERT INTO object_taxonomy (object_id, domain, ref_code_id)
    SELECT 'RMPLIS9999999903', 'taxonomy_hlo', id FROM ref_code WHERE domain = 'taxonomy_hlo' AND is_assignable ORDER BY code LIMIT 1;
  INSERT INTO object_location (object_id, city, is_main_location)
    VALUES ('RMPLIS9999999903', 'Le Tampon', TRUE);
  INSERT INTO object_capacity (object_id, metric_id, value_integer)
    SELECT 'RMPLIS9999999903', id, 4 FROM ref_capacity_metric WHERE code = 'max_capacity';

  -- ---------- (A) La vue voit exactement les bons trous ----------
  SELECT missing_essentials INTO v_missing
  FROM internal.v_object_essentials WHERE object_id = 'RMPLIS9999999901';
  ASSERT v_missing = '{}'::text[],
    format('01 doit n''avoir AUCUN essentiel manquant ; obtenu: %s', v_missing);

  SELECT missing_essentials INTO v_missing
  FROM internal.v_object_essentials WHERE object_id = 'RMPLIS9999999902';
  ASSERT v_missing = ARRAY['photos'],
    format('02 ne doit manquer QUE de photos ; obtenu: %s', v_missing);

  SELECT missing_essentials INTO v_missing
  FROM internal.v_object_essentials WHERE object_id = 'RMPLIS9999999903';
  ASSERT v_missing @> ARRAY['photos','contact','description','tags']
     AND cardinality(v_missing) = 4,
    format('03 doit manquer exactement photos+contact+description+tags ; obtenu: %s', v_missing);

  RAISE NOTICE 'Bloc A (vue) OK.';
END$$;

-- ---------- (C) NON VACUITÉ — le filtre remonte l'ensemble EXACT ----------
-- Toutes les requêtes passent published+draft : cf. la note du bloc B3 — avec
-- `published` seul, le RPC lirait la vue matérialisée, qui ne contient pas les
-- témoins de cette transaction, et chaque assertion « passerait » sur 0 ligne.
DO $$
DECLARE
  v_hits text[];
BEGIN
  -- Palier « many » (3 et plus) : seule 03 y est.
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_hits
  FROM api.get_filtered_object_ids(
         '{"missing_essentials_buckets": ["many"]}'::jsonb,
         NULL::object_type[], ARRAY['published','draft']::object_status[], NULL) AS f
  WHERE f.object_id LIKE 'RMPLIS%';
  ASSERT v_hits = ARRAY['RMPLIS9999999903'],
    format('palier many doit remonter exactement 03 ; obtenu: %s', v_hits);

  -- Palier « complete » : seule 01.
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_hits
  FROM api.get_filtered_object_ids(
         '{"missing_essentials_buckets": ["complete"]}'::jsonb,
         NULL::object_type[], ARRAY['published','draft']::object_status[], NULL) AS f
  WHERE f.object_id LIKE 'RMPLIS%';
  ASSERT v_hits = ARRAY['RMPLIS9999999901'],
    format('palier complete doit remonter exactement 01 ; obtenu: %s', v_hits);

  -- Sélection NON CONTIGUË (complete + many) : 01 et 03, pas 02. C'est ce cas
  -- qui justifie des codes de palier plutôt qu'un intervalle min/max.
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_hits
  FROM api.get_filtered_object_ids(
         '{"missing_essentials_buckets": ["complete","many"]}'::jsonb,
         NULL::object_type[], ARRAY['published','draft']::object_status[], NULL) AS f
  WHERE f.object_id LIKE 'RMPLIS%';
  ASSERT v_hits = ARRAY['RMPLIS9999999901','RMPLIS9999999903'],
    format('paliers complete+many doivent remonter 01 et 03 ; obtenu: %s', v_hits);

  -- Facette « il manque les photos » : 02 et 03 (01 en a 4).
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_hits
  FROM api.get_filtered_object_ids(
         '{"missing_essentials_any": ["photos"]}'::jsonb,
         NULL::object_type[], ARRAY['published','draft']::object_status[], NULL) AS f
  WHERE f.object_id LIKE 'RMPLIS%';
  ASSERT v_hits = ARRAY['RMPLIS9999999902','RMPLIS9999999903'],
    format('facette photos doit remonter 02 et 03 ; obtenu: %s', v_hits);

  -- OU interne à la facette : « contact OU tags » ne remonte que 03.
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_hits
  FROM api.get_filtered_object_ids(
         '{"missing_essentials_any": ["contact","tags"]}'::jsonb,
         NULL::object_type[], ARRAY['published','draft']::object_status[], NULL) AS f
  WHERE f.object_id LIKE 'RMPLIS%';
  ASSERT v_hits = ARRAY['RMPLIS9999999903'],
    format('facette contact+tags (OU interne) doit remonter 03 ; obtenu: %s', v_hits);

  -- Les deux clés se combinent en ET : « sans photo » ET palier few ⇒ 02 seule.
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_hits
  FROM api.get_filtered_object_ids(
         '{"missing_essentials_any": ["photos"], "missing_essentials_buckets": ["few"]}'::jsonb,
         NULL::object_type[], ARRAY['published','draft']::object_status[], NULL) AS f
  WHERE f.object_id LIKE 'RMPLIS%';
  ASSERT v_hits = ARRAY['RMPLIS9999999902'],
    format('photos ET palier few doivent remonter 02 seule ; obtenu: %s', v_hits);

  -- Clé présente mais VIDE = pas de filtre (convention des facettes).
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_hits
  FROM api.get_filtered_object_ids(
         '{"missing_essentials_any": []}'::jsonb,
         NULL::object_type[], ARRAY['published','draft']::object_status[], NULL) AS f
  WHERE f.object_id LIKE 'RMPLIS%';
  ASSERT cardinality(v_hits) = 3,
    format('une clé vide ne doit RIEN filtrer ; obtenu: %s', v_hits);

  RAISE NOTICE 'Bloc C (non-vacuité du filtre) OK.';
END$$;

-- ---------- (D) La page de cartes porte missing_essentials ----------
DO $$
DECLARE
  v_page JSONB;
  v_item JSONB;
BEGIN
  -- published+draft : même raison qu'au bloc C (les témoins ne sont pas dans le MV).
  -- p_search cible les temoins : sans lui, « il manque les photos » remonte ~357
  -- fiches et 02 n'est pas dans la premiere page — le test echouerait sur la
  -- PAGINATION en laissant croire a un defaut du filtre.
  v_page := api.list_object_resources_filtered_page(
              NULL, ARRAY['fr']::text[], 50,
              '{"missing_essentials_any": ["photos"]}'::jsonb,
              NULL::object_type[], ARRAY['published','draft']::object_status[], 'Remplissage')::jsonb;

  SELECT d INTO v_item
  FROM jsonb_array_elements(v_page->'data') d
  WHERE d->>'id' = 'RMPLIS9999999902';

  ASSERT v_item IS NOT NULL,
    '02 doit être dans la page filtrée sur « il manque les photos »';
  ASSERT v_item ? 'missing_essentials',
    'la carte doit porter missing_essentials pour un appelant éditeur';
  ASSERT (SELECT array_agg(x) FROM jsonb_array_elements_text(v_item->'missing_essentials') x)
         = ARRAY['photos'],
    format('02 ne doit manquer que de photos ; obtenu: %s', v_item->'missing_essentials');

  -- 01 est complète : elle porte le champ, mais VIDE. Absence et tableau vide
  -- ne veulent pas dire la même chose — le front ne doit jamais déduire
  -- « complète » d'une absence (= appelant non éditeur).
  v_page := api.list_object_resources_filtered_page(
              NULL, ARRAY['fr']::text[], 50, '{}'::jsonb,
              NULL::object_type[], ARRAY['published','draft']::object_status[], 'Remplissage')::jsonb;
  SELECT d INTO v_item
  FROM jsonb_array_elements(v_page->'data') d
  WHERE d->>'id' = 'RMPLIS9999999901';
  ASSERT v_item ? 'missing_essentials' AND jsonb_array_length(v_item->'missing_essentials') = 0,
    format('01 doit porter un tableau VIDE, pas l''absence du champ ; obtenu: %s', v_item->'missing_essentials');

  RAISE NOTICE 'Bloc D (carte décorée) OK.';
END$$;

-- ---------- (B) Gardes du helper ----------
DO $$
DECLARE
  v_ids text[];
  v_n   int;
BEGIN
  -- B1. Le REVOKE FROM PUBLIC tient. Vérifié PAR LE CATALOGUE et non en tentant
  -- l'appel : PostgreSQL accorde EXECUTE à PUBLIC par défaut, et un GRANT ciblé
  -- ne retire pas ce droit — c'est précisément l'oubli que cette assertion garde.
  ASSERT NOT has_function_privilege('anon', 'api.object_missing_essentials(text[])', 'EXECUTE'),
    'anon ne doit PAS pouvoir exécuter api.object_missing_essentials : le REVOKE ALL FROM PUBLIC a sauté';
  ASSERT has_function_privilege('authenticated', 'api.object_missing_essentials(text[])', 'EXECUTE'),
    'authenticated doit pouvoir l''exécuter, sinon le chemin cartes est mort';

  -- B2. Contexte LECTEUR (role authenticated, sub inconnu) ⇒ ensemble vide.
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000ff"}', true);
  ASSERT api.current_user_can_edit_objects() = FALSE,
    'le contexte lecteur du harnais doit donner can_edit=FALSE (et non NULL), sinon B2 ne prouve rien';
  SELECT count(*) INTO v_n FROM api.object_missing_essentials(
    ARRAY['RMPLIS9999999901','RMPLIS9999999902','RMPLIS9999999903']);
  ASSERT v_n = 0,
    format('un appelant non-éditeur doit obtenir 0 ligne ; obtenu %s — le gate serveur est ouvert', v_n);

  -- B3. Le gate porte aussi sur le FILTRE lui-même, pas seulement sur l'émission
  -- du champ : un lecteur seul peut appeler le RPC en direct avec les deux clés.
  -- Ses clés doivent être IGNORÉES — donc les 3 témoins ressortent, pas 1.
  --
  -- STATUTS = published+draft, ET CE N'EST PAS ANODIN : avec `published` seul,
  -- get_filtered_object_ids emprunte internal.mv_filtered_objects, une vue
  -- MATÉRIALISÉE qui ne contient pas les témoins insérés dans cette transaction
  -- — le RPC rendrait 0 et le test « passerait » en ne prouvant rien. Ajouter
  -- `draft` force le chemin vif (`use_mv` faux). C'est aussi le chemin réel du
  -- filtre : son public, les éditeurs, voit published+draft par défaut.
  SELECT count(*) INTO v_n
  FROM api.get_filtered_object_ids(
         '{"missing_essentials_buckets": ["many"]}'::jsonb,
         NULL::object_type[], ARRAY['published','draft']::object_status[], NULL) AS f
  WHERE f.object_id LIKE 'RMPLIS%';
  ASSERT v_n = 3,
    format('les clés de remplissage d''un non-éditeur doivent être ignorées (3 témoins attendus) ; obtenu %s', v_n);

  -- B4. Retour en contexte ÉDITEUR : le helper rend les ids demandés, et RIEN
  -- d'autre — il ne fait pas confiance à la liste reçue mais ne l'élargit pas non plus.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT array_agg(object_id ORDER BY object_id) INTO v_ids
  FROM api.object_missing_essentials(ARRAY['RMPLIS9999999902','RMPLIS9999999903']);
  ASSERT v_ids = ARRAY['RMPLIS9999999902','RMPLIS9999999903'],
    format('le helper doit rendre exactement les ids demandés ; obtenu: %s', v_ids);

  RAISE NOTICE 'Bloc B (gardes du helper ET du filtre) OK.';
END$$;

ROLLBACK;
