from __future__ import annotations

from typing import Any


def evaluate_idempotency_reuse(existing: dict[str, Any] | None, payload_sha: str) -> str:
    if not existing:
        return "new"
    existing_sha = existing.get("payload_sha256")
    if existing_sha and existing_sha != payload_sha:
        return "conflict"
    return "replay"
