-- migration_test_org_isolation.sql
-- Organisation de test a donnees isolees — la DIMENSION de cloisonnement.
-- Spec : docs/superpowers/specs/2026-09-04-test-org-isolated-data-design.md
--
-- PROBLEME. `org_config.access_scope` ('own_objects_only') existe depuis §172 mais
-- NE RESTREINT RIEN : une policy distincte, `public_objects_published`, accorde
-- `status='published'` au role `public` (donc `anon` compris), et la garde des ~40
-- tables filles `api.can_read_object` est `published OR can_read_extended`. Toute
-- fiche publiee est donc lisible de tous — et part a l'API partenaire.
--
-- PRINCIPE. Un unique predicat, applique partout a l'identique :
--
--     o.is_test = (SELECT api.current_user_test_realm())
--
-- Il cloisonne dans les DEUX SENS d'un seul tenant : un compte de production ne
-- voit que le reel (realm=false), un compte de test ne voit que le test
-- (realm=true). Ecrire la garde en deux predicats separes (« ne pas sortir » /
-- « ne pas entrer ») laisserait un des deux sens s'oublier — c'est exactement ce
-- qui est arrive a access_scope, qui ne restreint rien depuis §172.
--
-- `is_test` est DENORMALISE sur object mais ENTRETENU PAR TRIGGER depuis
-- org_config.is_test_org : l'organisation reste la source de verite, la garde ne
-- lit qu'une constante par ligne. Deriver le caractere de test par jointure a
-- chaque garde placerait une jointure dans le chemin RLS le plus chaud — celui
-- deja reecrit en ensembliste pour tenir sous le statement_timeout de 8 s (§35).
--
-- CE FICHIER ne porte QUE les objets nouveaux et les gardes integralement
-- re-emettables. Les predicats situes DANS le corps de fonctions volumineuses
-- (get_object_resource 115 Ko, get_filtered_object_ids 48 Ko) sont edites a leur
-- source canonique, api_views_functions.sql — re-emettre 115 Ko dans une
-- migration serait illisible et non revuable.
--
-- Idempotent. A appliquer APRES rls_policies.sql et api_views_functions.sql.

BEGIN;

-- ── 1. La dimension ─────────────────────────────────────────────────────────────

ALTER TABLE object     ADD COLUMN IF NOT EXISTS is_test     boolean NOT NULL DEFAULT false;
ALTER TABLE org_config ADD COLUMN IF NOT EXISTS is_test_org boolean NOT NULL DEFAULT false;

-- Les tombstones partent a l'API partenaire (C-4, list_deleted_objects_since) et
-- ne portaient AUCUNE dimension de test : supprimer une fiche de test aurait fuite
-- son id et son type aux partenaires. La colonne est figee a la suppression —
-- l'objet n'existe plus, on ne peut pas la rejoindre apres coup.
ALTER TABLE object_deletion_log ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN object.is_test IS
  'Fiche du corpus de test (org_config.is_test_org). Entretenue par trigger depuis object_org_link — ne pas ecrire a la main. Exclut la fiche de l''API partenaire, de anon, et de toute ORG de production.';
COMMENT ON COLUMN org_config.is_test_org IS
  'ORG bac a sable : ses fiches sont is_test, ses membres ne voient QUE le corpus de test. Reserve au superuser plateforme.';
COMMENT ON COLUMN object_deletion_log.is_test IS
  'Realm de la fiche au moment de sa suppression. Exclut le tombstone du flux partenaire list_deleted_objects_since (C-4).';

-- Index partiel : le corpus de test est ~285 lignes sur ~1140 ; l'index ne sert que
-- le balayage « toutes les fiches de test » (seed, reset, Explorer du bac a sable).
CREATE INDEX IF NOT EXISTS idx_object_is_test ON object (id) WHERE is_test;

-- ── 2. La feuille de garde ──────────────────────────────────────────────────────

