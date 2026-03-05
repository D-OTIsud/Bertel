from __future__ import annotations

from datetime import datetime, timezone
from statistics import median
from typing import Any


def format_seconds(seconds: float | None) -> str:
    if seconds is None:
        return "n/a"
    total = int(max(0, round(seconds)))
    minutes, sec = divmod(total, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}h {minutes}m {sec}s"
    if minutes:
        return f"{minutes}m {sec}s"
    return f"{sec}s"


def estimate_eta(
    *,
    status_payload: dict[str, Any] | None,
    events: list[dict[str, Any]],
    historical_durations: list[float],
) -> dict[str, Any]:
    status = str((status_payload or {}).get("status") or "").lower()
    latest_start: datetime | None = None
    now = datetime.now(timezone.utc)
    for event in events:
        if str(event.get("message") or "") != "ETL task started":
            continue
        created_at = str(event.get("created_at") or "")
        if not created_at:
            continue
        try:
            latest_start = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            break
        except ValueError:
            continue

    if status in {"staging_loaded", "committed"}:
        return {
            "phase": "completed",
            "elapsed_seconds": None,
            "remaining_seconds": 0.0,
            "eta_confidence": "high",
            "note": "ETL pipeline already completed for this batch.",
        }
    if status not in {"profiling", "mapping", "transforming", "deduplicated"} and latest_start is None:
        return {
            "phase": status or "unknown",
            "elapsed_seconds": None,
            "remaining_seconds": None,
            "eta_confidence": "low",
            "note": "No ETL execution signal yet.",
        }

    elapsed = (now - latest_start).total_seconds() if latest_start else None
    if not historical_durations:
        return {
            "phase": status or "running",
            "elapsed_seconds": elapsed,
            "remaining_seconds": None,
            "eta_confidence": "low",
            "note": "Learning ETA: not enough historical ETL runs yet.",
        }

    expected_total = median(historical_durations)
    remaining = max(0.0, expected_total - (elapsed or 0.0))
    sample_count = len(historical_durations)
    confidence = "high" if sample_count >= 5 else "medium" if sample_count >= 2 else "low"
    return {
        "phase": status or "running",
        "elapsed_seconds": elapsed,
        "remaining_seconds": remaining,
        "eta_confidence": confidence,
        "note": f"ETA based on median of {sample_count} previous ETL runs.",
    }
