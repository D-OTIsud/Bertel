from __future__ import annotations

import argparse
import os
import sys
from typing import Iterable

from supabase import create_client


REQUIRED_ENV = (
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
    "OPENAI_API_KEY",
    "API_BEARER_TOKEN",
    "RAW_IMPORT_BUCKET",
    "MEDIA_BUCKET",
)


def _missing_env(keys: Iterable[str]) -> list[str]:
    missing: list[str] = []
    for key in keys:
        if not (os.getenv(key) or "").strip():
            missing.append(key)
    return missing


def _print(msg: str) -> None:
    print(msg, flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Preflight checks for Universal AI Ingestor go-live.")
    parser.add_argument(
        "--skip-bucket-check",
        action="store_true",
        help="Skip bucket existence check (useful if Storage API is temporarily unavailable).",
    )
    args = parser.parse_args()

    missing = _missing_env(REQUIRED_ENV)
    if missing:
        _print("FAIL missing required env vars:")
        for k in missing:
            _print(f"- {k}")
        raise SystemExit(2)

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_service_key = os.environ["SUPABASE_SERVICE_KEY"]
    bucket_name = os.environ["RAW_IMPORT_BUCKET"]
    media_bucket_name = os.environ["MEDIA_BUCKET"]
    sb = create_client(supabase_url, supabase_service_key)

    # Minimal RPC check to verify migration and API reachability.
    try:
        metrics_resp = sb.rpc("get_ingestor_metrics", {}).execute()
        if metrics_resp.data is None:
            _print("FAIL rpc get_ingestor_metrics returned no data.")
            raise SystemExit(3)
    except Exception as exc:  # noqa: BLE001
        _print(f"FAIL rpc get_ingestor_metrics not reachable: {exc}")
        raise SystemExit(3) from exc

    try:
        scheduler_resp = sb.rpc("get_ingestor_scheduler_health", {}).execute()
        if scheduler_resp.data is None:
            _print("FAIL rpc get_ingestor_scheduler_health returned no data.")
            raise SystemExit(3)
    except Exception as exc:  # noqa: BLE001
        _print(f"FAIL rpc get_ingestor_scheduler_health not reachable: {exc}")
        raise SystemExit(3) from exc

    if not args.skip_bucket_check:
        try:
            buckets = sb.storage.list_buckets()
            names = {b.get("name") for b in buckets if isinstance(b, dict)}
            if bucket_name not in names:
                _print(f"FAIL bucket not found: {bucket_name}")
                raise SystemExit(4)
            if media_bucket_name not in names:
                _print(f"FAIL bucket not found: {media_bucket_name}")
                raise SystemExit(4)
        except Exception as exc:  # noqa: BLE001
            _print(f"FAIL bucket check failed: {exc}")
            raise SystemExit(4) from exc

    _print("OK preflight check passed.")
    _print("- required env vars: present")
    _print("- rpc get_ingestor_metrics: reachable")
    _print("- rpc get_ingestor_scheduler_health: reachable")
    if args.skip_bucket_check:
        _print("- bucket existence: skipped")
    else:
        _print(f"- bucket existence: found `{bucket_name}` and `{media_bucket_name}`")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        _print("Interrupted.")
        sys.exit(130)
