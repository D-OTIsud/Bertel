"""Offline exact comparison/type tree. Inputs and resource values stay outside Git."""
import argparse
import hashlib
import json
from pathlib import Path


def unwrap(value):
    if isinstance(value,dict) and 'result' in value:
        value=value['result']
    if isinstance(value,list) and len(value)==1:
        value=value[0]
    if not isinstance(value,dict) or 'functions' not in value or 'resources' not in value:
        raise ValueError('Expected the structured row returned by public-snapshot.sql')
    return value


def tree(value,path='$'):
    kind='null' if value is None else 'boolean' if isinstance(value,bool) else 'object' if isinstance(value,dict) else 'array' if isinstance(value,list) else 'number' if isinstance(value,(int,float)) else 'string'
    result={path:kind}
    if isinstance(value,dict):
        for key in sorted(value):result.update(tree(value[key],path+'.'+key))
    elif isinstance(value,list):
        for i,item in enumerate(value):result.update(tree(item,path+f'[{i}]'))
    return result


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('before');parser.add_argument('after',nargs='?');parser.add_argument('--output',required=True)
    args=parser.parse_args()
    before=unwrap(json.loads(Path(args.before).read_text(encoding='utf-8')))
    after=unwrap(json.loads(Path(args.after).read_text(encoding='utf-8'))) if args.after else None
    rows=before['resources'] or []
    if not rows or any(not row['public_context'] for row in rows):raise ValueError('No complete least-privileged public projection')
    result={'volatile_payload_paths_ignored':[],'functions_sha256':digest(before['functions']),
        'resources':[{'id':r['id'],'object_type':r['object_type'],'sql_payload_md5':r['sql_payload_md5'],
        'payload_sha256':digest(r['payload']),'types':tree(r['payload']),
        'raw_sql_payload_md5':r.get('raw_sql_payload_md5'),
        'raw_types':tree(r['raw_payload']) if 'raw_payload' in r else None,
        'editor_legs':{k:{'present':k in (r.get('raw_payload') or {}),
          'type':tree((r.get('raw_payload') or {}).get(k))['$'] if k in (r.get('raw_payload') or {}) else 'absent'}
          for k in ['canonical_description','org_description']}} for r in rows]}
    if after:
        result['functions_equal']=before['functions']==after['functions']
        left={r['id']:r for r in rows};right={r['id']:r for r in after['resources'] or []}
        result['same_samples']=set(left)==set(right)
        result['differences']=[]
        for object_id in sorted(set(left)|set(right)):
            a=left.get(object_id);b=right.get(object_id)
            if a!=b:
                result['differences'].append({'id':object_id,'payload_equal':bool(a and b and a['payload']==b['payload']),
                    'types_equal':bool(a and b and tree(a['payload'])==tree(b['payload'])),
                    'raw_payload_equal':bool(a and b and a.get('raw_payload')==b.get('raw_payload')),
                    'raw_types_equal':bool(a and b and tree(a.get('raw_payload'))==tree(b.get('raw_payload')))})
        result['equal']=result['functions_equal'] and result['same_samples'] and not result['differences']
    Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'resources':len(rows),'functions':len(before['functions']),'equal':result.get('equal'),'values_printed':False}))
    if after and not result['equal']:raise SystemExit(1)


if __name__=='__main__':main()
