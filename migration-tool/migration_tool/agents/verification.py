"""Agent supervising inserts and prompt adjustments."""

from __future__ import annotations

from typing import Any, Dict, List

from ..ai import PromptLibrary
from ..schemas import AgentContext
from ..telemetry import EventLog
from .base import Agent


class VerificationAgent(Agent):
    """Monitor agent outcomes and tune prompts when issues repeat."""

    name = "verification"
    description = (
        "Analyses routed fragments, tracks recurring Supabase errors, and adjusts"
        " agent prompting guidance so data flows into the correct tables."
    )

    def __init__(
        self,
        telemetry: EventLog,
        prompts: PromptLibrary,
        *,
        threshold: int = 3,
    ) -> None:
        super().__init__()
        self.telemetry = telemetry
        self.prompts = prompts
        self.threshold = max(1, threshold)
        self.expected_fields = []

    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        fragments: List[Dict[str, Any]] = payload.get("fragments", [])
        leftovers: Dict[str, Any] = payload.get("leftovers", {})
        observed_agents = list(context.agent_events.keys())
        adjustments: List[Dict[str, Any]] = []

        for agent_name in observed_agents:
            summary = self.prompts.error_summary(agent_name)
            if summary["count"] >= self.threshold and summary["messages"]:
                guidance = (
                    "Focus on resolving these recurring validation issues: "
                    + "; ".join(summary["messages"][-3:])
                    + ". Ensure emitted rows respect Supabase relations and constraints."
                )
                self.prompts.set_guidance(agent_name, guidance)
                adjustments.append(
                    {
                        "agent": agent_name,
                        "guidance": guidance,
                        "errors": summary,
                    }
                )
                self.telemetry.record(
                    "agent.verification.prompt_adjusted",
                    {
                        "agent": agent_name,
                        "guidance": guidance,
                        "errors": summary,
                        "coordinator_id": context.coordinator_id,
                    },
                )
                self.prompts.reset_errors(agent_name)

        review = {
            "status": "ok",
            "observed_agents": observed_agents,
            "fragments_reviewed": fragments,
            "leftovers": leftovers,
            "adjustments": adjustments,
        }
        context.share(self.name, review, overwrite=True)
        return review


__all__ = ["VerificationAgent"]
