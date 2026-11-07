#!/usr/bin/env python3
"""Synchronize the generated regional extension allowlist into the SQL migration."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


LEGACY_BLOCK = re.compile(
    r"-- Generated from field-mapping\.csv:.*?"
    r"ON CONFLICT \(profile, path\) DO NOTHING;\s*",
    re.DOTALL,
)
SAFE_PAYLOAD = re.compile(
    r"(?<=\$safe_allowlist\$).*?(?=\$safe_allowlist\$::jsonb)",
    re.DOTALL,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--allowlist",
        default="docs/integrations/tourinsoft/reunion-regional-v1/extension-allowlist.json",
    )
    parser.add_argument(
        "--migration",
        default="supabase/migrations/20260731041455_tourinsoft_reunion_regional_v1.sql",
    )
    args = parser.parse_args()

    allowlist_path = Path.cwd() / args.allowlist
    migration_path = Path.cwd() / args.migration
    allowlist = json.loads(allowlist_path.read_text(encoding="utf-8"))
    if len(allowlist) != 6:
        raise SystemExit(f"expected six allowlist profiles, found {len(allowlist)}")

    migration = migration_path.read_text(encoding="utf-8")
    migration, legacy_count = LEGACY_BLOCK.subn("", migration, count=1)
    payload = json.dumps(allowlist, ensure_ascii=False, separators=(",", ":"))
    migration, safe_count = SAFE_PAYLOAD.subn(payload, migration, count=1)
    if safe_count != 1:
        raise SystemExit("$safe_allowlist$ payload not found exactly once")
    migration_path.write_text(migration, encoding="utf-8", newline="\n")
    print(
        f"Tourinsoft regional SQL allowlist synchronized: {len(allowlist)} profiles; "
        f"obsolete block removed={legacy_count == 1} -> {migration_path}"
    )


if __name__ == "__main__":
    main()
