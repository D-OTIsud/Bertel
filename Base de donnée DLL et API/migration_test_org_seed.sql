-- migration_test_org_seed.sql
-- Le CORPUS du bac a sable : l'ORG de test, ses acteurs fictifs, et 15 fiches de
-- chacun des 18 types adressables — plus la fonction qui sait le refaire.
-- Spec : docs/superpowers/specs/2026-09-04-test-org-isolated-data-design.md
-- DEPEND de migration_test_org_isolation.sql (object.is_test, org_config.is_test_org).
--
-- STRATEGIE « hybride » (arbitrage du PO) : la COQUILLE est fabriquee — noms,
-- acteurs, adresses, telephones, e-mails — pour qu'AUCUNE donnee personnelle
-- reelle n'entre dans le corpus de test ; la PROFONDEUR est empruntee aux fiches
-- reelles du meme type — jeux d'equipements, communes et coordonnees, formes de
-- tarifs, classements. Une fiche de test ressemble donc a une vraie fiche du meme
-- type sans en porter une seule donnee personnelle.
--
-- Les types sans source vivante (PNA, ITI, VIL, ASC, RVA, et CAMP/HPA/SPU/PCU
-- quasi vides) n'ont rien a emprunter : leur profondeur est fabriquee a partir des
-- tables de reference. C'est pour eux que le bac a sable vaut le plus — ce sont
-- les types qu'on ne peut aujourd'hui exercer sur rien.
--
-- IDENTIFICATION. Les ids portent `TST` la ou les fiches reelles portent `RUN`
-- (ex. HOTTST0000000001) et object.extra->>'test_corpus' vaut 'true'. Une fiche de
-- test qui apparaitrait en production serait donc reconnaissable immediatement,
-- sans que les libelles affiches en soient pollues — ils doivent rester realistes
-- pour que le bac a sable serve a quelque chose.
--
-- IDEMPOTENT. Les tables filles ont des cles primaires de substitution : un simple
-- ON CONFLICT DO NOTHING n'y declenche RIEN et un second passage DUPLIQUERAIT
-- chaque adresse, chaque tarif, chaque periode. Le semeur purge donc les filles de
-- chaque fiche avant de les reecrire.

BEGIN;

-- ── 0. Constantes et fabriques ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION internal.test_org_id() RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$ SELECT 'ORGTST0000000001'::text $fn$;

COMMENT ON FUNCTION internal.test_org_id() IS
  'Id de l''ORG bac a sable. Source unique pour le seed, la remise a zero et les tests.';

-- Id conforme a chk_object_id_shape (3 lettres + 3 alphanum + 10 alphanum) :
-- `TST` occupe la place que `RUN` occupe sur les fiches reelles.
CREATE OR REPLACE FUNCTION internal.test_corpus_id(p_type text, p_i integer)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT upper(rpad(left(regexp_replace(p_type, '[^A-Za-z]', '', 'g'), 3), 3, 'X'))
      || 'TST' || lpad(p_i::text, 10, '0');
$fn$;

-- Un nom credible par type. Volontairement realiste : un corpus intitule
-- « Objet 12 » ne permet d'evaluer ni une recherche, ni un tri, ni une mise en page.
CREATE OR REPLACE FUNCTION internal.test_corpus_name(p_type text, p_i integer)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $fn$
DECLARE
  v_lieu text[] := ARRAY[
    'des Trois-Bassins','du Piton Rouge','de Grand Anse','de la Ravine Blanche',
    'des Makes','de Bois-Court','du Cap Noir','de l''Etang-Sale','de Bras-Panon',
    'de la Plaine des Palmistes','du Tampon','de Saint-Leu','des Avirons',
    'de Cilaos','de Salazie'];
  v_pref text;
  v_n    integer := array_length(v_lieu, 1);
