-- Phase 1: definitions are an invariant for every vocabulary, including private ones.
-- No source concept or published snapshot is rewritten. Apply before preparing drafts:
-- vocabulary policy participates in the optimistic source fingerprint.
ALTER TABLE thesaurus.vocabulary ALTER COLUMN require_definition SET DEFAULT true;
UPDATE thesaurus.vocabulary SET require_definition=true,updated_at=now()
WHERE require_definition IS DISTINCT FROM true;
ALTER TABLE thesaurus.vocabulary
  ADD CONSTRAINT thesaurus_vocabulary_definition_required CHECK (require_definition IS TRUE);

CREATE OR REPLACE FUNCTION thesaurus.has_editorial_text(p_value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path=pg_catalog AS $text$
  SELECT COALESCE(jsonb_typeof(p_value)='string' AND (p_value#>>'{}') ~
    U&'[^[:space:]\00A0\1680\2000-\200B\2028\2029\202F\205F\3000\FEFF]',false)
$text$;

-- The same check serves editable documents and the complete release snapshot.
-- Phase 2 strengthens this helper after the corpus has been reviewed and published.
CREATE OR REPLACE FUNCTION thesaurus.definition_errors(
  p_labels jsonb,p_definitions jsonb,p_required_languages text[])
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path=pg_catalog,thesaurus AS $definitions$
DECLARE lang text; errors jsonb:='[]';
BEGIN
  FOR lang IN SELECT DISTINCT x FROM unnest(
    COALESCE(p_required_languages,'{}'::text[])||ARRAY['fr']) x ORDER BY x LOOP
    IF NOT thesaurus.has_editorial_text(p_labels->lang) THEN
      errors:=errors||jsonb_build_array('Libellé obligatoire manquant ou invalide pour la langue '||lang);
    END IF;
    IF NOT thesaurus.has_editorial_text(p_definitions->lang) THEN
      errors:=errors||jsonb_build_array('Définition obligatoire manquante ou invalide pour la langue '||lang);
    END IF;
  END LOOP;
  RETURN errors;
END $definitions$;

CREATE OR REPLACE FUNCTION thesaurus.assert_release_definitions(p_release_id bigint)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,thesaurus AS $assert_release$
DECLARE invalid record;
BEGIN
  SELECT rc.concept_id,rc.domain,checks.errors INTO invalid
  FROM thesaurus.release_concept rc JOIN thesaurus.vocabulary v USING(domain)
  CROSS JOIN LATERAL (SELECT thesaurus.definition_errors(
    rc.document->'preferred_labels',rc.document->'definitions',v.required_languages) AS errors) checks
  WHERE rc.release_id=p_release_id AND jsonb_array_length(checks.errors)>0
  ORDER BY rc.domain,rc.concept_id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Définitions de publication invalides pour %/% : %',
      invalid.domain,invalid.concept_id,invalid.errors USING ERRCODE='PT400';
  END IF;
END $assert_release$;

REVOKE ALL ON FUNCTION thesaurus.has_editorial_text(jsonb),
  thesaurus.definition_errors(jsonb,jsonb,text[]),
  thesaurus.assert_release_definitions(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION thesaurus.has_editorial_text(jsonb),
  thesaurus.definition_errors(jsonb,jsonb,text[]),
  thesaurus.assert_release_definitions(bigint) TO bertel_thesaurus_publisher;

-- Narrow reviewed edits preserve the current auth/preparation kernel and function ACLs.
-- Fail closed when the predecessor has changed, rather than replacing newer behavior.
DO $patch_definition_policy$
DECLARE original text; body text; needle text; replacement text;
BEGIN
  SELECT prosrc INTO STRICT original FROM pg_proc
  WHERE oid='thesaurus.validate_document(uuid,jsonb)'::regprocedure;
  body:=replace(original,E'\r','');
  needle:=$old$  IF COALESCE(req,false) AND NULLIF(btrim(p_doc->>'description'),'') IS NULL THEN errors:=errors||jsonb_build_array('La définition est obligatoire pour ce domaine.'); END IF;
  IF NULLIF(btrim(p_doc->>'description'),'') IS NULL THEN warnings:=warnings||jsonb_build_array('Définition absente : corpus non déclaré complet.');END IF;$old$;
  IF strpos(body,needle)=0 THEN RAISE EXCEPTION 'Reviewed primary-definition validator changed';END IF;
  body:=replace(body,needle,'');
  needle:=$old$  FOREACH lang IN ARRAY required_langs LOOP
    IF NULLIF(btrim(CASE WHEN lang='fr'THEN p_doc->>'name'ELSE p_doc->'name_i18n'->>lang END),'')IS NULL THEN errors:=errors||jsonb_build_array('Libellé obligatoire manquant pour la langue '||lang);END IF;
    IF req AND NULLIF(btrim(CASE WHEN lang='fr'THEN p_doc->>'description'ELSE p_doc->'description_i18n'->>lang END),'')IS NULL THEN errors:=errors||jsonb_build_array('Définition obligatoire manquante pour la langue '||lang);END IF;
  END LOOP;$old$;
  replacement:=$new$  errors:=errors||thesaurus.definition_errors(
    CASE WHEN jsonb_typeof(p_doc->'name_i18n')='object' THEN p_doc->'name_i18n' ELSE '{}'::jsonb END
      ||jsonb_build_object('fr',p_doc->'name'),
    CASE WHEN jsonb_typeof(p_doc->'description_i18n')='object' THEN p_doc->'description_i18n' ELSE '{}'::jsonb END
      ||jsonb_build_object('fr',p_doc->'description'),required_langs);$new$;
  IF strpos(body,needle)=0 THEN RAISE EXCEPTION 'Reviewed translated-definition validator changed';END IF;
  body:=replace(body,needle,replacement);
  EXECUTE replace(pg_get_functiondef('thesaurus.validate_document(uuid,jsonb)'::regprocedure),original,body);

  SELECT prosrc INTO STRICT original FROM pg_proc
  WHERE oid='thesaurus.admin_dispatch(text,jsonb)'::regprocedure;
  body:=replace(original,E'\r','');
  needle:=$old$    UPDATE thesaurus.vocabulary SET require_definition=COALESCE((p_payload->>'require_definition')::boolean,require_definition),updated_at=now()WHERE domain=v.domain RETURNING to_jsonb(thesaurus.vocabulary.*)INTO result;RETURN result;$old$;
  replacement:=$new$    IF p_payload?'require_definition' AND (p_payload->>'require_definition')::boolean IS FALSE THEN
      RAISE EXCEPTION 'Une définition métier est obligatoire pour chaque concept : cette règle ne peut pas être désactivée.' USING ERRCODE='PT400';
    END IF;
    UPDATE thesaurus.vocabulary SET require_definition=true,updated_at=now()WHERE domain=v.domain RETURNING to_jsonb(thesaurus.vocabulary.*)INTO result;RETURN result;$new$;
  IF strpos(body,needle)=0 THEN RAISE EXCEPTION 'Reviewed domain configuration changed';END IF;
  body:=replace(body,needle,replacement);
  EXECUTE replace(pg_get_functiondef('thesaurus.admin_dispatch(text,jsonb)'::regprocedure),original,body);

  SELECT prosrc INTO STRICT original FROM pg_proc
  WHERE oid='thesaurus.guard_immutable()'::regprocedure;
  body:=replace(original,E'\r','');
  needle:=$old$    IF TG_OP='UPDATE' AND current_user='bertel_thesaurus_publisher' AND OLD.checksum='' THEN RETURN NEW;END IF;$old$;
  replacement:=$new$    IF TG_OP='UPDATE' AND current_user='bertel_thesaurus_publisher' AND OLD.checksum='' THEN
      -- Every row, including concepts copied from the previous release, must pass.
      IF NEW.checksum<>'' THEN PERFORM thesaurus.assert_release_definitions(NEW.release_id);END IF;
      RETURN NEW;
    END IF;$new$;
  IF strpos(body,needle)=0 THEN RAISE EXCEPTION 'Reviewed immutable release guard changed';END IF;
  body:=replace(body,needle,replacement);
  EXECUTE replace(pg_get_functiondef('thesaurus.guard_immutable()'::regprocedure),original,body);
END $patch_definition_policy$;

COMMENT ON COLUMN thesaurus.vocabulary.require_definition IS
  'Always true: every concept requires a business-context definition; publication checks each required language across the entire snapshot.';
