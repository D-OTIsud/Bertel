# GDPR cleanup admission

Production provenance: after verified N18 delivery, the independent read-only postflight at 2026-11-08T16:06:25.907117Z confirmed `activated_exact` (9/9 checks) for this manually selected act (`af367b8e…`), opening only six caller/server EXECUTE ACLs. The historical catalog-211 capture at 11:45 UTC remains unchanged. The act stays outside automatic migrations and the closed fresh-install manifest.

`activate.sql` is the separate, manually selected activation
following the six closed migrations 070035, 073355, 073400, 074602, 075514 and 083121.
It is outside both the automatic migration directory and the closed fresh-install manifest. The HTTP witness
must execute this exact file on its owned disposable target instead of fixture grants.

Activation checks the known bodies and attributes of the thirteen GDPR functions,
their owner-only ACLs and the four private intent/receipt relations. It grants exactly:

- `authenticated`: stable START and read-only request lookup; their SQL bodies enforce
  the current platform authority and request binding.
- `service_role`: cleanup status, exclusive claim, attempt-bound acknowledgement and
  pre-effect refusal, used only after the route checks the caller's current authority.

Legacy four-argument erase/ACK and internal helpers stay owner-only. No table grants,
new functions, rows, provider calls or automatic replay are added by activation.
A repeat activation against already open ACLs is refused.

The six closed migrations can be applied and postchecked atomically while N16
serves the application: they leave GDPR admission closed and do not change Storage
policies. No fenced-write guarantee is claimed for legacy avatar writers.
Before activation, obtain the approved recovery interaction, qualify and deliver
its compatible application, retire legacy writers, retain a compatible fallback
and qualify avatars. Only then review/apply this separate act and postcheck its
ACLs. B1 is not a qualified fallback for the activated GDPR workflow.

`close.sql` removes the six caller/server EXECUTE admissions and preserves all durable
operations, claims, unknown outcomes and receipts. It does not cancel an already
admitted request or restore deleted content. Reopening requires a reviewed operator
step; do not replay an uncertain mutation.
