"""Build the Photos-only SQL candidate from the reviewed integration sources.

No database/network operation. Operator evidence is outside the public Git repo.
Usage: python tools/album-production/build-sql-package.py --source PATH --evidence PATH
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
from pglast import parse_sql, split
from pglast.parser import parse_plpgsql_json

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'supabase/releases/20261105_partner_photo_album'


def md5(value):
    return hashlib.md5(value.encode()).hexdigest()


def body(definition):
    found = re.search(r'\bAS\s+(\$\w*\$)([\s\S]*?)\1', definition, re.I)
    assert found
    return found[2]


def function(text, name):
    found = re.search(r'CREATE(?: OR REPLACE)? FUNCTION\s+' + re.escape(name)
        + r'\s*\([\s\S]*?\bAS\s+(\$\w*\$)[\s\S]*?\1\s*;?', text, re.I)
    assert found, name
    return found[0].rstrip(';') + ';'


def statements(text):
    result = []
    for statement in split(text):
        ast = parse_sql(statement)[0].stmt
        if ast.__class__.__name__ in {'TransactionStmt', 'NotifyStmt'}:
            continue
        result.append(statement.rstrip(';') + ';')
    return result


def patch_once(value, old, new):
    assert value.count(old) == 1, old[:100]
    return value.replace(old, new)


def lock_patch(signature, definition, expected, marker):
    original = body(definition)
    assert md5(original) == expected, signature
    pairs = [
        ('  v_now timestamptz := now();', '  v_now timestamptz := now();\n  v_sub_id uuid;'),
        ('  SELECT * INTO v_row FROM pending_change WHERE id = p_id FOR UPDATE;',
         f'  -- /* {marker} */ Submission -> proposal -> object, same order as the batch.\n'
         '  SELECT submission_id INTO v_sub_id FROM pending_change WHERE id=p_id;\n'
         '  IF v_sub_id IS NOT NULL THEN PERFORM 1 FROM fiche_submission WHERE id=v_sub_id FOR UPDATE; END IF;\n'
         '  SELECT * INTO v_row FROM pending_change WHERE id = p_id FOR UPDATE;'),
    ]
    if signature.startswith('api.reject_'):
        pairs.append(('IF NOT api.user_can_moderate_object(v_row.object_id) THEN',
            'IF v_row.object_id IS NULL OR NOT api.user_can_moderate_object(v_row.object_id) THEN'))
    updated = original
    for old, new in pairs:
        updated = patch_once(updated, old, new)
    target = md5(updated)
    pair_sql = ',\n'.join('jsonb_build_array($old$'+old+'$old$,$new$'+new+'$new$)' for old,new in pairs)
    sql = f"""DO $photo_lock_patch$
