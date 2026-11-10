"""Reduced PostgreSQL 17 proof on a newly provisioned temporary cluster only.

Never accepts a DSN, port, existing data directory or database. Uses original
activation/reader bodies and the prepared activation patch; does not execute the
full publication kernel. The complete fresh-apply suite remains necessary.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time

import psycopg2


ROOT = Path(__file__).resolve().parents[2]
BIN = Path("C:/Program Files/PostgreSQL/17/bin")
if not (BIN / "initdb.exe").is_file():
    raise SystemExit("This proof requires the explicitly installed local PostgreSQL 17 binaries.")
# Refuse libpq ambient configuration rather than adopting any existing target.
if any(key.startswith("PG") for key in os.environ):
    raise SystemExit("Run with a clean environment containing no PG-prefixed settings.")


def block(source, start, end):
    return source[source.index(start):source.index(end, source.index(start)) + len(end)]


base = (ROOT / "supabase/migrations/20261106112948_thesaurus_publication.sql").read_text(encoding="utf-8")
prepared = (ROOT / "supabase/migrations/20261106160017_thesaurus_prepared_publication.sql").read_text(encoding="utf-8")
migration = (ROOT / "Base de donnée DLL et API/thesaurus_domain_metadata_localization.sql").read_text(encoding="utf-8")
labels = json.loads((ROOT / "tools/thesaurus-content/domain-labels.i18n.json").read_text(encoding="utf-8"))
activate_sql = block(base, "CREATE OR REPLACE FUNCTION thesaurus.activate(", "END $$;")
reader_sql = block(base, "CREATE OR REPLACE FUNCTION thesaurus.public_dispatch(", "END $$;")
prepared_sql = block(prepared, "DO $prepared_activation$", "END $prepared_activation$;")

with tempfile.TemporaryDirectory(prefix="bertel-domain-metadata-pg17-") as folder:
    folder = Path(folder)
    data = folder / "data"
    logfile = folder / "server.log"
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    def command(*args):
        capture = args[0] != "pg_ctl.exe"
        return subprocess.run([str(BIN / args[0]), *args[1:]], check=True,
                              stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                              stderr=subprocess.PIPE if capture else subprocess.DEVNULL,
                              text=True, timeout=30,
                              creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    command("initdb.exe", "-D", str(data), "-U", "fixture_admin", "-A", "trust", "--no-locale", "-E", "UTF8")
    control = command("pg_controldata.exe", str(data)).stdout
    system_id = re.search(r"Database system identifier:\s+(\d+)", control).group(1)
    started = False
    connections = []
    try:
        started = True
        command("pg_ctl.exe", "-D", str(data), "-l", str(logfile), "-o",
                f"-h 127.0.0.1 -p {port}", "-w", "start")
        def connect():
            connection = psycopg2.connect(host="127.0.0.1", port=port, dbname="postgres",
                                          user="fixture_admin", connect_timeout=5,
                                          options="-c statement_timeout=10000")
            connections.append(connection)
            with connection.cursor() as cursor:
                cursor.execute("SET TRANSACTION READ ONLY")
                cursor.execute("SELECT current_setting('data_directory'),system_identifier::text,inet_server_addr()::text,inet_server_port() FROM pg_control_system()")
                directory, actual_id, address, actual_port = cursor.fetchone()
                assert Path(directory).resolve() == data.resolve()
                assert (actual_id, address, actual_port) == (system_id, "127.0.0.1/32", port) or (
                    actual_id, address, actual_port) == (system_id, "127.0.0.1", port)
            connection.rollback()
            return connection
        admin = connect()
        def sql(connection, query, params=None):
            with connection.cursor() as cursor:
                cursor.execute(query, params)
                return cursor.fetchone()[0] if cursor.description else None
        sql(admin, """
          CREATE ROLE fixture_migrator NOLOGIN NOSUPERUSER NOCREATEROLE;
          CREATE ROLE bertel_thesaurus_publisher NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
          GRANT bertel_thesaurus_publisher TO fixture_migrator WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
          GRANT CREATE ON DATABASE postgres TO fixture_migrator;
          GRANT CREATE ON SCHEMA public TO fixture_migrator;
          SET ROLE fixture_migrator;
          GRANT bertel_thesaurus_publisher TO fixture_migrator WITH ADMIN FALSE, INHERIT FALSE, SET FALSE GRANTED BY fixture_migrator;
          CREATE SCHEMA thesaurus;
          CREATE TABLE thesaurus.vocabulary(domain text PRIMARY KEY,name text NOT NULL,source_kind text NOT NULL,updated_at timestamptz,is_public boolean DEFAULT true,is_governed boolean DEFAULT true);
          CREATE TABLE thesaurus.revision(status text);
          CREATE TABLE thesaurus.instance(singleton boolean,current_release_id bigint,base_uri text,license text,attribution text);
          CREATE TABLE thesaurus.release(release_id bigint,previous_release_id bigint,manifest jsonb,checksum text);
          CREATE TABLE public.ref_code_domain_registry(domain text,name text,name_i18n jsonb,updated_at timestamptz);
          CREATE TABLE public.ref_catalog_registry(catalog_key text,label text,updated_at timestamptz);
          CREATE FUNCTION thesaurus.take_source_gate() RETURNS void LANGUAGE sql AS $$SELECT pg_advisory_xact_lock_shared(741126,2)$$;
          CREATE FUNCTION thesaurus.has_editorial_text(jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT coalesce(jsonb_typeof($1)='string' AND length(trim($1#>>'{}'))>0,false)$$;
        """)
        for domain, names in labels.items():
            sql(admin, "INSERT INTO thesaurus.vocabulary(domain,name,source_kind) VALUES(%s,%s,'ref_code')", (domain, names["fr"]))
        sql(admin, activate_sql)
        sql(admin, prepared_sql)
        sql(admin, reader_sql)
        assert sql(admin, "SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure") == "985839358c6e0d68eb7db280f42bb6ed"
        assert sql(admin, "SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='thesaurus.public_dispatch(text,bigint,jsonb)'::regprocedure") == "03fb8e96e1b55d8ed42ce2df19301942"
        sql(admin, "RESET ROLE; GRANT CREATE ON SCHEMA thesaurus TO bertel_thesaurus_publisher; ALTER FUNCTION thesaurus.activate(uuid[],text[],text,bigint,jsonb) OWNER TO bertel_thesaurus_publisher; REVOKE CREATE ON SCHEMA thesaurus FROM bertel_thesaurus_publisher; SET ROLE fixture_migrator")
        admin.commit()
        membership_query = "SELECT jsonb_agg(to_jsonb(m) ORDER BY member,grantor) FROM pg_auth_members m WHERE roleid='bertel_thesaurus_publisher'::regrole"
        memberships = sql(admin, membership_query)
        before_activate = sql(admin, "SELECT pg_get_functiondef('thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure)")
        admin.commit()
        sql(admin, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
        try:
            sql(admin, migration)
            raise AssertionError("Stale-snapshot isolation accepted")
        except psycopg2.Error as error:
            assert error.pgcode == "PT409"
            assert "READ COMMITTED" in error.diag.message_primary
            admin.rollback()
        sql(admin, migration)
        assert sql(admin, membership_query) == memberships
        assert sql(admin, "SELECT count(*) FROM thesaurus.vocabulary WHERE name_i18n IS NOT NULL") == 78
        admin.commit()
        after_activate = sql(admin, "SELECT pg_get_functiondef('thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure)")
        sql(admin, migration)
        assert sql(admin, membership_query) == memberships
        admin.commit()
        # Frozen reader metadata: old releases omit it, new releases return the
        # exact stored value even when live vocabulary metadata is subsequently edited.
        sql(admin, "INSERT INTO thesaurus.instance(singleton,current_release_id) VALUES(true,25); INSERT INTO thesaurus.release VALUES(25,24,'{\"domains\":[]}','concept-checksum')")
        assert "metadata_checksum" not in sql(admin, "SELECT thesaurus.public_dispatch('release',25,'{}')->'meta'")
        sql(admin, "UPDATE thesaurus.release SET manifest=manifest||'{\"metadata_checksum\":\"frozen-value\"}'")
        assert sql(admin, "SELECT thesaurus.public_dispatch('release',25,'{}')#>>'{meta,metadata_checksum}'") == "frozen-value"
        admin.commit()
        # A partial activation patch must be rejected rather than blessed as replay.
        new_update = re.search(r"new_update CONSTANT text := \$new\$(.*?)\$new\$;", migration, re.S).group(1)
        old_update = re.search(r"old_update CONSTANT text := \$old\$(.*?)\$old\$;", migration, re.S).group(1)
        sql(admin, "RESET ROLE")
        sql(admin, after_activate.replace(new_update, old_update))
        sql(admin, "SET ROLE fixture_migrator")
        try:
            sql(admin, migration)
            raise AssertionError("Partial patch accepted")
        except psycopg2.Error as error:
            assert "metadata patch drift" in error.diag.message_primary
            admin.rollback()
        # Rollback restores the complete function because corruption was local.
        assert sql(admin, "SELECT pg_get_functiondef('thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure)") == after_activate
        admin.commit()
        # Also restore the absent self-grant case exactly after a real replacement.
        sql(admin, "RESET ROLE")
        sql(admin, before_activate)
        sql(admin, "SET ROLE fixture_migrator; REVOKE bertel_thesaurus_publisher FROM fixture_migrator GRANTED BY fixture_migrator")
        admin.commit()
        absent_memberships = sql(admin, membership_query)
        sql(admin, migration)
        assert sql(admin, membership_query) == absent_memberships
        admin.commit()
        # Existing editor holds K1 and has not committed its new revision. The
        # migration must wait, then see and refuse that revision after the commit.
        editor = connect()
        migrator = connect()
        sql(editor, "SET ROLE fixture_migrator; SELECT pg_advisory_xact_lock_shared(741126,1)")
        def attempt_upgrade():
            try:
                sql(migrator, "SET ROLE fixture_migrator")
                sql(migrator, migration)
                return "unexpected success"
            except psycopg2.Error as error:
                migrator.rollback()
                return error.pgcode
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(attempt_upgrade)
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                waiting = sql(admin, "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='advisory' AND classid=741126 AND objid=1 AND NOT granted)", (migrator.get_backend_pid(),))
                admin.commit()
                if waiting:
                    break
                time.sleep(0.02)
            assert waiting, "Upgrade did not wait on the editor fence"
            assert not future.done()
            sql(editor, "INSERT INTO thesaurus.revision VALUES('draft')")
            editor.commit()
            assert future.result(timeout=5) == "PT409"
        print("PASS: real prepared kernel/reader MD5s; non-superuser replacement; exact two-grantor and absent-grant restoration; complete replay; partial rejection/rollback; frozen reader checksum; stale-isolation and concurrent draft refusal.")
    finally:
        for connection in connections:
            connection.close()
        if started and (data / "postmaster.pid").exists():
            command("pg_ctl.exe", "-D", str(data), "-m", "immediate", "-w", "stop")
