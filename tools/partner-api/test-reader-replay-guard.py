"""Prove the historical aggregate cannot replace a served reader, even without -v ON_ERROR_STOP."""
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlparse


db_url = sys.argv[1] if len(sys.argv) == 2 else ""
target = urlparse(db_url)
if (target.scheme != "postgresql" or target.hostname not in ("127.0.0.1", "localhost")
        or target.port != 54322 or target.path != "/postgres" or target.username != "postgres"
        or target.password != "postgres" or target.query or target.fragment):
    raise SystemExit("Only the disposable localhost:54322/postgres database is accepted")
root = Path(__file__).resolve().parents[2]
env = dict(os.environ, PGOPTIONS="-c bertel.ephemeral_ci=on")
command = ["psql", "-X", "-qAt", "--dbname", db_url]
guard = (root / "Base de donnée DLL et API/tests/assert_partner_api_ephemeral.sql").read_text(encoding="utf-8")


def sql(source):
    result = subprocess.run(command + ["-v", "ON_ERROR_STOP=1"], input=source, text=True,
                            capture_output=True, env=env, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


sql(guard)
fingerprint = """
SELECT md5(string_agg(jsonb_build_array(n.nspname,p.oid,p.proowner,p.proacl,
 pg_get_functiondef(p.oid))::text,E'\n' ORDER BY p.oid))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN('api','internal','public') AND p.prokind IN('f','p');
"""
before = sql(fingerprint)
assert len(before) == 32, "Missing function fingerprint"
aggregate = root / "Base de donnée DLL et API/api_views_functions.sql"
for stop_on_error in ("1", "0"):
    result = subprocess.run(command + ["-v", "ON_ERROR_STOP=" + stop_on_error, "-f", str(aggregate)],
                            text=True, capture_output=True, env=env, timeout=30)
    assert "api_views_functions.sql is fresh-install only" in result.stderr, "Fresh-only guard did not fire"
    if stop_on_error == "1":
        assert result.returncode != 0, "Strict client did not report rejection"
    else:
        assert "current transaction is aborted" in result.stderr, "Permissive client escaped the failed transaction"
    assert sql(fingerprint) == before, "Function definitions, identities, owners or ACLs changed on replay"
    print("Historical aggregate replay rejected; all application functions and ACLs preserved (ON_ERROR_STOP=" + stop_on_error + ")")
