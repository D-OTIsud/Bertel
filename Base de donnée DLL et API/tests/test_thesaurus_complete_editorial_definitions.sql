-- Disposable database only: four-language editorial policy and all extra translations.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='60s';
DO $complete_editorial_checks$
DECLARE labels jsonb:='{"fr":"Une étoile","en":"One star","es":"Una estrella","de":"Ein Stern"}';
 defs jsonb:='{"fr":"Niveau une étoile du classement officiel des hôtels.","en":"One-star level in the official hotel classification.","es":"Nivel de una estrella en la clasificación oficial de hoteles.","de":"Ein-Stern-Stufe der offiziellen Hotelklassifizierung."}';
 languages text[]:=ARRAY['fr','en','es','de']; lang text; bad text; cid uuid; doc jsonb;
BEGIN
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.vocabulary
    WHERE NOT required_languages @> languages OR NOT require_definition),
    'All domains must require contextual definitions in all four languages';
  ASSERT jsonb_array_length(thesaurus.definition_errors(labels,defs,languages))=0,
    'Concise contextual definitions must not be rejected by an arbitrary length gate';
  FOREACH lang IN ARRAY languages LOOP
    ASSERT jsonb_array_length(thesaurus.definition_errors(labels,defs-lang,languages))>0,
      'Each required language must have a definition';
    ASSERT jsonb_array_length(thesaurus.definition_errors(labels,
      jsonb_set(defs,ARRAY[lang],labels->lang),languages))>0,
      'Repeating the same-language preferred label is not a definition';
  END LOOP;
  ASSERT jsonb_array_length(thesaurus.definition_errors(labels,
    jsonb_set(defs,'{fr}',to_jsonb(U&'  UNE\00A0\00C9TOILE !!!  '::text)),languages))>0,
    'Case, Unicode whitespace and punctuation cannot disguise a copied label';
  FOREACH bad IN ARRAY ARRAY['TODO','TBD','À compléter','N/A','—','...'] LOOP
    ASSERT jsonb_array_length(thesaurus.definition_errors(labels,
      jsonb_set(defs,'{de}',to_jsonb(bad)),languages))>0,
      format('Whole-value placeholder must be rejected: %s',bad);
  END LOOP;
  ASSERT jsonb_array_length(thesaurus.definition_errors(labels||'{"it":"Una stella"}',defs,languages))>0,
    'An additional preferred-label language also requires its definition';
  ASSERT jsonb_array_length(thesaurus.definition_errors(labels,defs||'{"it":"Livello di una stella nella classificazione ufficiale degli alberghi."}',languages))>0,
    'An additional definition also requires its preferred label';
  ASSERT jsonb_array_length(thesaurus.definition_errors(labels||'{"it":"Una stella"}',
    defs||'{"it":"Livello di una stella nella classificazione ufficiale degli alberghi."}',languages))=0,
    'Complete additional translations must remain supported';

  INSERT INTO thesaurus.vocabulary(domain,name,source_kind)
  VALUES('test_complete_definitions','Domaine privé témoin','ref_code');
  ASSERT (SELECT required_languages @> languages FROM thesaurus.vocabulary WHERE domain='test_complete_definitions'),
    'New domains must default to all four editorial languages';
  BEGIN
    UPDATE thesaurus.vocabulary SET required_languages=ARRAY['fr'] WHERE domain='test_complete_definitions';
    RAISE EXCEPTION 'Required languages were silently weakened';
  EXCEPTION WHEN check_violation THEN NULL;END;
  INSERT INTO thesaurus.concept(domain,code,source_kind,source_id)
  VALUES('test_complete_definitions','test_complete','ref_code',gen_random_uuid()::text) RETURNING concept_id INTO cid;
  doc:=jsonb_build_object('name',labels->'fr','description',defs->'fr',
    'name_i18n',labels,'description_i18n',defs);
  ASSERT jsonb_array_length(thesaurus.validate_document(cid,doc)->'errors')=0,
    'Draft validator must use the strengthened editorial helper';
  ASSERT jsonb_array_length(thesaurus.validate_document(cid,
    jsonb_set(doc,'{description_i18n,de}',labels->'de'))->'errors')>0,
    'Draft validator must reject copied translated labels, not only French';
END $complete_editorial_checks$;
ROLLBACK;
