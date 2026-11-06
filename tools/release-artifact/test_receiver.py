"""Offline tests. No real network, Docker, /root write, or account credential."""
import contextlib
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import struct
import sys
import tempfile
import unittest
from unittest import mock
import warnings
import zipfile

import receive_candidate as r


def sha(data):
    return hashlib.sha256(data).hexdigest()


def make_bundle(change=None, extras=(), kind=stat.S_IFREG, compression=zipfile.ZIP_STORED,
                raw_change=None, gzip_change=None, zip_change=None):
    compressed = gzip.compress(b"synthetic image stream\n" * 200, mtime=0)
    p = {"schema_version": 1, "source_sha": "a" * 40, "source_tree": "b" * 40,
         "run_id": "12345", "run_attempt": "1", "artifact_id": "67890",
         "zip_bytes": 1, "zip_sha256": "0" * 64, "manifest_sha256": "0" * 64,
         "image_id": "sha256:" + "c" * 64, "image_size": 123456,
         "gzip_bytes": len(compressed), "gzip_sha256": sha(compressed),
         "public_config_sha256": "d" * 64,
         "download_hostname": "synthetic.oaiusercontent.com"}
    image = {"id": p["image_id"], "size": p["image_size"], "platform": "linux/amd64",
             "user": "node", "revision": p["source_sha"], "source": r.SOURCE}
    m = {"schema_version": 1, "source_sha": p["source_sha"], "source_tree": p["source_tree"],
         "image": image, "archive": {"filename": r.archive_name(p), "bytes": len(compressed), "sha256": sha(compressed)},
         "public_config_sha256": p["public_config_sha256"], "public_config_captured_at": "2026-11-06T18:17:00.527Z",
         "smoke": {**image, "health": True, "contract": "2/2", "public_config_matches": True,
                   "auth_gateway_reachable": True, "service_secret_supplied": False, "scope": r.SCOPE},
         "created_at": "2026-11-06T18:19:44.549Z", "run_id": p["run_id"], "run_attempt": "1",
         "repository": r.REPO, "registry_published": False, "deployed": False}
    if change:
        change(m)
    raw = json.dumps(m, indent=2).encode()
    if raw_change:
        raw = raw_change(raw)
    p["manifest_sha256"] = sha(raw)
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as z:
        for name, data in [("manifest.json", raw), (r.archive_name(p), gzip_change(compressed) if gzip_change else compressed), *extras]:
            entry = zipfile.ZipInfo(name)
            entry.create_system = 3
            entry.external_attr = (kind | 0o600) << 16
            entry.compress_type = compression
            z.writestr(entry, data)
    payload = archive.getvalue()
    if zip_change:
        payload = zip_change(payload)
    p["zip_bytes"], p["zip_sha256"] = len(payload), sha(payload)
    return p, payload, compressed


class OfflineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="bertel-receiver-owned-")
        self.folder = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

    def output(self, name):
        return (self.folder / name).open("xb")

    def verify(self, p, payload):
        return r.verify_bundle(io.BytesIO(payload), p, self.output)

    def test_real_file_extraction_matches_both_expected_bytes(self):
        p, payload, compressed = make_bundle()
        r.validate_params(p)
        self.verify(p, payload)
        self.assertEqual((self.folder / r.archive_name(p)).read_bytes(), compressed)
        self.assertEqual(sha((self.folder / "manifest.json").read_bytes()), p["manifest_sha256"])
        self.assertEqual(len(list(self.folder.iterdir())), 2)

    def test_outer_hash_or_size_is_checked_before_zip_parser(self):
        p, payload, _ = make_bundle()
        for changed in [payload[:-1], payload + b"extra", payload[:-1] + bytes([payload[-1] ^ 1])]:
            with self.subTest(length=len(changed)), mock.patch.object(r.zipfile, "ZipFile", side_effect=AssertionError("parser ran")):
                with self.assertRaises(r.Refused):
                    self.verify(p, changed)
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_manifest_hash_and_every_reviewed_identity_are_required(self):
        original, payload, _ = make_bundle()
        for key, value in {"manifest_sha256": "e" * 64, "source_sha": "e" * 40, "source_tree": "e" * 40,
                           "run_id": "987", "run_attempt": "2", "image_id": "sha256:" + "e" * 64,
                           "image_size": 123457, "gzip_sha256": "e" * 64,
                           "public_config_sha256": "e" * 64}.items():
            with self.subTest(key=key):
                p = {**original, key: value}
                with self.assertRaises(r.Refused):
                    self.verify(p, payload)
                self.assertEqual(list(self.folder.iterdir()), [])

    def test_complete_manifest_rejects_unknown_keys_and_forged_smoke(self):
        mutations = [lambda m: m.update(extra="forbidden"), lambda m: m.update(schema_version=True),
                     lambda m: m.update(repository="other/repo"), lambda m: m.update(registry_published=True),
                     lambda m: m.update(deployed=0), lambda m: m["image"].update(user="root"),
                     lambda m: m["image"].update(env={"credential": "forbidden"}),
                     lambda m: m["archive"].update(filename="../elsewhere"),
                     lambda m: m["smoke"].update(health=1), lambda m: m["smoke"].update(contract="1/1"),
                     lambda m: m["smoke"].update(service_secret_supplied=True),
                     lambda m: m["smoke"].update(auth_gateway_reachable=False),
                     lambda m: m.update(public_config_captured_at="2026-99-06T18:17:00.527Z")]
        for index, change in enumerate(mutations):
            with self.subTest(index=index):
                p, payload, _ = make_bundle(change=change)
                with self.assertRaises(r.Refused):
                    self.verify(p, payload)
                self.assertEqual(list(self.folder.iterdir()), [])

    def test_duplicate_json_key_is_not_silently_overwritten(self):
        p, payload, _ = make_bundle(raw_change=lambda raw: raw.replace(b'"schema_version": 1', b'"schema_version": 1, "schema_version": 1', 1))
        with self.assertRaisesRegex(r.Refused, "json_duplicate_key"):
            self.verify(p, payload)

    def test_zip_paths_extra_duplicate_directory_and_symlink_are_refused(self):
        cases = [{"extras": [("../escape", b"bad")]}, {"extras": [("/absolute", b"bad")]},
                 {"extras": [("manifest.json", b"duplicate")]},
                 {"kind": stat.S_IFLNK}, {"kind": stat.S_IFDIR}, {"compression": zipfile.ZIP_DEFLATED}]
        for case in cases:
            with self.subTest(case=case), warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                p, payload, _ = make_bundle(**case)
                with self.assertRaises(r.Refused):
                    self.verify(p, payload)
                self.assertEqual(list(self.folder.iterdir()), [])

    def test_encrypted_zip_flags_are_refused_before_opening_members(self):
        def encrypted(raw):
            data = bytearray(raw)
            for magic, offset in [(b"PK\x03\x04", 6), (b"PK\x01\x02", 8)]:
                start = 0
                while True:
                    index = data.find(magic, start)
                    if index < 0:
                        break
                    struct.pack_into("<H", data, index + offset, struct.unpack_from("<H", data, index + offset)[0] | 1)
                    start = index + 4
            return bytes(data)
        p, payload, _ = make_bundle(zip_change=encrypted)
        with self.assertRaisesRegex(r.Refused, "zip_member_type"):
            self.verify(p, payload)

    def test_local_header_cannot_hide_encryption_or_another_compression_method(self):
        for offset, value in [(6, 1), (8, 8)]:
            def local_change(raw):
                data = bytearray(raw)
                struct.pack_into("<H", data, offset, value)
                return bytes(data)
            with self.subTest(offset=offset):
                p, payload, _ = make_bundle(zip_change=local_change)
                with self.assertRaisesRegex(r.Refused, "zip_local_header"):
                    self.verify(p, payload)

    def test_gzip_mutation_leaves_quarantine_outputs_and_never_overwrites(self):
        p, payload, _ = make_bundle(gzip_change=lambda raw: raw[:-1] + bytes([raw[-1] ^ 1]))
        with self.assertRaisesRegex(r.Refused, "gzip_hash"):
            self.verify(p, payload)
        before = {f.name: f.read_bytes() for f in self.folder.iterdir()}
        self.assertEqual(set(before), {"manifest.json", r.archive_name(p)})
        with self.assertRaises(FileExistsError):
            self.verify(p, payload)
        self.assertEqual(before, {f.name: f.read_bytes() for f in self.folder.iterdir()})

    def test_gzip_zip_member_size_has_an_exact_bound(self):
        p, payload, _ = make_bundle()
        p["gzip_bytes"] += 1
        with self.assertRaisesRegex(r.Refused, "zip_member_size"):
            self.verify(p, payload)

    def test_input_parameters_have_closed_keys_types_and_bounds(self):
        p, _, _ = make_bundle()
        changes = [{"zip_bytes": r.MAX_ZIP + 1}, {"gzip_bytes": r.MAX_GZIP + 1}, {"image_size": r.MAX_IMAGE + 1},
                   {"zip_bytes": True}, {"artifact_id": "0"}, {"run_attempt": "01"}, {"source_sha": "unknown"},
                   {"download_hostname": "evil.invalid"}, {"download_hostname": "a.oaiusercontent.com:443"},
                   {"extra_secret": "not accepted"}]
        for change in changes:
            with self.subTest(change=change), self.assertRaises(r.Refused):
                r.validate_params({**p, **change})


    def test_only_exact_https_connector_host_is_accepted(self):
        p, _, _ = make_bundle()
        self.assertEqual(r.validate_url("https://synthetic.oaiusercontent.com/files/id/raw?sig=synthetic", p),
                         "/files/id/raw?sig=synthetic")
        for url in ["http://synthetic.oaiusercontent.com/files/id?sig=x",
                    "https://evil.oaiusercontent.com/files/id?sig=x",
                    "https://synthetic.oaiusercontent.com.evil.invalid/files/id?sig=x",
                    "https://user@synthetic.oaiusercontent.com/files/id?sig=x",
                    "https://synthetic.oaiusercontent.com:443/files/id?sig=x",
                    "https://synthetic.oaiusercontent.com/files/id?sig=x#fragment",
                    "https://synthetic.oaiusercontent.com/files/id?sig=x\n",
                    "https://synthetic.oaiusercontent.com//other?sig=x"]:
            with self.subTest(url=url), self.assertRaises(r.Refused):
                r.validate_url(url, p)

    def test_noecho_unavailable_aborts_instead_of_accepting_fallback_input(self):
        p, _, _ = make_bundle()
        def fallback(*args, **kwargs):
            warnings.warn("no echo-free terminal", r.getpass.GetPassWarning)
            self.fail("fallback input must not run")
        with mock.patch.object(r.getpass, "getpass", side_effect=fallback), self.assertRaisesRegex(r.Refused, "terminal_noecho"):
            r.read_hidden_url(p)

    def test_verified_receipt_is_complete_before_create_only_publication(self):
        calls = []
        def complete(fd, name, value):
            calls.append(("write", name, value))
        def publish(source, target, **kwargs):
            self.assertEqual(calls, [("write", "VERIFIED.pending.json", {"status": "test"})])
            self.assertEqual((source, target), ("VERIFIED.pending.json", "VERIFIED.json"))
            self.assertEqual(kwargs, {"src_dir_fd": 77, "dst_dir_fd": 77, "follow_symlinks": False})
            calls.append(("link",))
        with mock.patch.object(r, "write_receipt", side_effect=complete), \
             mock.patch.object(r.os, "link", side_effect=publish), mock.patch.object(r.os, "fsync"):
            r.publish_verified(77, {"status": "test"})
        self.assertEqual(calls[-1], ("link",))
        with mock.patch.object(r, "write_receipt", side_effect=OSError("disk full")), \
             mock.patch.object(r.os, "link") as link:
            with self.assertRaises(OSError):
                r.publish_verified(77, {})
            link.assert_not_called()

    def test_http_has_no_auth_proxy_or_redirect_and_has_exact_stream_bound(self):
        p, payload, _ = make_bundle()
        class Response(io.BytesIO):
            status = 200
            def getheaders(self):
                return [("Content-Length", str(len(payload)))]
        connection = mock.Mock()
        connection.getresponse.return_value = Response(payload)
        with mock.patch.object(r.http.client, "HTTPSConnection", return_value=connection) as factory:
            with (self.folder / "download").open("xb") as output:
                r._http_to_file("https://synthetic.oaiusercontent.com/files/id/raw?sig=SYNTHETIC", p, output)
        self.assertEqual((self.folder / "download").read_bytes(), payload)
        self.assertEqual(factory.call_args.args, (p["download_hostname"],))
        self.assertEqual(factory.call_args.kwargs["timeout"], 15)
        headers = connection.request.call_args.kwargs["headers"]
        self.assertFalse(set(headers) & {"Authorization", "Cookie", "Proxy-Authorization"})
        connection.request.assert_called_once()
        connection.close.assert_called_once()

    def test_http_refusals_do_not_follow_or_accept_partial_chunked_or_encoded_bodies(self):
        p, payload, _ = make_bundle()
        for status, headers in [(302, [("Location", "https://elsewhere.invalid")]),
                                (200, [("Content-Length", "1")]),
                                (200, [("Content-Length", str(len(payload))), ("Content-Length", str(len(payload)))]),
                                (200, [("Content-Length", str(len(payload))), ("Transfer-Encoding", "chunked")]),
                                (200, [("Content-Length", str(len(payload))), ("Content-Encoding", "gzip")])]:
            response = mock.Mock(status=status)
            response.getheaders.return_value = headers
            connection = mock.Mock()
            connection.getresponse.return_value = response
            with self.subTest(status=status, headers=headers), mock.patch.object(r.http.client, "HTTPSConnection", return_value=connection):
                with self.assertRaises(r.Refused):
                    r._http_to_file("https://synthetic.oaiusercontent.com/files/id?sig=x", p, io.BytesIO())
                connection.request.assert_called_once()
                response.read.assert_not_called()

    def test_cli_failure_is_sanitized_and_keeps_partial_quarantine(self):
        p, payload, _ = make_bundle()
        url = "https://synthetic.oaiusercontent.com/files/id?sig=DO_NOT_LOG"
        def fail_download(value, expected, fd):
            os.write(fd, b"partial")
            raise RuntimeError(url)
        stdout, stderr = io.StringIO(), io.StringIO()
        with mock.patch.object(r.sys, "platform", "linux"), mock.patch.object(r.os, "geteuid", return_value=0, create=True), \
             mock.patch.object(r.os, "umask"), mock.patch.object(r.os, "fsync"), mock.patch.object(r.os, "close"), \
             mock.patch.object(r.sys, "argv", ["receiver", "--params-b64", r.base64.b64encode(json.dumps(p).encode()).decode()]), \
             mock.patch.object(r, "new_quarantine", return_value=(77, str(self.folder))), \
             mock.patch.object(r, "exclusive", side_effect=lambda fd, name: self.output(name)), \
             mock.patch.object(r, "read_hidden_url", return_value=url), mock.patch.object(r, "download", side_effect=fail_download), \
             contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            self.assertEqual(r.main(), 1)
        self.assertEqual((self.folder / "artifact.zip").read_bytes(), b"partial")
        self.assertTrue((self.folder / "FAILURE.json").exists())
        self.assertFalse((self.folder / "VERIFIED.json").exists())
        combined = stdout.getvalue() + stderr.getvalue() + "".join(f.read_text() for f in self.folder.glob("*.json"))
        self.assertNotIn("DO_NOT_LOG", combined)
        self.assertNotIn(url, combined)

    @unittest.skipUnless(sys.platform.startswith("linux"), "requires actual Linux fork; not qualified by Windows")
    def test_actual_linux_fork_deadline_stops_hung_worker(self):
        import time
        p, _, _ = make_bundle()
        def hung(*unused):
            time.sleep(30)
        with (self.folder / "partial").open("xb") as output, \
             mock.patch.object(r, "_download_worker", hung), mock.patch.object(r, "NETWORK_DEADLINE", 0.05):
            started = time.monotonic()
            with self.assertRaisesRegex(r.Refused, "download_deadline"):
                r.download("synthetic-memory-only", p, output.fileno())
            self.assertLess(time.monotonic() - started, 5)
        self.assertTrue((self.folder / "partial").exists())



if __name__ == "__main__":
    unittest.main(verbosity=2)
