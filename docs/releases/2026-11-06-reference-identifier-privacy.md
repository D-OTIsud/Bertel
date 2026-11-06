# Reference identifier privacy boundary

Reference export now canonicalizes supported table identifiers before filtering
and publishing values. Legal unquoted casing such as `PUBLIC.ref_document` no
longer bypasses the explicit-public document filter. Lower-case quoted aliases
are supported; ambiguous identifiers fail closed. Cache loading, live/seed merge,
REST transfer and final rendering share this identity boundary. A canonical live
table also suppresses its older seed values regardless of its incoming alias.

The synthetic renderer witness now uses a document name that demonstrably renders
when allowed, instead of relying only on a URL the renderer does not show. Public
values and schema documentation remain available. The change does not establish
that private values were previously published in the real generated files.

Validation: the added alias and ambiguity cases produced 25 failures against the
preceding source. The corrected full DB graph suite passes 75 tests locally on
the existing project Python 3.14.3 environment. A dedicated CI workflow pins the
same pytest9.0.3 and pg8000 1.31.5 test dependencies and needs no credentials,
database or hosted request. No production operation or document body was used.
