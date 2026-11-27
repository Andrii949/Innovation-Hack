from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_CORS_ORIGINS = "http://localhost:5173,https://localhost,capacitor://localhost"


@dataclass(frozen=True)
class OcrConfig:
    api_url: str | None
    api_key: str | None
    model: str
    timeout_s: float

    @property
    def is_configured(self) -> bool:
        return bool(self.api_url and self.api_key)

    @property
    def provider_name(self) -> str:
        if not self.api_url:
            return "disabled"
        parsed = urlparse(self.api_url)
        return parsed.hostname or "external"


class Settings(BaseSettings):
    """Process configuration from the environment and an optional `.env` file."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://lab:lab@localhost:5432/lab"
    cors_origins: str = DEFAULT_CORS_ORIGINS
    public_base_url: str = "http://localhost:8000"
    files_dir: Path = Path("files")
    timezone: str = "Europe/Warsaw"
    fcm_credentials_file: Path | None = None

    ocr_api_url: str | None = None
    ocr_api_key: str | None = None
    ocr_model: str = "qwen-vl-max"
    ocr_timeout_s: float = 30.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def ocr_config(self) -> OcrConfig:
        return OcrConfig(
            api_url=self.ocr_api_url.strip() if self.ocr_api_url else None,
            api_key=self.ocr_api_key.strip() if self.ocr_api_key else None,
            model=self.ocr_model.strip() or "qwen-vl-max",
            timeout_s=self.ocr_timeout_s,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
