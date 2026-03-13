"""Tests for the v2 API surface (health, orgs, ingest, status, mapping, execute, rollback, purge)."""
from __future__ import annotations

import os
import sys
import types
from types import SimpleNamespace

import pandas as pd
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
    sys.modules["langchain_openai"] = langchain_openai
else:
    langchain_openai = sys.modules["langchain_openai"]


class _DummyChatOpenAI:
    def __init__(self, *a, **kw):
        pass

    def with_structured_output(self, *a, **kw):
        return self

    def invoke(self, *a, **kw):
        return {}


class _DummyOpenAIEmbeddings:
    def __init__(self, *a, **kw):
        pass

    async def aembed_query(self, *a, **kw):
        return [0.0]


langchain_openai.ChatOpenAI = _DummyChatOpenAI
langchain_openai.OpenAIEmbeddings = _DummyOpenAIEmbeddings

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

        def add_conditional_edges(self, *a, **kw):
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


class _RecordingTableQuery(_FakeTableQuery):
    def __init__(self, data=None):
        super().__init__(data)
        self.updated_payloads: list[dict[str, object]] = []

    def update(self, payload, *a, **kw):
        self.updated_payloads.append(dict(payload))
        return self


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


class _RecordingSchema:
    def __init__(self, query: _RecordingTableQuery):
        self._query = query

    def table(self, name):
        return self._query


class _RecordingSupabase(_FakeSupabase):
    def __init__(self, query: _RecordingTableQuery):
        self._query = query

    def schema(self, name):
        return _RecordingSchema(self._query)

    def table(self, name):
        return self._query


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


def test_startup_config_skips_validation_outside_production(monkeypatch):
    monkeypatch.setattr(api_main.settings, "app_env", "development")
    monkeypatch.setattr(api_main.settings, "supabase_url", "")
    api_main._validate_startup_config()


def test_startup_config_requires_secrets_in_production(monkeypatch):
    monkeypatch.setattr(api_main.settings, "app_env", "production")
    monkeypatch.setattr(api_main.settings, "supabase_url", "")
    monkeypatch.setattr(api_main.settings, "supabase_service_key", "")
    monkeypatch.setattr(api_main.settings, "api_bearer_token", "")
    monkeypatch.setattr(api_main.settings, "openai_api_key", "")
    with pytest.raises(RuntimeError):
        api_main._validate_startup_config()


def test_list_orgs(monkeypatch):
    monkeypatch.setattr(api_main, "get_supabase", lambda: _FakeSupabase([
        {"id": "org-1", "name": "Test Org", "object_type": "ORG"},
    ]))
    client = TestClient(api_main.app)
    r = client.get("/api/v1/orgs", headers=AUTH)
    assert r.status_code == 200
    assert len(r.json()["orgs"]) == 1


def test_ingest_accepts_valid_upload(monkeypatch):
    async def _fake_build_discovery_contract(**kwargs):
        return SimpleNamespace(
            fields=[],
            relations=[],
            source_format="xlsx",
            overall_confidence=0.95,
            assumptions=[],
            sheets=[],
        )

    monkeypatch.setattr(api_main, "get_supabase", lambda: _FakeSupabase())
    monkeypatch.setattr(api_main, "find_batch_by_idempotency", lambda *a, **kw: None)
    monkeypatch.setattr(api_main, "hash_payload", lambda payload: "sha256")
    monkeypatch.setattr(api_main, "store_raw_payload", lambda *a, **kw: "raw/path.xlsx")
    monkeypatch.setattr(api_main, "ensure_import_batch_row_extended", lambda *a, **kw: None)
    monkeypatch.setattr(api_main, "append_import_event", lambda *a, **kw: None)
    monkeypatch.setattr(api_main, "update_import_batch_row", lambda *a, **kw: None)
    monkeypatch.setattr(
        api_main,
        "parse_payload",
        lambda *a, **kw: SimpleNamespace(
            source_format="xlsx",
            dataframe=pd.DataFrame({"Nom": ["Hotel A"]}),
            workbook_sheets=None,
        ),
    )
    monkeypatch.setattr(api_main, "build_discovery_contract", _fake_build_discovery_contract)
    monkeypatch.setattr(
        api_main,
        "persist_discovery_contract",
        lambda *a, **kw: {"contract_id": "c1", "status": "review_required"},
    )

    client = TestClient(api_main.app)
    r = client.post(
        "/api/v1/ingest",
        headers=AUTH,
        params={"organization_object_id": "ORGGEN0000000001"},
        files={
            "upload_file": (
                "sample.xlsx",
                b"fake-bytes",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert r.status_code == 202
    assert r.json()["status"] == "mapping_review_required"


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


def test_mapping_patch_persists_position(monkeypatch):
    query = _RecordingTableQuery()
    monkeypatch.setattr(api_main, "get_supabase", lambda: _RecordingSupabase(query))
    monkeypatch.setattr(api_main, "_latest_contract", lambda *a, **kw: {"id": "contract-1"})

    client = TestClient(api_main.app)
    r = client.patch(
        "/api/v1/ingest/batch-1/mapping",
        headers=AUTH,
        json={
            "corrections": [
                {
                    "field_id": "f1",
                    "target_table": "object_location_temp",
                    "target_column": "address1",
                    "transform": "concat_text",
                    "position": 2,
                }
            ]
        },
    )

    assert r.status_code == 200
    assert r.json()["updated"] == 1
    assert query.updated_payloads
    assert query.updated_payloads[0]["position"] == 2
    assert query.updated_payloads[0]["transform"] == "concat_text"


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

