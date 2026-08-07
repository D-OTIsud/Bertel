-- CRM actors may exist before an establishment does. This migration gives those
-- prospects an owning CRM organisation, a default role, and a private document
-- staging library whose files can later be promoted to object_document.

begin;

alter table public.actor
  add column if not exists crm_owner_org_id text,
  add column if not exists default_role_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'actor_crm_owner_org_id_fkey'
      and conrelid = 'public.actor'::regclass
  ) then
    alter table public.actor
      add constraint actor_crm_owner_org_id_fkey
      foreign key (crm_owner_org_id) references public.object(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'actor_default_role_id_fkey'
      and conrelid = 'public.actor'::regclass
  ) then
    alter table public.actor
      add constraint actor_default_role_id_fkey
      foreign key (default_role_id) references public.ref_actor_role(id) on delete restrict;
  end if;
end $$;

create index if not exists idx_actor_crm_owner_org on public.actor (crm_owner_org_id);
create index if not exists idx_actor_default_role on public.actor (default_role_id);

-- Existing linked actors inherit a stable default from their primary/first link.
update public.actor a
set default_role_id = (
  select ar.role_id
  from public.actor_object_role ar
  where ar.actor_id = a.id
  order by ar.is_primary desc nulls last, ar.created_at, ar.role_id
  limit 1
)
where a.default_role_id is null
  and exists (select 1 from public.actor_object_role ar where ar.actor_id = a.id);

-- crm_private documents are never emitted as public URLs. Access is mediated by
-- CRM RPCs and authenticated server routes which mint short-lived signed URLs.
alter table public.ref_document
  drop constraint if exists chk_ref_document_access_scope;
alter table public.ref_document
  add constraint chk_ref_document_access_scope
  check (access_scope = any (array['public'::text, 'legal_private'::text, 'crm_private'::text]));

create table if not exists public.actor_document (
  actor_id uuid not null references public.actor(id) on delete cascade,
  document_id uuid not null references public.ref_document(id) on delete cascade,
  title text,
  notes text,
  intended_role_id uuid references public.ref_code_document_type(id) on delete set null,
  valid_from date,
  valid_to date,
  position integer not null default 1 check (position > 0),
  status text not null default 'active'
    check (status = any (array['active'::text, 'promoted'::text, 'archived'::text])),
  promoted_to_object_id text references public.object(id) on delete set null,
  promoted_document_id uuid references public.ref_document(id) on delete set null,
  promoted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (actor_id, document_id),
  constraint actor_document_validity_check
    check (valid_to is null or valid_from is null or valid_to >= valid_from),
  constraint actor_document_promotion_check
    check (status <> 'promoted' or (promoted_to_object_id is not null and promoted_document_id is not null and promoted_at is not null))
);

create index if not exists idx_actor_document_actor_status
  on public.actor_document (actor_id, status, position, created_at);
create index if not exists idx_actor_document_document
  on public.actor_document (document_id);
create index if not exists idx_actor_document_intended_role
  on public.actor_document (intended_role_id);
create index if not exists idx_actor_document_promoted_object
  on public.actor_document (promoted_to_object_id) where promoted_to_object_id is not null;
create index if not exists idx_actor_document_promoted_document
  on public.actor_document (promoted_document_id) where promoted_document_id is not null;
create index if not exists idx_actor_document_created_by
  on public.actor_document (created_by) where created_by is not null;

drop trigger if exists update_actor_document_updated_at on public.actor_document;
create trigger update_actor_document_updated_at
before update on public.actor_document
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_audit_actor_document on public.actor_document;
create trigger trg_audit_actor_document
after update or delete on public.actor_document
for each row execute function audit.log_row_changes();

alter table public.actor_document enable row level security;
drop policy if exists admin_read_actor_document on public.actor_document;
drop policy if exists admin_ins_actor_document on public.actor_document;
drop policy if exists admin_upd_actor_document on public.actor_document;
drop policy if exists admin_del_actor_document on public.actor_document;
create policy admin_read_actor_document on public.actor_document for select
  using ((select auth.role()) = any (array['service_role'::text, 'admin'::text]));
create policy admin_ins_actor_document on public.actor_document for insert
  with check ((select auth.role()) = any (array['service_role'::text, 'admin'::text]));
create policy admin_upd_actor_document on public.actor_document for update
  using ((select auth.role()) = any (array['service_role'::text, 'admin'::text]))
  with check ((select auth.role()) = any (array['service_role'::text, 'admin'::text]));
create policy admin_del_actor_document on public.actor_document for delete
  using ((select auth.role()) = any (array['service_role'::text, 'admin'::text]));

revoke all on table public.actor_document from public, anon, authenticated;
grant select, insert, update, delete on table public.actor_document to service_role;