-- Realm du user courant : false = production, true = bac a sable. JAMAIS NULL —
-- c'est ce qui permet l'egalite `o.is_test = realm` comme garde a double sens.
--
-- §208/R2.1 : `pg_temp` EXPLICITEMENT EN DERNIER. Sans lui PostgreSQL cherche le
-- schema temporaire EN PREMIER pour les relations : n'importe quel `authenticated`
-- se donnerait le realm de test par un `CREATE TEMP TABLE user_org_membership`,
-- et lirait alors le corpus de test — ou, en inversant, se rendrait invisible de
-- sa propre organisation.
CREATE OR REPLACE FUNCTION api.current_user_test_realm()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM user_org_membership uom
    JOIN org_config oc ON oc.org_object_id = uom.org_object_id
    WHERE uom.user_id = auth.uid()
      AND uom.is_active = TRUE
      AND oc.is_test_org = TRUE
  );
$fn$;

REVOKE ALL     ON FUNCTION api.current_user_test_realm() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION api.current_user_test_realm() TO anon, authenticated, service_role;

COMMENT ON FUNCTION api.current_user_test_realm() IS
  'Realm de lecture du user courant : true = bac a sable, false = production (jamais NULL). service_role et anon renvoient false — l''API partenaire ne voit donc jamais le corpus de test. Garde a double sens : o.is_test = (SELECT api.current_user_test_realm()).';

-- ── 3. Le trigger : l'ORG est la source de verite ───────────────────────────────

