from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class BatchStatus(str, Enum):
    received = "received"
    discovering = "discovering"
    discovery_ready = "discovery_ready"
    mapping_review_required = "mapping_review_required"
    mapping_approved = "mapping_approved"
    profiling = "profiling"
    mapping = "mapping"
    transforming = "transforming"
    staging_loaded = "staging_loaded"
    deduplicated = "deduplicated"
    committed = "committed"
    failed = "failed"
    failed_permanent = "failed_permanent"


class MappingTarget(BaseModel):
    table: str
    column: str
    transform: str = Field(
        default="identity",
        description="Transformation keyword like identity, split_gps, normalize_phone",
    )
    source_key: str = Field(description="Input key/column name in source file")
    source_sheet: str | None = Field(default=None, description="Optional source sheet name for workbook inputs")
    notes: str | None = None


class MappingPlan(BaseModel):
    source_format: str
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    targets: list[MappingTarget]
    unstructured_fields: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)


class SheetSample(BaseModel):
    sheet_name: str
    incoming_columns: list[str] = Field(default_factory=list)
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)


class WorkbookPayload(BaseModel):
    workbook_name: str | None = None
    sheets: list[SheetSample] = Field(default_factory=list)


class MultiSheetMappingPlan(BaseModel):
    source_format: str
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    per_sheet: dict[str, MappingPlan] = Field(default_factory=dict)
    assumptions: list[str] = Field(default_factory=list)


class CleanerItem(BaseModel):
    input_text: str
    normalized: dict[str, Any]
    quality_score: float = Field(ge=0.0, le=1.0, default=0.0)


class CleanerBatchOutput(BaseModel):
    items: list[CleanerItem]


class IngestAccepted(BaseModel):
    batch_id: str
    status: BatchStatus
    status_url: str


class BatchRecord(BaseModel):
    batch_id: str
    status: BatchStatus
    created_at: datetime
    updated_at: datetime
    filename: str | None = None
    content_type: str | None = None
    storage_path: str | None = None
    error: str | None = None
    mapping_plan: MappingPlan | None = None
    sheet_progress: dict[str, Any] | None = None


class DiscoveryFieldProposal(BaseModel):
    sheet_name: str
    source_column: str
    target_table: str
    target_column: str
    transform: str = "identity"
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    rationale: str = ""
    status: str = "proposed"


class DiscoveryRelationHypothesis(BaseModel):
    from_sheet: str
    from_column: str
    to_sheet: str = ""
    to_column: str = ""
    relation_type: str = "foreign_key_candidate"
    separator: str = Field(
        default=",",
        description="Delimiter found in the source column (e.g. ',', ';', '|')",
    )
    is_join_table: bool = Field(
        default=False,
        description="True when the entire sheet/node is a pure junction table linking two entities",
    )
    target_staging_table: str = Field(
        default="",
        description="Staging table to route resolved tokens to (e.g. 'object_org_link_temp', 'object_amenity_temp')",
    )
    target_entity_type: str = Field(
        default="",
        description="Semantic entity type of the target (org, amenity, payment, media, language, environment_tag)",
    )
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    rationale: str = ""
    status: str = "proposed"


class DiscoverySheetProfile(BaseModel):
    sheet_name: str
    inferred_entity_type: str
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    profile: dict[str, Any] = Field(default_factory=dict)


class DiscoveryContract(BaseModel):
    source_format: str
    overall_confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    assumptions: list[str] = Field(default_factory=list)
    fields: list[DiscoveryFieldProposal] = Field(default_factory=list)
    relations: list[DiscoveryRelationHypothesis] = Field(default_factory=list)
    sheets: list[DiscoverySheetProfile] = Field(default_factory=list)
