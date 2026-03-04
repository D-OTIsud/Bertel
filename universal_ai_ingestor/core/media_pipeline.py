from __future__ import annotations

import hashlib
import io
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import requests

from core.config import settings

ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _allowed_domains() -> set[str]:
    raw = (settings.media_allowed_domains or "").strip()
    if not raw:
        return set()
    return {item.strip().lower() for item in raw.split(",") if item.strip()}


def _check_media_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme.lower() != "https":
        raise ValueError("Only https media URLs are accepted")
    host = (parsed.hostname or "").lower()
    if not host:
        raise ValueError("Invalid media URL host")
    allow = _allowed_domains()
    if allow and host not in allow:
        raise ValueError(f"Media URL host not allowlisted: {host}")


def download_media(url: str) -> tuple[bytes, str]:
    _check_media_url(url)
    response = requests.get(url, timeout=settings.media_download_timeout_seconds, stream=True)
    response.raise_for_status()
    content_type = (response.headers.get("content-type") or "").split(";")[0].strip().lower()
    if content_type and content_type not in ALLOWED_IMAGE_MIME:
        raise ValueError(f"Unsupported media mime type: {content_type}")
    buffer = io.BytesIO()
    total = 0
    for chunk in response.iter_content(chunk_size=1024 * 64):
        if not chunk:
            continue
        total += len(chunk)
        if total > settings.media_max_bytes:
            raise ValueError("Media file too large")
        buffer.write(chunk)
    data = buffer.getvalue()
    if not data:
        raise ValueError("Empty media payload")
    return data, content_type or "application/octet-stream"


def upload_media_bytes(sb, *, object_id: str, source_url: str, payload: bytes, content_type: str) -> tuple[str, str]:
    digest = hashlib.sha256(payload).hexdigest()
    ext = "bin"
    if content_type == "image/jpeg":
        ext = "jpg"
    elif content_type == "image/png":
        ext = "png"
    elif content_type == "image/webp":
        ext = "webp"
    elif content_type == "image/gif":
        ext = "gif"
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = f"{object_id}/{ts}_{digest[:20]}.{ext}"
    sb.storage.from_(settings.media_bucket).upload(
        path=path,
        file=payload,
        file_options={"content-type": content_type, "upsert": "false"},
    )
    return path, digest


def derive_media_governance(*, mime_type: str, payload_sha: str) -> dict[str, Any]:
    # Deterministic baseline scoring: this can be replaced by real visual LLM scoring later.
    base_score = 0.92 if mime_type in {"image/jpeg", "image/png", "image/webp"} else 0.75
    decision = "auto_ready"
    if base_score < settings.media_confidence_review:
        decision = "blocked_low_confidence"
    elif base_score < settings.media_confidence_auto:
        decision = "review_required"
    return {
        "confidence": round(base_score, 4),
        "decision": decision,
        "model": "deterministic_mime_gate_v1",
        "prompt_version": "n/a",
        "schema_version": "v1",
        "features": {"mime_type": mime_type, "sha256_prefix": payload_sha[:12]},
    }