BEGIN
  v_pref := CASE p_type
    WHEN 'HOT'  THEN 'Hotel'            WHEN 'HLO'  THEN 'Gite'
    WHEN 'CAMP' THEN 'Camping'          WHEN 'HPA'  THEN 'Village vacances'
    WHEN 'RES'  THEN 'Restaurant'       WHEN 'ACT'  THEN 'Activite'
    WHEN 'LOI'  THEN 'Parc'             WHEN 'ITI'  THEN 'Sentier'
    WHEN 'FMA'  THEN 'Fete'             WHEN 'PCU'  THEN 'Musee'
    WHEN 'PNA'  THEN 'Site naturel'     WHEN 'VIL'  THEN 'Village'
    WHEN 'COM'  THEN 'Commerce'         WHEN 'PSV'  THEN 'Service'
    WHEN 'PRD'  THEN 'Producteur'       WHEN 'ASC'  THEN 'Association'
    WHEN 'RVA'  THEN 'Salle'            WHEN 'SPU'  THEN 'Service public'
    WHEN 'ORG'  THEN 'Office'
    ELSE 'Etablissement'
  END;
  RETURN v_pref || ' ' || v_lieu[1 + ((p_i - 1) % v_n)]
       || CASE WHEN p_i > v_n THEN ' ' || ((p_i - 1) / v_n + 1)::text ELSE '' END;
END;
$fn$;

-- Noms d'acteurs FICTIFS. Jamais tires du corpus reel : c'est la ligne rouge de
-- l'arbitrage hybride — on emprunte des structures, jamais des personnes.
--
-- Les deux indices derivent d'un HACHAGE de (type, rang) et non d'une arithmetique
-- sur `length(p_type)` : tous les codes de type font 3 ou 4 caracteres, donc la
-- longueur ne prend que DEUX valeurs et ne produisait que 30 noms distincts pour
-- 270 fiches — un annuaire de test ou chaque personne detient neuf etablissements
-- ne permet d'exercer ni le CRM, ni la recherche d'acteurs, ni les regroupements.
CREATE OR REPLACE FUNCTION internal.test_actor_name(p_type text, p_i integer)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $fn$
  WITH h AS (SELECT md5(p_type || ':' || p_i::text) AS d),
  n AS (
    SELECT ('x' || substr(d, 1, 8))::bit(32)::bigint AS a,
           ('x' || substr(d, 9, 8))::bit(32)::bigint AS b
    FROM h
  )
  SELECT (ARRAY['Alizee','Bastien','Celine','Damien','Elodie','Fabrice','Gaelle',
                'Herve','Ines','Julien','Karine','Ludovic','Maeva','Nicolas','Ophelie',
                'Priscille','Quentin','Rachel','Sylvain','Tiphaine'])
           [1 + (abs(n.a) % 20)]
      || ' ' ||
         (ARRAY['Bellevue','Cadet','Dijoux','Fontaine','Grondin','Hoarau','Ivoula',
                'Lebon','Maillot','Nativel','Payet','Riviere','Sautron','Turpin','Vienne',
                'Ah-Nieme','Boyer','Clain','Elisabeth','Technau'])
           [1 + (abs(n.b) % 20)]
  FROM n;
$fn$;

-- ── 1. Le semeur ────────────────────────────────────────────────────────────────

