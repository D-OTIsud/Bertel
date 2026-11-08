# Archive receiver guards

`receive_candidate.py` is an operator archive verifier, not a deployment command.
It accepts a closed, independently reviewed nonsecret parameter profile and reads
the temporary connector-copy URL through echo-free `getpass`. No profile or real
download URL is stored in this repository. No Docker load/tag/run, registry or
application action follows verification.

The receiver requires Linux and effective UID 0. Outputs are exclusive, mode 0600,
inside a new root-owned 0700 directory below `/root/bertel-releases`. Directory
FDs and O_NOFOLLOW prevent following a replacement/symlink. Existing files and
failed attempts are never overwritten or deleted. Failures retain quarantine;
a complete receipt is published atomically only after archive verification.

HTTP is direct verified TLS to the exact reviewed connector hostname, without
Authorization, cookies, environment proxy handlers or redirects. Exact size/hash
pins bound the outer ZIP before parsing, then the complete manifest and two
regular-file members. The gzip is copied and hashed, never unpacked or imported.
The manifest's image ID is compared with reviewed pins, not derived by Docker.
The artifact ID is supplied by independently reviewed GitHub metadata and its
outer ZIP digest, since the exported inner manifest predates artifact creation.

## Independent worker deadline

The parent enforces a 300 s network deadline, but a killed parent cannot run its
cleanup. The worker therefore also installs the kernel default SIGALRM action,
unblocks SIGALRM and arms a one-shot 300 s ITIMER_REAL immediately on entry.
The timer stays armed through process exit. It does not depend on a Python signal
handler reaching a bytecode checkpoint after a blocking native call.

This bounds an orphan by the remainder of its own deadline. It does **not** detect
parent death immediately or promise immediate child termination. Production
reaping after a parent dies belongs to the host's reaper. Native tests use an
isolated Linux subreaper and explicitly wait/reap every test process instead of
assuming the runner's PID 1 does so.

A failed result pipe is also guarded: reporting/closing it must not raise out of
the worker and expose an original HTTP error through exception chaining. A
synthetic raw-error plus broken-pipe witness exercises both the formatting branch
and an actual Linux multiprocessing child; neither may emit a raw error/traceback.

## Disposable Linux qualification

The release workflow's guard job runs Python 3.12 tests as disposable runner root:

```sh
sudo -n "$(command -v python)" -I -m unittest discover \
  -s tools/release-artifact -p 'test_receiver*.py' -v
```

All fixtures are synthetic. There is no external network or application Docker
runtime. HTTP branches use fake responses; blocking witnesses use socketpair or
libc pause. Filesystem tests operate only in their own temporary directories,
never the real `/root` release tree.

Four witnesses kill the real parent with SIGTERM/SIGKILL while the actual worker
is blocked in local socket/native calls. SIGALRM starts inherited as ignored and
blocked. The worker must exit from its own SIGALRM, be adopted/reaped by the test
supervisor and disappear from `/proc`. A negative control suppresses only timer
arming: it must expose the old surviving orphan, then kill and reap it explicitly.
A separate case keeps the parent alive and requires child expiry before the
longer parent deadline. Native UID/mode/dirfd, symlink refusal and complete,
create-only receipt hardlinks are checked on the disposable Linux filesystem.

On Windows the Linux witnesses are explicit skips, not qualification. A successful
Linux test run does not attest live connector reachability, real TTY behavior,
host deployment, image runtime or a production transfer. Operator handoffs and
reviewed parameters remain separate private artifacts.

Primary references: [Linux timers](https://man7.org/linux/man-pages/man2/setitimer.2.html),
[signal disposition and masks](https://man7.org/linux/man-pages/man7/signal.7.html),
[Python 3.12 signals](https://docs.python.org/3.12/library/signal.html).
