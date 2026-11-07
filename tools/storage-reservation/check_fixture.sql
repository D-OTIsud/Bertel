-- Fixture-only effective privilege postcondition. No mutation; fail closed.
do $check$
declare r record; principal text; privilege text; owner_oid oid;
begin
  select oid into strict owner_oid from pg_catalog.pg_roles where rolname='storage_reservation_owner'
    and not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb;
  if exists(select 1 from pg_catalog.pg_auth_members where member=owner_oid)
     or exists(select 1 from pg_catalog.pg_roles where rolname='service_role' and
       (rolsuper or rolcreaterole or rolcreatedb or rolcanlogin or not rolbypassrls)) then
    raise exception using errcode='55000',message='role_boundary';
  end if;
  foreach principal in array array['anon','authenticated','fixture_publisher','service_role','fixture_client'] loop
    -- MEMBER is transitive even when NOINHERIT would hide effective USAGE.
    if pg_catalog.pg_has_role(principal,owner_oid,'MEMBER') then
      raise exception using errcode='55000',message='owner_membership';
    end if;
    for r in select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='storage_reservation_private' and c.relkind='r' loop
      foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
        if pg_catalog.has_table_privilege(principal,r.oid,privilege) then
          raise exception using errcode='55000',message='direct_table_grant';
        end if;
      end loop;
      foreach privilege in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
        if pg_catalog.has_any_column_privilege(principal,r.oid,privilege) then
          raise exception using errcode='55000',message='direct_column_grant';
        end if;
      end loop;
    end loop;
    if pg_catalog.has_schema_privilege(principal,'storage_reservation_private','USAGE')
       or pg_catalog.has_schema_privilege(principal,'storage_reservation_private','CREATE')
       or pg_catalog.has_schema_privilege(principal,'storage_reservation_api','CREATE')
       or pg_catalog.has_schema_privilege(principal,'storage_reservation_api','USAGE')
          is distinct from (principal='service_role') then
      raise exception using errcode='55000',message='schema_boundary';
    end if;
    for r in select p.oid,n.nspname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('storage_reservation_api','storage_reservation_private') loop
      if pg_catalog.has_function_privilege(principal,r.oid,'EXECUTE') is distinct from
        (principal='service_role' and r.nspname='storage_reservation_api') then
        raise exception using errcode='55000',message='function_boundary';
      end if;
    end loop;
  end loop;
  if exists(select 1 from pg_catalog.pg_namespace n
      cross join lateral pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
      where n.nspname in ('storage_reservation_api','storage_reservation_private') and
       (n.nspowner<>owner_oid or (a.grantee<>owner_oid and not
         (n.nspname='storage_reservation_api' and a.grantee='service_role'::regrole::oid
           and a.privilege_type='USAGE' and not a.is_grantable))))
     or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
       where n.nspname='storage_reservation_private' and c.relkind='r' and a.grantee<>owner_oid)
     or exists(select 1 from pg_catalog.pg_attribute t join pg_catalog.pg_class c on c.oid=t.attrelid
       join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       cross join lateral pg_catalog.aclexplode(t.attacl) a
       where n.nspname='storage_reservation_private' and a.grantee<>owner_oid) then
    raise exception using errcode='55000',message='exact_schema_table_column_acl';
  end if;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='storage_reservation_api')<>3
     or pg_catalog.to_regprocedure('storage_reservation_api.reserve(jsonb,text)') is null
     or pg_catalog.to_regprocedure('storage_reservation_api.claim(uuid,jsonb,text,uuid)') is null
     or pg_catalog.to_regprocedure('storage_reservation_api.inspect(uuid,jsonb,text)') is null
     or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname in ('storage_reservation_api','storage_reservation_private') and
        (p.proowner<>owner_oid or p.proconfig is distinct from array['search_path=pg_catalog']::text[]
          or p.prosecdef is distinct from (n.nspname='storage_reservation_api')))
     or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
       where n.nspname in ('storage_reservation_api','storage_reservation_private') and
         (a.grantee not in (owner_oid,case when n.nspname='storage_reservation_api'
           then 'service_role'::regrole::oid else owner_oid end) or a.privilege_type<>'EXECUTE'
            or (a.grantee<>owner_oid and a.is_grantable))) then
    raise exception using errcode='55000',message='function_descriptor';
  end if;
  if (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='storage_reservation_private' and c.relkind='r')<>3
     or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where n.nspname='storage_reservation_private' and c.relkind='r' and
         (c.relowner<>owner_oid or not c.relrowsecurity or not c.relforcerowsecurity))
     or (select count(*) from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid=p.polrelid
       join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where n.nspname='storage_reservation_private' and p.polname='owner_only'
         and p.polcmd='*' and p.polpermissive and p.polroles=array[owner_oid]
         and pg_catalog.pg_get_expr(p.polqual,p.polrelid)='true'
         and pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)='true')<>3
     or (select count(*) from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid=p.polrelid
       join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where n.nspname='storage_reservation_private')<>3 then
    raise exception using errcode='55000',message='table_owner_rls';
  end if;
end $check$;
select 'effective_acl_ok';
