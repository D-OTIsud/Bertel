# Cutover Sign-off Template

## Release context

- Environment:
- Date/time (UTC):
- Release version/tag:
- Migration applied: `sql/staging_ingestor.sql` (yes/no)
- Preflight checks completed (yes/no):

## Evidence checklist

- [ ] `sql/preflight_migration_checks.sql` executed and archived
- [ ] `sql/security_audit_checks.sql` executed and archived
- [ ] Dry-run E2E completed and archived
- [ ] Benchmark results archived
- [ ] Monitoring + alerting active
- [ ] Retention purge schedule active
- [ ] Backup validated
- [ ] Rollback runbook acknowledged by on-call

## Go/No-Go inputs

- Failed permanent count:
- Blocker count:
- Integrity status (`ok=true`):
- Idempotency replay status:
- Performance thresholds status:

## Signatures

- Product owner:
- Data owner:
- Ops lead:
- On-call engineer:
- Final decision: GO / NO-GO
- Notes:
