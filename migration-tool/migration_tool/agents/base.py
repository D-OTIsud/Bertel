"""Agent protocol."""

from __future__ import annotations

import abc
from typing import Any, Dict, Iterable

from ..schemas import AgentContext, AgentDescriptor


class Agent(abc.ABC):
    """Abstract base class for specialised agents."""

    name: str = "agent"
    description: str = ""

    def __init__(self) -> None:
        self.expected_fields: Iterable[str] = []

    @abc.abstractmethod
    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        """Handle a payload fragment and return a result dictionary."""

    def descriptor(self) -> AgentDescriptor:
        return AgentDescriptor(
            name=self.name,
            description=self.description,
            expected_fields=list(self.expected_fields),
        )


__all__ = ["Agent"]
