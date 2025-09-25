"""Schedule agent handling opening hours data."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..schemas import AgentContext, ScheduleRecord, ScheduleTransformation
from ..supabase_client import SupabaseService
from ..telemetry import EventLog
from .base import Agent


class ScheduleAgent(Agent):
    name = "schedule"
    description = "Handles opening hours and schedule data."

    def __init__(self, supabase: SupabaseService, telemetry: EventLog) -> None:
        super().__init__()
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
        establishment_id = payload.get("establishment_id") or payload.get("object_id")
        if not establishment_id:
            return {"status": "error", "message": "Missing establishment_id"}

        # Extract schedule data from payload
        schedule_data = payload.get("horaires") or payload.get("schedule") or []
        
        # If it's a single schedule object, wrap it in a list
        if isinstance(schedule_data, dict):
            schedule_data = [schedule_data]
        
        # If it's nested in a "data" array, extract it
        if isinstance(schedule_data, list) and len(schedule_data) > 0:
            if isinstance(schedule_data[0], dict) and "data" in schedule_data[0]:
                schedule_data = schedule_data[0]["data"]

        created_schedules = []

        for schedule_item in schedule_data:
            if not isinstance(schedule_item, dict):
                continue

            # Extract schedule information
            schedule_record = self._extract_schedule_record(schedule_item, establishment_id)
            if not schedule_record:
                continue

            # Create the schedule in the database
            schedule_id = await self._create_schedule(schedule_record, context)
            if schedule_id:
                created_schedules.append(schedule_id)

        if created_schedules:
            return {
                "status": "ok",
                "operation": "upsert",
                "table": "object_schedule",
                "created_schedules": len(created_schedules),
                "response": created_schedules,
            }
        else:
            return {
                "status": "ok",
                "operation": "no_data",
                "message": "No valid schedule data found",
                "created_schedules": 0,
            }

    def _extract_schedule_record(self, schedule_data: Dict[str, Any], establishment_id: str) -> Optional[ScheduleRecord]:
        """Extract schedule record from raw data."""
        try:
            # Parse days from French format
            jours_str = schedule_data.get("jours") or ""
            days = self._parse_days(jours_str)
            
            if not days:
                return None

            # Extract time information
            am_start = schedule_data.get("AM_Start") or schedule_data.get("am_start")
            am_finish = schedule_data.get("AM_Finish") or schedule_data.get("am_finish")
            pm_start = schedule_data.get("PM_Start") or schedule_data.get("pm_start")
            pm_finish = schedule_data.get("PM_Finish") or schedule_data.get("pm_finish")
            
            # Check if reservation is required
            reservation_required = schedule_data.get("Révervation") or schedule_data.get("reservation_required") or False

            return ScheduleRecord(
                object_id=establishment_id,
                days=days,
                am_start=am_start,
                am_finish=am_finish,
                pm_start=pm_start,
                pm_finish=pm_finish,
                reservation_required=reservation_required,
                schedule_type="regular",
            )
        except Exception as e:
            self.telemetry.record(
                "agent.schedule.extract_error",
                {"error": str(e), "schedule_data": schedule_data},
            )
            return None

    def _parse_days(self, jours_str: str) -> List[str]:
        """Parse French day names to English day codes."""
        if not jours_str:
            return []

        # French to English mapping
        day_mapping = {
            "lundi": "monday",
            "mardi": "tuesday", 
            "mercredi": "wednesday",
            "jeudi": "thursday",
            "vendredi": "friday",
            "samedi": "saturday",
            "dimanche": "sunday",
            "monday": "monday",
            "tuesday": "tuesday",
            "wednesday": "wednesday",
            "thursday": "thursday",
            "friday": "friday",
            "saturday": "saturday",
            "sunday": "sunday",
        }

        days = []
        # Split by comma and clean up
        for day_part in jours_str.split(","):
            day_clean = day_part.strip().lower()
            if day_clean in day_mapping:
                days.append(day_mapping[day_clean])
        
        return days

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
