BEGIN;
DO $test$
DECLARE
  witness record;
  forbidden_key text;
BEGIN
  FOR witness IN
    SELECT * FROM (VALUES
      ('contact_channel', NULL, 'contacts', '{"objectItems":[],"webItems":[],"olderDraftField":true}'),
      ('object_description', NULL, 'descriptions', '{"object":{"chapo":{"values":{"fr":"Texte fictif"}}}}'),
      ('object_capacity', NULL, 'capacity-policies', '{"capacityItems":[],"petPolicy":{"accepted":true}}'),
      ('object_price', NULL, 'pricing', '{"prices":[],"promotions":[]}'),
      ('object_act', NULL, 'activity', '{"durationMin":"60","maxParticipants":"5"}'),
      ('opening_period', 'save_object_openings', 'openings', '{"periods":[]}'),
      ('object_amenity', 'save_object_commercial', 'characteristics',
        '{"languages":[],"payment_methods":[],"environment_tags":[],"amenities":[]}'),
      ('media', 'publish_portal_photo_additions', 'media',
        '{"additions":[{"upload_id":"00000000-0000-4000-a000-000000000001","credit":"Fixture","replace_media_id":null}]}')
    ) AS cases(target_table, rpc, module, payload)
  LOOP
    ASSERT internal.portal_submission_module(witness.target_table, witness.rpc, witness.payload::jsonb) = witness.module,
      format('a valid portal envelope must resolve to %s', witness.module);
  END LOOP;

  FOREACH forbidden_key IN ARRAY ARRAY['capacities','group_policy','pet_policy','discounts','prices','promotions'] LOOP
    ASSERT internal.portal_submission_module('object_amenity','save_object_commercial',
      jsonb_build_object('amenities','[]'::jsonb,forbidden_key,'[]'::jsonb)) IS NULL,
      format('the portal commercial writer must reject %s', forbidden_key);
  END LOOP;
  ASSERT internal.portal_submission_module('object_amenity','save_object_commercial','{"amenities":[]}'::jsonb)
    = 'characteristics', 'a compatible partial commercial payload stays valid';
  ASSERT internal.portal_submission_module('object_description',NULL,'{"chapo":"ancien brouillon"}'::jsonb)
    = 'descriptions', 'manual payload fields do not change the target module';
  ASSERT internal.portal_submission_module('contact_channel',NULL,'[]'::jsonb) IS NULL;
  ASSERT internal.portal_submission_module('object',NULL,'{}'::jsonb) IS NULL;
  ASSERT internal.portal_submission_module('object_description','save_object_openings','{"periods":[]}'::jsonb) IS NULL;
  ASSERT internal.portal_submission_module('opening_period','save_object_openings','{"periods":[],"prices":[]}'::jsonb) IS NULL;
  ASSERT internal.portal_submission_module('media','publish_portal_photo_additions','{"additions":[],"prices":[]}'::jsonb) IS NULL;
  ASSERT NOT has_function_privilege('anon','internal.portal_submission_module(text,text,jsonb)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','internal.portal_submission_module(text,text,jsonb)','EXECUTE');
  ASSERT NOT has_function_privilege('service_role','internal.portal_submission_module(text,text,jsonb)','EXECUTE');
END;
$test$;
ROLLBACK;
