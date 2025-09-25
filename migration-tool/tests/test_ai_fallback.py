"""Tests covering AI provider fallback behaviour."""

import warnings

from migration_tool.ai import RuleBasedLLM, build_llm
from migration_tool.config import Settings
from migration_tool.main import create_app


def test_build_llm_falls_back_without_api_key() -> None:
    """Selecting the OpenAI provider without a key should degrade gracefully."""

    with warnings.catch_warnings(record=True) as captured:
        warnings.simplefilter("always")
        llm = build_llm(provider="openai", api_key=None, model="gpt-4o-mini", temperature=0.0)

    assert isinstance(llm, RuleBasedLLM)
    assert any("falling back" in str(w.message).lower() for w in captured)


def test_create_app_recovers_when_build_llm_fails(monkeypatch) -> None:
    """The FastAPI factory should recover if LLM initialisation blows up."""

    def _boom(**_: object) -> None:  # pragma: no cover - invoked via monkeypatch
        raise RuntimeError("synthetic failure")

    monkeypatch.setattr("migration_tool.main.build_llm", _boom)

    settings = Settings(ai_provider="openai")

    app = create_app(settings)

    assert hasattr(app, "router")