-- Private bucket: browser roles cannot read, list or write directly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'actor-documents', 'actor-documents', false, 5242880,
  array['application/pdf', 'image/jpeg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists actor_documents_service_role_all on storage.objects;
create policy actor_documents_service_role_all
  on storage.objects for all to service_role
  using (bucket_id = 'actor-documents')
  with check (bucket_id = 'actor-documents');

drop policy if exists actor_documents_no_direct_access on storage.objects;
create policy actor_documents_no_direct_access
  on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'actor-documents')
  with check (bucket_id <> 'actor-documents');

-- Prospects without object links remain scoped to the active CRM organisation.
create or replace function api.current_user_crm_actor_ids()
returns setof uuid
language sql stable security definer
set search_path = public, api, auth
as $$
  select ar.actor_id
  from public.actor_object_role ar
  where ar.object_id in (select api.current_user_crm_object_ids())
  union
  select ci.actor_id
  from public.crm_interaction ci
  where ci.actor_id is not null
    and ci.object_id in (select api.current_user_crm_object_ids())
  union
  select a.id
  from public.actor a
  where a.crm_owner_org_id = (select api.current_user_org_id());
$$;

revoke all on function api.current_user_crm_actor_ids() from public, anon;
grant execute on function api.current_user_crm_actor_ids() to authenticated, service_role;

-- The existing superuser branch only includes actors with a link or interaction. Keep it as
-- the scoped implementation, then append truly unattached project actors for superusers too.
do $migration$
begin
  if to_regprocedure('api.list_crm_directory_linked(text,text,timestamp with time zone,timestamp with time zone,text)') is null then
    alter function api.list_crm_directory(text, text, timestamptz, timestamptz, text)
      rename to list_crm_directory_linked;
  end if;
end
$migration$;

revoke all on function api.list_crm_directory_linked(text, text, timestamptz, timestamptz, text)
  from public, anon, authenticated;

create or replace function api.list_crm_directory(
  p_topic_code text default null,
  p_status text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_search text default null
) returns jsonb
language plpgsql stable security definer
set search_path = public, api, auth, extensions
as $$
declare
  v_items jsonb;
  v_projects jsonb;
  v_search text := case when length(btrim(coalesce(p_search, ''))) >= 2
                        then immutable_unaccent(lower(btrim(p_search))) end;
begin
  v_items := api.list_crm_directory_linked(p_topic_code, p_status, p_from, p_to, p_search);
  if not api.is_platform_superuser()
     or p_topic_code is not null or p_status is not null or p_from is not null or p_to is not null then
    return v_items;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'actor_id', a.id,
    'display_name', a.display_name,
    'photo_url', a.photo_url,
    'objects', '[]'::jsonb,
    'object_count', 0,
    'interaction_count', 0,
    'interactions_12m', 0,
    'last_interaction_at', null,
    'last_interaction_type', null,
    'last_interaction_subject', null,
    'last_interaction_object_name', null,
    'top_topics', '[]'::jsonb
  ) order by a.created_at desc), '[]'::jsonb)
  into v_projects
  from public.actor a
  where not exists (select 1 from public.actor_object_role ar where ar.actor_id = a.id)
    and not exists (select 1 from public.crm_interaction ci where ci.actor_id = a.id)
    and (
      v_search is null
      or a.display_name_normalized like '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
      or a.first_name_normalized like '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
      or a.last_name_normalized like '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
      or exists (
        select 1 from public.actor_channel ac
        where ac.actor_id = a.id and lower(ac.value) like '%' || lower(btrim(p_search)) || '%'
      )
    );

  return coalesce(v_items, '[]'::jsonb) || v_projects;
end;
$$;

