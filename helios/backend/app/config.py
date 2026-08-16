from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./helios.db"

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7

    user_llm_api_key: str = ""
    user_llm_base_url: str = "https://api.openai.com/v1"
    user_llm_model: str = "gpt-4o-mini"
    user_llm_embedding_model: str = "text-embedding-3-small"
    llm_timeout_seconds: float = 60.0
    llm_max_tool_iterations: int = 5

    memory_top_k: int = 5

    @field_validator("jwt_secret")
    @classmethod
    def _jwt_secret_must_be_strong(cls, v: str) -> str:
        if v == "change-me" or len(v) < 32:
            raise ValueError(
                "jwt_secret must be a strong value of at least 32 characters "
                "(set the JWT_SECRET env var or jwt_secret in .env)"
            )
        return v


settings = Settings()