DECLARE v_oid regprocedure:='{signature}'::regprocedure;v_raw text;v_def text;v_pair jsonb;v_meta jsonb;
BEGIN
 SELECT replace(p.prosrc,E'\\r\\n',E'\\n'),pg_get_functiondef(p.oid),
  jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef)
 INTO v_raw,v_def,v_meta FROM pg_proc p WHERE p.oid=v_oid AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres';
 IF md5(v_raw)='{target}' THEN RETURN; END IF;
 IF md5(v_raw) IS DISTINCT FROM '{expected}' THEN RAISE EXCEPTION 'Unreviewed photo moderation source: %',v_oid; END IF;
 v_def:=replace(v_def,E'\\r\\n',E'\\n');
 FOR v_pair IN SELECT value FROM jsonb_array_elements(jsonb_build_array({pair_sql})) LOOP
  IF (length(v_def)-length(replace(v_def,v_pair->>0,'')))/length(v_pair->>0)<>1 THEN RAISE EXCEPTION 'Photo moderation anchor differs: %',v_oid; END IF;
  v_def:=replace(v_def,v_pair->>0,v_pair->>1);
 END LOOP;
 EXECUTE v_def;
 IF (SELECT md5(replace(prosrc,E'\\r\\n',E'\\n')) FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM '{target}'
  OR (SELECT jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef) FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_meta THEN
  RAISE EXCEPTION 'Photo moderation target/attributes differ';
 END IF;
END;
$photo_lock_patch$;
ALTER FUNCTION {signature} SET lock_timeout='5s';
"""
    parse_plpgsql_json(sql[:sql.index('\nALTER FUNCTION')])
    parse_plpgsql_json(definition.replace(original, updated))
    return sql, target


def office_main_order_patch(definition):
    original=body(definition)
    old=" FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'rows') LOOP"
    new=""" -- Explicit demotions must happen before promotions, regardless of client row order.
 -- Keep the original request/receipt unchanged and preserve order within each group.
 FOR v_row IN SELECT item FROM jsonb_array_elements(p_payload->'rows') WITH ORDINALITY incoming(item,n)
  ORDER BY CASE WHEN item->'changes'->'is_main'='false'::jsonb THEN 0 ELSE 1 END,n LOOP"""
    start=original.index(" FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'deleted') LOOP")
    end=original.index(' PERFORM internal.gallery_assert_photo_capacity(',start)
    delete_block=original[start:end]
    updated=patch_once(original,delete_block,'')
    updated=patch_once(updated,old,delete_block+new)
    before=md5(original);after=md5(updated)
    sql=f"""DO $office_main_order$
DECLARE v_oid regprocedure:='api.save_object_gallery(text,jsonb)'::regprocedure;v_def text;v_source text;v_meta jsonb;v_pair jsonb;
BEGIN
 SELECT replace(prosrc,E'\\r\\n',E'\\n'),pg_get_functiondef(oid),
  jsonb_build_object('owner',proowner,'acl',to_jsonb(proacl),'config',to_jsonb(proconfig),'definer',prosecdef)
 INTO v_source,v_def,v_meta FROM pg_proc WHERE oid=v_oid AND prosecdef AND pg_get_userbyid(proowner)='postgres';
 IF md5(v_source)='{after}' THEN RETURN; END IF;
 IF md5(v_source) IS DISTINCT FROM '{before}' THEN RAISE EXCEPTION 'Office gallery source differs'; END IF;
 v_def:=replace(v_def,E'\\r\\n',E'\\n');
 FOR v_pair IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
  jsonb_build_array($old_delete${delete_block}$old_delete$,''),
  jsonb_build_array($old_rows${old}$old_rows$,$new_rows${delete_block+new}$new_rows$))) LOOP
  IF (length(v_def)-length(replace(v_def,v_pair->>0,'')))/length(v_pair->>0)<>1 THEN RAISE EXCEPTION 'Office gallery ordering anchor differs'; END IF;
  v_def:=replace(v_def,v_pair->>0,v_pair->>1);
 END LOOP;
 EXECUTE v_def;
 IF (SELECT md5(replace(prosrc,E'\\r\\n',E'\\n')) FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM '{after}'
 OR (SELECT jsonb_build_object('owner',proowner,'acl',to_jsonb(proacl),'config',to_jsonb(proconfig),'definer',prosecdef) FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM v_meta THEN RAISE EXCEPTION 'Office gallery target/attributes differ'; END IF;
END; $office_main_order$;
"""
    parse_plpgsql_json(definition.replace(original,updated))
    parse_plpgsql_json(sql)
    return sql,before,after,definition.replace(original,updated)


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--source', required=True)
    args.add_argument('--evidence', required=True)
    opts = args.parse_args()
    source = Path(opts.source)
    evidence = Path(opts.evidence)
    read = lambda name: (source / name).read_text(encoding='utf-8')
    before = json.loads((evidence / 'base-live-catalogue.json').read_text(encoding='utf-8'))['result']
    live = {row['name']: row for row in before}
    reject = json.loads((evidence / 'base-reject-definition-private.json').read_text(encoding='utf-8'))['result'][0]
    assert reject['source_md5'] == 'c125ebd25849243cf45f1b7a114960ed'
    parts = []
    append = lambda title, text: parts.append('\n-- '+title+'\n'+'\n'.join(statements(text)))
    baseline = [('actor_portal_floor_modules','2bbe58646c2d56dc402bbede946e1511'),
        ('submit_actor_fiche','0861011392137effc9c7cb97bef6beab'),
        ('approve_pending_change','78b171f997cd630da118ecc81382448d'),
        ('reject_pending_change','c125ebd25849243cf45f1b7a114960ed'),
        ('get_object_resource','523b18abc402528c494e25f3895f2912')]
    for name, expected in baseline:
        assert live[name]['source_md5'] == expected
    signatures = {'actor_portal_floor_modules':'','submit_actor_fiche':'text,jsonb,text','approve_pending_change':'uuid,text,boolean','reject_pending_change':'uuid,text','get_object_resource':'text,text[],text,jsonb'}
    checks = '\n'.join(" IF (SELECT md5(replace(prosrc,E'\\r\\n',E'\\n')) FROM pg_proc WHERE oid=to_regprocedure('api."
        +name+'('+signatures[name]+")')) IS DISTINCT FROM '"+expected+"' THEN RAISE EXCEPTION 'Live source changed: "+name+"'; END IF;" for name,expected in baseline)
    deps = json.loads((evidence/'base-storage-dependencies.json').read_text(encoding='utf-8'))['result']
    kind_definition = next(row['details']['definition'] for row in deps if row['kind']=='constraint' and row['name']=='chk_app_notification_kind')
    checks += f"\n IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid='public.app_notification'::regclass AND conname='chk_app_notification_kind') IS DISTINCT FROM '{md5(kind_definition)}' THEN RAISE EXCEPTION 'Notification kind constraint changed'; END IF;"
    checks += """
 IF to_regprocedure('api.get_my_portal_photo_workspace(text)') IS NOT NULL OR to_regclass('internal.portal_photo_analysis') IS NOT NULL
  OR to_regprocedure('api.send_portal_message(text,text,text,jsonb,text,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'Unexpected partial photo installation; compare before continuing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='actor-documents' AND NOT public)
  OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='media' AND public) THEN RAISE EXCEPTION 'Existing photo buckets must match reviewed configuration'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ref_code_demand_topic WHERE code='modification_infos_bdd' AND is_active) THEN RAISE EXCEPTION 'Existing correction topic must be active'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.app_user_profile'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%''actor''%') THEN RAISE EXCEPTION 'Actor profile role prerequisite missing'; END IF;
