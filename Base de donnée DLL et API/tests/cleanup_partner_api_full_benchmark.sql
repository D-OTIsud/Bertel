DO $$ BEGIN
  IF current_setting('bertel.ephemeral_ci',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Disposable Supabase required: bertel.ephemeral_ci=on';
  END IF;
END $$;
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DELETE FROM public.object WHERE id IN
  (SELECT 'RESRUN999999C'||lpad(n::text,3,'0') FROM generate_series(1,100) n);
DELETE FROM public.ref_document WHERE id IN
 ('00000000-0000-4000-a000-00000000c231','00000000-0000-4000-a000-00000000c232');
DROP TABLE internal.partner_api_full_benchmark;
REFRESH MATERIALIZED VIEW internal.mv_filtered_objects;
COMMIT;
