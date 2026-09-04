-- migration_test_org_facets.sql
-- La PROFONDEUR PAR TYPE du corpus de test : les tables de facette.
-- A APPLIQUER AVANT migration_test_org_seed.sql (18b), qui APPELLE cette fonction
-- depuis internal.seed_test_corpus. L'ordre inverse casserait le bootstrap de 18b.
-- Spec : docs/superpowers/specs/2026-09-04-test-org-isolated-data-design.md
--
-- POURQUOI CE FICHIER EXISTE. 18b remplissait les tables COMMUNES — localisation,
-- description, contacts, acteur, ouverture, equipements, tarifs, classements — et
-- s'arretait la. Les 270 fiches n'avaient donc AUCUNE ligne de facette : pas un
-- object_iti, pas une occurrence de manifestation, pas un type de chambre, pas un
-- menu. Ce qui veut dire, tres concretement :
--
--   * un sentier sans distance, sans denivele, sans etape et sans trace — l'editeur
--     d'itineraire n'avait rien a editer ;
--   * une manifestation SANS DATE — l'agenda restait vide ;
--   * un hotel sans chambre, un restaurant sans carte.
--
-- Le corpus etait « complet » au sens du nombre de fiches et vide au sens du
-- METIER. Et la garde de 18b ne le voyait pas : elle verifiait la profondeur
-- COMMUNE, c'est-a-dire exactement ce qui avait ete construit. Une garde qui
-- n'interroge que ce qu'on a fait ne dit rien de ce qu'on a oublie — c'est le
-- meme motif que les 42 policies inlinees de 18a.
--
-- CE QUI EST EMPRUNTE, CE QUI EST FABRIQUE. Meme regle que 18b : la structure est
-- copiee d'une fiche reelle du meme type quand il en existe une, sinon elle est
-- fabriquee a partir des referentiels. Pour ITI et FMA il n'y a RIEN a emprunter
-- (0 sentier, 1 seule manifestation et elle est archivee) — et ce sont justement
-- les deux types qu'on ne peut aujourd'hui exercer sur rien.
--
-- LA CARTE DES FACETTES EST FERMEE. `ref_facet_applicability` decide quelle table
-- s'applique a quel type, et `trg_assert_facet_applicable` refuse le reste. On la
-- suit exactement ; 7 types (COM, PCU, PNA, PRD, PSV, SPU, VIL) n'ont AUCUNE
-- facette et n'en recevront pas.
--
-- Ce fichier ne contient QUE la fonction — aucune donnee. C'est le semeur de 18b
-- qui l'appelle fiche par fiche, et c'est important : rpc_reset_test_data() repasse
-- par seed_test_corpus, donc des facettes semees par une passe separee auraient
-- disparu au premier « Reinitialiser » sans jamais revenir.

-- Idempotent : les facettes sont purgees avant reecriture (cles de substitution).

BEGIN;

