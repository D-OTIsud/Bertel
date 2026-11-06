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
  'Realm derive de l ORG primaire (ou de la propre configuration d une ORG). Les ecritures directes contradictoires sont refusees ; l entretien passe par les sources autorisees. Exclut le corpus de test des lecteurs publics et partenaires.';
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

-- Source transitions serialize by organization before touching derived object
-- rows. The object guard never takes these locks: it already owns an object row,
-- whereas a config transition owns its config row before updating objects.
-- A SHARE lock on the organization row also makes a stale REPEATABLE READ source
-- transition fail with 40001 instead of accepting a pre-flip snapshot.
CREATE OR REPLACE FUNCTION internal.lock_object_realm_sources(p_org_ids text[])
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
DECLARE v_org_id text;
BEGIN
  FOR v_org_id IN SELECT DISTINCT x FROM unnest(p_org_ids) x WHERE x IS NOT NULL ORDER BY x LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('bertel.object-realm:' || v_org_id, 0));
  END LOOP;
  FOR v_org_id IN SELECT DISTINCT x FROM unnest(p_org_ids) x WHERE x IS NOT NULL ORDER BY x LOOP
    PERFORM 1 FROM public.object WHERE id=v_org_id FOR SHARE;
  END LOOP;
END;
$fn$;
REVOKE ALL ON FUNCTION internal.lock_object_realm_sources(text[]) FROM PUBLIC, anon, authenticated, service_role;

-- An ORG follows its own configuration. Other objects follow their primary
-- organization. A new/orphan object has no source yet and starts in production;
-- the existing AFTER INSERT auto-attachment stamps a test creator's object.
CREATE OR REPLACE FUNCTION api.object_expected_is_test(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
  SELECT COALESCE(
    (SELECT oc.is_test_org FROM public.org_config oc WHERE oc.org_object_id=p_object_id),
    (
    SELECT oc.is_test_org
    FROM public.object_org_link ool
    JOIN public.org_config oc ON oc.org_object_id = ool.org_object_id
    WHERE ool.object_id = p_object_id AND ool.is_primary IS TRUE
    ORDER BY ool.updated_at DESC, ool.org_object_id
    LIMIT 1
    ), false);
$fn$;

-- This is an invariant, not another authorization decision. Even privileged
-- writers must change the source organization/config rather than forge its copy.
-- VOLATILE is intentional: queries in a row trigger need a fresh snapshot after
-- waiting for another transaction's row update. No caller-controlled bypass GUC.
CREATE OR REPLACE FUNCTION api.guard_object_is_test()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
DECLARE v_expected boolean;
BEGIN
  SELECT api.object_expected_is_test(NEW.id) INTO v_expected;
  IF NEW.is_test IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Object realm is derived from its organization'
      USING ERRCODE='42501', DETAIL='object_realm_is_derived',
        HINT='Change the primary organization or its configuration through the existing authorized path.';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION api.guard_object_is_test() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_guard_object_is_test ON public.object;
CREATE TRIGGER trg_guard_object_is_test
BEFORE INSERT OR UPDATE OF is_test ON public.object
FOR EACH ROW EXECUTE FUNCTION api.guard_object_is_test();

CREATE OR REPLACE FUNCTION api.sync_object_is_test(p_object_id text)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
  UPDATE public.object o
     SET is_test = api.object_expected_is_test(p_object_id)
   WHERE o.id = p_object_id
     AND o.is_test IS DISTINCT FROM api.object_expected_is_test(p_object_id);
$fn$;

CREATE OR REPLACE FUNCTION api.trg_object_org_link_is_test()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
DECLARE v_org_ids text[]:=ARRAY[]::text[]; v_object_ids text[]:=ARRAY[]::text[]; v_object_id text;
BEGIN
  -- An object DELETE already owns the derived row before FK cascades remove
  -- its links. There is no remaining row to synchronize; do not invert the
  -- source-lock -> object-row order against a concurrent config transition.
  IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.object WHERE id=OLD.object_id) THEN
    RETURN NULL;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_org_ids:=array_append(v_org_ids,OLD.org_object_id);
    v_object_ids:=array_append(v_object_ids,OLD.object_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_org_ids:=array_append(v_org_ids,NEW.org_object_id);
    v_object_ids:=array_append(v_object_ids,NEW.object_id);
  END IF;
  PERFORM internal.lock_object_realm_sources(v_org_ids);
  FOR v_object_id IN SELECT DISTINCT x FROM unnest(v_object_ids) x ORDER BY x LOOP
    PERFORM api.sync_object_is_test(v_object_id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_object_org_link_is_test ON public.object_org_link;
CREATE TRIGGER trg_object_org_link_is_test
AFTER INSERT OR DELETE OR UPDATE OF object_id, org_object_id, is_primary ON public.object_org_link
FOR EACH ROW EXECUTE FUNCTION api.trg_object_org_link_is_test();

-- A config insert, flag change, key move or deletion re-derives every affected
-- organization and current primary child. An absent source uses the same false
-- fallback as an object without a primary organization. No authorization changes.
CREATE OR REPLACE FUNCTION api.trg_org_config_is_test()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
DECLARE v_org_ids text[]:=ARRAY[]::text[]; v_object_id text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_org_ids:=array_append(v_org_ids,OLD.org_object_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_org_ids:=array_append(v_org_ids,NEW.org_object_id);
  END IF;
  PERFORM internal.lock_object_realm_sources(v_org_ids);
  -- Read the current primary source for each row, rather than stamp one config
  -- value onto an object whose primary link may have moved while we waited.
  FOR v_object_id IN
    SELECT ool.object_id FROM public.object_org_link ool
      WHERE ool.org_object_id=ANY(v_org_ids) AND ool.is_primary IS TRUE
    UNION SELECT unnest(v_org_ids)
    ORDER BY 1
  LOOP
    PERFORM api.sync_object_is_test(v_object_id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_org_config_is_test ON public.org_config;
CREATE TRIGGER trg_org_config_is_test
AFTER INSERT OR DELETE OR UPDATE OF org_object_id, is_test_org ON public.org_config
FOR EACH ROW EXECUTE FUNCTION api.trg_org_config_is_test();

-- Le tombstone herite du realm de la fiche AU MOMENT de sa suppression.
CREATE OR REPLACE FUNCTION api.trg_object_deletion_log_is_test()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
BEGIN
  IF NEW.is_test IS NOT TRUE THEN
    NEW.is_test := COALESCE((SELECT o.is_test FROM public.object o WHERE o.id = NEW.object_id), false);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_object_deletion_log_is_test ON public.object_deletion_log;
CREATE TRIGGER trg_object_deletion_log_is_test
BEFORE INSERT ON public.object_deletion_log
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
