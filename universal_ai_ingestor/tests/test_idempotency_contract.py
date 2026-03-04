from universal_ai_ingestor.core.idempotency_contract import evaluate_idempotency_reuse


def test_idempotency_replay_when_hash_matches() -> None:
    existing = {"payload_sha256": "abc123"}
    assert evaluate_idempotency_reuse(existing, "abc123") == "replay"


def test_idempotency_conflict_when_hash_differs() -> None:
    existing = {"payload_sha256": "abc123"}
    assert evaluate_idempotency_reuse(existing, "zzz999") == "conflict"


def test_idempotency_new_when_no_existing_row() -> None:
    assert evaluate_idempotency_reuse(None, "abc123") == "new"
