"""Native Linux process witnesses. No external network or /root directory writes."""
import ctypes
import json
import multiprocessing
import os
from pathlib import Path
import select
import signal
import socket
import stat
import struct
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

# The isolated subprocess intentionally has no implicit script/user import path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import receive_candidate as r


def wait_reap(pid, timeout):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        found, status = os.waitpid(pid, os.WNOHANG)
        if found:
            return status
        time.sleep(0.01)
    raise AssertionError("child exceeded its bounded witness deadline")


def supervise(kind, death, unarmed):
    """Adopt/reap our orphaned grandchild; never rely on the runner's PID 1."""
    libc = ctypes.CDLL(None, use_errno=True)
    libc.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong]
    if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER, test subprocess only.
        raise AssertionError("Linux subreaper unavailable")
    read_fd, report_fd = os.pipe()
    parent, worker = None, None
    reaped = set()
    try:
        parent = os.fork()
        if parent == 0:
            os.close(read_fd)
            signal.signal(signal.SIGTERM, signal.SIG_DFL)
            signal.signal(signal.SIGALRM, signal.SIG_IGN)  # Worker must reset inheritance.
            signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGALRM})
            r.WORKER_DEADLINE, r.NETWORK_DEADLINE = 0.6, 5
            if unarmed:
                r.signal.setitimer = lambda *args: None  # Negative control, not a production option.

            def blocked(*unused):
                os.write(report_fd, struct.pack("!qq", os.getpid(), os.getppid()))
                if kind == "socketpair":
                    left, right = socket.socketpair()
                    try:
                        left.recv(1)  # No peer data, no socket timeout, no external network.
                    finally:
                        left.close()
                        right.close()
                else:
                    libc.pause()  # Actual blocking native call, not a Python timeout.

            r._http_to_file = blocked
            with tempfile.TemporaryFile() as output:
                try:
                    r.download("synthetic-memory-only", {}, output.fileno())
                except r.Refused:
                    os._exit(2)
            os._exit(0)

        os.close(report_fd)
        report_fd = None
        if not select.select([read_fd], [], [], 3)[0]:
            raise AssertionError("worker did not report its synthetic blocking point")
        packet = os.read(read_fd, 16)
        if len(packet) != 16:
            raise AssertionError("incomplete worker identity")
        worker, actual_parent = struct.unpack("!qq", packet)
        if actual_parent != parent:
            raise AssertionError("worker was not a child of the parent to be killed")
        # Require the worker to be alive and sleeping in the blocking witness.
        proc = Path("/proc") / str(worker)
        until = time.monotonic() + 0.3
        while time.monotonic() < until:
            state = (proc / "stat").read_text().rsplit(")", 1)[1].split()[0]
            if state == "S":
                break
            time.sleep(0.005)
        else:
            raise AssertionError("worker did not enter its blocking call")
        killed_at = time.monotonic()
        os.kill(parent, death)
        parent_status = wait_reap(parent, 2)
        reaped.add(parent)
        if not os.WIFSIGNALED(parent_status) or os.WTERMSIG(parent_status) != death:
            raise AssertionError("parent did not die from the requested signal")

        if unarmed:
            time.sleep(1.0)  # Exceeds the suppressed 0.6 s worker deadline.
            found, unused_status = os.waitpid(worker, os.WNOHANG)
            if found:
                reaped.add(worker)
                raise AssertionError("unarmed negative control did not expose the old orphan")
            os.kill(worker, signal.SIGKILL)
            status = wait_reap(worker, 2)
            expected_signal = signal.SIGKILL
        else:
            status = wait_reap(worker, 2)
            expected_signal = signal.SIGALRM
        reaped.add(worker)
        if not os.WIFSIGNALED(status) or os.WTERMSIG(status) != expected_signal:
            raise AssertionError("worker did not terminate from the expected kernel signal")
        if proc.exists():
            raise AssertionError("worker still exists after waitpid reaping")
        try:
            os.waitpid(worker, os.WNOHANG)
        except ChildProcessError:
            pass
        else:
            raise AssertionError("worker was not fully reaped")
        result = {"block": kind, "parent_signal": signal.Signals(death).name,
                  "worker_signal": signal.Signals(expected_signal).name,
                  "reaped": True, "worker_proc_absent": True, "unarmed_control_detected": unarmed,
                  "elapsed_after_parent_death": round(time.monotonic() - killed_at, 3)}
        print(json.dumps(result), flush=True)
    finally:
        os.close(read_fd)
        if report_fd is not None:
            os.close(report_fd)
        for pid in (parent, worker):
            if pid is None or pid in reaped:
                continue
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                os.waitpid(pid, 0)
            except ChildProcessError:
                pass


