from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import requests


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _post_file(base_url: str, token: str, path: Path, idempotency_key: str, organization_object_id: str) -> dict:
    with path.open("rb") as f:
        files = {"upload_file": (path.name, f, "application/octet-stream")}
        r = requests.post(
            f"{base_url}/api/v1/ingest",
            headers={**_headers(token), "x-idempotency-key": idempotency_key},
            files=files,
            params={"organization_object_id": organization_object_id},
            timeout=120,
        )
    r.raise_for_status()
    return r.json()


def _post(base_url: str, token: str, route: str) -> dict:
    r = requests.post(f"{base_url}{route}", headers=_headers(token), timeout=180)
    r.raise_for_status()
    return r.json()


def _get(base_url: str, token: str, route: str) -> dict:
    r = requests.get(f"{base_url}{route}", headers=_headers(token), timeout=60)
    r.raise_for_status()
    return r.json()


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark Universal AI Ingestor flow.")
    parser.add_argument("--base-url", required=True, help="API base URL, e.g. http://localhost:8000")
    parser.add_argument("--token", required=True, help="API_BEARER_TOKEN")
    parser.add_argument("--file", required=True, help="Path to import file")
    parser.add_argument("--organization-object-id", required=True, help="Default organization object id (ORG...)")
    parser.add_argument("--idempotency-key", default="bench-run-001", help="Idempotency key")
    parser.add_argument("--poll-seconds", type=int, default=2, help="Polling interval")
    parser.add_argument("--max-ingest-accept-s", type=float, default=None, help="Fail if ingest accept exceeds threshold")
    parser.add_argument("--max-etl-until-terminal-s", type=float, default=None, help="Fail if ETL duration exceeds threshold")
    parser.add_argument("--max-resolve-s", type=float, default=None, help="Fail if resolve exceeds threshold")
    parser.add_argument("--max-dedup-s", type=float, default=None, help="Fail if dedup exceeds threshold")
    parser.add_argument("--max-commit-s", type=float, default=None, help="Fail if commit exceeds threshold")
    args = parser.parse_args()

    p = Path(args.file)
    if not p.exists():
        raise SystemExit(f"File not found: {p}")

    metrics: dict[str, float] = {}

    t0 = time.perf_counter()
    accepted = _post_file(args.base_url, args.token, p, args.idempotency_key, args.organization_object_id)
    metrics["ingest_accept_s"] = time.perf_counter() - t0
    batch_id = accepted["batch_id"]

    # Wait for staging_loaded or terminal failure.
    t1 = time.perf_counter()
    while True:
        status = _get(args.base_url, args.token, f"/api/v1/ingest/{batch_id}")
        state = status["status"]
        if state in {"staging_loaded", "failed", "failed_permanent"}:
            break
        time.sleep(args.poll_seconds)
    metrics["etl_until_terminal_s"] = time.perf_counter() - t1

    t2 = time.perf_counter()
    resolve = _post(args.base_url, args.token, f"/api/v1/ingest/{batch_id}/resolve-dependencies")
    metrics["resolve_s"] = time.perf_counter() - t2

    t3 = time.perf_counter()
    dedup = _post(args.base_url, args.token, f"/api/v1/ingest/{batch_id}/deduplicate")
    metrics["dedup_s"] = time.perf_counter() - t3

    t4 = time.perf_counter()
    commit = _post(args.base_url, args.token, f"/api/v1/ingest/{batch_id}/commit")
    metrics["commit_s"] = time.perf_counter() - t4

    print(
        json.dumps(
            {
                "batch_id": batch_id,
                "metrics_seconds": metrics,
                "resolve": resolve,
                "dedup": dedup,
                "commit": commit,
            },
            indent=2,
            ensure_ascii=True,
        )
    )

    thresholds = {
        "ingest_accept_s": args.max_ingest_accept_s,
        "etl_until_terminal_s": args.max_etl_until_terminal_s,
        "resolve_s": args.max_resolve_s,
        "dedup_s": args.max_dedup_s,
        "commit_s": args.max_commit_s,
    }
    failures: list[str] = []
    for metric_name, max_allowed in thresholds.items():
        if max_allowed is None:
            continue
        observed = metrics.get(metric_name)
        if observed is None:
            failures.append(f"missing metric `{metric_name}`")
            continue
        if observed > max_allowed:
            failures.append(f"{metric_name}={observed:.3f}s > {max_allowed:.3f}s")

    if failures:
        raise SystemExit("Benchmark thresholds failed: " + "; ".join(failures))


if __name__ == "__main__":
    main()
