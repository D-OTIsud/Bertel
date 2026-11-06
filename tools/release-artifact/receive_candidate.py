"""Private Linux receiver. Verify only; never load or start a container."""
import base64
import datetime
import getpass
import hashlib
import http.client
import json
import multiprocessing
import os
import re
import secrets
import signal
import ssl
import stat
import struct
import sys
import urllib.parse
import warnings
import zipfile

MAX_ZIP = 305 * 1024 * 1024
MAX_GZIP = 300 * 1024 * 1024
MAX_IMAGE = 1024 * 1024 * 1024
MAX_MANIFEST = 65536
CHUNK = 65536
SOCKET_TIMEOUT = 15
NETWORK_DEADLINE = 300
WORKER_DEADLINE = 300
REPO = "D-OTIsud/Bertel"
SOURCE = "https://github.com/" + REPO
SCOPE = "No authenticated business, email, AI, document or Storage operation tested."
PARAM_KEYS = {
    "schema_version", "source_sha", "source_tree", "run_id", "run_attempt",
    "artifact_id", "zip_bytes", "zip_sha256", "manifest_sha256", "image_id",
    "image_size", "gzip_bytes", "gzip_sha256", "public_config_sha256", "download_hostname",
}


class Refused(Exception):
    """Only constant error codes may cross the CLI boundary."""


def require(condition, code):
    if not condition:
        raise Refused(code)


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "json_duplicate_key")
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(Refused("json_constant")))


def keys(value, expected, code):
    require(type(value) is dict and set(value) == set(expected), code)


def positive(value, maximum, code):
    require(type(value) is int and 0 < value <= maximum, code)


def hex_string(value, length):
    return type(value) is str and re.fullmatch("[a-f0-9]{%d}" % length, value) is not None


