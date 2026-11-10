-- Phase 2: apply to an existing installation only after Phase 1's complete
-- editorial backfill has been reviewed and published through the normal circuit.
-- No concept, source, revision, or immutable snapshot is changed by this migration.
CREATE OR REPLACE FUNCTION thesaurus.normalize_editorial_text(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path=pg_catalog AS $normalize$
  SELECT lower(regexp_replace(normalize(COALESCE(p_text,''),NFKC),
    U&'[[:punct:][:space:]\00A0\1680\2000-\200B\2028\2029\202F\205F\3000\00AD\0600-\0605\061C\06DD\070F\0890-\0891\08E2\180E\200B-\200F\202A-\202E\2060-\2064\2066-\206F\FEFF\FFF9-\FFFB\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0001\+0E0020-\+0E007F]+','','g'))
$normalize$;
REVOKE ALL ON FUNCTION thesaurus.normalize_editorial_text(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION thesaurus.normalize_editorial_text(text) TO bertel_thesaurus_publisher;

DO $complete_editorial_policy$
DECLARE invalid record;
BEGIN
  -- The replacement and readiness check are atomic even in a transaction-free
  -- fresh-apply driver: failure retains Phase 1's less strict helper unchanged.
  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION thesaurus.definition_errors(
      p_labels jsonb,p_definitions jsonb,p_required_languages text[])
    RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
    SET search_path=pg_catalog,thesaurus AS $definitions$
    DECLARE lang text; errors jsonb:='[]'; normalized_definition text;
    BEGIN
      -- Every advertised translation must have both a preferred label and a
      -- definition, even if that language is additional to the required four.
      FOR lang IN
        SELECT DISTINCT language FROM (
          SELECT unnest(COALESCE(p_required_languages,'{}'::text[])||ARRAY['fr']) AS language
          UNION ALL SELECT jsonb_object_keys(CASE WHEN jsonb_typeof(p_labels)='object' THEN p_labels ELSE '{}'::jsonb END)
          UNION ALL SELECT jsonb_object_keys(CASE WHEN jsonb_typeof(p_definitions)='object' THEN p_definitions ELSE '{}'::jsonb END)
        ) languages ORDER BY language
      LOOP
        IF NOT thesaurus.has_editorial_text(p_labels->lang) THEN
          errors:=errors||jsonb_build_array('Libellé obligatoire manquant ou invalide pour la langue '||lang);
        END IF;
        IF NOT thesaurus.has_editorial_text(p_definitions->lang) THEN
          errors:=errors||jsonb_build_array('Définition obligatoire manquante ou invalide pour la langue '||lang);
        ELSE
          normalized_definition:=thesaurus.normalize_editorial_text(p_definitions->>lang);
          IF normalized_definition IN ('','todo','tbd','àcompléter','acompleter','na') THEN
            errors:=errors||jsonb_build_array('La définition doit expliquer le contexte métier, sans texte provisoire, pour la langue '||lang);
          ELSIF normalized_definition=thesaurus.normalize_editorial_text(p_labels->>lang) THEN
            errors:=errors||jsonb_build_array('La définition doit expliquer le contexte métier au lieu de répéter le libellé pour la langue '||lang);
          END IF;
        END IF;
      END LOOP;
      RETURN errors;
    END $definitions$;
  $ddl$;

  -- A fresh, not-yet-published installation can install the policy before its
  -- seed corpus is enriched. An existing live installation must be ready now.
  IF EXISTS(SELECT 1 FROM thesaurus.instance WHERE singleton AND current_release_id IS NOT NULL) THEN
    SELECT c.concept_id,c.domain,checks.errors INTO invalid
    FROM thesaurus.concept c JOIN thesaurus.vocabulary v USING(domain)
    CROSS JOIN LATERAL (SELECT thesaurus.concept_document(c.concept_id,false) AS doc) canonical
    CROSS JOIN LATERAL (SELECT thesaurus.definition_errors(
      CASE WHEN jsonb_typeof(canonical.doc->'name_i18n')='object' THEN canonical.doc->'name_i18n' ELSE '{}'::jsonb END
        ||jsonb_build_object('fr',canonical.doc->'name'),
      CASE WHEN jsonb_typeof(canonical.doc->'description_i18n')='object' THEN canonical.doc->'description_i18n' ELSE '{}'::jsonb END
        ||jsonb_build_object('fr',canonical.doc->'description'),
      v.required_languages||ARRAY['fr','en','es','de']) AS errors) checks
    WHERE jsonb_array_length(checks.errors)>0 ORDER BY c.domain,c.concept_id LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Enrichissement éditorial à publier avant la phase 2 (%/%) : %',
        invalid.domain,invalid.concept_id,invalid.errors USING ERRCODE='PT400';
    END IF;
  END IF;

  UPDATE thesaurus.vocabulary v SET required_languages=(
    SELECT array_agg(language ORDER BY first_position) FROM (
      SELECT language,min(position) AS first_position
      FROM unnest(v.required_languages||ARRAY['fr','en','es','de']) WITH ORDINALITY AS languages(language,position)
      GROUP BY language
    ) deduplicated
  ),updated_at=now();
  ALTER TABLE thesaurus.vocabulary ALTER COLUMN required_languages SET DEFAULT ARRAY['fr','en','es','de']::text[];
  ALTER TABLE thesaurus.vocabulary ADD CONSTRAINT thesaurus_vocabulary_editorial_languages
    CHECK (required_languages @> ARRAY['fr','en','es','de']::text[]);
END $complete_editorial_policy$;
