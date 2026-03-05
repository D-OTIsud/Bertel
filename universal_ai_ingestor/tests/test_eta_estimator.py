from __future__ import annotations

from datetime import datetime, timedelta, timezone

from universal_ai_ingestor.core.eta_estimator import estimate_eta, format_seconds


def test_format_seconds_human_readable() -> None:
    assert format_seconds(65) == "1m 5s"
    assert format_seconds(None) == "n/a"


def test_estimate_eta_completed_batch() -> None:
    out = estimate_eta(status_payload={"status": "staging_loaded"}, events=[], historical_durations=[30, 60, 90])
    assert out["phase"] == "completed"
    assert out["remaining_seconds"] == 0.0
    assert out["eta_confidence"] == "high"


def test_estimate_eta_running_with_history() -> None:
    started = (datetime.now(timezone.utc) - timedelta(seconds=20)).isoformat()
    out = estimate_eta(
        status_payload={"status": "profiling"},
        events=[{"message": "ETL task started", "created_at": started}],
        historical_durations=[80.0, 100.0, 120.0],
    )
    assert out["phase"] == "profiling"
    assert out["elapsed_seconds"] is not None
    assert out["remaining_seconds"] is not None
    assert out["eta_confidence"] in {"medium", "high"}