def validate_params(p):
    keys(p, PARAM_KEYS, "parameter_keys")
    require(type(p["schema_version"]) is int and p["schema_version"] == 1, "parameter_schema")
    for key in ("source_sha", "source_tree"):
        require(hex_string(p[key], 40), "parameter_source")
    for key in ("zip_sha256", "manifest_sha256", "gzip_sha256", "public_config_sha256"):
        require(hex_string(p[key], 64), "parameter_hash")
    require(type(p["image_id"]) is str and re.fullmatch(r"sha256:[a-f0-9]{64}", p["image_id"]), "parameter_image")
    for key in ("run_id", "run_attempt", "artifact_id"):
        require(type(p[key]) is str and re.fullmatch(r"[1-9][0-9]{0,19}", p[key]), "parameter_run")
    positive(p["zip_bytes"], MAX_ZIP, "parameter_zip_size")
    positive(p["gzip_bytes"], MAX_GZIP, "parameter_gzip_size")
    positive(p["image_size"], MAX_IMAGE, "parameter_image_size")
    require(p["gzip_bytes"] < p["zip_bytes"] <= p["gzip_bytes"] + MAX_MANIFEST + 16384,
            "parameter_zip_envelope")
    host = p["download_hostname"]
    require(type(host) is str and len(host) <= 253 and
            re.fullmatch(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.oaiusercontent\.com", host),
            "parameter_download_host")
    return p


def archive_name(p):
    return "bertel-" + p["source_sha"] + ".docker.tar.gz"


def validate_url(url, p):
    require(type(url) is str and 0 < len(url) <= 8192 and
            all(32 < ord(c) < 127 for c in url), "download_url")
    parsed = urllib.parse.urlsplit(url)
    require(parsed.scheme == "https" and parsed.netloc == p["download_hostname"] and
            parsed.hostname == p["download_hostname"] and parsed.username is None and
            parsed.password is None and not parsed.fragment and parsed.path.startswith("/") and
            not parsed.path.startswith("//") and bool(parsed.query), "download_url_target")
    return parsed.path + "?" + parsed.query


def read_hidden_url(p):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", getpass.GetPassWarning)
            value = getpass.getpass("Temporary connector URL (hidden): ")
    except getpass.GetPassWarning:
        raise Refused("terminal_noecho") from None
    validate_url(value, p)
    return value


def timestamp(value):
    require(type(value) is str and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", value), "manifest_timestamp")
    try:
        return datetime.datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        raise Refused("manifest_timestamp") from None


def validate_manifest(raw, p):
    require(0 < len(raw) <= MAX_MANIFEST and hashlib.sha256(raw).hexdigest() == p["manifest_sha256"], "manifest_hash")
    m = strict_json(raw)
    keys(m, {"schema_version", "source_sha", "source_tree", "image", "archive", "public_config_sha256",
             "public_config_captured_at", "smoke", "created_at", "run_id", "run_attempt", "repository",
             "registry_published", "deployed"}, "manifest_keys")
    require(type(m["schema_version"]) is int and m["schema_version"] == 1, "manifest_schema")
    require(all(type(m[k]) is str and m[k] == p[k] for k in
                ("source_sha", "source_tree", "run_id", "run_attempt", "public_config_sha256")), "manifest_target")
    require(m["repository"] == REPO and m["registry_published"] is False and m["deployed"] is False,
            "manifest_publication")
    captured, created = timestamp(m["public_config_captured_at"]), timestamp(m["created_at"])
    require(captured <= created, "manifest_timestamp_order")
    expected_image = {"id": p["image_id"], "size": p["image_size"], "platform": "linux/amd64",
                      "user": "node", "revision": p["source_sha"], "source": SOURCE}
    keys(m["image"], expected_image, "manifest_image_keys")
    require(type(m["image"]["size"]) is int and m["image"] == expected_image, "manifest_image")
    expected_archive = {"filename": archive_name(p), "bytes": p["gzip_bytes"], "sha256": p["gzip_sha256"]}
    keys(m["archive"], expected_archive, "manifest_archive_keys")
    require(type(m["archive"]["bytes"]) is int and m["archive"] == expected_archive, "manifest_archive")
    expected_smoke = {**expected_image, "health": True, "contract": "2/2", "public_config_matches": True,
                      "auth_gateway_reachable": True, "service_secret_supplied": False, "scope": SCOPE}
    keys(m["smoke"], expected_smoke, "manifest_smoke_keys")
    require(type(m["smoke"]["size"]) is int and m["smoke"] == expected_smoke and
            all(m["smoke"][k] is v for k, v in {
                "health": True, "public_config_matches": True, "auth_gateway_reachable": True,
                "service_secret_supplied": False}.items()), "manifest_smoke")
    return m


def bounded_copy(source, target, expected_bytes, expected_hash, code):
    count, h = 0, hashlib.sha256()
    while True:
        chunk = source.read(min(CHUNK, expected_bytes - count + 1))
        if not chunk:
            break
        count += len(chunk)
        require(count <= expected_bytes, code + "_size")
        h.update(chunk)
        if target is not None:
            target.write(chunk)
    require(count == expected_bytes, code + "_size")
    require(h.hexdigest() == expected_hash, code + "_hash")


def verify_bundle(outer, p, create_output):
    """No ZIP parser runs until the complete outer size/hash has matched."""
    outer.seek(0)
    bounded_copy(outer, None, p["zip_bytes"], p["zip_sha256"], "zip")
    outer.seek(0)
    with zipfile.ZipFile(outer, "r") as archive:
        infos = archive.infolist()
        require(len(infos) == 2 and {i.filename for i in infos} == {"manifest.json", archive_name(p)} and
                not archive.comment, "zip_members")
        for i in infos:
            require(i.filename == i.orig_filename and i.create_system == 3 and
                    stat.S_ISREG(i.external_attr >> 16) and not i.is_dir() and
                    not (i.flag_bits & ~(8 | 2048)) and not i.comment and
                    i.compress_type == zipfile.ZIP_STORED and i.compress_size == i.file_size,
                    "zip_member_type")
            # zipfile uses central-directory metadata. Refuse a conflicting local
            # encryption/compression flag or name rather than accepting ambiguity.
            outer.seek(i.header_offset)
            local = outer.read(30)
            require(len(local) == 30, "zip_local_header")
            fields = struct.unpack("<4s5H3L2H", local)
            require(fields[0] == b"PK\x03\x04" and fields[2] == i.flag_bits and
                    fields[3] == i.compress_type and fields[9] == len(i.filename.encode("ascii")) and
                    outer.read(fields[9]) == i.filename.encode("ascii"), "zip_local_header")
        manifest_info = archive.getinfo("manifest.json")
        require(0 < manifest_info.file_size <= MAX_MANIFEST and
                archive.getinfo(archive_name(p)).file_size == p["gzip_bytes"], "zip_member_size")
        with archive.open(manifest_info) as member:
            raw = member.read(MAX_MANIFEST + 1)
        manifest = validate_manifest(raw, p)
        with create_output("manifest.json") as output:
            output.write(raw)
            output.flush()
            os.fsync(output.fileno())
        with archive.open(archive_name(p)) as member, create_output(archive_name(p)) as output:
            require(member.read(3) == b"\x1f\x8b\x08", "gzip_header")
            member.seek(0)
            bounded_copy(member, output, p["gzip_bytes"], p["gzip_sha256"], "gzip")
            output.flush()
            os.fsync(output.fileno())
        return manifest


def _http_to_file(url, p, output):
    target = validate_url(url, p)
    # Construct directly: no urllib proxy/netrc handler and no environment TLS key logging.
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.load_default_certs()
    require(context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED and
            context.keylog_filename is None, "tls_configuration")
    connection = http.client.HTTPSConnection(p["download_hostname"], port=443,
                                             timeout=SOCKET_TIMEOUT, context=context)
    try:
        connection.request("GET", target, headers={"Accept": "application/zip", "Accept-Encoding": "identity",
                           "Connection": "close", "User-Agent": "bertel-private-receiver/1"})
        response = connection.getresponse()
        require(response.status == 200, "download_status")  # No redirects, including 302.
        headers = response.getheaders()
        lengths = [v for k, v in headers if k.lower() == "content-length"]
        require(len(lengths) == 1 and lengths[0] == str(p["zip_bytes"]), "download_length")
        require(not any(k.lower() == "transfer-encoding" for k, _ in headers) and
                all(v.lower() == "identity" for k, v in headers if k.lower() == "content-encoding"), "download_encoding")
        bounded_copy(response, output, p["zip_bytes"], p["zip_sha256"], "download")
        output.flush()
        os.fsync(output.fileno())
    finally:
        connection.close()


def _download_worker(send, fd, p, url):
    # Kernel disposition, not a Python handler: expiry terminates even a blocked
    # native/DNS call. Keep it armed through process exit, independently of the
    # parent. An orphan can remain only for the rest of this worker's deadline.
    signal.signal(signal.SIGALRM, signal.SIG_DFL)
    signal.pthread_sigmask(signal.SIG_UNBLOCK, {signal.SIGALRM})
    signal.setitimer(signal.ITIMER_REAL, WORKER_DEADLINE)
    try:
        with os.fdopen(os.dup(fd), "wb", buffering=0) as output:
            _http_to_file(url, p, output)
        send.send("ok")
    except BaseException as error:
        try:
            send.send(error.args[0] if type(error) is Refused else "download_failed")
        except BaseException:
            # A broken result pipe must not let multiprocessing print the raw
            # original HTTP exception through implicit exception chaining.
            pass
    finally:
        try:
            send.close()
        except BaseException:
            pass


def download(url, p, fd):
    # Fork passes URL in memory, never in OS argv/environment or a child command.
    # Parent deadline bounds DNS, TLS and trickling responses as well as body reads.
    context = multiprocessing.get_context("fork")
    receive, send = context.Pipe(duplex=False)
    worker = context.Process(target=_download_worker, args=(send, fd, p, url),
                             name="bertel-zip-download", daemon=True)
    try:
        worker.start()
        send.close()
        worker.join(NETWORK_DEADLINE)
        if worker.is_alive():
            worker.kill()
            worker.join(5)
            raise Refused("download_deadline")
        require(worker.exitcode != -signal.SIGALRM, "download_deadline")
        require(worker.exitcode == 0 and receive.poll(), "download_worker")
        result = receive.recv()
        require(result == "ok", result if type(result) is str and re.fullmatch(r"[a-z_]+", result)
                else "download_worker")
    finally:
        if worker.pid is not None and worker.is_alive():
            worker.kill()
            worker.join(5)
        receive.close()
        send.close()


def private_directory(fd, exact=False):
    info = os.fstat(fd)
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and
            (stat.S_IMODE(info.st_mode) == 0o700 if exact else not (info.st_mode & 0o022)), "directory_ownership")


def new_quarantine(p):
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    with _directory("/root", flags) as root:
        private_directory(root)
        try:
            os.mkdir("bertel-releases", mode=0o700, dir_fd=root)
        except FileExistsError:
            pass
        base = os.open("bertel-releases", flags, dir_fd=root)
    try:
        private_directory(base, exact=True)
        name = p["source_sha"] + "-" + p["run_id"] + "-" + secrets.token_hex(12)
        os.mkdir(name, mode=0o700, dir_fd=base)  # One exclusive attempt, never reuse.
        owned = os.open(name, flags, dir_fd=base)
        try:
            private_directory(owned, exact=True)
        except BaseException:
            os.close(owned)
            raise
        return owned, "/root/bertel-releases/" + name
    finally:
        os.close(base)


class _directory:
    def __init__(self, name, flags):
        self.fd = os.open(name, flags)
    def __enter__(self):
        return self.fd
    def __exit__(self, *unused):
        os.close(self.fd)


def exclusive(fd, name):
    require(name in {"artifact.zip", "manifest.json", "QUARANTINE.json", "FAILURE.json", "VERIFIED.pending.json"}
            or re.fullmatch(r"bertel-[a-f0-9]{40}\.docker\.tar\.gz", name), "output_name")
    opened = os.open(name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                     0o600, dir_fd=fd)
    info = os.fstat(opened)
    if not (stat.S_ISREG(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1):
        os.close(opened)
        raise Refused("output_ownership")
    return os.fdopen(opened, "w+b")


def write_receipt(fd, filename, value):
    with exclusive(fd, filename) as output:
        output.write((json.dumps(value, sort_keys=True, indent=2) + "\n").encode("utf-8"))
        output.flush()
        os.fsync(output.fileno())
    os.fsync(fd)


def publish_verified(fd, value):
    # Publish complete bytes atomically without overwriting or removing anything.
    write_receipt(fd, "VERIFIED.pending.json", value)
    os.link("VERIFIED.pending.json", "VERIFIED.json", src_dir_fd=fd, dst_dir_fd=fd,
            follow_symlinks=False)
    os.fsync(fd)


def main():
    folder, path = None, None
    try:
        require(sys.version_info >= (3, 8) and sys.platform.startswith("linux") and
                hasattr(os, "geteuid") and os.geteuid() == 0, "linux_root_required")
        require(len(sys.argv) == 3 and sys.argv[1] == "--params-b64", "arguments")
        require(len(sys.argv[2]) <= 16384, "parameter_size")
        p = validate_params(strict_json(base64.b64decode(sys.argv[2], validate=True)))
        os.umask(0o077)
        folder, path = new_quarantine(p)
        write_receipt(folder, "QUARANTINE.json", {"status": "quarantined", "expected": p})
        url = read_hidden_url(p)
        try:
            with exclusive(folder, "artifact.zip") as outer:
                download(url, p, outer.fileno())
                url = None
                verify_bundle(outer, p, lambda name: exclusive(folder, name))
        finally:
            url = None
        publish_verified(folder, {"status": "verified_archive_only", "expected": p,
                      "docker_action": False, "extracted": ["manifest.json", archive_name(p)]})
        print("VERIFIED archive only: " + path)
        return 0
    except BaseException as error:
        code = error.args[0] if type(error) is Refused else "io_or_input"
        if folder is not None:
            try:
                write_receipt(folder, "FAILURE.json", {"status": "quarantined", "code": code})
            except BaseException:
                pass
        print("REFUSED " + code + ("; quarantine: " + path if path else ""), file=sys.stderr)
        return 1
    finally:
        if folder is not None:
            os.close(folder)


if __name__ == "__main__":
    sys.exit(main())
