-- test_global_search.sql
-- Proves §109 (global Explorer search via object.search_document):
--   * search_mode='global' matches child-sourced content (amenities, menu dishes,
--     dietary tags, descriptions) — not just name/city.
--   * the default ('name') mode is NOT broadened (editor pickers stay name-only).
--   * relevance ranking: a name match outranks an amenity-only match.
--   * menu visibility is honored (a private menu's dish does NOT surface the object).
--   * the maintenance triggers populate search_document on child INSERT (no manual refresh).
-- …and §197 (recherche tolérante aux fautes, trigrammes pg_trgm) :
--   * object.search_document_text (texte brut) est rempli par les MÊMES triggers ;
--   * `jaccusy` retrouve `jacuzzi` — par le nom ET par le contenu enfant ;
--   * LE REPLI : une saisie correcte n'arme PAS les trigrammes (« jacuzzi » ne
--     ramène pas « Chez Jacques »), une saisie sans aucun exact les arme ;
--   * un résultat exact passe TOUJOURS devant un résultat approximatif (socle 2.0) ;
--   * le flou est cantonné au mode `global` (les sélecteurs de l'éditeur restent exacts) ;
--   * la visibilité tient : un plat de carte PRIVÉE reste introuvable, même mal orthographié ;
--   * le seuil dépendant de la longueur est figé par ses deux bornes mesurées ;
--   * le chemin PUBLIÉ (internal.mv_filtered_objects) porte bien le texte.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
-- Fixtures are draft ⇒ get_filtered_object_ids reads the LIVE object table (use_mv = FALSE),
-- which exercises the full search_document path without an MV refresh. Le dernier bloc
-- ajoute UNE fixture publiée + REFRESH pour couvrir aussi le chemin MV.
-- NOTE: object_menu is only facet-applicable to menu-bearing types (e.g. RES), so both
-- dish-bearing fixtures are RES. The search itself is type-agnostic — any object that
-- carries the content surfaces.
--
-- §197 — POURQUOI CERTAINES GARDES NE SONT **PAS** TESTÉES (leçon §195, ne pas écrire
-- un test infalsifiable) : les gardes « au moins 4 caractères » et « un seul mot » sont
-- des gardes de COÛT, pas de sémantique. Mesuré : `jac` (3 car.) score 0.33 sur un
-- document contenant « jacuzzi », et `jaccusy zzqtrpp` (multi-mots) ~0.2 — tous deux
-- sous le seuil. Les retirer ne changerait AUCUNE de ces fixtures : un test « à 3
-- caractères, pas de flou » passerait qu'il existe ou non. Ce qui est réellement
-- testable — et testé ci-dessous — ce sont les DEUX bornes du seuil et la garde de mode.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_res   text := 'RESRUN9999999801';  -- restaurant: amenity jacuzzi + dish "Salade de palmiste" + vegan dish
  v_res2  text := 'RESRUN9999999802';  -- second restaurant: dish "Salade de palmiste"
  v_desc  text := 'RESRUN9999999803';  -- object: "palmiste" only in the canonical description
  v_priv  text := 'RESRUN9999999804';  -- object with a PRIVATE menu dish "Bredes mafane"
  v_named text := 'HLORUN9999999805';  -- object literally named with "jacuzzi" + commune Saint-Philippe
  v_hoar  text := 'HLORUN9999999806';  -- §197 : nom propre, cible du flou sur le NOM
  v_bebe  text := 'HLORUN9999999807';  -- §197 : description contenant « bebe » (plancher de bruit 4 car.)
  v_pub   text := 'HLORUN9999999808';  -- §197 : fixture PUBLIÉE ⇒ chemin MV
  v_jacq  text := 'HLORUN9999999809';  -- §197 : « Jacques » — proche de jacuzzi (0.375) SANS l'être
  v_cafe  text := 'RESRUN9999999810';  -- §199 : contient « cafe » — cible de la graphie « kafé »
  v_goya  text := 'RESRUN9999999811';  -- §199 : « goyavier » collide phonétiquement (KF) SANS parenté de caractères
  v_word  text := 'HLORUN9999999812';  -- §199 : « pique » (code PK) + « bebe » (trgm 0.400) — piège de la confirmation
  v_amen_jacuzzi uuid;
  v_dietary_vegan uuid;
  v_menu_res uuid; v_menu_res2 uuid; v_menu_priv uuid; v_item_res uuid;
  v_rel_named real; v_rel_res real;
  v_rel_exact real; v_rel_fuzzy real;
  v_doc_bebe text;
  v_ws numeric;
BEGIN
  -- ---------- Resolve reference rows (must exist) ----------
  SELECT id INTO v_amen_jacuzzi FROM ref_amenity
    WHERE immutable_unaccent(lower(name)) LIKE '%jacuzzi%' ORDER BY name LIMIT 1;
  ASSERT v_amen_jacuzzi IS NOT NULL, 'seed missing: a ref_amenity whose name contains "jacuzzi"';

  SELECT id INTO v_dietary_vegan FROM ref_code_dietary_tag
    WHERE immutable_unaccent(lower(name)) LIKE '%vegan%' ORDER BY name LIMIT 1;
  ASSERT v_dietary_vegan IS NOT NULL, 'seed missing: a ref_code_dietary_tag whose name contains "vegan/végan"';

  -- ---------- Structural assertions ----------
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='object' AND column_name='search_document'),
         'object.search_document column is missing';
  -- §197 — le texte brut ET sa projection dans le MV. Oublier la colonne du MV rendrait
  -- le flou muet pour les visiteurs anonymes SANS aucune erreur : d'où l'assertion.
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='object' AND column_name='search_document_text'),
         '§197: object.search_document_text column is missing';
  ASSERT EXISTS (SELECT 1 FROM pg_attribute
                 WHERE attrelid='internal.mv_filtered_objects'::regclass
                   AND attname='search_document_text' AND NOT attisdropped),
         '§197: internal.mv_filtered_objects does not carry search_document_text';
  ASSERT EXISTS (SELECT 1 FROM pg_attribute
                 WHERE attrelid='internal.mv_filtered_objects'::regclass
                   AND attname='city_normalized' AND NOT attisdropped),
         '§197: internal.mv_filtered_objects does not carry city_normalized';
  ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_refresh_object_filter_caches_object_menu_item'),
         'menu-item maintenance trigger is missing';
  ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_refresh_object_filter_caches_tag_link'),
         'tag_link maintenance trigger is missing';

  -- ---------- Fixtures (superuser; RLS bypassed). Triggers populate search_document. ----------
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_res,   'RES', 'Table du Sud',       'draft'),
    (v_res2,  'RES', 'Case Creole',        'draft'),
    (v_desc,  'RES', 'Le Bon Coin',        'draft'),
    (v_priv,  'RES', 'Le Discret',         'draft'),
    (v_named, 'HLO', 'Villa Jacuzzi Plus', 'draft'),
    (v_hoar,  'HLO', 'Chez Hoareau',       'draft'),
    (v_bebe,  'HLO', 'Le Nid Douillet',    'draft'),
    (v_pub,   'HLO', 'Villa Publiee',      'published'),
    (v_jacq,  'HLO', 'La Kaz Tranquille',  'draft'),
    (v_cafe,  'RES', 'Le Comptoir',        'draft'),
    (v_goya,  'RES', 'La Confiturerie',    'draft'),
    (v_word,  'HLO', 'L Aire Verte',       'draft');

  INSERT INTO object_amenity (object_id, amenity_id) VALUES (v_res, v_amen_jacuzzi);
  INSERT INTO object_amenity (object_id, amenity_id) VALUES (v_pub, v_amen_jacuzzi);

  -- Commune portée par la fixture nommée : alimente le score flou « commune ».
  INSERT INTO object_location (object_id, city, is_main_location)
    VALUES (v_named, 'Saint-Philippe', TRUE);

  INSERT INTO object_menu (id, object_id, name, is_active, visibility)
    VALUES (gen_random_uuid(), v_res, 'Carte', TRUE, 'public') RETURNING id INTO v_menu_res;
  INSERT INTO object_menu (id, object_id, name, is_active, visibility)
    VALUES (gen_random_uuid(), v_res2, 'Table d hote', TRUE, NULL) RETURNING id INTO v_menu_res2;

  INSERT INTO object_menu_item (id, menu_id, name, description)
    VALUES (gen_random_uuid(), v_menu_res, 'Salade de palmiste', 'fraicheur du jour')
    RETURNING id INTO v_item_res;
  INSERT INTO object_menu_item (menu_id, name) VALUES (v_menu_res2, 'Salade de palmiste');

  INSERT INTO object_menu_item_dietary_tag (menu_item_id, dietary_tag_id)
    VALUES (v_item_res, v_dietary_vegan);

  INSERT INTO object_description (object_id, org_object_id, description, visibility)
    VALUES (v_desc, NULL, 'Specialite locale a base de palmiste cuisine maison.', 'public');
  INSERT INTO object_description (object_id, org_object_id, description, visibility)
    VALUES (v_bebe, NULL, 'Lit bebe sur demande.', 'public');
  INSERT INTO object_description (object_id, org_object_id, description, visibility)
    VALUES (v_jacq, NULL, 'Chez Jacques et Jacqueline.', 'public');
  -- §199 — fixtures du bras phonétique. Codes dmetaphone vérifiés en base :
  --   cafe = KF · goyavier = KF (collision) · pique = PK · bebe = PP · bequ = PK
  INSERT INTO object_description (object_id, org_object_id, description, visibility)
    VALUES (v_cafe, NULL, 'Petit cafe de quartier.', 'public');
  INSERT INTO object_description (object_id, org_object_id, description, visibility)
    VALUES (v_goya, NULL, 'Confiture de goyavier maison.', 'public');
  INSERT INTO object_description (object_id, org_object_id, description, visibility)
    VALUES (v_word, NULL, 'Aire de pique nique, lit bebe sur demande.', 'public');

  INSERT INTO object_menu (id, object_id, name, is_active, visibility)
    VALUES (gen_random_uuid(), v_priv, 'Carte secrete', TRUE, 'private') RETURNING id INTO v_menu_priv;
  INSERT INTO object_menu_item (menu_id, name) VALUES (v_menu_priv, 'Bredes mafane maison');

  -- ---------- GLOBAL mode: child content surfaces ----------
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'jacuzzi') f WHERE f.object_id=v_res),
         'global: amenity jacuzzi must surface the restaurant';
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'salade de palmiste') f WHERE f.object_id=v_res),
         'global: dish must surface restaurant 1';
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'salade de palmiste') f WHERE f.object_id=v_res2),
         'global: dish must surface restaurant 2';
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'vegan') f WHERE f.object_id=v_res),
         'global: vegan dietary tag must surface the restaurant';
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'palmiste') f WHERE f.object_id=v_desc),
         'global: description word must surface the object';

  -- ---------- Visibility: a private menu dish must NOT surface the object ----------
  ASSERT NOT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'mafane') f WHERE f.object_id=v_priv),
         'global: a PRIVATE menu dish must NOT surface the object';

  -- ---------- Name mode is NOT broadened (editor pickers stay name-only) ----------
  ASSERT NOT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{}'::jsonb,NULL,ARRAY['draft']::object_status[],'jacuzzi') f WHERE f.object_id=v_res),
         'name mode: must NOT match the amenity (no broadening)';
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{}'::jsonb,NULL,ARRAY['draft']::object_status[],'jacuzzi') f WHERE f.object_id=v_named),
         'name mode: a name match must still work';

  -- ---------- Ranking: a name match outranks an amenity-only match ----------
  SELECT COALESCE(MAX(f.relevance),0) INTO v_rel_named
    FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'jacuzzi') f WHERE f.object_id=v_named;
  SELECT COALESCE(MAX(f.relevance),0) INTO v_rel_res
    FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'jacuzzi') f WHERE f.object_id=v_res;
  ASSERT v_rel_named > v_rel_res,
         format('ranking: object named "...Jacuzzi..." (%s) must outrank one that merely has the amenity (%s)', v_rel_named, v_rel_res);

  -- =================================================================
  -- §197 — RECHERCHE TOLÉRANTE AUX FAUTES
  -- =================================================================

  -- ---------- Le texte brut est maintenu par les MÊMES triggers ----------
  ASSERT (SELECT search_document_text FROM object WHERE id = v_res) LIKE '%jacuzzi%',
         '§197: le trigger object_amenity doit remplir search_document_text (mot brut « jacuzzi »)';
  ASSERT (SELECT search_document_text FROM object WHERE id = v_desc) LIKE '%palmiste%',
         '§197: le trigger object_description doit remplir search_document_text';
  -- Le texte brut porte la forme RÉELLE des mots — c'est tout l'intérêt vs le tsvector,
  -- qui ne stocke que des lexèmes racinisés et ne peut donc pas nourrir les trigrammes.
  ASSERT (SELECT search_document_text FROM object WHERE id = v_priv) IS NULL
      OR (SELECT search_document_text FROM object WHERE id = v_priv) NOT LIKE '%mafane%',
         '§197: une carte PRIVÉE ne doit pas entrer dans search_document_text';

  -- ---------- Calibration figée (protège d'un changement de version de pg_trgm) ----------
  -- Ces trois valeurs SONT la décision de seuil ; si pg_trgm change, on veut le savoir ici
  -- et pas par un ticket « la recherche ne trouve plus rien ».
  ASSERT round(word_similarity('jaccusy','jacuzzi')::numeric,3) = 0.375,
         format('§197: word_similarity(jaccusy,jacuzzi) attendu 0.375, obtenu %s',
                round(word_similarity('jaccusy','jacuzzi')::numeric,3));
  ASSERT round(word_similarity('hoareu','hoareau')::numeric,3) = 0.714,
         format('§197: word_similarity(hoareu,hoareau) attendu 0.714, obtenu %s',
                round(word_similarity('hoareu','hoareau')::numeric,3));
  ASSERT round(word_similarity('bequ','bebe')::numeric,3) = 0.400,
         format('§197: word_similarity(bequ,bebe) attendu 0.400 (plancher de bruit des requêtes de 4 car.), obtenu %s',
                round(word_similarity('bequ','bebe')::numeric,3));

  -- ---------- La faute est rattrapée : par le NOM et par le CONTENU ENFANT ----------
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'jaccusy') f WHERE f.object_id=v_named),
         '§197: « jaccusy » doit retrouver l''objet NOMMÉ « Villa Jacuzzi Plus »';
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'jaccusy') f WHERE f.object_id=v_res),
         '§197: « jaccusy » doit retrouver l''objet qui PORTE l''équipement jacuzzi (cas d''acceptation)';
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'hoareu') f WHERE f.object_id=v_hoar),
         '§197: « hoareu » doit retrouver « Chez Hoareau » (flou sur le nom)';
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'philipe') f WHERE f.object_id=v_named),
         '§197: « philipe » doit retrouver l''objet de la commune « Saint-Philippe » (flou sur la commune)';
  -- « palmistte » et non « palmist » : ce dernier est réconcilié par le stemmer français
  -- (il matche EXACTEMENT), l'assertion ne prouverait alors rien du bras approximatif.
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'palmistte') f WHERE f.object_id=v_desc),
         '§197: une faute sur un mot de la PROSE publique doit rattraper la fiche';
  ASSERT NOT (to_tsvector('french', immutable_unaccent(lower('Specialite locale a base de palmiste cuisine maison.')))
              @@ plainto_tsquery('french', api.norm_search('palmistte'))),
         '§197: « palmistte » ne doit PAS matcher en plein texte — sinon l''assertion ci-dessus ne teste pas le flou';

  -- ---------- LE REPLI : le flou ne se déclenche QUE si l'exact ne trouve rien ----------
  -- « Chez Jacques et Jacqueline » score 0.375 pour « jacuzzi » — au-dessus du seuil 0.35.
  -- FALSIFIABLE, et c'est LE test qui distingue le repli d'un simple « OU » : en OU,
  -- cette fiche remonterait sur « jacuzzi » (elle le faisait, mesuré : 86 → 102 fiches
  -- sur le corpus live, les 16 ajoutées étant toutes des « Jacques »). En repli, non :
  -- « jacuzzi » trouve des correspondances exactes, donc les trigrammes ne s'arment pas.
  ASSERT round(word_similarity('jacuzzi','chez jacques et jacqueline.')::numeric,3) = 0.375,
         '§197: la fixture « Jacques » ne prouve rien si elle ne ressemble plus à « jacuzzi »';
  ASSERT NOT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'jacuzzi') f WHERE f.object_id=v_jacq),
         '§197: REPLI — « jacuzzi » trouve des exacts, le flou ne doit PAS s''armer (sinon « Jacques » remonte)';
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'jacuzzi') f WHERE f.object_id=v_res),
         '§197: REPLI — les correspondances exactes de « jacuzzi » restent évidemment là';
  -- …et symétriquement : quand l'exact ne trouve rien, le repli s'arme pour de bon.
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'jaccusy') f WHERE f.object_id=v_jacq),
         '§197: REPLI — « jaccusy » n''a aucun exact, le flou s''arme (et ramène aussi ses approximations, « Jacques » compris — bruit assumé du sauvetage)';

  -- ---------- Un exact passe TOUJOURS devant un approximatif ----------
  SELECT COALESCE(MAX(f.relevance),0) INTO v_rel_exact
    FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'jaccusy') f WHERE f.object_id=v_named;
  SELECT COALESCE(MAX(f.relevance),0) INTO v_rel_fuzzy
    FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'jaccusy') f WHERE f.object_id=v_res;
  ASSERT v_rel_exact < 1.0 AND v_rel_fuzzy < 1.0,
         format('§197: « jaccusy » n''est exact pour personne ⇒ les deux scores doivent rester sous le socle exact 2.0 (%s / %s)', v_rel_exact, v_rel_fuzzy);
  SELECT COALESCE(MAX(f.relevance),0) INTO v_rel_exact
    FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'jacuzzi') f WHERE f.object_id=v_named;
  ASSERT v_rel_exact >= 2.0,
         format('§197: un résultat EXACT doit porter le socle 2.0 (obtenu %s) — c''est ce qui garantit qu''il passe devant tout approximatif', v_rel_exact);
  ASSERT v_rel_exact > v_rel_fuzzy,
         format('§197: exact (%s) doit devancer approximatif (%s)', v_rel_exact, v_rel_fuzzy);

  -- ---------- Le flou est cantonné au mode `global` ----------
  -- FALSIFIABLE : sans la garde de mode, « jaccusy » matcherait v_named par le nom
  -- (score 0.375) et v_res par le contenu (0.375). Les sélecteurs d'objets de
  -- l'éditeur proposeraient alors la mauvaise fiche.
  ASSERT NOT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{}'::jsonb,NULL,ARRAY['draft']::object_status[],'jaccusy') f WHERE f.object_id=v_named),
         '§197: mode `name` — le flou ne doit PAS s''appliquer (sélecteurs de l''éditeur)';
  ASSERT NOT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{}'::jsonb,NULL,ARRAY['draft']::object_status[],'jaccusy') f WHERE f.object_id=v_res),
         '§197: mode `name` — le flou ne doit PAS atteindre le contenu enfant';

  -- ---------- Le seuil des requêtes COURTES (4 car.) tient ----------
  -- FALSIFIABLE : « bequ » score exactement 0.400 sur « bebe ». Abaisser le seuil des
  -- requêtes de 4 caractères à 0.35 (uniformisation naïve) ferait remonter cette fiche —
  -- et, sur le corpus live, 217 fiches sans rapport.
  SELECT search_document_text INTO v_doc_bebe FROM object WHERE id = v_bebe;
  SELECT round(word_similarity('bequ', v_doc_bebe)::numeric, 3) INTO v_ws;
  ASSERT v_ws = 0.400,
         format('§197: la fixture « bebe » doit scorer 0.400 pour « bequ » (obtenu %s) — sinon le test ci-dessous ne prouve plus rien', v_ws);
  ASSERT NOT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'bequ') f WHERE f.object_id=v_bebe),
         '§197: une requête de 4 caractères sous 0.45 ne doit rien ramener (plancher de bruit)';

  -- ---------- La visibilité tient AUSSI en approximatif ----------
  -- FALSIFIABLE : « mafanne » score 0.667 sur « mafane ». Si une carte privée entrait
  -- dans search_document_text, le flou l'exposerait.
  ASSERT round(word_similarity('mafanne','mafane')::numeric,3) = 0.667,
         '§197: la fixture de visibilité ne prouve rien si « mafanne » ne ressemble plus à « mafane »';
  ASSERT NOT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'mafanne') f WHERE f.object_id=v_priv),
         '§197: un plat de carte PRIVÉE ne doit pas remonter, même mal orthographié';

  -- ---------- Une requête sans rapport ne ramène RIEN ----------
  ASSERT NOT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'zzqtrpp')),
         '§197: une saisie fantaisiste ne doit ramener aucun objet';

  -- =================================================================
  -- §199 — BRAS PHONÉTIQUE (confirmé par trigramme)
  -- =================================================================

  ASSERT EXISTS (SELECT 1 FROM pg_extension WHERE extname='fuzzystrmatch'),
         '§199: extension fuzzystrmatch absente';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='object' AND column_name='search_document_phonetic'),
         '§199: object.search_document_phonetic absente';
  ASSERT EXISTS (SELECT 1 FROM pg_attribute
                 WHERE attrelid='internal.mv_filtered_objects'::regclass
                   AND attname='search_document_phonetic' AND NOT attisdropped),
         '§199: le MV ne porte pas search_document_phonetic (bras muet pour les anonymes)';

  -- La transformation phonétique, figée sur ses deux comportements attendus.
  ASSERT api.phonetic_document('kafe') = api.phonetic_document('cafe'),
         '§199: kafe et cafe doivent produire le MÊME code (c''est TOUT le principe)';
  ASSERT api.phonetic_document('bequ') <> api.phonetic_document('bebe'),
         '§199: bequ et bebe ne doivent PAS collider phonétiquement';

  -- LE CAS SIGNALÉ : « kafé » retrouve « café ».
  -- FALSIFIABLE en deux temps — d'abord on prouve que les trigrammes SEULS ne peuvent
  -- pas y arriver (score sous le seuil des requêtes de 4 caractères), ensuite que la
  -- fiche remonte quand même. Sans cette première assertion, le test pourrait être
  -- satisfait par le bras trigramme et ne rien prouver du phonétique.
  SELECT round(word_similarity('kafe', search_document_text)::numeric,3) INTO v_ws
    FROM object WHERE id = v_cafe;
  ASSERT v_ws < 0.45,
         format('§199: les trigrammes ne doivent PAS pouvoir attraper kafe (score %s, seuil 4 car. = 0.45)', v_ws);
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'kafé') f WHERE f.object_id=v_cafe),
         '§199: « kafé » doit retrouver la fiche qui contient « cafe » (cas signalé par le PO)';

  -- LA CONFIRMATION REJETTE LES COLLISIONS SANS PARENTÉ.
  -- « goyavier » porte le MÊME code phonétique que « cafe » (KF) mais 0.000 de
  -- similarité trigramme. Sans l'étage de confirmation, cette fiche remonterait.
  ASSERT api.phonetic_document('goyavier') = api.phonetic_document('kafe'),
         '§199: la fixture ne prouve rien si goyavier ne collide plus avec kafe';
  ASSERT NOT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'kafé') f WHERE f.object_id=v_goya),
         '§199: une collision phonétique SANS parenté de caractères doit être rejetée';

  -- LA CONFIRMATION PORTE SUR LE MOT, PAS SUR LE DOCUMENT.
  -- v_word contient « pique » (code PK, comme « bequ », mais 0.000 de trigramme) ET
  -- « bebe » (0.400 de trigramme, mais code PP). Aucun mot ne réunit les deux critères.
  -- Une confirmation portant sur le DOCUMENT ENTIER validerait pourtant la fiche —
  -- c'est la version que la mesure a écartée (bequ passait à 18 fiches).
  SELECT round(word_similarity('bequ', search_document_text)::numeric,3) INTO v_ws
    FROM object WHERE id = v_word;
  ASSERT v_ws >= 0.30 AND v_ws < 0.45,
         format('§199: la fixture ne piège plus rien — score document %s, il doit être dans [0.30, 0.45)', v_ws);
  ASSERT NOT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['draft']::object_status[],'bequ') f WHERE f.object_id=v_word),
         '§199: la confirmation doit porter sur LE mot qui a matché, pas sur un mot quelconque du document';

  -- Le bras phonétique hérite de la garde de mode (sélecteurs de l'éditeur).
  ASSERT NOT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{}'::jsonb,NULL,ARRAY['draft']::object_status[],'kafé') f WHERE f.object_id=v_cafe),
         '§199: mode  — le bras phonétique ne doit PAS s''appliquer';
  -- ---------- Chemin PUBLIÉ : le MV porte bien le texte ----------
  -- Sans cette assertion, oublier la colonne dans le MV rendrait le flou muet pour les
  -- visiteurs anonymes — le seul chemin qui compte en production — sans aucune erreur.
  REFRESH MATERIALIZED VIEW internal.mv_filtered_objects;
  ASSERT (SELECT search_document_text FROM internal.mv_filtered_objects WHERE id = v_pub) LIKE '%jacuzzi%',
         '§197: le MV doit projeter search_document_text pour les fiches publiées';
  ASSERT EXISTS(SELECT 1 FROM api.get_filtered_object_ids('{"search_mode":"global"}'::jsonb,NULL,ARRAY['published']::object_status[],'jaccusy') f WHERE f.object_id=v_pub),
         '§197: « jaccusy » doit fonctionner sur le chemin PUBLIÉ (lecture MV, use_mv = TRUE)';

  RAISE NOTICE 'test_global_search: all assertions passed (named_rel=% amenity_rel=% fuzzy_rel=%)',
    v_rel_exact, v_rel_res, v_rel_fuzzy;
END $$;

ROLLBACK;
