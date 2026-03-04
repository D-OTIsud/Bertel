from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str = Field(alias="SUPABASE_URL")
    supabase_service_key: str = Field(alias="SUPABASE_SERVICE_KEY")
    openai_api_key: str = Field(alias="OPENAI_API_KEY")
    api_bearer_token: str = Field(alias="API_BEARER_TOKEN")

    # Optional but recommended for schema introspection SQL.
    supabase_db_url: str | None = Field(default=None, alias="SUPABASE_DB_URL")
    raw_import_bucket: str = Field(default="raw_imports", alias="RAW_IMPORT_BUCKET")
    llm_model: str = Field(default="gpt-4o-mini", alias="LLM_MODEL")
    sample_rows: int = Field(default=5, alias="INGEST_SAMPLE_ROWS")
    cleaner_batch_size: int = Field(default=50, alias="CLEANER_BATCH_SIZE")
    etl_chunk_size: int = Field(default=500, alias="ETL_CHUNK_SIZE")
    etl_max_attempts: int = Field(default=3, alias="ETL_MAX_ATTEMPTS")
    etl_retry_backoff_seconds: int = Field(default=2, alias="ETL_RETRY_BACKOFF_SECONDS")
    media_bucket: str = Field(default="media", alias="MEDIA_BUCKET")
    media_download_timeout_seconds: int = Field(default=20, alias="MEDIA_DOWNLOAD_TIMEOUT_SECONDS")
    media_max_bytes: int = Field(default=15_000_000, alias="MEDIA_MAX_BYTES")
    media_allowed_domains: str = Field(default="", alias="MEDIA_ALLOWED_DOMAINS")
    media_confidence_auto: float = Field(default=0.9, alias="MEDIA_CONFIDENCE_AUTO")
    media_confidence_review: float = Field(default=0.6, alias="MEDIA_CONFIDENCE_REVIEW")


settings = Settings()
