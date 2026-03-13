from __future__ import annotations

import asyncio
import logging

try:
    from core.target_schema import build_target_schema_context
    from core.vector_store import prewarm_target_schema
except ModuleNotFoundError:
    from universal_ai_ingestor.core.target_schema import build_target_schema_context  # type: ignore
    from universal_ai_ingestor.core.vector_store import prewarm_target_schema  # type: ignore

logger = logging.getLogger("ingestor.prewarm")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


async def _main() -> int:
    ok = await prewarm_target_schema(build_target_schema_context())
    if ok:
        logger.info("Vector target-schema prewarm complete.")
        return 0
    logger.info("Vector target-schema prewarm skipped or unavailable.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
