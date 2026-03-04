from __future__ import annotations

import os
import sys
import types
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

# Ensure required settings exist before importing API module.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("API_BEARER_TOKEN", "admin-token")

if "multipart" not in sys.modules:
    try:
        __import__("multipart")
    except Exception:  # noqa: BLE001
        pytest.skip("python-multipart is required for API app import", allow_module_level=True)

# Optional runtime deps for ai_graph are not needed for these tests.
if "langchain_openai" not in sys.modules:
    langchain_openai = types.ModuleType("langchain_openai")

    class _DummyChatOpenAI:
        def __init__(self, *args, **kwargs):
            pass

        def with_structured_output(self, *_args, **_kwargs):
            return self

        def invoke(self, *_args, **_kwargs):
            return {}

    langchain_openai.ChatOpenAI = _DummyChatOpenAI
    sys.modules["langchain_openai"] = langchain_openai

if "langgraph.graph" not in sys.modules:
    langgraph = types.ModuleType("langgraph")
    langgraph_graph = types.ModuleType("langgraph.graph")

    class _DummyStateGraph:
        def __init__(self, *_args, **_kwargs):
            pass

        def add_node(self, *_args, **_kwargs):
            return None

        def add_edge(self, *_args, **_kwargs):
            return None

        def compile(self):
            return self

    langgraph_graph.START = "START"
    langgraph_graph.END = "END"
    langgraph_graph.StateGraph = _DummyStateGraph
    sys.modules["langgraph"] = langgraph
    sys.modules["langgraph.graph"] = langgraph_graph

from universal_ai_ingestor.api import main as api_main  # noqa: E402
from universal_ai_ingestor.core.schemas import BatchRecord, BatchStatus  # noqa: E402


class _FakeExecute:
    def __init__(self, data):
        self.data = data


class _FakeTableQuery:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        return _FakeExecute(self._rows)


class _FakeSchema:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return _FakeTableQuery(self._rows)


class _FakeSupabase:
    def __init__(self, rows):
        self._rows = rows

    def schema(self, _name):
        return _FakeSchema(self._rows)

    def rpc(self, _name, _payload=None):
        return SimpleNamespace(execute=lambda: _FakeExecute({"ok": True}))


def test_ingest_rejects_oversized_payload(monkeypatch) -> None:
    monkeypatch.setattr(api_main.settings, "api_operator_token", "operator-token")
    monkeypatch.setattr(api_main.settings, "ingest_max_bytes", 10)
    monkeypatch.setattr(api_main, "MAX_INGEST_BYTES", 10)
    client = TestClient(api_main.app)

    response = client.post(
        "/api/v1/ingest",
        headers={"Authorization": "Bearer operator-token"},
        params={"organization_object_id": "ORG001"},
        files={"upload_file": ("big.csv", b"0123456789ABCDEF", "text/csv")},
    )

    assert response.status_code == 413
    assert "Payload too large" in response.json()["detail"]


def test_list_batches_applies_limit_offset_and_max_cap(monkeypatch) -> None:
    monkeypatch.setattr(api_main.settings, "api_operator_token", "operator-token")
    monkeypatch.setattr(api_main.settings, "ingest_list_default_limit", 2)
    monkeypatch.setattr(api_main.settings, "ingest_list_max_limit", 3)
    monkeypatch.setattr(
        api_main,
        "get_supabase",
        lambda: _FakeSupabase(
            [
                {"batch_id": "db-1", "status": "mapping", "updated_at": "2026-01-01T00:00:00+00:00", "metadata": {"filename": "a.csv"}},
                {"batch_id": "db-2", "status": "mapping", "updated_at": "2026-01-02T00:00:00+00:00", "metadata": {"filename": "b.csv"}},
                {"batch_id": "db-3", "status": "mapping", "updated_at": "2026-01-03T00:00:00+00:00", "metadata": {"filename": "c.csv"}},
            ]
        ),
    )

    now = datetime.now(timezone.utc)
    api_main.batch_registry.clear()
    api_main.batch_registry["mem-1"] = BatchRecord(
        batch_id="mem-1",
        status=BatchStatus.profiling,
        created_at=now,
        updated_at=now,
        filename="mem.csv",
    )

    client = TestClient(api_main.app)

    ok = client.get(
        "/api/v1/ingest",
        headers={"Authorization": "Bearer operator-token"},
        params={"limit": 2, "offset": 1},
    )
    assert ok.status_code == 200
    assert len(ok.json()) <= 2

    bad = client.get(
        "/api/v1/ingest",
        headers={"Authorization": "Bearer operator-token"},
        params={"limit": 4},
    )
    assert bad.status_code == 400
    assert "limit must be <=" in bad.json()["detail"]


def test_rbac_enforced_between_operator_reviewer_admin(monkeypatch) -> None:
    monkeypatch.setattr(api_main.settings, "api_operator_token", "operator-token")
    monkeypatch.setattr(api_main.settings, "api_reviewer_token", "reviewer-token")
    monkeypatch.setattr(api_main.settings, "api_admin_token", "admin-token")
    monkeypatch.setattr(api_main, "get_supabase", lambda: _FakeSupabase([]))

    client = TestClient(api_main.app)

    operator_on_admin = client.get(
        "/api/v1/metrics",
        headers={"Authorization": "Bearer operator-token"},
    )
    assert operator_on_admin.status_code == 403

    reviewer_on_operator = client.post(
        "/api/v1/ingest",
        headers={"Authorization": "Bearer reviewer-token"},
        params={"organization_object_id": "ORG001"},
        files={"upload_file": ("tiny.csv", b"a,b\n1,2\n", "text/csv")},
    )
    assert reviewer_on_operator.status_code == 403

    admin_on_admin = client.get(
        "/api/v1/metrics",
        headers={"Authorization": "Bearer admin-token"},
    )
    assert admin_on_admin.status_code == 200