"""
    append('Observed live sources must still match before any preparation', 'DO $baseline$ BEGIN\n'+checks+'\nEND; $baseline$;')

    messaging = read('Base de donnée DLL et API/migration_actor_portal_message.sql')
    append('Shared private messaging only: keep existing mail claimant/acknowledger UNCHANGED', """
ALTER TABLE public.app_notification DROP CONSTRAINT chk_app_notification_kind;
ALTER TABLE public.app_notification ADD CONSTRAINT chk_app_notification_kind CHECK(kind IN('crm_task_assigned','fiche_submission_reviewed','list_feature_requested','pending_change_submitted','portal_message'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_portal_client_message ON public.crm_interaction(actor_id,(extra->>'portal_client_id')) WHERE source='portal' AND extra->>'portal_client_id' IS NOT NULL;
""")
    message_names = ['portal_message_upload_context','send_portal_message','portal_message_document','list_portal_message_documents','list_my_portal_messages']
    message_sigs = ['text','text,text,text,jsonb,text,uuid','uuid','uuid','text']
    for name, sig in zip(message_names,message_sigs):
        append(name, function(messaging,'api.'+name) + f'\nREVOKE ALL ON FUNCTION api.{name}({sig}) FROM PUBLIC,anon,authenticated;\nGRANT EXECUTE ON FUNCTION api.{name}({sig}) TO authenticated;')
    media = read('Base de donnée DLL et API/migration_actor_portal_media.sql')
    append('Photo B contract; later stages close actor mutations in the SAME transaction',media)

    correction = read('supabase/migrations/20261103083731_partner_portal_menu_stay_correction_read_scope.sql')
    append('Canonical gallery read helper ONLY: no menu/stay RLS rollout',function(correction,'api.can_read_object_for_correction') + """
REVOKE ALL ON FUNCTION api.can_read_object_for_correction(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.can_read_object_for_correction(text) TO authenticated;
DROP POLICY IF EXISTS correction_read_root_gallery ON public.media;
CREATE POLICY correction_read_root_gallery ON public.media FOR SELECT TO authenticated USING(place_id IS NULL AND api.can_read_object_for_correction(object_id));
""")
    approve_definition = function(media,'api.approve_pending_change')
    approve_lock, approve_hash = lock_patch('api.approve_pending_change(uuid,text,boolean)',approve_definition,'e6130617c05459dccd63d23814160f60','album-photo-lock-order')
    reject_lock, reject_hash = lock_patch('api.reject_pending_change(uuid,text)',reject['definition'],'c125ebd25849243cf45f1b7a114960ed','album-photo-lock-order')
    append('Moderation lock order ONLY: no collection baselines or commercial/opening writer changes',approve_lock+reject_lock)
    stock_path='supabase/migrations/20261103072105_partner_portal_photo_stock_and_gallery_contract.sql'
    for name in [stock_path,
        'supabase/migrations/20261103084816_partner_portal_photo_assessment_foundation_off.sql',
        'supabase/migrations/20261104151051_partner_photo_actor_workspace_texts.sql',
        'supabase/migrations/20261104161843_partner_photo_refusal_office_private_preview.sql']:
        append(name,read(name))
    office_patch,office_before,office_after,office_final=office_main_order_patch(function(read(stock_path),'api.save_object_gallery'))
    append('Office principal row order: demote before promote, same CAS and receipt',office_patch)
    footer = """
REVOKE ALL ON FUNCTION api.send_portal_message(text,text,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
DO $closed$ BEGIN
 IF internal.portal_photo_actor_writes_enabled() THEN RAISE EXCEPTION 'Actor photo writes must stay closed'; END IF;
 IF (SELECT enabled FROM internal.portal_photo_analysis_settings WHERE singleton) THEN RAISE EXCEPTION 'Photo AI must stay OFF'; END IF;
END; $closed$;
NOTIFY pgrst,'reload schema';
"""
    atomicity="""SELECT set_config('bertel.album_xid',txid_current()::text,true);
DO $atomicity$ BEGIN
 IF current_setting('bertel.album_xid',true) IS DISTINCT FROM txid_current()::text THEN
  RAISE EXCEPTION 'The complete album installation requires one managed transaction';
 END IF;
END; $atomicity$;
"""
    prepare = '-- GENERATED REVIEW CANDIDATE. No pilot IDs. apply_migration only after root/Claude approval.\n'+atomicity+"SET LOCAL lock_timeout='500ms';\nSET LOCAL statement_timeout='60s';\n"+'\n'.join(parts)+'\n'+footer
    # The caller/apply_migration owns the one transaction; no nested BEGIN/COMMIT.
    assert not any(s.stmt.__class__.__name__ == 'TransactionStmt' for s in parse_sql(prepare))
    activate = read('supabase/cutovers/partner_photo_stock_and_gallery.sql')+'\n'+read('supabase/cutovers/partner_photo_actor_album.sql')
    for old,new in [('ed555f983ff336577c0b87be090a7bfa',approve_hash),('4a7f66b8c90990e479b7d0dbde720e71',reject_hash)]:
        assert activate.count(old)==2
        activate = activate.replace(old,new)
    activate = '-- GENERATED PHOTO-ONLY LOCK PINS. Requires root coordination and compatible office fallback.\n'+'\n'.join(statements(activate))
    activate = f"""DO $office_writer_pin$ BEGIN
 IF (SELECT md5(replace(prosrc,E'\\r\\n',E'\\n')) FROM pg_proc WHERE oid=to_regprocedure('api.save_object_gallery(text,jsonb)')) IS DISTINCT FROM '{office_after}' THEN
  RAISE EXCEPTION 'Install the reviewed office principal-order fix before activation';
 END IF;
END; $office_writer_pin$;
"""+activate
    close = '\n'.join(statements(read('supabase/cutovers/close_partner_photo_actor_album.sql')))
    OUT.mkdir(parents=True,exist_ok=True)
    for filename,text in [('prepare.sql',prepare),('activate.sql',activate),('close.sql',close)]:
        parse_sql(text)
        (OUT/filename).write_text(text,encoding='utf-8',newline='\n')
    (OUT/'review-office-final.sql').write_text('-- FOR REVIEW ONLY: final reconstructed office writer, not a standalone deployment.\n'+office_final+'\n',encoding='utf-8',newline='\n')
    rehearsal_template = (OUT/'rehearsal.sql').read_text(encoding='utf-8')
    assert rehearsal_template.count('__ACTIVATION_SQL__')==1
    assert '$album_activation_payload$' not in activate
    rehearsal = rehearsal_template.replace('__ACTIVATION_SQL__',activate)
    for statement in split(rehearsal):
        parse_sql(statement)
        if statement.lstrip().startswith('DO ') or '\nDO $' in statement:
            parse_plpgsql_json(statement)
    install = prepare+'\n'+rehearsal
    (OUT/'install.sql').write_text(install,encoding='utf-8',newline='\n')
    manifest = json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
    manifest['status']='reviewed_closed_install_runtime_recipe_pending'
    manifest['minimal_moderation_hashes']={'approve':approve_hash,'reject':reject_hash}
    manifest['office_gallery_order_hashes']={'before':office_before,'after':office_after}
    manifest['files']={n:hashlib.sha256((OUT/n).read_bytes()).hexdigest() for n in ['prepare.sql','activate.sql','close.sql','install.sql','rehearsal.sql','public-snapshot.sql','review-office-final.sql']}
    manifest['installation']='install.sql'
    manifest['mandatory_rehearsal']=True
    comparison_path=evidence/'base-public-full-comparison-private.json'
    comparison=json.loads(comparison_path.read_text(encoding='utf-8')) if comparison_path.exists() else {}
    manifest['public_json_baseline_captured']=comparison.get('equal') is True
    manifest['mail_overrides_included']=False
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({'prepare_bytes':len(prepare.encode()),'approve_lock_hash':approve_hash,'reject_lock_hash':reject_hash,'office_hash':office_after,'status':manifest['status']}))


if __name__ == '__main__':
    main()
