create schema storage_reservation_private authorization postgres;
create schema storage_reservation_api authorization postgres;

create function storage_reservation_private.valid_binding(b jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog,pg_temp as $body$
declare names text[]; k text;
begin
  if pg_catalog.jsonb_typeof(b) is distinct from 'object' then return false; end if;
  select pg_catalog.array_agg(x order by x) into names from pg_catalog.jsonb_object_keys(b) x;
  if names is distinct from array['bucket','document_id','epoch','key','manifest_sha256','mime',
    'namespace_id','object_id','payload_bytes','payload_sha256','project_ref',
    'source_fingerprint_sha256','storage_origin_sha256']::text[] then return false; end if;
  foreach k in array array['bucket','document_id','epoch','key','manifest_sha256','mime','namespace_id',
    'object_id','payload_sha256','project_ref','source_fingerprint_sha256','storage_origin_sha256'] loop
    if pg_catalog.jsonb_typeof(b->k) is distinct from 'string'
       or pg_catalog.octet_length(b->>k) <> pg_catalog.length(b->>k) then return false; end if;
  end loop;
  foreach k in array array['manifest_sha256','payload_sha256','source_fingerprint_sha256','storage_origin_sha256'] loop
    if (b->>k) !~ '^[a-f0-9]{64}$' then return false; end if;
  end loop;
  foreach k in array array['document_id','epoch','namespace_id'] loop
    if (b->>k) !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return false; end if;
  end loop;
  if (b->>'project_ref') !~ '^[a-z0-9]{20}$'
     or b->>'bucket' <> 'legal-documents'
     or (b->>'object_id') !~ '^[A-Z0-9]{16}$'
     or b->>'mime' not in ('application/pdf','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','image/heif')
     or pg_catalog.jsonb_typeof(b->'payload_bytes') is distinct from 'number'
     or (b->>'payload_bytes') !~ '^[1-9][0-9]{0,7}$' then return false; end if;
  if (b->>'payload_bytes')::bigint > 42305170 then return false; end if;
  -- Exact ASCII copy grammar, distinct from the research key profile.
  if (b->>'key') !~ '^[A-Za-z0-9._/-]+$' or pg_catalog.length(b->>'key') > 512
     or b->>'key' <> 'objects/'||(b->>'object_id')||'/'||(b->>'document_id') then return false; end if;
  return true;
end $body$;

create table storage_reservation_private.namespace (
  id uuid primary key,
  project_ref text not null,
  storage_origin_sha256 text not null check(storage_origin_sha256 ~ '^[a-f0-9]{64}$'),
  epoch uuid not null,
  manifest_sha256 text not null check(manifest_sha256 ~ '^[a-f0-9]{64}$'),
  bucket text not null check(bucket='legal-documents'),
  prefix text not null check(prefix='objects/'),
  active boolean not null default false
);
create table storage_reservation_private.admission (
  bucket text not null,
  object_key text not null,
  namespace_id uuid not null references storage_reservation_private.namespace(id) on delete restrict,
  binding jsonb not null check(storage_reservation_private.valid_binding(binding)),
  primary key(bucket,object_key),
  check(binding->>'bucket'=bucket and binding->>'key'=object_key and binding->>'namespace_id'=namespace_id::text)
);
create index admission_namespace_idx on storage_reservation_private.admission(namespace_id);
create table storage_reservation_private.reservation (
  bucket text not null,
  object_key text not null,
  receipt_id uuid not null unique default pg_catalog.gen_random_uuid(),
  binding jsonb not null check(storage_reservation_private.valid_binding(binding)),
  owner_sha256 bytea not null check(pg_catalog.octet_length(owner_sha256)=32),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  dispatch_started_at timestamptz,
  dispatch_attempt uuid,
  primary key(bucket,object_key),
  foreign key(bucket,object_key) references storage_reservation_private.admission(bucket,object_key) on delete restrict,
  check(binding->>'bucket'=bucket and binding->>'key'=object_key),
  check((dispatch_started_at is null)=(dispatch_attempt is null))
);

create function storage_reservation_private.deny_erasure() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $body$
begin raise exception using errcode='55000',message='permanent_registry'; end $body$;
create function storage_reservation_private.guard_namespace() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $body$
begin
  if (pg_catalog.to_jsonb(new)-'active') is distinct from (pg_catalog.to_jsonb(old)-'active')
     or (not old.active and new.active) then
    raise exception using errcode='55000',message='immutable_namespace';
  end if;
  return new;
end $body$;
create function storage_reservation_private.guard_reservation() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $body$
begin
  if (new.bucket,new.object_key,new.receipt_id,new.binding,new.owner_sha256,new.created_at)
       is distinct from (old.bucket,old.object_key,old.receipt_id,old.binding,old.owner_sha256,old.created_at)
     or (old.dispatch_started_at is not null and
       (new.dispatch_started_at,new.dispatch_attempt) is distinct from (old.dispatch_started_at,old.dispatch_attempt)) then
    raise exception using errcode='55000',message='immutable_reservation';
  end if;
  return new;
end $body$;
create trigger namespace_no_erasure before delete or truncate on storage_reservation_private.namespace
  for each statement execute function storage_reservation_private.deny_erasure();
create trigger admission_no_erasure before delete or truncate on storage_reservation_private.admission
  for each statement execute function storage_reservation_private.deny_erasure();
create trigger admission_no_rewrite before update on storage_reservation_private.admission
  for each statement execute function storage_reservation_private.deny_erasure();
create trigger reservation_no_erasure before delete or truncate on storage_reservation_private.reservation
  for each statement execute function storage_reservation_private.deny_erasure();
create trigger namespace_immutable before update on storage_reservation_private.namespace
  for each row execute function storage_reservation_private.guard_namespace();
create trigger reservation_immutable before update on storage_reservation_private.reservation
  for each row execute function storage_reservation_private.guard_reservation();

alter table storage_reservation_private.namespace enable row level security;
alter table storage_reservation_private.namespace force row level security;
alter table storage_reservation_private.admission enable row level security;
alter table storage_reservation_private.admission force row level security;
alter table storage_reservation_private.reservation enable row level security;
alter table storage_reservation_private.reservation force row level security;
create policy owner_only on storage_reservation_private.namespace to postgres using(true) with check(true);
create policy owner_only on storage_reservation_private.admission to postgres using(true) with check(true);
create policy owner_only on storage_reservation_private.reservation to postgres using(true) with check(true);

create function storage_reservation_private.require_admission(b jsonb, require_active boolean) returns void
language plpgsql set search_path=pg_catalog,pg_temp as $body$
begin
  if storage_reservation_private.valid_binding(b) is distinct from true then
    raise exception using errcode='22023',message='binding_refused';
  end if;
  perform n.id from storage_reservation_private.admission a
    join storage_reservation_private.namespace n on n.id=a.namespace_id
    where a.bucket=b->>'bucket' and a.object_key=b->>'key' and a.binding=b
      and n.project_ref=b->>'project_ref' and n.storage_origin_sha256=b->>'storage_origin_sha256'
      and n.epoch::text=b->>'epoch' and n.manifest_sha256=b->>'manifest_sha256'
      and n.bucket=b->>'bucket' and (not require_active or n.active)
    for share of n;
  if not found then raise exception using errcode='42501',message='admission_refused'; end if;
end $body$;

create function storage_reservation_api.reserve(b jsonb, owner_hash text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,pg_temp as $body$
declare r storage_reservation_private.reservation%rowtype;
begin
  perform storage_reservation_private.require_admission(b,true);
  if owner_hash is null or owner_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='owner_hash_refused';
  end if;
  insert into storage_reservation_private.reservation(bucket,object_key,binding,owner_sha256)
    values(b->>'bucket',b->>'key',b,pg_catalog.decode(owner_hash,'hex'))
    on conflict(bucket,object_key) do nothing returning * into r;
  if not found then
    select * into r from storage_reservation_private.reservation
      where bucket=b->>'bucket' and object_key=b->>'key';
  end if;
  if r.receipt_id is null or r.binding is distinct from b
     or r.owner_sha256 is distinct from pg_catalog.decode(owner_hash,'hex') then
    raise exception using errcode='42501',message='foreign_reservation';
  end if;
  return pg_catalog.jsonb_build_object('schema_version',1,'phase','reservation','may_post',false,
    'receipt_id',r.receipt_id::text,'binding',r.binding,
    'state',case when r.dispatch_started_at is null then 'reserved' else 'dispatch_started' end);
end $body$;

create function storage_reservation_api.claim(receipt uuid,b jsonb,owner_secret text,attempt uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,pg_temp as $body$
declare r storage_reservation_private.reservation%rowtype; h bytea;
begin
  perform storage_reservation_private.require_admission(b,true);
  if receipt is null or attempt is null or owner_secret is null or owner_secret !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='claim_shape_refused';
  end if;
  h:=pg_catalog.sha256(pg_catalog.decode(owner_secret,'hex'));
  update storage_reservation_private.reservation
    set dispatch_started_at=pg_catalog.clock_timestamp(),dispatch_attempt=attempt
    where receipt_id=receipt and binding=b and owner_sha256=h and dispatch_started_at is null
    returning * into r;
  if found then
    return pg_catalog.jsonb_build_object('schema_version',1,'phase','dispatch_granted','may_post',true,
      'receipt_id',r.receipt_id::text,'binding',r.binding,'attempt_id',attempt::text);
  end if;
  select * into r from storage_reservation_private.reservation where receipt_id=receipt and binding=b and owner_sha256=h;
  if not found then raise exception using errcode='42501',message='foreign_reservation'; end if;
  return pg_catalog.jsonb_build_object('schema_version',1,'phase','dispatch_denied','may_post',false,
    'receipt_id',r.receipt_id::text,'binding',r.binding,'attempt_id',attempt::text);
end $body$;

create function storage_reservation_api.inspect(receipt uuid,b jsonb,owner_secret text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,pg_temp as $body$
declare r storage_reservation_private.reservation%rowtype;
begin
  perform storage_reservation_private.require_admission(b,false);
  if receipt is null or owner_secret is null or owner_secret !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='inspection_shape_refused';
  end if;
  select * into r from storage_reservation_private.reservation
    where receipt_id=receipt and binding=b
      and owner_sha256=pg_catalog.sha256(pg_catalog.decode(owner_secret,'hex'));
  if not found then raise exception using errcode='42501',message='foreign_reservation'; end if;
  return pg_catalog.jsonb_build_object('schema_version',1,'phase','inspection','may_post',false,
    'receipt_id',r.receipt_id::text,'binding',r.binding,
    'state',case when r.dispatch_started_at is null then 'reserved' else 'dispatch_started' end);
end $body$;

revoke all on schema storage_reservation_private,storage_reservation_api from public,anon,authenticated,service_role;
revoke all on all tables in schema storage_reservation_private from public,anon,authenticated,service_role;
revoke all on all functions in schema storage_reservation_private,storage_reservation_api from public,anon,authenticated,service_role;
