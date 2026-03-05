from __future__ import annotations

import os
import sys
import types

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("API_BEARER_TOKEN", "admin-token")

if "multipart" not in sys.modules:
    try:
        __import__("multipart")
    except Exception:  # noqa: BLE001
        pytest.skip("python-multipart is required for API app import", allow_module_level=True)

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


class _FakeExecute:
    def __init__(self, data):
        self.data = data


class _FakeTableQuery:
    def __init__(self, table_name: str):
        self._table_name = table_name

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def update(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self._table_name == "mapping_contract":
            return _FakeExecute([{"id": "contract-1", "status": "review_required"}])
        if self._table_name == "mapping_contract_field":
            return _FakeExecute([])
        if self._table_name == "mapping_relation_hypothesis":
            return _FakeExecute([])
        return _FakeExecute([])


class _FakeSchema:
    def table(self, table_name: str):
        return _FakeTableQuery(table_name)


class _FakeSupabase:
    def schema(self, _name: str):
        return _FakeSchema()


def test_review_mapping_field_rejects_invalid_target(monkeypatch) -> None:
    monkeypatch.setattr(api_main, "get_supabase", lambda: _FakeSupabase())
    client = TestClient(api_main.app)
    response = client.post(
        "/api/v1/ingest/batch-1/mapping/review-field",
        headers={"Authorization": "Bearer admin-token"},
        params={
            "field_id": "f1",
            "decision": "approve",
            "reviewer": "r1",
            "target_table": "object_temp",
            "target_column": "source_url",
            "transform": "identity",
        },
    )
    assert response.status_code == 400
    assert "Unsupported target_column" in response.json()["error"]
