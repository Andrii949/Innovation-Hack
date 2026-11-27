from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_CORS_ORIGINS = "http://localhost:5173,https://localhost,capacitor://localhost"


class Settings(BaseSettings):
    """Process configuration from the environment and an optional `.env` file."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://lab:lab@localhost:5432/lab"
    cors_origins: str = DEFAULT_CORS_ORIGINS
    public_base_url: str = "http://localhost:8000"
    files_dir: Path = Path("files")
    timezone: str = "Europe/Warsaw"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
