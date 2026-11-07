#!/usr/bin/env bash
set -euo pipefail

operator_image=$(docker image inspect --format '{{.Id}}' "${1:?operator image required}")
postgres_image=docker.io/library/postgres:17.11-alpine3.24@sha256:4717f90960a225c2d1c5dac50508c401230f693ff626e06e84e6db0a68ded508
good_host=db.aaaaaaaaaaaaaaaaaaaa.supabase.co
bad_host=db.bbbbbbbbbbbbbbbbbbbb.supabase.co
password=db07-synthetic-password
umask 077
fixture=$(mktemp -d)
network_id=
db_id=
cleanup() {
  set +e
  if [[ -n "$db_id" ]]; then docker rm -fv "$db_id" >/dev/null; fi
  if [[ -n "$network_id" ]]; then docker network rm "$network_id" >/dev/null; fi
  rm -rf -- "$fixture"
}
trap cleanup EXIT
mkdir -m 0755 "$fixture/client" "$fixture/server"

printf '[req]\ndistinguished_name=dn\n[dn]\n' > "$fixture/openssl.cnf"
for ca in trusted untrusted; do
  openssl req -config "$fixture/openssl.cnf" -x509 -newkey rsa:2048 -nodes -days 1 \
    -subj "/CN=DB07 synthetic $ca CA" -addext 'basicConstraints=critical,CA:TRUE' \
    -addext 'keyUsage=critical,keyCertSign,cRLSign' -addext 'subjectKeyIdentifier=hash' -keyout "$fixture/$ca.key" \
    -out "$fixture/client/$ca.pem" 2>/dev/null
done
openssl req -config "$fixture/openssl.cnf" -new -newkey rsa:2048 -nodes -subj "/CN=$good_host" \
  -keyout "$fixture/server/server.key" -out "$fixture/server.csr" 2>/dev/null
printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nauthorityKeyIdentifier=keyid\nsubjectAltName=DNS:%s\n' \
  "$good_host" > "$fixture/leaf.ext"
openssl x509 -req -days 1 -in "$fixture/server.csr" -extfile "$fixture/leaf.ext" \
  -CA "$fixture/client/trusted.pem" -CAkey "$fixture/trusted.key" -set_serial 1 \
  -out "$fixture/server/server.pem"
openssl verify -x509_strict -purpose sslserver -verify_hostname "$good_host" \
  -CAfile "$fixture/client/trusted.pem" "$fixture/server/server.pem" >/dev/null
chmod 0644 "$fixture/client/trusted.pem" "$fixture/client/untrusted.pem"
printf '%s:5432:postgres:postgres:%s\n' "$good_host" "$password" "$bad_host" "$password" > "$fixture/client/pgpass"
sudo -n chown 1000:1000 "$fixture/client/pgpass"

network_id=$(docker network create --internal "db07-tls-${fixture##*.}")
db_id=$(docker run -d --platform linux/amd64 --network "$network_id" \
  --network-alias "$good_host" --network-alias "$bad_host" \
  -e "POSTGRES_PASSWORD=$password" -e POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 \
  --mount "type=bind,source=$fixture/server,target=/tls-input,readonly" \
  --entrypoint /bin/sh "$postgres_image" -eu -c '
    mkdir -m 0700 /tmp/db07-tls
    chown postgres:postgres /tmp/db07-tls
    install -m 0600 -o postgres -g postgres /tls-input/server.key /tmp/db07-tls/server.key
    install -m 0644 -o postgres -g postgres /tls-input/server.pem /tmp/db07-tls/server.pem
    exec docker-entrypoint.sh postgres -c ssl=on -c ssl_key_file=/tmp/db07-tls/server.key \
      -c ssl_cert_file=/tmp/db07-tls/server.pem
  ')
for ((attempt = 0; attempt < 25; attempt++)); do
  if docker exec "$db_id" pg_isready -q -h 127.0.0.1 -d postgres -U postgres -t 1; then break; fi
  sleep 1
done
docker exec "$db_id" pg_isready -q -h 127.0.0.1 -d postgres -U postgres -t 1

docker run --rm -i --pull never --network "$network_id" --read-only --cap-drop ALL \
  --security-opt no-new-privileges \
  --mount "type=bind,source=$fixture/client,target=/tls,readonly" \
  --entrypoint /usr/bin/env "$operator_image" -i LC_ALL=C /usr/bin/python3 -I -B - "$good_host" "$bad_host" <<'PY'
import socket
import sys
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, "/operator/tools/storage-reservation")
from copy_claim import CopySqlClient, Refused, subprocess

good_host, bad_host = sys.argv[1:]
assert socket.gethostbyname(good_host) == socket.gethostbyname(bad_host)
config = {
    "mode": "hosted", "host": good_host, "port": 5432,
    "database": "postgres", "user": "postgres", "sslmode": "verify-full",
    "sslrootcert": "/tls/trusted.pem", "password_file": "/tls/pgpass",
    "psql_bin": "/usr/libexec/postgresql17/psql",
}
expression = """pg_catalog.json_build_object(
    'role', current_user, 'database', pg_catalog.current_database(),
    'ssl', (SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid = pg_catalog.pg_backend_pid())
)"""
run_psql = subprocess.run
diagnostics = []

def observe_psql(command, **options):
    assert command[0] == config["psql_bin"] and options["env"]["PGSSLMODE"] == "verify-full"
    result = run_psql(command, **options)
    diagnostics.append(result.stderr)
    return result

with patch.object(subprocess, "run", side_effect=observe_psql):
    assert CopySqlClient(config).transaction(expression, uuid4().hex) == {
        "role": "postgres", "database": "postgres", "ssl": True,
    }
    for override, diagnostic in (
        ({"sslrootcert": "/tls/untrusted.pem"}, "certificate verify failed"),
        ({"host": bad_host}, "does not match host name"),
    ):
        try:
            CopySqlClient(config | override).transaction(expression, uuid4().hex)
        except Refused as error:
            assert str(error) == "copy_database_result_unknown" and diagnostic in diagnostics[-1]
        else:
            raise AssertionError("invalid TLS peer was accepted")
assert len(diagnostics) == 3
print("DB07 TLS smoke: verified connection and COMMIT; wrong CA and hostname refused")
PY
