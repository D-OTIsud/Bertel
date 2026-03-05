"""Tests for the v2 API surface (health, orgs, ingest, status, mapping, execute, rollback, purge)."""
from __future__ import annotations

import os
import sys
import types
from types import SimpleNamespace

import pytest

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("API_BEARER_TOKEN", "test-token")

if "multipart" not in sys.modules:
    try:
        __import__("multipart")
    except Exception:  # noqa: BLE001
        pytest.skip("python-multipart required", allow_module_level=True)

if "langchain_openai" not in sys.modules:
    langchain_openai = types.ModuleType("langchain_openai")

    class _DummyChatOpenAI:
        def __init__(self, *a, **kw):
            pass
        def with_structured_output(self, *a, **kw):
            return self
        def invoke(self, *a, **kw):
            return {}

    langchain_openai.ChatOpenAI = _DummyChatOpenAI
    sys.modules["langchain_openai"] = langchain_openai

if "langgraph.graph" not in sys.modules:
    langgraph = types.ModuleType("langgraph")
    langgraph_graph = types.ModuleType("langgraph.graph")

    class _DummyStateGraph:
        def __init__(self, *a, **kw):
            pass
        def add_node(self, *a, **kw):
            return None
        def add_edge(self, *a, **kw):
            return None
        def compile(self):
            return self

    langgraph_graph.START = "START"
    langgraph_graph.END = "END"
    langgraph_graph.StateGraph = _DummyStateGraph
    sys.modules["langgraph"] = langgraph
    sys.modules["langgraph.graph"] = langgraph_graph

from fastapi.testclient import TestClient  # noqa: E402
from universal_ai_ingestor.api import main as api_main  # noqa: E402

AUTH = {"Authorization": "Bearer test-token"}


class _FakeExecute:
    def __init__(self, data):
        self.data = data


class _FakeTableQuery:
    def __init__(self, data=None):
        self._data = data or []
    def select(self, *a, **kw):
        return self
    def eq(self, *a, **kw):
        return self
    def order(self, *a, **kw):
        return self
    def limit(self, *a, **kw):
        return self
    def ilike(self, *a, **kw):
        return self
    def update(self, *a, **kw):
        return self
    def in_(self, *a, **kw):
        return self
    def insert(self, *a, **kw):
        return self
    def upsert(self, *a, **kw):
        return self
    def execute(self):
        return _FakeExecute(self._data)


class _FakeSchema:
    def __init__(self, data=None):
        self._data = data or []
    def table(self, name):
        return _FakeTableQuery(self._data)


class _FakeSupabase:
    def __init__(self, data=None):
        self._data = data or []
    def schema(self, name):
        return _FakeSchema(self._data)
    def table(self, name):
        return _FakeTableQuery(self._data)
    def rpc(self, name, payload=None):
        return SimpleNamespace(execute=lambda: _FakeExecute({"ok": True}))


def test_health():
    client = TestClient(api_main.app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_auth_rejects_bad_token():
    client = TestClient(api_main.app)
    r = client.get("/api/v1/orgs", headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401


def test_auth_rejects_missing_token():
    client = TestClient(api_main.app)
    r = client.get("/api/v1/orgs")
    assert r.status_code == 401


def test_list_orgs(monkeypatch):
    monkeypatch.setattr(api_main, "get_supabase", lambda: _FakeSupabase([
        {"id": "org-1", "name": "Test Org", "object_type": "ORG"},
    ]))
    client = TestClient(api_main.app)
    r = client.get("/api/v1/orgs", headers=AUTH)
    assert r.status_code == 200
    assert len(r.json()["orgs"]) == 1


def test_ingest_rejects_oversized(monkeypatch):
    monkeypatch.setattr(api_main, "MAX_INGEST_BYTES", 10)
    client = TestClient(api_main.app)
    r = client.post(
        "/api/v1/ingest",
        headers=AUTH,
        params={"organization_object_id": "org-1"},
        files={"upload_file": ("big.csv", b"x" * 20, "text/csv")},
    )
    assert r.status_code == 413


def test_batch_status_404(monkeypatch):
    monkeypatch.setattr(api_main, "get_supabase", lambda: _FakeSupabase([]))
    client = TestClient(api_main.app)
    r = client.get("/api/v1/ingest/nonexistent", headers=AUTH)
    assert r.status_code == 404


def test_mapping_patch_404_no_contract(monkeypatch):
    monkeypatch.setattr(api_main, "get_supabase", lambda: _FakeSupabase([]))
    client = TestClient(api_main.app)
    r = client.patch(
        "/api/v1/ingest/batch-1/mapping",
        headers=AUTH,
        json={"corrections": [{"field_id": "f1", "target_table": "object_temp", "target_column": "name"}]},
    )
    assert r.status_code == 404


def test_rollback(monkeypatch):
    monkeypatch.setattr(api_main, "get_supabase", lambda: _FakeSupabase())
    client = TestClient(api_main.app)
    r = client.post("/api/v1/ingest/batch-1/rollback", headers=AUTH)
    assert r.status_code == 200


def test_purge(monkeypatch):
    monkeypatch.setattr(api_main, "get_supabase", lambda: _FakeSupabase())
    client = TestClient(api_main.app)
    r = client.post("/api/v1/ingest/batch-1/purge", headers=AUTH)
    assert r.status_code == 200
