"""Create PRIVATE apply_migration input. No database/network access, no secrets.

Pilot identities are resolved in SQL and bound by a private digest, not SQL literals.
Never commit the generated payload or fetch its migration history into public Git.
"""
from pathlib import Path
from uuid import UUID
import argparse
import hashlib
import json

ROOT=Path(__file__).resolve().parents[2]
PACKAGE=ROOT/'supabase/releases/20261105_partner_photo_album'


def literal(value):
    return "'"+value.replace("'","''")+"'"


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--evidence',required=True);args=parser.parse_args()
    evidence=Path(args.evidence)
    pilot=json.loads((evidence/'base-selected-pilot-private.json').read_text(encoding='utf-8'))['result'][0]
    candidates=json.loads((evidence/'base-linked-test-candidates.json').read_text(encoding='utf-8'))['result']
    links=[r for r in candidates if r['object_id']==pilot['id'] and r['actor_is_test'] and r['is_primary']]
    users=[r for r in pilot['office_accounts'] if r['role']=='super_admin']
    if len(links)!=1 or len(users)!=1:raise ValueError('Privately reviewed pilot selection is not unique')
    actor=str(UUID(links[0]['actor_id']));user=str(UUID(users[0]['user_id']));object_id=pilot['id']
    selection_hash=hashlib.sha256((object_id+'|'+actor+'|'+user).encode()).hexdigest()
    baseline=json.loads((evidence/'base-public-before-full-private.json').read_text(encoding='utf-8'))['result'][0]
    if any(not r['public_context'] or not r.get('raw_sql_payload_md5') for r in baseline['resources']):raise ValueError('Complete raw public baseline required')
    reduced={'functions':baseline['functions'],'resources':[{k:r[k] for k in ['id','object_type','public_context','sql_payload_md5','raw_sql_payload_md5']} for r in baseline['resources']]}
    prefix="SELECT set_config('bertel.album_rehearsal_enabled','yes',true);\n"
    prefix+="SELECT set_config('bertel.album_pilot_selection_sha256',"+literal(selection_hash)+",true);\n"
    prefix+="SELECT set_config('bertel.album_public_baseline',"+literal(json.dumps(reduced,separators=(',',':'),ensure_ascii=False))+",true);\n"
    sql=prefix+(PACKAGE/'install.sql').read_text(encoding='utf-8')
    for identity in [object_id,actor,user]:
        if identity in sql:raise ValueError('A pilot identifier leaked into migration SQL')
    target=evidence/'base-install-operator.private.sql';target.write_text(sql,encoding='utf-8',newline='\n')
    record={'pilot':{'object_id':object_id,'actor_id':actor,'office_user_id':user},'selection_sha256':selection_hash,
        'install_sha256':hashlib.sha256((PACKAGE/'install.sql').read_bytes()).hexdigest(),
        'operator_query_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
        'public_baseline_at':baseline['observed_at'],'executed':False,
        'restriction':'No non-anonymized migration fetch into public Git; SQL inputs and evidence stay private'}
    (evidence/'base-install-operator-private.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'payload':str(target),'bytes':len(sql.encode()),'sha256':record['operator_query_sha256'],'pilot_ids_in_sql':False}))


if __name__=='__main__':main()