-- Chaque fiche est rattachee a l'ORG de test comme ORG PRIMAIRE : c'est CE lien
-- qui, via le trigger de migration_test_org_isolation.sql, la marque is_test. On
-- ne pose JAMAIS is_test a la main — l'organisation est la source de verite, et un
-- seed qui l'ecrirait directement pourrait diverger d'elle sans qu'on le voie.
CREATE OR REPLACE FUNCTION internal.seed_test_corpus(p_per_type integer DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public, internal, api, extensions
AS $fn$
DECLARE
  v_org        text := internal.test_org_id();
  v_type       text;
  v_types      text[] := ARRAY(SELECT unnest(enum_range(NULL::object_type))::text ORDER BY 1);
  v_i          integer;
  v_id         text;
  v_org_role   uuid;
  v_actor_role uuid;
  v_kind_phone uuid;
  v_kind_mail  uuid;
  v_kind_web   uuid;
  v_actor      uuid;
  v_name       text;
  v_src        text;     -- fiche reelle du meme type dont on emprunte la forme
  v_loc        record;   -- localisation empruntee (commune + coordonnees)
  v_created    integer := 0;
  v_actors     integer := 0;
BEGIN
  SELECT id INTO v_org_role FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_org_role IS NULL THEN
    SELECT id INTO v_org_role FROM ref_org_role ORDER BY code LIMIT 1;
  END IF;
  SELECT id INTO v_actor_role FROM ref_actor_role ORDER BY code LIMIT 1;
  SELECT id INTO v_kind_phone FROM ref_code_contact_kind WHERE code = 'phone'   LIMIT 1;
  SELECT id INTO v_kind_mail  FROM ref_code_contact_kind WHERE code = 'email'   LIMIT 1;
  SELECT id INTO v_kind_web   FROM ref_code_contact_kind WHERE code = 'website' LIMIT 1;

  IF v_org_role IS NULL OR v_actor_role IS NULL OR v_kind_mail IS NULL THEN
    RAISE EXCEPTION 'seed: referentiels absents (ref_org_role / ref_actor_role / ref_code_contact_kind)';
  END IF;

  FOREACH v_type IN ARRAY v_types LOOP
    -- L'ORG de test est creee a part (elle porte sa propre org_config) : on ne
    -- fabrique pas 15 ORG supplementaires, qui apparaitraient comme des
    -- organisations reelles dans le selecteur d'equipe.
    CONTINUE WHEN v_type = 'ORG';

    -- La fiche reelle du meme type dont on empruntera la PROFONDEUR : la mieux
    -- garnie, pour que le modele copie soit representatif et pas squelettique.
    -- NULL pour les types absents du corpus — la fabrication generique prend alors
    -- le relais.
    SELECT o.id INTO v_src
    FROM object o
    WHERE o.object_type::text = v_type AND NOT o.is_test AND o.status = 'published'
    ORDER BY (SELECT count(*) FROM object_amenity a WHERE a.object_id = o.id) DESC, o.id
    LIMIT 1;

    FOR v_i IN 1..p_per_type LOOP
      v_id   := internal.test_corpus_id(v_type, v_i);
      v_name := internal.test_corpus_name(v_type, v_i);

      INSERT INTO object (id, object_type, name, status, region_code, extra)
      VALUES (v_id, v_type::object_type, v_name, 'published', 'RUN',
              jsonb_build_object('test_corpus', true, 'seeded_at', now()))
      ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, status = EXCLUDED.status, extra = EXCLUDED.extra;

      -- Le lien d'ORG PRIMAIRE : c'est lui qui marque la fiche is_test.
      INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary)
      VALUES (v_id, v_org, v_org_role, TRUE)
      ON CONFLICT (object_id, org_object_id, role_id) DO UPDATE SET is_primary = TRUE;

      -- Purge des filles a cles de substitution AVANT reecriture : sans elle, un
      -- second passage dupliquerait adresses, tarifs et periodes en silence.
      DELETE FROM object_location       WHERE object_id = v_id;
      DELETE FROM object_description    WHERE object_id = v_id;
      DELETE FROM opening_period        WHERE object_id = v_id;
      DELETE FROM object_price          WHERE object_id = v_id;
      DELETE FROM object_classification WHERE object_id = v_id;
      -- Le role d'acteur aussi : `uq_actor_object_role_primary` est un index
      -- unique PARTIEL sur (object_id, role_id) WHERE is_primary — un ON CONFLICT
      -- sur la cle primaire (acteur, objet, role) ne le couvre PAS. Si le nom
      -- fabrique change, un NOUVEL acteur arrive sur une fiche qui a deja son
      -- acteur principal, et l'insertion casse au lieu de ne rien faire.
      DELETE FROM actor_object_role     WHERE object_id = v_id;

      -- Localisation empruntee a une fiche reelle (commune, code postal,
      -- coordonnees), puis DISPERSEE : les points ne se superposent pas sur la
      -- carte et les recherches par rayon ont de quoi discriminer. La rue, elle,
      -- est fabriquee — une adresse reelle est une donnee d'etablissement.
      SELECT ol.city, ol.postcode, ol.code_insee, ol.latitude, ol.longitude
        INTO v_loc
      FROM object_location ol
      JOIN object o2 ON o2.id = ol.object_id AND NOT o2.is_test
      WHERE ol.latitude IS NOT NULL AND ol.longitude IS NOT NULL
      ORDER BY md5(v_id || ol.id::text)
      LIMIT 1;

      INSERT INTO object_location (object_id, address1, postcode, city, code_insee,
                                   latitude, longitude, is_main_location, position)
      VALUES (v_id,
              (10 + (v_i * 7) % 90)::text || ' rue de la Republique',
              COALESCE(v_loc.postcode, '97400'),
              COALESCE(v_loc.city, 'Saint-Denis'),
              v_loc.code_insee,
              COALESCE(v_loc.latitude,  -20.88) + (((v_i % 10) - 5) * 0.004),
              COALESCE(v_loc.longitude,  55.45) + (((v_i % 7)  - 3) * 0.004),
              TRUE, 1);

      INSERT INTO object_description (object_id, description, description_chapo,
                                      visibility, position)
      VALUES (v_id,
              'Fiche de demonstration du bac a sable. ' || v_name ||
              ' accueille ses visiteurs toute l''annee. Cette fiche sert a exercer ' ||
              'l''editeur, la recherche, les filtres et les exports sans toucher au ' ||
              'corpus reel.',
              'Fiche de demonstration — corpus de test.',
              'public', 1);

      -- Coordonnees FICTIVES et NON ROUTABLES : la plage 0269 39 xx xx est reservee
      -- aux fictions (ARCEP) et le domaine .test ne resout pas. Aucun appel ni
      -- courriel declenche depuis le bac a sable ne peut atteindre une personne.
      IF v_kind_phone IS NOT NULL THEN
        INSERT INTO contact_channel (object_id, kind_id, value, is_public, is_primary, position)
        VALUES (v_id, v_kind_phone,
                '0269 39 ' || lpad(((v_i * 37) % 100)::text, 2, '0')
                          || ' ' || lpad(((v_i * 11) % 100)::text, 2, '0'),
                TRUE, TRUE, 1)
        ON CONFLICT (object_id, kind_id, value) DO NOTHING;
      END IF;
      INSERT INTO contact_channel (object_id, kind_id, value, is_public, is_primary, position)
      VALUES (v_id, v_kind_mail,
              'contact-' || lower(v_type) || lpad(v_i::text, 2, '0') || '@example.test',
              TRUE, FALSE, 2)
      ON CONFLICT (object_id, kind_id, value) DO NOTHING;
      IF v_kind_web IS NOT NULL THEN
        INSERT INTO contact_channel (object_id, kind_id, value, is_public, is_primary, position)
        VALUES (v_id, v_kind_web,
                'https://example.test/' || lower(v_type) || '/' || lpad(v_i::text, 2, '0'),
                TRUE, FALSE, 3)
        ON CONFLICT (object_id, kind_id, value) DO NOTHING;
      END IF;

      -- Acteur FICTIF + son role sur la fiche.
      SELECT a.id INTO v_actor FROM actor a
       WHERE a.display_name = internal.test_actor_name(v_type, v_i)
         AND a.extra->>'test_corpus' = 'true'
       LIMIT 1;
      IF v_actor IS NULL THEN
        INSERT INTO actor (display_name, first_name, last_name, extra)
        VALUES (internal.test_actor_name(v_type, v_i),
                split_part(internal.test_actor_name(v_type, v_i), ' ', 1),
                split_part(internal.test_actor_name(v_type, v_i), ' ', 2),
                jsonb_build_object('test_corpus', true))
        RETURNING id INTO v_actor;
        v_actors := v_actors + 1;
      END IF;

      INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility)
      VALUES (v_actor, v_id, v_actor_role, TRUE, 'public')
      ON CONFLICT (actor_id, object_id, role_id) DO NOTHING;

      -- ── La PROFONDEUR, empruntee a la fiche reelle du meme type ──
      IF v_src IS NOT NULL THEN
        -- Equipements : le meme JEU que la source (une structure, pas un contenu).
        INSERT INTO object_amenity (object_id, amenity_id)
        SELECT v_id, a.amenity_id FROM object_amenity a WHERE a.object_id = v_src
        ON CONFLICT (object_id, amenity_id) DO NOTHING;

        -- Tarifs : on reprend la FORME (nature, unite, saison) et on fabrique le
        -- MONTANT. Copier un tarif reel deposerait une donnee commerciale reelle
        -- dans un corpus de demonstration.
        INSERT INTO object_price (object_id, kind_id, unit_id, amount, currency, season_code)
        SELECT v_id, p.kind_id, p.unit_id,
               round((12 + ((v_i * 17) % 140))::numeric, 2), 'EUR', p.season_code
        FROM object_price p WHERE p.object_id = v_src;

        -- Classements : meme schema, meme valeur — ce sont des referentiels
        -- publics (etoiles, epis, labels), pas des donnees d'etablissement.
        INSERT INTO object_classification (object_id, scheme_id, value_id, status, awarded_at)
        SELECT v_id, c.scheme_id, c.value_id, c.status, c.awarded_at
        FROM object_classification c WHERE c.object_id = v_src;
      END IF;

      -- Repli d'equipements. La condition porte sur le RESULTAT (la fiche a-t-elle
      -- des equipements ?) et non sur l'existence d'une source : SPU avait bien une
      -- fiche source, mais elle-meme sans aucun equipement — le repli branche sur
      -- `v_src IS NULL` ne se declenchait donc pas et 15 fiches restaient nues,
      -- sans que rien ne le signale. Mesurer l'effet, pas la cause presumee.
      IF NOT EXISTS (SELECT 1 FROM object_amenity a WHERE a.object_id = v_id) THEN
        INSERT INTO object_amenity (object_id, amenity_id)
        SELECT v_id, a.id FROM ref_amenity a
        ORDER BY md5(v_id || a.id::text) LIMIT 6
        ON CONFLICT (object_id, amenity_id) DO NOTHING;
      END IF;

      -- La profondeur PAR TYPE (migration_test_org_facets.sql, appliquee AVANT
      -- celle-ci). Appelee ICI, dans le semeur, et non par une passe separee :
      -- rpc_reset_test_data() repasse par seed_test_corpus, donc toute facette
      -- semee ailleurs disparaitrait au premier « Reinitialiser » sans revenir.
      -- Le corpus doit etre complet PAR CONSTRUCTION, pas par rattrapage.
      PERFORM internal.seed_test_facets(v_id, v_type, v_i, v_src);

      -- Un tarif de repli pour les types marchands dont la source n'en portait
      -- aucun. Sans lui, un seul type du corpus de test avait des prix : les
      -- filtres tarifaires, le tri par prix et cached_min_price restaient muets
      -- sur 17 types sur 18 — soit exactement ce qu'on venait creer le bac a
      -- sable pour pouvoir exercer.
      IF NOT EXISTS (SELECT 1 FROM object_price p WHERE p.object_id = v_id)
         AND v_type IN ('HOT','HLO','CAMP','HPA','RES','ACT','LOI','PCU','PRD','COM','PSV','RVA','FMA')
      THEN
        INSERT INTO object_price (object_id, kind_id, unit_id, amount, currency)
        SELECT v_id,
               (SELECT id FROM ref_code_price_kind ORDER BY md5(v_id || id::text) LIMIT 1),
               (SELECT id FROM ref_code_price_unit ORDER BY md5(v_id || id::text) LIMIT 1),
               round((12 + ((v_i * 17) % 140))::numeric, 2), 'EUR'
        WHERE EXISTS (SELECT 1 FROM ref_code_price_kind);
      END IF;

      -- Ouverture toute l'annee : sans periode, les filtres « ouvert a … » et le
      -- calcul d'ouverture n'ont rien a evaluer et la fiche parait morte.
      INSERT INTO opening_period (object_id, name, date_start, date_end, all_years)
      VALUES (v_id, 'Toute l''annee',
              date_trunc('year', now())::date,
              (date_trunc('year', now()) + interval '1 year - 1 day')::date,
              TRUE);

      v_created := v_created + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('objects', v_created, 'actors_created', v_actors,
                            'org', v_org, 'per_type', p_per_type);
