"""Pure fresh-process refusal tests; no PostgreSQL fixture or network is used.

These tests attest that entry is closed. They do not execute historical database
mutations, certify their cleanup paths, or revoke already imported Python objects.
"""
from __future__ import annotations

import ast
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap
import unittest
import uuid


TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
REFUSAL = "ARCHIVED_THESAURUS_TOOL"
ARCHIVED = (
    "benchmark_existing.py", "restore_local_cron_fixture.py",
    "preparation_test_oracle.py", "verify_configuration_race.py",
    "verify_filter_expansion.py", "verify_live_restore.py",
    "verify_native_projection.py", "verify_preparation_fk_races.py",
    "verify_preparation_late_writer.py", "verify_preparation_races.py",
    "verify_prepared_runtime.py", "verify_publish_race.py",
    "verify_runtime.py", "verify_usage_projection.py",
)

# Loaded only by subprocesses. It refuses a connection, driver, parser or output
# attempt and records the attempt without including credentials in diagnostics.
SITE_CUSTOMIZE = r'''
import os
import sys
import types
from pathlib import Path

def mark(kind):
    Path(os.environ["ARCHIVE_TEST_" + kind + "_MARKER"]).write_text("attempted", encoding="utf-8")
    raise RuntimeError("ARCHIVE_TEST_SENTINEL_" + kind)

protected = set(os.path.abspath(os.environ[key]) for key in (
    "ARCHIVE_TEST_OUTPUT", "ARCHIVE_TEST_REPORT", "ARCHIVE_TEST_STATE"))
configuration = set(os.path.abspath(os.environ[key]) for key in ("PGPASSFILE", "PGSERVICEFILE"))

def audit(event, args):
    if event.startswith("socket."):
        mark("NETWORK")
    if event == "open" and args and isinstance(args[0], (str, bytes, os.PathLike)):
        path = os.path.abspath(os.fsdecode(args[0]))
        if path in configuration:
            mark("CONFIG")
        mode = args[1] if isinstance(args[1], str) else ""
        flags = args[2] if len(args) > 2 and isinstance(args[2], int) else 0
        if path in protected and (any(value in mode for value in "wax+") or flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC)):
            mark("OUTPUT")
    if event in ("os.remove", "os.rename", "os.rmdir"):
        if any(isinstance(value, (str, bytes)) and os.path.abspath(os.fsdecode(value)) in protected for value in args[:2]):
            mark("OUTPUT")

sys.addaudithook(audit)

# A forged old shared guard must never reopen an inline, unconditional refusal.
fake = types.ModuleType("archived_tool_guard")
def noop(*args, **kwargs):
    Path(os.environ["ARCHIVE_TEST_GUARD_MARKER"]).write_text("called", encoding="utf-8")
fake.archive_only = noop
fake.ArchivedToolError = RuntimeError
sys.modules["archived_tool_guard"] = fake
sys.modules["tools.thesaurus.archived_tool_guard"] = fake
Path(os.environ["ARCHIVE_TEST_READY_MARKER"]).write_text("ready", encoding="utf-8")
'''

POISON = '''import os
from pathlib import Path
Path(os.environ["ARCHIVE_TEST_{kind}_MARKER"]).write_text("imported", encoding="utf-8")
raise RuntimeError("ARCHIVE_TEST_SENTINEL_{kind}")
'''


