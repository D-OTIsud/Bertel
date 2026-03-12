from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_key: str = Field(default="", alias="SUPABASE_SERVICE_KEY")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    api_bearer_token: str = Field(default="", alias="API_BEARER_TOKEN")

    raw_import_bucket: str = Field(default="raw_imports", alias="RAW_IMPORT_BUCKET")
    llm_model: str = Field(default="gpt-4o", alias="LLM_MODEL")
    sample_rows: int = Field(default=5, alias="INGEST_SAMPLE_ROWS")
    cleaner_batch_size: int = Field(default=50, alias="CLEANER_BATCH_SIZE")
    etl_chunk_size: int = Field(default=500, alias="ETL_CHUNK_SIZE")
    etl_max_attempts: int = Field(default=3, alias="ETL_MAX_ATTEMPTS")
    etl_retry_backoff_seconds: int = Field(default=2, alias="ETL_RETRY_BACKOFF_SECONDS")
    ingest_max_bytes: int = Field(default=25_000_000, alias="INGEST_MAX_BYTES")
    app_env: str = Field(default="development", alias="APP_ENV")
    min_confidence_threshold: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        alias="MIN_CONFIDENCE_THRESHOLD",
    )
    min_sheet_confidence_threshold: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        alias="MIN_SHEET_CONFIDENCE_THRESHOLD",
    )
    vector_db_url: str = Field(default="", alias="VECTOR_DB_URL")

    def missing_required_settings(self, *, require_openai: bool = True) -> list[str]:
        required = {
            "SUPABASE_URL": self.supabase_url,
            "SUPABASE_SERVICE_KEY": self.supabase_service_key,
            "API_BEARER_TOKEN": self.api_bearer_token,
        }
        if require_openai:
            required["OPENAI_API_KEY"] = self.openai_api_key
        return [name for name, value in required.items() if not str(value or "").strip()]


settings = Settings()