END;
$fn$;

COMMIT;

-- ── 2. Bootstrap : l'ORG de test, sa configuration, son corpus ──────────────────

BEGIN;

INSERT INTO object (id, object_type, name, status, region_code, extra)
VALUES (internal.test_org_id(), 'ORG', 'Bac a sable (organisation de test)',
        'published', 'RUN', jsonb_build_object('test_corpus', true))
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, extra = EXCLUDED.extra;

-- is_test_org = TRUE : le trigger de migration_test_org_isolation.sql marque
-- l'ORG elle-meme, puis chaque fiche qui viendra s'y rattacher.
-- access_scope = 'own_objects_only' par coherence, meme si ce n'est plus lui qui
-- fait respecter le cloisonnement (cf. l'en-tete de la migration 18a).
INSERT INTO org_config (org_object_id, access_scope, is_test_org)
VALUES (internal.test_org_id(), 'own_objects_only', TRUE)
ON CONFLICT (org_object_id) DO UPDATE
  SET is_test_org = TRUE, access_scope = 'own_objects_only';

SELECT internal.seed_test_corpus(15);

COMMIT;

-- ── 3. La remise a zero ─────────────────────────────────────────────────────────

BEGIN;

-- Vide et resseme le corpus de test. DEUX gardes, qui ne se remplacent pas :
--   * superuser plateforme — QUI a le droit de declencher ;
--   * is_test_org = TRUE sur l'ORG visee — SUR QUOI la purge peut porter.
-- La seconde est celle qui compte. La fonction ne prend d'ailleurs AUCUN argument :
-- la cible est constante, on ne peut pas la pointer sur une ORG de production.
CREATE OR REPLACE FUNCTION api.rpc_reset_test_data()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, extensions, auth, pg_temp
AS $fn$
DECLARE
  v_org     text := internal.test_org_id();
  v_is_test boolean;
  v_deleted integer := 0;
  v_seed    jsonb;
BEGIN
  -- fail-closed : is_platform_superuser() renvoie NULL hors contexte auth
  -- (service_role/CI) ; un `IF NOT ...` ne declencherait PAS la garde (fail-open).
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN: platform superuser required to reset test data'
      USING ERRCODE = '42501';
  END IF;

  SELECT oc.is_test_org INTO v_is_test FROM org_config oc WHERE oc.org_object_id = v_org;
  IF v_is_test IS NOT TRUE THEN
    RAISE EXCEPTION 'REFUS: % n''est pas une organisation de test (is_test_org). Aucune suppression.', v_org
      USING ERRCODE = '42501';
  END IF;

  -- On ne supprime QUE des fiches marquees is_test, et jamais l'ORG elle-meme.
  -- Le predicat porte sur is_test et NON sur le prefixe d'id : une fiche creee a
  -- la main dans le bac a sable doit disparaitre aussi, et une fiche de production
  -- ne doit pas disparaitre parce qu'elle porterait un id malheureux.
  WITH suppr AS (
    DELETE FROM object o WHERE o.is_test AND o.id <> v_org RETURNING o.id
  )
  SELECT count(*) INTO v_deleted FROM suppr;

  -- Les acteurs n'ont pas de perimetre d'organisation : ils sont reconnus par leur
  -- marqueur, et seulement par lui. On ne supprime que ceux devenus orphelins.
  DELETE FROM actor a
   WHERE a.extra->>'test_corpus' = 'true'
     AND NOT EXISTS (SELECT 1 FROM actor_object_role r WHERE r.actor_id = a.id);

  v_seed := internal.seed_test_corpus(15);

  RETURN jsonb_build_object('deleted', v_deleted, 'reseeded', v_seed);
END;
$fn$;

REVOKE ALL     ON FUNCTION api.rpc_reset_test_data() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION api.rpc_reset_test_data() TO authenticated, service_role;

COMMENT ON FUNCTION api.rpc_reset_test_data() IS
  'Vide et resseme le corpus du bac a sable. Superuser plateforme uniquement, et refuse de s''executer si l''ORG cible n''est pas is_test_org. Sans argument : la cible est constante et ne peut pas etre pointee sur une organisation de production.';

COMMIT;

-- La matview de l'Explorer exclut le corpus de test : elle n'a rien a y prendre,
-- mais on la rafraichit pour que le seed ne laisse pas un instantane decale.
REFRESH MATERIALIZED VIEW internal.mv_filtered_objects;