class ArchivedToolsTests(unittest.TestCase):
    def test_inventory_and_standalone_first_statement(self):
        """Future obvious driver/helper entry points cannot silently skip review."""
        known = {Path(name).stem for name in ARCHIVED}
        drivers = {"psycopg2", "psycopg", "asyncpg", "pg8000"}
        detected = set()
        for path in TOOLS.glob("*.py"):
            if path.name == Path(__file__).name:
                continue
            tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=path.name)
            imports = set()
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    imports.update(alias.name.split(".")[0] for alias in node.names)
                elif isinstance(node, ast.ImportFrom) and node.module:
                    imports.update((node.module.split(".")[0], node.module.split(".")[-1]))
            if path.name in ARCHIVED or imports & (drivers | known):
                detected.add(path.name)
        self.assertEqual(detected, set(ARCHIVED))
        for name in ARCHIVED:
            with self.subTest(tool=name):
                body = ast.parse((TOOLS / name).read_text(encoding="utf-8-sig")).body
                if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) and isinstance(body[0].value.value, str):
                    body = body[1:]
                while body and isinstance(body[0], ast.ImportFrom) and body[0].module == "__future__":
                    body = body[1:]
                self.assertIsInstance(body[0], ast.Raise)
                error = body[0].exc
                self.assertIsInstance(error, ast.Call)
                self.assertIsInstance(error.func, ast.Name)
                self.assertEqual(error.func.id, "RuntimeError")
                self.assertIsInstance(error.args[0], ast.Constant)
                self.assertTrue(REFUSAL in error.args[0].value)

    def run_refusal(self, name, entry, optimized=False, scenario="help", positive=None):
        with tempfile.TemporaryDirectory(prefix="archived-thesaurus-test-") as directory:
            fixture = Path(directory)
            poison = fixture / "poison"
            poison.mkdir()
            (poison / "sitecustomize.py").write_text(textwrap.dedent(SITE_CUSTOMIZE), encoding="utf-8")
            for module, kind in (("psycopg2", "DRIVER"), ("psycopg", "DRIVER"), ("asyncpg", "DRIVER"), ("pg8000", "DRIVER"), ("argparse", "PARSER")):
                (poison / (module + ".py")).write_text(POISON.format(kind=kind), encoding="utf-8")
            (poison / "archived_tool_guard.py").write_text("def archive_only(*args, **kwargs):\n    return None\n", encoding="utf-8")
            before = b"Existing output must remain byte-identical.\n"
            outputs = {kind: fixture / (kind.lower() + ".json") for kind in ("OUTPUT", "REPORT", "STATE")}
            for path in outputs.values():
                path.write_bytes(before)
            passfile, servicefile = fixture / "pgpass.conf", fixture / "pgservice.conf"
            passfile.write_text("*:*:*:*:synthetic-not-a-real-password\n", encoding="utf-8")
            servicefile.write_text("[untrusted]\nhost=invalid.example\n", encoding="utf-8")
            markers = {kind: fixture / (kind.lower() + ".marker") for kind in ("DRIVER", "PARSER", "NETWORK", "CONFIG", "OUTPUT", "GUARD")}
            ready = fixture / "ready.marker"
            env = os.environ.copy()
            for key in ("PYTHONHOME", "PYTHONSTARTUP", "PYTHONINSPECT", "PYTHONUSERBASE", "PYTHONOPTIMIZE"):
                env.pop(key, None)
            env.update(PYTHONPATH=os.pathsep.join((str(poison), str(ROOT))),
                       PYTHONDONTWRITEBYTECODE="1", PYTHONNOUSERSITE="1")
            canaries = {}
            for key in ("PGHOST", "PGHOSTADDR", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSERVICE", "PGOPTIONS", "PGSSLMODE", "PGSSLROOTCERT", "PGSSLKEY", "PGSSLCERT", "PGCONNECT_TIMEOUT", "PGTARGETSESSIONATTRS", "DATABASE_URL", "SUPABASE_DB_URL", "TBLS_DSN"):
                canaries[key] = "PRIVATE_TEST_CANARY_" + uuid.uuid4().hex
            canaries.update(PGPASSFILE=str(passfile), PGSERVICEFILE=str(servicefile))
            env.update(canaries)
            env.update({"ARCHIVE_TEST_" + kind + "_MARKER": str(path) for kind, path in markers.items()})
            env["ARCHIVE_TEST_READY_MARKER"] = str(ready)
            env.update({"ARCHIVE_TEST_" + kind: str(path) for kind, path in outputs.items()})
            script = TOOLS / name
            arguments = ["--help"]
            if scenario != "help":
                target = {"false_target": "production", "historical_prefix": "bertel_thesaurus_live_restore_20261106", "malformed": "../not-a-database/?bad"}[scenario]
                arguments = ["--database", target, "--port", "-1", "--output", str(outputs["OUTPUT"]), "--report", str(outputs["REPORT"]), "--state", str(outputs["STATE"])]
            command = [sys.executable, "-B"] + (["-O"] if optimized else [])
            stem = script.stem
            if entry == "cli":
                command += [str(script)]
            elif entry == "package":
                command += ["-c", "import importlib; importlib.import_module(" + repr("tools.thesaurus." + stem) + ")"]
            elif entry == "bare":
                command += ["-c", "import sys,importlib;sys.path.insert(0," + repr(str(TOOLS)) + ");importlib.import_module(" + repr(stem) + ")"]
            elif entry == "spec":
                command += ["-c", "import importlib.util;s=importlib.util.spec_from_file_location('isolated_archived_tool'," + repr(str(script)) + ");m=importlib.util.module_from_spec(s);s.loader.exec_module(m)"]
            elif entry == "runpy":
                command += ["-c", "import runpy;runpy.run_path(" + repr(str(script)) + ",run_name='__main__')"]
            elif entry == "module":
                command += ["-m", "tools.thesaurus." + stem]
            elif entry == "sentinel":
                probes = {
                    "DRIVER": "import psycopg2",
                    "PARSER": "import argparse",
                    "NETWORK": "import socket;socket.socket()",
                    "CONFIG": "import os;from pathlib import Path;Path(os.environ['PGSERVICEFILE']).read_bytes()",
                    "OUTPUT": "import os;from pathlib import Path;Path(os.environ['ARCHIVE_TEST_OUTPUT']).write_text('forbidden')",
                    # The forged guard intentionally remains a no-op. This
                    # positive probe ends itself after proving it was reached.
                    "GUARD": "import archived_tool_guard;archived_tool_guard.archive_only('ignored');raise RuntimeError('ARCHIVE_TEST_SENTINEL_GUARD')",
                }
                command += ["-c", probes[positive]]
            else:
                self.fail("Unknown test entry type")
            completed = subprocess.run(command + arguments, cwd=fixture, env=env,
                                       capture_output=True, text=True, timeout=15)
            combined = completed.stdout + completed.stderr
            # Never include captured output or private canary values in failures.
            self.assertTrue(ready.is_file() and ready.read_text(encoding="utf-8") == "ready", "Sentinel installation did not complete")
            self.assertTrue(completed.returncode != 0, "Archived entry unexpectedly succeeded")
            self.assertTrue("RuntimeError" in combined, "Unexpected refusal type")
            self.assertTrue(completed.stdout == "", "Entry wrote stdout before refusal")
            self.assertFalse(any(value in combined for value in canaries.values()), "Refusal disclosed a libpq canary value")
            if positive is None:
                self.assertTrue(REFUSAL in combined, "Missing unconditional archive refusal")
                self.assertFalse(any(path.exists() for path in markers.values()), "Driver/parser/network/config/output or forged guard was reached")
            else:
                self.assertTrue("ARCHIVE_TEST_SENTINEL_" + positive in combined, "Positive sentinel did not refuse the deliberate probe")
                self.assertTrue(markers[positive].is_file(), "Positive sentinel was not reached")
                self.assertFalse(any(path.exists() for kind, path in markers.items() if kind != positive), "An unrelated sentinel was reached")
            for path in outputs.values():
                self.assertTrue(path.read_bytes() == before, "An existing output was overwritten")

    def test_all_cli_targets_and_help_refuse_before_entry(self):
        for name in ARCHIVED:
            for optimized in (False, True):
                for scenario in ("help", "false_target", "historical_prefix", "malformed"):
                    with self.subTest(tool=name, optimized=optimized, scenario=scenario):
                        self.run_refusal(name, "cli", optimized, scenario)

    def test_all_import_and_module_forms_refuse_before_entry(self):
        for name in ARCHIVED:
            for optimized in (False, True):
                for entry in ("package", "bare", "spec", "runpy", "module"):
                    with self.subTest(tool=name, optimized=optimized, entry=entry):
                        self.run_refusal(name, entry, optimized)

    def test_sentinels_are_live_and_preserve_existing_outputs(self):
        """Positive controls of this harness, never historical mutation paths."""
        for optimized in (False, True):
            for kind in ("DRIVER", "PARSER", "NETWORK", "CONFIG", "OUTPUT", "GUARD"):
                with self.subTest(optimized=optimized, sentinel=kind):
                    self.run_refusal(ARCHIVED[0], "sentinel", optimized, positive=kind)


if __name__ == "__main__":
    unittest.main()
