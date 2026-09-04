-- test_test_org_seed.sql
-- Garde permanente du CORPUS du bac a sable (migration_test_org_seed.sql).
--
-- Le cloisonnement est prouve ailleurs (test_test_org_isolation.sql). Ici on
-- prouve que le corpus EXISTE, qu'il est COMPLET, qu'il est UTILISABLE, et qu'il
-- ne contient aucune donnee personnelle reelle :
--   A. L'ORG de test existe et est marquee is_test_org.
--   B. 15 fiches par type adressable, et TOUS les types y sont — un corpus qui
--      couvre 13 types sur 19 laisserait sans banc d'essai exactement les types
--      rares, ceux qu'on ne peut deja exercer sur rien en production.
--   C. Chaque fiche est marquee is_test PAR SON LIEN D'ORG, jamais a la main.
--   D. La profondeur est la : localisation, description, contacts, ouverture,
--      equipements. Une fiche sans localisation ni ouverture ne permet d'exercer
--      ni la carte, ni les filtres, ni le calcul d'ouverture.
--   E. Des acteurs FICTIFS, en nombre. Un annuaire de 30 personnes pour 270
--      fiches ne permet d'exercer ni le CRM ni la recherche d'acteurs.
--   F. AUCUNE COORDONNEE ROUTABLE. C'est la garde qui compte le plus : un corpus
--      de demonstration qui porterait de vrais telephones ou de vrais courriels
--      transformerait le premier envoi groupe de test en incident reel.
--   G. Le corpus reste HORS du flux partenaire, mesure sur le corpus vivant et
--      pas sur un temoin fabrique.
--   H. La remise a zero fait un aller-retour IDENTIQUE, et ses deux gardes
--      refusent effectivement — dont celle qui compte : une ORG non marquee de
--      test ne peut pas etre purgee. Une fonction qui SUPPRIME merite qu'on
--      prouve ses refus, pas seulement son succes.
--
-- Les blocs A a G ne LISENT que le corpus reel tel que le seed l'a laisse — le
-- test echoue donc si le seed n'a pas tourne. Le bloc H ecrit, mais tout est
-- annule par le ROLLBACK final comme dans le reste de la suite.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_org      text := internal.test_org_id();
  v_types    integer;
  v_expected integer;
  v_n        integer;
  v_bad      text;
BEGIN
  -- ────────── A. L'organisation ──────────
  ASSERT EXISTS (SELECT 1 FROM object WHERE id = v_org AND object_type = 'ORG'),
         'A: l ORG de test est absente — le seed n a pas tourne';
  ASSERT (SELECT is_test_org FROM org_config WHERE org_object_id = v_org) IS TRUE,
         'A: l ORG de test n est pas marquee is_test_org';
  ASSERT (SELECT is_test FROM object WHERE id = v_org) IS TRUE,
         'A: l ORG de test n est pas elle-meme dans le realm de test';

  -- ────────── B. Couverture : 15 fiches par type, tous les types ──────────
  -- ORG exclu : le seed n en fabrique pas 15 de plus, elles apparaitraient comme
  -- des organisations reelles dans le selecteur d equipe.
  v_expected := (SELECT count(*) FROM unnest(enum_range(NULL::object_type)) t
                  WHERE t::text <> 'ORG');

  SELECT count(*) INTO v_types
  FROM (SELECT object_type FROM object WHERE is_test AND object_type <> 'ORG'
        GROUP BY object_type HAVING count(*) >= 15) s;

  ASSERT v_types = v_expected,
         format('B: %s types couverts a 15 fiches sur %s attendus', v_types, v_expected);

  SELECT string_agg(t::text, ', ') INTO v_bad
  FROM unnest(enum_range(NULL::object_type)) t
  WHERE t::text <> 'ORG'
    AND NOT EXISTS (SELECT 1 FROM object o WHERE o.is_test AND o.object_type = t);
  ASSERT v_bad IS NULL, format('B: types sans aucune fiche de test : %s', v_bad);

  -- ────────── C. Le marquage vient du LIEN D'ORG ──────────
  SELECT count(*) INTO v_n
  FROM object o
  WHERE o.is_test AND o.id <> v_org
    AND NOT EXISTS (
      SELECT 1 FROM object_org_link l
      WHERE l.object_id = o.id AND l.org_object_id = v_org AND l.is_primary);
  ASSERT v_n = 0,
         format('C: %s fiches marquees is_test SANS lien d ORG primaire vers le bac a sable — is_test a ete pose a la main quelque part', v_n);

  -- ────────── D. La profondeur ──────────
  SELECT count(*) INTO v_n FROM object o
   WHERE o.is_test AND o.id <> v_org
     AND NOT EXISTS (SELECT 1 FROM object_location l WHERE l.object_id = o.id);
  ASSERT v_n = 0, format('D: %s fiches de test sans localisation (carte et rayons inexploitables)', v_n);

  SELECT count(*) INTO v_n FROM object o
   WHERE o.is_test AND o.id <> v_org
     AND NOT EXISTS (SELECT 1 FROM object_description d WHERE d.object_id = o.id);
  ASSERT v_n = 0, format('D: %s fiches de test sans description', v_n);

  SELECT count(*) INTO v_n FROM object o
   WHERE o.is_test AND o.id <> v_org
     AND NOT EXISTS (SELECT 1 FROM opening_period p WHERE p.object_id = o.id);
  ASSERT v_n = 0, format('D: %s fiches de test sans periode d ouverture (filtres « ouvert a … » muets)', v_n);

  SELECT count(*) INTO v_n FROM object o
   WHERE o.is_test AND o.id <> v_org
     AND NOT EXISTS (SELECT 1 FROM contact_channel c WHERE c.object_id = o.id);
  ASSERT v_n = 0, format('D: %s fiches de test sans aucun canal de contact', v_n);

  SELECT count(*) INTO v_n FROM object o
   WHERE o.is_test AND o.id <> v_org
     AND NOT EXISTS (SELECT 1 FROM object_amenity a WHERE a.object_id = o.id);
  ASSERT v_n = 0, format('D: %s fiches de test sans equipement (filtres a facettes sans matiere)', v_n);

  -- ────────── E. Des acteurs fictifs, en nombre ──────────
  SELECT count(DISTINCT r.actor_id) INTO v_n
  FROM actor_object_role r JOIN object o ON o.id = r.object_id WHERE o.is_test;
  ASSERT v_n >= 100,
         format('E: seulement %s acteurs distincts sur le corpus de test — annuaire trop pauvre pour exercer le CRM', v_n);

  -- Tout acteur lie a une fiche de test DOIT etre fictif. Un acteur reel rattache
  -- au bac a sable serait une donnee personnelle reelle versee dans un corpus de
  -- demonstration — et deviendrait visible des comptes de test.
  SELECT count(*) INTO v_n
  FROM actor a
  WHERE COALESCE(a.extra->>'test_corpus', '') <> 'true'
    AND EXISTS (SELECT 1 FROM actor_object_role r JOIN object o ON o.id = r.object_id
                 WHERE r.actor_id = a.id AND o.is_test);
  ASSERT v_n = 0,
         format('E: %s acteurs REELS rattaches a des fiches de test', v_n);

  -- ────────── F. Aucune coordonnee routable ──────────
  -- Plage ARCEP reservee aux fictions pour le telephone, domaine .test (RFC 2606)
  -- pour le courriel et le web : rien de ce que declenchera un essai ne peut
  -- atteindre une personne reelle.
  SELECT count(*) INTO v_n
  FROM contact_channel c
  JOIN object o ON o.id = c.object_id
  JOIN ref_code_contact_kind k ON k.id = c.kind_id
  WHERE o.is_test
    AND ((k.code = 'email'   AND c.value NOT LIKE '%@example.test')
      OR (k.code = 'website' AND c.value NOT LIKE 'https://example.test/%')
      OR (k.code = 'phone'   AND c.value NOT LIKE '0269 39 %'));
  ASSERT v_n = 0,
         format('F: %s coordonnees POTENTIELLEMENT ROUTABLES sur le corpus de test — un envoi groupe de test deviendrait un incident reel', v_n);

  -- ────────── G. Hors du flux partenaire (corpus vivant) ──────────
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  SET LOCAL ROLE service_role;
    SELECT count(*) INTO v_n
    FROM api.get_filtered_object_ids('{}'::jsonb, NULL,
                                     ARRAY['published','draft']::object_status[], NULL) f
    JOIN object o ON o.id = f.object_id
    WHERE o.is_test;
    ASSERT v_n = 0,
           format('G: FUITE PARTENAIRE — %s fiches du corpus de test sont servies a service_role', v_n);

    ASSERT NOT EXISTS (
      SELECT 1 FROM api.current_user_readable_object_ids() s
      JOIN object o ON o.id = s WHERE o.is_test),
      'G: FUITE PARTENAIRE — le corpus de test est dans current_user_readable_object_ids';

    -- Temoin de non-vacuite : le corpus REEL, lui, doit bien etre servi. Sans
    -- lui, les deux assertions ci-dessus seraient vertes sur une base ou l API
    -- partenaire ne sert simplement RIEN, et ne prouveraient aucun cloisonnement.
    --
    -- Conditionne a l existence d un corpus de production : ci_fresh_apply.sql
    -- monte le schema et les REFERENTIELS, pas de corpus d objets. Exiger le
    -- temoin inconditionnellement rendrait la garde rouge sur base fraiche — pour
    -- une absence de donnees, pas pour une fuite. On exige alors la seule chose
    -- qui ait un sens la-bas : que le corpus de test, lui, existe bien.
    IF EXISTS (SELECT 1 FROM object WHERE NOT is_test AND status = 'published') THEN
      SELECT count(*) INTO v_n
      FROM api.get_filtered_object_ids('{}'::jsonb, NULL,
                                       ARRAY['published','draft']::object_status[], NULL) f
      JOIN object o ON o.id = f.object_id
      WHERE NOT o.is_test;
      ASSERT v_n > 0,
             'G: TEST VACANT — un corpus de production existe mais l API partenaire n en sert AUCUNE fiche ; le zero ci-dessus ne prouve rien';
    ELSE
      ASSERT EXISTS (SELECT 1 FROM object WHERE is_test),
             'G: TEST VACANT — ni corpus de production, ni corpus de test : rien n a ete mesure';
      RAISE NOTICE 'G: base sans corpus de production (fresh apply) — temoin de non-vacuite adapte';
    END IF;
  RESET ROLE;

  -- ────────── H. La remise a zero ──────────
  DECLARE
    v_su     uuid := '00000000-0000-4000-a000-0000000000f4'::uuid;
    v_plain  uuid := '00000000-0000-4000-a000-0000000000f5'::uuid;
    v_before integer;
    v_after  integer;
    v_denied boolean;
    v_res    jsonb;
  BEGIN
    INSERT INTO auth.users (id, email)
    VALUES (v_su, 'seed_reset_su@test.local'), (v_plain, 'seed_reset_plain@test.local')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO app_user_profile (id, role)
    VALUES (v_su, 'super_admin'), (v_plain, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

    SELECT count(*) INTO v_before FROM object WHERE is_test;

    -- H1. Un compte ordinaire ne purge rien.
    v_denied := false;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_plain, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
      BEGIN PERFORM api.rpc_reset_test_data();
      EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    RESET ROLE;
    ASSERT v_denied, 'H: GARDE MUETTE — un compte ordinaire a pu reinitialiser le corpus';

    -- H2. Le superuser passe, et le corpus revient A L IDENTIQUE. Une remise a
    -- zero qui laisse moins de fiches qu elle n en trouve casse le bac a sable
    -- au lieu de le restaurer — et ne se verrait qu au prochain essai.
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_su, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
      v_res := api.rpc_reset_test_data();
    RESET ROLE;
    SELECT count(*) INTO v_after FROM object WHERE is_test;
    ASSERT v_after = v_before,
           format('H: la remise a zero n est pas un aller-retour : %s fiches avant, %s apres', v_before, v_after);
    ASSERT (v_res->'reseeded'->>'objects')::integer > 0,
           'H: la remise a zero n a rien reseme';

    -- H3. LA garde qui compte : sans le marqueur is_test_org, aucune purge.
    -- C est elle qui separe « je vide le bac a sable » de « je vide une ORG ».
    UPDATE org_config SET is_test_org = FALSE WHERE org_object_id = v_org;
    v_denied := false;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_su, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
      BEGIN PERFORM api.rpc_reset_test_data();
      EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
    RESET ROLE;
    ASSERT v_denied,
           'H: GARDE MUETTE — purge acceptee sur une ORG NON marquee de test';
  END;

  RAISE NOTICE 'test_test_org_seed: OK (A org, B couverture 15/type, C marquage par lien d ORG, D profondeur, E acteurs fictifs, F rien de routable, G hors flux partenaire, H remise a zero + ses deux refus)';
END
$$;
ROLLBACK;