-- ── Le semeur de facettes ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION internal.seed_test_facets(
  p_id   text,
  p_type text,
  p_i    integer,
  p_src  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, internal, api, extensions
AS $fn$
DECLARE
  v_lat      numeric;
  v_lon      numeric;
  v_menu     uuid;
  v_start    date;
  v_k        integer;
BEGIN
  -- Point d'ancrage de la fiche : sert aux geometries (trace, etapes).
  SELECT ol.latitude, ol.longitude INTO v_lat, v_lon
  FROM object_location ol
  WHERE ol.object_id = p_id AND ol.is_main_location IS TRUE
  LIMIT 1;
  v_lat := COALESCE(v_lat, -20.88);
  v_lon := COALESCE(v_lon,  55.45);

  -- ── Purge : cles de substitution, donc ON CONFLICT ne rattraperait rien ──
  DELETE FROM object_iti_profile WHERE object_id = p_id;
  DELETE FROM object_iti_stage   WHERE object_id = p_id;
  DELETE FROM object_iti_practice WHERE object_id = p_id;
  DELETE FROM object_iti_info    WHERE object_id = p_id;
  DELETE FROM object_iti         WHERE object_id = p_id;
  DELETE FROM object_fma_occurrence WHERE object_id = p_id;
  DELETE FROM object_fma         WHERE object_id = p_id;
  DELETE FROM object_act         WHERE object_id = p_id;
  DELETE FROM object_menu_item   WHERE menu_id IN (SELECT id FROM object_menu WHERE object_id = p_id);
  DELETE FROM object_menu        WHERE object_id = p_id;
  DELETE FROM object_room_type   WHERE object_id = p_id;
  DELETE FROM object_meeting_room WHERE object_id = p_id;

  -- ══ ACT / ASC — object_act ══
  IF p_type IN ('ACT', 'ASC') THEN
    INSERT INTO object_act (object_id, duration_min, min_participants, max_participants,
                            difficulty_level, guide_required, min_age, equipment_provided)
    SELECT p_id,
           COALESCE(a.duration_min,     60 + (p_i % 6) * 30),
           COALESCE(a.min_participants, 1 + (p_i % 3)),
           COALESCE(a.max_participants, 8 + (p_i % 5) * 4),
           COALESCE(a.difficulty_level, 1 + (p_i % 5)),
           COALESCE(a.guide_required,   (p_i % 2 = 0)),
           COALESCE(a.min_age,          (ARRAY[NULL, 6, 12, 16])[1 + (p_i % 4)]),
           COALESCE(a.equipment_provided, (p_i % 3 <> 0))
    FROM (SELECT * FROM object_act WHERE object_id = p_src) a
    RIGHT JOIN (SELECT 1) dummy ON TRUE
    LIMIT 1;
  END IF;

  -- ══ FMA — la manifestation et SES DATES ══
  -- Une manifestation sans occurrence est une fiche sans date : ni agenda, ni
  -- filtre « a venir », ni tri chronologique. C'est le coeur du type.
  IF p_type = 'FMA' THEN
    v_start := (date_trunc('month', now()) + ((p_i % 10) || ' months')::interval
                                           + ((p_i % 20) || ' days')::interval)::date;
    INSERT INTO object_fma (object_id, event_start_date, event_end_date,
                            event_start_time, event_end_time, is_recurring, recurrence_pattern)
    VALUES (p_id, v_start, v_start + (p_i % 3),
            TIME '09:00' + ((p_i % 6) || ' hours')::interval,
            TIME '18:00',
            (p_i % 4 = 0),
            CASE WHEN p_i % 4 = 0 THEN 'annuel' ELSE NULL END);

    -- Trois occurrences etalees : passee, proche, lointaine. Un corpus dont tout
    -- tombe le meme jour ne permet pas d'eprouver un filtre temporel.
    FOR v_k IN 0..2 LOOP
      INSERT INTO object_fma_occurrence (object_id, start_at, end_at, state)
      VALUES (p_id,
              (v_start + (v_k * 30 - 30))::timestamptz + TIME '10:00',
              (v_start + (v_k * 30 - 30))::timestamptz + TIME '17:00',
              'scheduled');
    END LOOP;
  END IF;

  -- ══ ITI — le sentier : mesures, pratiques, etapes, trace, profil ══
  IF p_type = 'ITI' THEN
    INSERT INTO object_iti (object_id, distance_km, difficulty_level, elevation_gain,
                            elevation_loss, is_loop, duration_min, open_status, geom)
    VALUES (p_id,
            round((2 + (p_i % 18) * 1.4)::numeric, 2),
            1 + (p_i % 5),
            120 + (p_i % 12) * 95,
            110 + (p_i % 9) * 88,
            (p_i % 3 = 0),
            60 + (p_i % 8) * 45,
            -- ATTENTION : le CHECK de la colonne n'accepte que 4 des 7 codes du
            -- referentiel ref_code_iti_open_status ('not_managed', 'unknown' et
            -- 'archived' y sont REFUSES). On reste dans les 4 admis.
            (ARRAY['open','closed','partially_closed','warning'])[1 + (p_i % 4)],
            extensions.ST_SetSRID(
              extensions.ST_MakeLine(ARRAY[
                extensions.ST_MakePoint(v_lon,          v_lat),
                extensions.ST_MakePoint(v_lon + 0.010,  v_lat + 0.006),
                extensions.ST_MakePoint(v_lon + 0.018,  v_lat + 0.015),
                extensions.ST_MakePoint(v_lon + 0.027,  v_lat + 0.011)
              ]), 4326)::geography);

    -- Une a trois pratiques (pedestre, VTT, trail…).
    INSERT INTO object_iti_practice (object_id, practice_id)
    SELECT p_id, rp.id FROM ref_code_iti_practice rp
    ORDER BY md5(p_id || rp.id::text)
    LIMIT 1 + (p_i % 3)
    ON CONFLICT (object_id, practice_id) DO NOTHING;

    INSERT INTO object_iti_info (object_id, access, ambiance, recommended_parking,
                                 required_equipment, info_places, is_child_friendly)
    VALUES (p_id,
            'Acces par la route forestiere, 15 minutes depuis le centre du bourg.',
            'Foret de tamarins puis crete degagee sur le cirque.',
            'Parking du depart, une trentaine de places.',
            'Chaussures de randonnee, 2 L d''eau, coupe-vent.',
            'Point d''eau au refuge a mi-parcours.',
            (p_i % 3 = 0));

    -- Quatre etapes le long de la trace.
    FOR v_k IN 1..4 LOOP
      INSERT INTO object_iti_stage (object_id, name, description, position, geom)
      VALUES (p_id,
              (ARRAY['Depart','Point de vue','Refuge','Arrivee'])[v_k],
              (ARRAY['Depart du parking forestier.',
                     'Panorama sur le cirque et les remparts.',
                     'Refuge non garde, point d''eau.',
                     'Retour au parking.'])[v_k],
              v_k,
              extensions.ST_SetSRID(
                extensions.ST_MakePoint(v_lon + (v_k - 1) * 0.009,
                                        v_lat + (v_k - 1) * 0.005), 4326)::geography);
    END LOOP;

    -- Profil altimetrique : 6 points suffisent a dessiner une courbe.
    FOR v_k IN 0..5 LOOP
      INSERT INTO object_iti_profile (object_id, position_m, elevation_m)
      VALUES (p_id,
              (v_k * 800)::numeric,
              (450 + (p_i % 7) * 60 + CASE WHEN v_k <= 3 THEN v_k * 130 ELSE (6 - v_k) * 130 END)::numeric);
    END LOOP;
  END IF;

  -- ══ Hebergements et salles — types de chambre + salles de reunion ══
  IF p_type IN ('HOT', 'HLO', 'CAMP', 'HPA', 'RVA') THEN
    INSERT INTO object_room_type (object_id, code, name, capacity_adults, capacity_children,
                                  capacity_total, size_sqm, bed_config, total_rooms,
                                  base_price, currency, is_accessible, is_published, position,
                                  room_type_id, view_type_id)
    SELECT p_id, r.code, r.name, r.ad, r.ch, r.ad + r.ch, r.sqm, r.bed, r.nb,
           r.price, 'EUR', (r.code = 'STD'), TRUE, r.pos,
           (SELECT id FROM ref_code_room_type ORDER BY md5(p_id || r.code || id::text) LIMIT 1),
           (SELECT id FROM ref_code_view_type ORDER BY md5(p_id || r.code || id::text) LIMIT 1)
    FROM (VALUES
      ('STD', 'Chambre standard',   2, 0, 18.0, '1 lit double',            4 + (p_i % 6),  (78 + (p_i % 9) * 11)::numeric, 1),
      ('SUP', 'Chambre superieure', 2, 1, 26.0, '1 lit double + 1 simple', 2 + (p_i % 4),  (112 + (p_i % 7) * 14)::numeric, 2),
      ('FAM', 'Chambre familiale',  2, 2, 34.0, '1 lit double + 2 simples', 1 + (p_i % 3), (148 + (p_i % 5) * 18)::numeric, 3)
    ) AS r(code, name, ad, ch, sqm, bed, nb, price, pos)
    ON CONFLICT (object_id, code) DO NOTHING;
  END IF;

  IF p_type IN ('HOT', 'CAMP', 'HPA', 'RVA', 'LOI', 'HLO') THEN
    INSERT INTO object_meeting_room (object_id, name, area_m2, cap_theatre, cap_u,
                                     cap_classroom, cap_boardroom)
    SELECT p_id, s.name, s.area, s.theatre, s.u, s.classroom, s.board
    FROM (VALUES
      ('Salle Piton',   (45 + (p_i % 8) * 12)::numeric, 60 + (p_i % 5) * 20, 24, 32, 18),
      ('Salle Lagon',   (28 + (p_i % 6) * 9)::numeric,  35 + (p_i % 4) * 15, 16, 20, 12)
    ) AS s(name, area, theatre, u, classroom, board)
    WHERE p_i % 2 = 0;   -- une fiche sur deux : un corpus ou TOUT est identique
                         -- ne permet pas d'eprouver un filtre « avec salle ».
  END IF;

  -- ══ RES — la carte ══
  IF p_type = 'RES' THEN
    INSERT INTO object_menu (object_id, category_id, name, description, is_active, visibility, position)
    VALUES (p_id,
            (SELECT id FROM ref_code_menu_category ORDER BY md5(p_id || id::text) LIMIT 1),
            'Carte du midi', 'Servie du lundi au vendredi, de 11h30 a 14h.',
            TRUE, 'public', 1)
    RETURNING id INTO v_menu;

    INSERT INTO object_menu_item (menu_id, name, description, price, currency, is_available, position)
    SELECT v_menu, m.name, m.descr,
           round((m.base + (p_i % 7) * 1.5)::numeric, 2), 'EUR', TRUE, m.pos
    FROM (VALUES
      ('Rougail saucisses',   'Riz, grains, rougail piment.',            14.0, 1),
      ('Cari poulet',         'Cari traditionnel, riz et lentilles.',    13.5, 2),
      ('Salade de palmiste',  'Coeur de palmiste, vinaigrette locale.',   9.0, 3),
      ('Gateau patate',       'Dessert creole du jour.',                  5.5, 4)
    ) AS m(name, descr, base, pos);
  END IF;
END;
$fn$;

COMMENT ON FUNCTION internal.seed_test_facets(text, text, integer, text) IS
  'Profondeur PAR TYPE du corpus de test : object_iti (+etapes, pratiques, profil, trace), object_fma (+occurrences), object_act, types de chambre, salles de reunion, carte. Suit ref_facet_applicability a la lettre — 7 types n''ont aucune facette. Idempotent (purge avant reecriture).';

COMMIT;
