from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

import requests


TERMINAL_STATES = {"staging_loaded", "failed", "failed_permanent", "committed"}


def _headers(token: str, *, idem: str | None = None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {token}"}
    if idem:
        headers["x-idempotency-key"] = idem
    return headers


def _post_file(
    base_url: str,
    token: str,
    file_path: Path,
    idempotency_key: str,
    organization_object_id: str,
) -> dict[str, Any]:
    with file_path.open("rb") as payload:
        files = {"upload_file": (file_path.name, payload, "application/octet-stream")}
        resp = requests.post(
            f"{base_url}/api/v1/ingest",
            headers=_headers(token, idem=idempotency_key),
            files=files,
            params={"organization_object_id": organization_object_id},
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def _post(base_url: str, token: str, route: str) -> dict[str, Any]:
    resp = requests.post(f"{base_url}{route}", headers=_headers(token), timeout=180)
    resp.raise_for_status()
    return resp.json()


def _approve_mapping(base_url: str, token: str, batch_id: str) -> dict[str, Any]:
    resp = requests.post(
        f"{base_url}/api/v1/ingest/{batch_id}/mapping/approve",
        headers=_headers(token),
        params={"reviewer": "dry_run", "approve_all": "true"},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def _post_expect_status(base_url: str, token: str, route: str, expected_status: int, *, idem: str | None = None) -> dict[str, Any]:
    resp = requests.post(f"{base_url}{route}", headers=_headers(token, idem=idem), timeout=180)
    if resp.status_code != expected_status:
        raise RuntimeError(f"Expected {expected_status} on {route}, got {resp.status_code}: {resp.text}")
    return resp.json()


def _get(base_url: str, token: str, route: str) -> dict[str, Any]:
    resp = requests.get(f"{base_url}{route}", headers=_headers(token), timeout=120)
    resp.raise_for_status()
    return resp.json()


def _wait_for_terminal(base_url: str, token: str, batch_id: str, poll_seconds: int, timeout_seconds: int) -> dict[str, Any]:
    start = time.perf_counter()
    while True:
        status = _get(base_url, token, f"/api/v1/ingest/{batch_id}")
        if status.get("status") in TERMINAL_STATES:
            return status
        if (time.perf_counter() - start) >= timeout_seconds:
            raise TimeoutError(f"Batch {batch_id} did not reach terminal ETL state in {timeout_seconds}s")
        time.sleep(poll_seconds)


def _extract_blockers(payload: Any) -> int:
    if isinstance(payload, list) and payload and isinstance(payload[0], dict):
        return int(payload[0].get("blocked", 0))
    if isinstance(payload, dict):
        return int(payload.get("blocked", 0))
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="End-to-end dry-run for Universal AI Ingestor.")
    parser.add_argument("--base-url", required=True, help="API base URL, e.g. http://localhost:8000")
    parser.add_argument("--token", required=True, help="API_BEARER_TOKEN")
    parser.add_argument("--file", required=True, help="Path to sample file (CSV/JSON/XML/XLSX)")
    parser.add_argument("--organization-object-id", required=True, help="Default organization object id (ORG...)")
    parser.add_argument("--idempotency-key", required=True, help="Idempotency key for replay validation")
    parser.add_argument("--poll-seconds", type=int, default=2, help="Polling interval for ETL status")
    parser.add_argument("--timeout-seconds", type=int, default=900, help="Max ETL wait time before fail")
    parser.add_argument(
        "--auto-commit",
        action="store_true",
        help="Attempt commit only if no blockers are detected. Keep off when manual approvals are pending.",
    )
    parser.add_argument(
        "--rollback-after-commit",
        action="store_true",
        help="Run compensating rollback after successful commit (drill).",
    )
    args = parser.parse_args()

    sample_file = Path(args.file)
    if not sample_file.exists():
        raise SystemExit(f"File not found: {sample_file}")

    report: dict[str, Any] = {"checks": [], "batch_id": None}

    first = _post_file(
        args.base_url, args.token, sample_file, args.idempotency_key, args.organization_object_id
    )
    batch_id = first["batch_id"]
    report["batch_id"] = batch_id
    report["checks"].append({"name": "ingest_accepted", "ok": True, "batch_id": batch_id})

    discovery = _get(args.base_url, args.token, f"/api/v1/ingest/{batch_id}/discovery")
    report["checks"].append(
        {"name": "discovery_contract_generated", "ok": bool(discovery.get("contract")), "contract": discovery.get("contract")}
    )
    approved_mapping = _approve_mapping(args.base_url, args.token, batch_id)
    report["checks"].append(
        {"name": "mapping_contract_approved", "ok": approved_mapping.get("status") == "approved", "result": approved_mapping}
    )
    run_etl = _post(args.base_url, args.token, f"/api/v1/ingest/{batch_id}/run-etl")
    report["checks"].append({"name": "run_etl_started", "ok": run_etl.get("status") == "profiling", "result": run_etl})

    etl_status = _wait_for_terminal(args.base_url, args.token, batch_id, args.poll_seconds, args.timeout_seconds)
    etl_ok = etl_status.get("status") == "staging_loaded"
    report["checks"].append({"name": "etl_staging_loaded", "ok": etl_ok, "status": etl_status.get("status")})
    if not etl_ok:
        print(json.dumps(report, indent=2, ensure_ascii=True))
        raise SystemExit(1)

    resolve = _post(args.base_url, args.token, f"/api/v1/ingest/{batch_id}/resolve-dependencies")
    blockers = _extract_blockers(resolve.get("result"))
    report["checks"].append({"name": "resolve_dependencies", "ok": True, "blocked": blockers, "result": resolve.get("result")})

    integrity = _get(args.base_url, args.token, f"/api/v1/ingest/{batch_id}/integrity")
    integrity_payload = integrity.get("result")
    integrity_ok = False
    if isinstance(integrity_payload, list) and integrity_payload and isinstance(integrity_payload[0], dict):
        integrity_ok = bool(integrity_payload[0].get("ok"))
    elif isinstance(integrity_payload, dict):
        integrity_ok = bool(integrity_payload.get("ok"))
    report["checks"].append({"name": "integrity_ok", "ok": integrity_ok, "result": integrity_payload})

    dedup = _post(args.base_url, args.token, f"/api/v1/ingest/{batch_id}/deduplicate")
    report["checks"].append({"name": "deduplicate_invoked", "ok": True, "result": dedup.get("result")})

    media_process = _post(args.base_url, args.token, f"/api/v1/ingest/{batch_id}/media/process")
    report["checks"].append({"name": "media_process", "ok": True, "result": media_process})

    if args.auto_commit and blockers == 0 and integrity_ok:
        commit = _post(args.base_url, args.token, f"/api/v1/ingest/{batch_id}/commit")
        report["checks"].append({"name": "commit", "ok": True, "result": commit.get("result")})
    else:
        report["checks"].append(
            {
                "name": "commit",
                "ok": True,
                "skipped": True,
                "reason": "manual approval pending or blockers/integrity gate not satisfied",
            }
        )

    replay = _post_file(
        args.base_url, args.token, sample_file, args.idempotency_key, args.organization_object_id
    )
    replay_same_batch = replay.get("batch_id") == batch_id
    report["checks"].append(
        {
            "name": "idempotency_replay_same_batch",
            "ok": replay_same_batch,
            "first_batch_id": batch_id,
            "replay_batch_id": replay.get("batch_id"),
        }
    )

    mismatch_key = f"{args.idempotency_key}-mismatch"
    first_mismatch_seed = _post_file(
        args.base_url, args.token, sample_file, mismatch_key, args.organization_object_id
    )
    report["checks"].append({"name": "idempotency_conflict_seed", "ok": bool(first_mismatch_seed.get("batch_id"))})
    mismatch_resp = requests.post(
        f"{args.base_url}/api/v1/ingest",
        headers=_headers(args.token, idem=mismatch_key),
        data=b'{"different":"payload"}',
        params={"organization_object_id": args.organization_object_id},
        timeout=120,
    )
    report["checks"].append(
        {
            "name": "idempotency_mismatch_409",
            "ok": mismatch_resp.status_code == 409,
            "status_code": mismatch_resp.status_code,
        }
    )

    if args.auto_commit and blockers == 0 and integrity_ok:
        recommit = _post_expect_status(args.base_url, args.token, f"/api/v1/ingest/{batch_id}/commit", 409)
        report["checks"].append({"name": "recommit_guard_409", "ok": True, "result": recommit})
        if args.rollback_after_commit:
            rollback = _post(args.base_url, args.token, f"/api/v1/ingest/{batch_id}/rollback")
            report["checks"].append({"name": "rollback_compensating", "ok": True, "result": rollback.get("result")})

    all_ok = all(bool(item.get("ok")) for item in report["checks"])
    report["ok"] = all_ok
    print(json.dumps(report, indent=2, ensure_ascii=True))
    if not all_ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
