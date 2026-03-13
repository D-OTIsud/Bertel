# AI Ingestor Principles

## Schema Truth First
- The unified destination schema is the source of truth.
- Staging tables, target schema rules, prompts, and UI choices must stay aligned.
- The mapper must never expose a destination table or column that does not exist.

## AI Must Be Observable
- Every batch should tell us whether it used full semantic AI routing or a fallback path.
- Important AI choices should be persisted as field-level rationale, contract assumptions, and discovery events.
- Users reviewing mappings should be able to see what the AI chose and which close alternatives were considered.

## Deterministic Validation Before Trust
- LLM output is a proposal, not a fact.
- Schema validation, transform validation, and semantic guards should run before a plan is accepted.
- Low-confidence or semantically inconsistent mappings should be routed to human review.

## Precompute Stable Semantic Context
- Stable target-schema context should be prepared before first ingest whenever possible.
- Vector embeddings for target tables and columns should be prewarmed at deploy/startup time.
- Runtime work should focus on source-column understanding and candidate ranking, not rebuilding static context.

## Human Review For Uncertainty
- Business columns should not be ignored by default.
- The UI should preserve source order and make correction easy.
- Manual review should focus on ambiguous fields, low-confidence sheets, and semantically close alternatives.

## Fix Root Causes
- Prefer schema sync and canonical metadata over hand-maintained UI subsets.
- Prefer durable semantic normalization over one-off string fixes.
- When a fallback path is needed, surface it clearly rather than hiding degraded behavior.
