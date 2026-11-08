# GDPR cleanup admission

Status: preparation only; no production activation or application delivery is implied.

`../../migrations/20261108091712_gdpr_cleanup_activation.sql` is the separate activation
following the six closed migrations 070035, 073355, 073400, 074602, 075514 and 083121.
It is deliberately absent from the closed fresh-install manifest. The HTTP witness
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

Delivery order: obtain the approved recovery interaction, qualify and deliver its
compatible application with GDPR still closed, retire legacy writers and retain a
compatible fallback, apply/postcheck the six closed migrations atomically, qualify
avatars, then review/apply this separate activation and postcheck its ACLs. B1 is not
a compatible avatar writer after the new intent fence.

`close.sql` removes the six caller/server EXECUTE admissions and preserves all durable
operations, claims, unknown outcomes and receipts. It does not cancel an already
admitted request or restore deleted content. Reopening requires a reviewed operator
step; do not replay an uncertain mutation.
