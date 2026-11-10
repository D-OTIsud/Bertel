# Thesaurus metadata SQL review — 10 November 2026

Scope: the generator, migration `20261110195115`, fresh-apply mirror, existing
publication/preparation/authority kernel, and frozen public reader. This review
does not deploy SQL or publish a production release.

## Findings corrected

- Hosted `postgres` cannot replace a publisher-owned function using its retained
  ADMIN-only membership. The patch now temporarily enables INHERIT on only the
  executor's own grant row, explicitly identifies its grantor, and restores the
  exact original ADMIN/INHERIT/SET options or removes a newly created grant row.
  It compares the complete publisher membership catalog before and after. No
  application-role membership, table ACL or RPC execution grant is added.
- A shared source gate alone permitted an in-flight draft to commit after the
  no-drafts check, immediately invalidating its fingerprint. The migration now
  requires READ COMMITTED and obtains exclusive K1 after shared S2, before the
  check. Existing editors finish first; a committed pending draft refuses the
  migration with PT409. Both lock acquisition and schema work have a five-second
  lock timeout. Existing publication source and authority checks remain intact.
- Replay previously accepted a fields-only partial activation patch. It now
  requires exactly one occurrence of both new fragments and the exact original
  normalized body hash after reversing both replacements.
- The public reader omitted `meta.metadata_checksum` despite the HTTP contract.
  A separately pinned constructor patch projects the key only when it exists in
  the selected immutable manifest. Legacy releases omit it. The function's full
  catalog metadata, including OID, owner, ACL, signature and execution settings,
  is compared before and after replacement.

## Verification

`python tools/thesaurus-content/test_domain_metadata_migration.py` provisions a
new temporary PostgreSQL 17 cluster, verifies its data directory/system identifier
and loopback endpoint before mutation, and stops/removes it afterward. It accepts
no supplied target or existing cluster and refuses ambient PG configuration.
It does not use the archived database test tools or any production connection.

The reduced fixture loads the real original activation and reader bodies and the
real prepared-activation constructor. Their normalized hashes match the reviewed
production prerequisites: activation `985839358c6e0d68eb7db280f42bb6ed`, reader
`03fb8e96e1b55d8ed42ce2df19301942`. The generated migration passes under a
NOSUPERUSER/NOCREATEROLE executor. Assertions cover exact two-grantor and absent
self-grant restoration, full replay, partial-patch rejection and transactional
rollback, frozen reader checksum/legacy omission, rejection of stale transaction
isolation, and an actual two-session editor/upgrade race ending in PT409.

`node tools/thesaurus-content/validate-domain-labels.mjs` verifies all 78 dictionaries
in four languages, French application consistency, and matching upgrade/mirror SQL.

The fixture deliberately substitutes lightweight tables and the text/source-gate
helpers; it does **not** execute the full publication kernel or replace a complete
fresh-apply/publication regression. The existing publisher has EXECUTE on
`has_editorial_text(jsonb)`, so the new name constraint introduces no helper grant.
The preparation contract's 13 support-function hashes exclude activation and the
public reader; the patch changes neither that registry nor its support functions.

Historical manifests, concept documents/checksums and revisions are not rewritten
by the migration. A later authenticated, authorized ordinary bootstrap is still
required to publish the frozen metadata. The exact 78-domain dictionary guard
describes this ordered migration, not coverage of every native reference catalog.

PostgreSQL role-grant syntax and explicit grantors were checked against the
[PostgreSQL 17 GRANT](https://www.postgresql.org/docs/17/sql-grant.html) and
[REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html) references.

Production installation: native migration ledger `20261110195115` succeeded on
10 November. Postflight verified all 78 domain maps, the exact reviewed activation
hash, zero pending revisions, unchanged 1,477 concept identities and release 25,
unchanged digest of every historical release row, and exact publisher memberships.
Installation did not publish new metadata; normal authenticated publication
remains a separate step.
