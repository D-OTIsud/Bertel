"""Schedule agent handling opening hours data."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..ai import LLMClient
from ..schemas import AgentContext, ScheduleRecord, ScheduleTransformation
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import AIEnabledAgent


class ScheduleAgent(AIEnabledAgent):
    name = "schedule"
    description = "Handles opening hours and schedule data."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog, llm: LLMClient) -> None:
        super().__init__(llm)
        self.supabase = supabase
        self.telemetry = telemetry
        self.expected_fields = [
            "horaires",
            "schedule",
            "jours",
            "AM_Start",
            "AM_Finish",
            "PM_Start",
            "PM_Finish",
            "Révervation",
        ]

    async def handle(self, payload: Dict[str, Any], context: AgentContext) -> Dict[str, Any]:
        establishment_id = (
            payload.get("establishment_id")
            or payload.get("object_id")
            or context.object_id
        )
        if not establishment_id:
            context.share(
                self.name,
                {"error": "missing_establishment_id", "payload": payload},
                overwrite=True,
            )
            return {"status": "error", "message": "Missing establishment_id"}

        # Use AI to transform the payload into structured schedule data
        transformation = await self.llm.transform_fragment(
            agent_name=self.name,
            payload=payload,
            response_model=ScheduleTransformation,
            context=context.snapshot(),
        )
        
        self.telemetry.record(
            "agent.schedule.transform",
            {
                "context": context.model_dump(),
                "payload": payload,
                "transformation": transformation.model_dump(),
            },
        )

        created_schedules = []

        for schedule_record in transformation.schedules:
            if not schedule_record.days:
                continue

            # Ensure the schedule is linked to the establishment
            schedule_record.object_id = establishment_id

            # Create the schedule in the database
            schedule_id = await self._create_schedule(schedule_record, context)
            if schedule_id:
                created_schedules.append(schedule_id)

        payload_summary = {
            "schedules": [record.model_dump() for record in transformation.schedules],
            "created_schedules": created_schedules,
        }
        if created_schedules:
            context.share(
                self.name,
                payload_summary | {"status": "upsert"},
                overwrite=True,
            )
            return {
                "status": "ok",
                "operation": "upsert",
                "table": "object_schedule",
                "created_schedules": len(created_schedules),
                "response": created_schedules,
            }
        context.share(
            self.name,
            payload_summary | {"status": "no_data"},
            overwrite=True,
        )
        return {
            "status": "ok",
            "operation": "no_data",
            "message": "No valid schedule data found",
            "created_schedules": 0,
        }


    async def _create_schedule(self, schedule_record: ScheduleRecord, context: AgentContext) -> Optional[str]:
        """Create a new schedule in the database."""
        try:
            # Generate a new UUID for the schedule
            import uuid
            schedule_id = str(uuid.uuid4())
            
            # Prepare data for insertion
            schedule_data = schedule_record.to_supabase()
            schedule_data["id"] = schedule_id

            result = await self.supabase.upsert("object_schedule", schedule_data, on_conflict="id")
            
            self.telemetry.record(
                "agent.schedule.create",
                {
                    "context": context.model_dump(),
                    "schedule_id": schedule_id,
                    "schedule_data": schedule_data,
                },
            )
            
            return schedule_id
        except Exception as e:
            self.telemetry.record(
                "agent.schedule.create_error",
                {
                    "error": str(e),
                    "schedule_record": schedule_record.to_supabase(),
                    "context": context.model_dump(),
                },
            )
            return None


__all__ = ["ScheduleAgent"]