revoke all on function api.list_crm_directory(text, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function api.list_crm_directory(text, text, timestamptz, timestamptz, text)
  to authenticated, service_role;

-- INSERT now accepts a missing object_id. default_role_id preserves the intended
-- business role until the first establishment is created/linked.
create or replace function api.save_crm_actor(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public, api, auth
as $$
declare
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_display_name text := nullif(btrim(coalesce(p_payload->>'display_name','')),'');
  v_object_id text := nullif(btrim(coalesce(p_payload->>'object_id','')),'');
  v_role_code text := nullif(btrim(coalesce(p_payload->>'role_code','')),'');
  v_role_id uuid;
  v_owner_org_id text := api.current_user_org_id();
begin
  if v_id is not null then
    if not exists (select 1 from public.actor where id = v_id) then
      raise exception 'actor inconnu: %', v_id using errcode = 'P0002';
    end if;
    if not api.user_can_write_crm_actor(v_id) then
      raise exception 'Écriture CRM non autorisée' using errcode = '42501';
    end if;
    if p_payload ? 'display_name' and v_display_name is null then
      raise exception 'display_name requis' using errcode = '22023';
    end if;
    if p_payload ? 'role_code' then
      if v_role_code is null then
        raise exception 'role_code requis' using errcode = '22023';
      end if;
      select id into v_role_id from public.ref_actor_role where code = v_role_code;
      if v_role_id is null then
        raise exception 'role_code inconnu: %', v_role_code using errcode = '22023';
      end if;
    end if;
    update public.actor set
      display_name = case when p_payload ? 'display_name' then v_display_name else display_name end,
      first_name = case when p_payload ? 'first_name' then nullif(p_payload->>'first_name','') else first_name end,
      last_name = case when p_payload ? 'last_name' then nullif(p_payload->>'last_name','') else last_name end,
      gender = case when p_payload ? 'gender' then nullif(p_payload->>'gender','') else gender end,
      photo_url = case when p_payload ? 'photo_url' then nullif(p_payload->>'photo_url','') else photo_url end,
      default_role_id = case when p_payload ? 'role_code' then v_role_id else default_role_id end,
      updated_by = auth.uid(),
      updated_at = now()
    where id = v_id;
    return jsonb_build_object('id', v_id);
  end if;

  if v_display_name is null then
    raise exception 'display_name requis' using errcode = '22023';
  end if;
  v_role_code := coalesce(v_role_code, 'operator');
  select id into v_role_id from public.ref_actor_role where code = v_role_code;
  if v_role_id is null then
    raise exception 'role_code inconnu: %', v_role_code using errcode = '22023';
  end if;

  if v_object_id is not null then
    if not api.user_can_write_crm(v_object_id) then
      raise exception 'Écriture CRM non autorisée sur cet établissement' using errcode = '42501';
    end if;
  elsif not api.is_platform_superuser() and (
    v_owner_org_id is null
    or not (api.user_has_permission('write_crm_notes') or api.current_user_admin_rank() is not null)
  ) then
    raise exception 'Création d''un acteur en projet non autorisée' using errcode = '42501';
  end if;

  v_id := gen_random_uuid();
  insert into public.actor (
    id, display_name, first_name, last_name, gender, photo_url,
    created_by, updated_by, crm_owner_org_id, default_role_id
  ) values (
    v_id, v_display_name, nullif(p_payload->>'first_name',''),
    nullif(p_payload->>'last_name',''), nullif(p_payload->>'gender',''),
    nullif(p_payload->>'photo_url',''), auth.uid(), auth.uid(),
    v_owner_org_id, v_role_id
  );

  if v_object_id is not null then
    insert into public.actor_object_role (actor_id, object_id, role_id, is_primary)
    values (
      v_id, v_object_id, v_role_id,
      not exists (
        select 1 from public.actor_object_role x
        where x.object_id = v_object_id and x.role_id = v_role_id and x.is_primary
      )
    );
  end if;
  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function api.save_crm_actor(jsonb) from public, anon;
grant execute on function api.save_crm_actor(jsonb) to authenticated, service_role;

-- Missing role_code inherits the actor's default role, then falls back to operator
-- for legacy actors created before this migration.
create or replace function api.link_actor_to_object(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public, api, auth
as $$
declare
  v_actor_id uuid := nullif(p_payload->>'actor_id','')::uuid;
  v_object_id text := nullif(btrim(coalesce(p_payload->>'object_id','')),'');
  v_role_code text := nullif(btrim(coalesce(p_payload->>'role_code','')),'');
  v_role_id uuid;
begin
  if v_actor_id is null then raise exception 'actor_id requis' using errcode = '22023'; end if;
  if v_object_id is null then raise exception 'object_id requis' using errcode = '22023'; end if;
  if not exists (select 1 from public.actor where id = v_actor_id) then
    raise exception 'actor inconnu: %', v_actor_id using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.object where id = v_object_id) then
    raise exception 'objet inconnu: %', v_object_id using errcode = 'P0002';
  end if;

  if v_role_code is null then
    select r.id, r.code into v_role_id, v_role_code
    from public.actor a join public.ref_actor_role r on r.id = a.default_role_id
    where a.id = v_actor_id;
  else
    select id into v_role_id from public.ref_actor_role where code = v_role_code;
  end if;
  if v_role_id is null then
    v_role_code := 'operator';
    select id into v_role_id from public.ref_actor_role where code = v_role_code;
  end if;
  if v_role_id is null then
    raise exception 'role_code inconnu: %', v_role_code using errcode = '22023';
  end if;
  if not api.user_can_write_crm(v_object_id) then
    raise exception 'Écriture CRM non autorisée sur cet établissement' using errcode = '42501';
  end if;

  insert into public.actor_object_role (actor_id, object_id, role_id, is_primary)
  values (
    v_actor_id, v_object_id, v_role_id,
    not exists (
      select 1 from public.actor_object_role x
      where x.object_id = v_object_id and x.role_id = v_role_id and x.is_primary
    )
  )
  on conflict (actor_id, object_id, role_id) do nothing;

  return jsonb_build_object(
    'actor_id', v_actor_id, 'object_id', v_object_id,
    'role_code', v_role_code, 'linked', found
  );
end;
$$;

revoke all on function api.link_actor_to_object(jsonb) from public, anon;
grant execute on function api.link_actor_to_object(jsonb) to authenticated, service_role;

create or replace function api.list_actor_support(p_actor_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, api, auth
as $$
declare
  v_role jsonb;
  v_documents jsonb;
begin
  if p_actor_id is null or not api.user_can_read_crm_actor(p_actor_id) then
    raise exception 'CRM non autorisé pour cet acteur' using errcode = '42501';
  end if;

  select case when r.id is null then null else jsonb_build_object('code', r.code, 'name', r.name) end
  into v_role
  from public.actor a
  left join public.ref_actor_role r on r.id = a.default_role_id
  where a.id = p_actor_id;

  select coalesce(jsonb_agg(item order by position, created_at desc), '[]'::jsonb)
  into v_documents
  from (
    select ad.position, ad.created_at,
      jsonb_build_object(
        'document_id', ad.document_id,
        'title', coalesce(ad.title, rd.title),
        'notes', ad.notes,
        'valid_from', ad.valid_from,
        'valid_to', ad.valid_to,
        'status', ad.status,
        'intended_role_code', dt.code,
        'intended_role_name', dt.name,
        'mime_type', rd.extra->>'mime_type',
        'size_bytes', coalesce((rd.extra->>'size_bytes')::bigint, 0),
        'promoted_to_object_id', ad.promoted_to_object_id,
        'promoted_document_id', ad.promoted_document_id,
        'promoted_at', ad.promoted_at,
        'created_at', ad.created_at
      ) as item
    from public.actor_document ad
    join public.ref_document rd on rd.id = ad.document_id
    left join public.ref_code_document_type dt on dt.id = ad.intended_role_id
    where ad.actor_id = p_actor_id
  ) q;

  return jsonb_build_object('default_role', v_role, 'documents', v_documents);
end;
$$;

revoke all on function api.list_actor_support(uuid) from public, anon;
grant execute on function api.list_actor_support(uuid) to authenticated, service_role;

create or replace function api.save_actor_document(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = public, api, auth
as $$
declare
  v_actor_id uuid := nullif(p_payload->>'actor_id','')::uuid;
  v_document_id uuid := nullif(p_payload->>'document_id','')::uuid;
  v_role_code text := nullif(btrim(coalesce(p_payload->>'intended_role_code','')),'');
  v_role_id uuid;
begin
  if v_actor_id is null or v_document_id is null then
    raise exception 'actor_id et document_id requis' using errcode = '22023';
  end if;
  if not api.user_can_write_crm_actor(v_actor_id) then
    raise exception 'Écriture CRM non autorisée' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.actor_document
    where actor_id = v_actor_id and document_id = v_document_id
  ) then
    raise exception 'document acteur inconnu' using errcode = 'P0002';
  end if;
  if p_payload ? 'intended_role_code' and v_role_code is not null then
    select id into v_role_id
    from public.ref_code_document_type
    where code = v_role_code and is_active;
    if v_role_id is null then
      raise exception 'type de document inconnu: %', v_role_code using errcode = '22023';
    end if;
  end if;

  update public.actor_document set
    title = case when p_payload ? 'title' then nullif(btrim(p_payload->>'title'),'') else title end,
    notes = case when p_payload ? 'notes' then nullif(btrim(p_payload->>'notes'),'') else notes end,
    intended_role_id = case when p_payload ? 'intended_role_code' then v_role_id else intended_role_id end,
    valid_from = case when p_payload ? 'valid_from' then nullif(p_payload->>'valid_from','')::date else valid_from end,
    valid_to = case when p_payload ? 'valid_to' then nullif(p_payload->>'valid_to','')::date else valid_to end,
    position = case when p_payload ? 'position' then greatest((p_payload->>'position')::integer, 1) else position end
  where actor_id = v_actor_id and document_id = v_document_id;

  return jsonb_build_object('actor_id', v_actor_id, 'document_id', v_document_id);
end;
$$;

revoke all on function api.save_actor_document(jsonb) from public, anon;
grant execute on function api.save_actor_document(jsonb) to authenticated, service_role;

comment on column public.actor.crm_owner_org_id is
  'Organisation CRM propriétaire des acteurs sans établissement (prospects/projets).';
comment on column public.actor.default_role_id is
  'Rôle métier par défaut, repris lors du premier rattachement établissement.';
comment on table public.actor_document is
  'Bibliothèque privée de documents d’accompagnement d’un acteur, avec préparation puis promotion vers object_document.';

commit;