-- Realm que la fiche DEVRAIT porter, d'apres son ORG primaire. Une fiche sans lien
-- d'ORG reste en production (false) — fail-closed du bon cote : une fiche orpheline
-- ne doit pas devenir invisible, elle doit rester visible et donc suspecte.
CREATE OR REPLACE FUNCTION api.object_expected_is_test(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, public, api
AS $fn$
  SELECT COALESCE((
    SELECT oc.is_test_org
    FROM object_org_link ool
    JOIN org_config oc ON oc.org_object_id = ool.org_object_id
    WHERE ool.object_id = p_object_id AND ool.is_primary IS TRUE
    ORDER BY ool.updated_at DESC
    LIMIT 1
  ), false);
$fn$;

CREATE OR REPLACE FUNCTION api.sync_object_is_test(p_object_id text)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, public, api
AS $fn$
  UPDATE object o
     SET is_test = api.object_expected_is_test(p_object_id)
   WHERE o.id = p_object_id
     AND o.is_test IS DISTINCT FROM api.object_expected_is_test(p_object_id);
$fn$;

CREATE OR REPLACE FUNCTION api.trg_object_org_link_is_test()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api
AS $fn$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM api.sync_object_is_test(OLD.object_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM api.sync_object_is_test(NEW.object_id);
  END IF;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_object_org_link_is_test ON object_org_link;
CREATE TRIGGER trg_object_org_link_is_test
AFTER INSERT OR DELETE OR UPDATE OF org_object_id, is_primary ON object_org_link
FOR EACH ROW EXECUTE FUNCTION api.trg_object_org_link_is_test();

-- Bascule d'une ORG entiere (is_test_org modifie) : re-synchronise ses fiches.
CREATE OR REPLACE FUNCTION api.trg_org_config_is_test()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api
AS $fn$
BEGIN
  UPDATE object o
     SET is_test = NEW.is_test_org
   WHERE o.id IN (
           SELECT ool.object_id FROM object_org_link ool
           WHERE ool.org_object_id = NEW.org_object_id AND ool.is_primary IS TRUE
         )
     AND o.is_test IS DISTINCT FROM NEW.is_test_org;
  -- L'ORG elle-meme est un objet : elle porte le realm de sa propre configuration.
  UPDATE object o SET is_test = NEW.is_test_org
   WHERE o.id = NEW.org_object_id AND o.is_test IS DISTINCT FROM NEW.is_test_org;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_org_config_is_test ON org_config;
CREATE TRIGGER trg_org_config_is_test
AFTER INSERT OR UPDATE OF is_test_org ON org_config
FOR EACH ROW EXECUTE FUNCTION api.trg_org_config_is_test();

-- Le tombstone herite du realm de la fiche AU MOMENT de sa suppression.
CREATE OR REPLACE FUNCTION api.trg_object_deletion_log_is_test()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api
AS $fn$
BEGIN
  IF NEW.is_test IS NOT TRUE THEN
    NEW.is_test := COALESCE((SELECT o.is_test FROM object o WHERE o.id = NEW.object_id), false);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_object_deletion_log_is_test ON object_deletion_log;
CREATE TRIGGER trg_object_deletion_log_is_test
BEFORE INSERT ON object_deletion_log
FOR EACH ROW EXECUTE FUNCTION api.trg_object_deletion_log_is_test();

-- ── 4. Point de passage 1 — la policy de lecture publique ───────────────────────

-- `(SELECT api.…)` et non l'appel nu : la forme scalaire est remontee en InitPlan
-- par le planner (evaluee UNE fois pour la requete), l'appel nu serait evalue par
-- ligne. C'est l'idiome deja en place ici pour auth.uid().
DROP POLICY IF EXISTS public_objects_published ON object;
CREATE POLICY public_objects_published ON object
  FOR SELECT
  USING (
    status = 'published'::object_status
    AND is_test = (SELECT api.current_user_test_realm())
  );

-- ── 5. Point de passage 2 — la garde des ~40 tables filles ──────────────────────

CREATE OR REPLACE FUNCTION api.can_read_object(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $fn$
  SELECT EXISTS (
           SELECT 1 FROM object o
           WHERE o.id = p_object_id
             AND o.status = 'published'
             AND o.is_test = (SELECT api.current_user_test_realm())
         )
      OR api.can_read_extended(p_object_id);
$fn$;

-- can_read_extended (chemins ORG/acteur) n'a PAS besoin du predicat : un membre
-- d'ORG de test n'a de lien qu'avec des fiches de test, et reciproquement. Le
-- realm y est deja porte par le graphe d'appartenance.

-- MAIS can_read_object ne couvre que 15 policies sur 58 : les 42 autres INLINENT
-- le controle `EXISTS(object o WHERE o.id = <col> AND o.status='published')` au
-- lieu de l'appeler (migration_child_read_gate_setbased.sql, §35 — l'inlining
-- etait le but : eviter un appel de fonction non inlinable par ligne). Patcher la
-- seule fonction aurait donc laisse 42 tables filles GRANDES OUVERTES — media,
-- contact_channel, descriptions, tarifs, horaires… c'est-a-dire l'essentiel de la
-- fiche. C'est exactement la panne muette que la spec redoutait.
--
-- Reecriture generique plutot que 42 policies recopiees a la main : on repart du
-- `qual` decompile de chaque policy et on n'INJECTE que le predicat de realm,
-- juste apres le controle de publication. Chaque policy garde ainsi sa propre
-- colonne de jointure et ses conditions propres (is_public, visibility,
-- is_published, dates d'adhesion…) — aucune n'est reecrite de memoire.
-- Forme verifiee sur la base live : les 42 utilisent l'alias `o` et la forme
-- canonique `(o.status = 'published'::object_status)`.
DO $do$
DECLARE
  r        record;
  v_new    text;
  v_count  integer := 0;
  v_left   integer;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, permissive, roles, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'SELECT'
      AND qual ~ '\(o\.status = ''published''::object_status\)'
      AND qual NOT LIKE '%current_user_test_realm%'
  LOOP
    v_new := regexp_replace(
      r.qual,
      '\(o\.status = ''published''::object_status\)',
      '(o.status = ''published''::object_status AND o.is_test = (SELECT api.current_user_test_realm()))',
      'g'
    );

    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR SELECT TO %s USING (%s)',
      r.policyname, r.schemaname, r.tablename,
      r.permissive,
      array_to_string(r.roles, ', '),
      v_new
    );
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'policies de lecture cloisonnees : %', v_count;

  -- Garde fail-closed. Une reecriture partielle (un `qual` d'une autre forme, une
  -- policy ajoutee entre-temps) laisserait une table fille ouverte SANS ERREUR.
  -- On refuse de valider la migration dans ce cas.
  SELECT count(*) INTO v_left
  FROM pg_policies
  WHERE schemaname = 'public' AND cmd = 'SELECT'
    AND qual ILIKE '%status = ''published''%'
    AND qual NOT LIKE '%current_user_test_realm%';

  IF v_left > 0 THEN
    RAISE EXCEPTION
      'CLOISONNEMENT INCOMPLET : % policy(ies) de lecture testent encore la publication sans predicat de realm', v_left;
  END IF;
END
$do$;

-- ── 6. Point de passage 3 — la matview de l'Explorer ────────────────────────────

-- La MV ne contient PLUS AUCUNE fiche de test. Aucun de ses consommateurs ne peut
-- donc en fuiter, present ou futur — plus sur que d'y ajouter une colonne que
-- chaque appelant devrait penser a filtrer. Consommateur unique verifie sur la
-- base live : api.get_filtered_object_ids. Les comptes de test y sont routes vers
-- la branche `FROM object` (cf. api_views_functions.sql, garde use_mv).
DROP MATERIALIZED VIEW IF EXISTS internal.mv_filtered_objects CASCADE;
CREATE MATERIALIZED VIEW internal.mv_filtered_objects AS
 SELECT o.id, o.object_type, o.status, o.commercial_visibility, o.updated_at,
        o.name_normalized, o.name_search_vector,
        ol.city_search_vector, ol.latitude, ol.longitude, ol.geog2,
        o.cached_min_price, o.cached_main_image_url, o.cached_rating,
        o.cached_is_open_now, o.cached_amenity_codes, o.cached_payment_codes,
        o.cached_environment_tags, o.cached_language_codes,
        o.cached_classification_codes, o.cached_taxonomy_codes,
        o.search_document, o.search_document_text, o.search_document_phonetic,
        immutable_unaccent(lower(ol.city)) AS city_normalized
   FROM object o
   LEFT JOIN object_location ol ON ol.object_id = o.id AND ol.is_main_location IS TRUE
  WHERE o.status = 'published'::object_status
    AND o.is_test = false;

COMMENT ON MATERIALIZED VIEW internal.mv_filtered_objects IS
  'Chemin chaud de l''Explorer (publie uniquement). NE CONTIENT JAMAIS de fiche de test : les comptes de bac a sable sont routes vers la branche object de get_filtered_object_ids.';

-- Les 12 index d'origine, a l'identique (releves sur la base live avant le DROP).
CREATE UNIQUE INDEX idx_mv_filtered_objects_id                   ON internal.mv_filtered_objects USING btree (id);
CREATE INDEX idx_mv_filtered_objects_name_search_gin             ON internal.mv_filtered_objects USING gin (name_search_vector);
CREATE INDEX idx_mv_filtered_objects_city_search_gin             ON internal.mv_filtered_objects USING gin (city_search_vector);
CREATE INDEX idx_mv_filtered_objects_search_doc_gin              ON internal.mv_filtered_objects USING gin (search_document);
CREATE INDEX idx_mv_filtered_objects_geog_gist                   ON internal.mv_filtered_objects USING gist (geog2);
CREATE INDEX idx_mv_filtered_objects_amenity_codes_gin           ON internal.mv_filtered_objects USING gin (cached_amenity_codes);
CREATE INDEX idx_mv_filtered_objects_payment_codes_gin           ON internal.mv_filtered_objects USING gin (cached_payment_codes);
CREATE INDEX idx_mv_filtered_objects_environment_tags_gin        ON internal.mv_filtered_objects USING gin (cached_environment_tags);
CREATE INDEX idx_mv_filtered_objects_language_codes_gin          ON internal.mv_filtered_objects USING gin (cached_language_codes);
CREATE INDEX idx_mv_filtered_objects_classification_codes_gin    ON internal.mv_filtered_objects USING gin (cached_classification_codes);
CREATE INDEX idx_mv_filtered_objects_taxonomy_codes_gin          ON internal.mv_filtered_objects USING gin (cached_taxonomy_codes);
CREATE INDEX idx_mv_filtered_objects_updated_at_id               ON internal.mv_filtered_objects USING btree (updated_at, id);

GRANT SELECT ON internal.mv_filtered_objects TO service_role;

-- ── 7. Rattrapage : aligner l'existant sur la dimension ─────────────────────────

-- Aucune ORG n'est de test a ce stade : toutes les fiches restent is_test=false.
-- L'UPDATE est neanmoins execute pour que la migration soit rejouable apres une
-- bascule manuelle de is_test_org.
UPDATE object o
   SET is_test = api.object_expected_is_test(o.id)
 WHERE o.is_test IS DISTINCT FROM api.object_expected_is_test(o.id);

COMMIT;
