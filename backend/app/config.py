from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    clerk_jwks_url: str
    clerk_issuer: str
    cors_origins: list[str] = ["http://localhost:3000"]
    environment: str = "local"


@lru_cache
def get_settings() -> Settings:
    return Settings()
