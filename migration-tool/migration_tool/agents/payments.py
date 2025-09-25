from __future__ import annotations

from typing import Any, Dict

from ..ai import LLMClient
from ..schemas import AgentContext, PaymentMethodTransformation
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import AIEnabledAgent


class PaymentMethodAgent(AIEnabledAgent):
    """Agent that links accepted payment methods to the object."""

    name = "payments"
    description = "Registers accepted payment methods for the establishment."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog, llm: LLMClient) -> None:
        super().__init__(llm)
        self.supabase = supabase
        self.telemetry = telemetry
        self.expected_fields = ["payment_methods", "mode_de_paiement"]

    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        transformation = await self.llm.transform_fragment(
            agent_name=self.name,
            payload=payload,
            response_model=PaymentMethodTransformation,
        )
        responses = []
        for record in transformation.payment_methods:
            payment_code = (record.payment_code or "").strip()
            if not payment_code and record.payment_name:
                payment_code = self.supabase.normalize_code(record.payment_name)
            if not payment_code:
                continue

            method_id = await self.supabase.ensure_code(
                domain="payment_method",
                code=payment_code,
                name=record.payment_name or payment_code.replace("_", " ").title(),
            )
            data = record.to_supabase(payment_method_id=method_id)
            responses.append(
                await self.supabase.upsert(
                    "object_payment_method",
                    data,
                    on_conflict="object_id,payment_method_id",
                )
            )

        self.telemetry.record(
            "agent.payments.transform",
            {
                "context": context.model_dump(),
                "payload": payload,
                "payment_methods": [record.model_dump() for record in transformation.payment_methods],
            },
        )

        return {
            "status": "ok",
            "operation": "upsert",
            "table": "object_payment_method",
            "responses": responses,
        }


__all__ = ["PaymentMethodAgent"]
