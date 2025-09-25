"""Application configuration."""

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment driven configuration."""

    supabase_url: Optional[str] = None
    supabase_service_key: Optional[str] = None
    webhook_url: Optional[str] = None
    dashboard_retention: int = 200

    model_config = SettingsConfigDict(
        env_prefix="MIGRATION_",
        env_file=".env",
        env_file_encoding="utf-8",
    )


@lru_cache
def get_settings() -> Settings:
    """Return a cached instance of :class:`Settings`."""

    return Settings()


__all__ = ["Settings", "get_settings"]