@unittest.skipUnless(sys.platform.startswith("linux"), "native Linux process witnesses")
class DeadlineLinuxTests(unittest.TestCase):
    def run_case(self, kind, death, unarmed=False):
        result = subprocess.run([sys.executable, "-I", str(Path(__file__).resolve()), "--supervise",
                                 kind, str(int(death)), "1" if unarmed else "0"],
                                capture_output=True, text=True, timeout=8, check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        data = json.loads(result.stdout)
        self.assertTrue(data["reaped"] and data["worker_proc_absent"])
        self.assertEqual(data["unarmed_control_detected"], unarmed)
        self.assertEqual(data["worker_signal"], "SIGKILL" if unarmed else "SIGALRM")
        print("native receiver witness: " + result.stdout.strip())

    def test_sigterm_parent_blocked_socket_worker(self):
        self.run_case("socketpair", signal.SIGTERM)

    def test_sigkill_parent_blocked_socket_worker(self):
        self.run_case("socketpair", signal.SIGKILL)

    def test_sigterm_parent_blocked_native_function(self):
        self.run_case("native", signal.SIGTERM)

    def test_sigkill_parent_blocked_native_function(self):
        self.run_case("native", signal.SIGKILL)

    def test_unarmed_negative_control_detects_and_reaps_old_orphan(self):
        self.run_case("native", signal.SIGKILL, unarmed=True)

    def test_worker_own_deadline_fires_before_live_parent_deadline(self):
        libc = ctypes.CDLL(None)
        with tempfile.TemporaryFile() as output, mock.patch.object(r, "WORKER_DEADLINE", 0.1), \
             mock.patch.object(r, "NETWORK_DEADLINE", 3), \
             mock.patch.object(r, "_http_to_file", side_effect=lambda *args: libc.pause()):
            started = time.monotonic()
            with self.assertRaisesRegex(r.Refused, "download_deadline"):
                r.download("synthetic-memory-only", {}, output.fileno())
            self.assertLess(time.monotonic() - started, 1.5)
        self.assertEqual(multiprocessing.active_children(), [])


@unittest.skipUnless(sys.platform.startswith("linux") and hasattr(os, "geteuid") and os.geteuid() == 0,
                     "actual Linux UID/mode/dirfd witnesses require disposable root")
class FilesystemLinuxTests(unittest.TestCase):
    def setUp(self):
        self.owned = tempfile.TemporaryDirectory(prefix="bertel-receiver-linux-owned-")
        self.addCleanup(self.owned.cleanup)
        self.path = Path(self.owned.name)
        self.fd = os.open(self.path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        self.addCleanup(os.close, self.fd)

    def test_actual_root_mode_exclusive_and_symlink_refusal(self):
        r.private_directory(self.fd, exact=True)
        with r.exclusive(self.fd, "artifact.zip") as output:
            output.write(b"synthetic")
            self.assertEqual(stat.S_IMODE(os.fstat(output.fileno()).st_mode), 0o600)
        with self.assertRaises(FileExistsError):
            r.exclusive(self.fd, "artifact.zip")
        target = self.path / "target"
        target.write_bytes(b"unchanged")
        (self.path / "manifest.json").symlink_to(target)
        with self.assertRaises(FileExistsError):
            r.exclusive(self.fd, "manifest.json")
        self.assertEqual(target.read_bytes(), b"unchanged")

    def test_directory_mode_or_owner_is_refused_without_repair(self):
        os.chmod(self.path, 0o755)
        with self.assertRaises(r.Refused):
            r.private_directory(self.fd, exact=True)
        self.assertEqual(stat.S_IMODE(os.fstat(self.fd).st_mode), 0o755)
        os.chmod(self.path, 0o700)
        os.chown(self.path, 65534, -1)
        try:
            with self.assertRaises(r.Refused):
                r.private_directory(self.fd, exact=True)
        finally:
            os.chown(self.path, 0, -1)

    def test_complete_marker_is_real_create_only_hardlink(self):
        r.publish_verified(self.fd, {"status": "synthetic_verified"})
        pending, verified = self.path / "VERIFIED.pending.json", self.path / "VERIFIED.json"
        self.assertEqual(pending.stat().st_ino, verified.stat().st_ino)
        self.assertEqual(verified.stat().st_nlink, 2)
        self.assertEqual(stat.S_IMODE(verified.stat().st_mode), 0o600)
        self.assertEqual(json.loads(verified.read_bytes()), {"status": "synthetic_verified"})
        with self.assertRaises(FileExistsError):
            r.publish_verified(self.fd, {})
        self.assertEqual(json.loads(verified.read_bytes()), {"status": "synthetic_verified"})


if __name__ == "__main__" and len(sys.argv) == 5 and sys.argv[1] == "--supervise":
    supervise(sys.argv[2], int(sys.argv[3]), sys.argv[4] == "1")
elif __name__ == "__main__":
    unittest.main(verbosity=2)
