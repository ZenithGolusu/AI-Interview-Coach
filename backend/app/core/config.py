"""Application configuration using pydantic-settings."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_name: str = "AI Interview Coach"
    app_env: str = "development"
    debug: bool = False
    secret_key: str = "change-me-in-production"

    # Database
    database_url: str = "postgresql+asyncpg://interview_user:interview_pass@localhost:5432/interview_coach_db"
    sync_database_url: str = "postgresql://interview_user:interview_pass@localhost:5432/interview_coach_db"

    @property
    def formatted_database_url(self) -> str:
        url = self.database_url
        # asyncpg uses 'ssl' not 'sslmode' — strip sslmode and inject ssl=require
        import re
        url = re.sub(r'[?&]sslmode=[^&]*', '', url)
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        # Append ssl=require for Render/Neon hosted databases
        if "render.com" in url or "neon.tech" in url or "amazonaws.com" in url:
            separator = "&" if "?" in url else "?"
            url = f"{url}{separator}ssl=require"
        return url



    # JWT
    jwt_secret_key: str = "change-me-jwt"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    # Groq API
    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"

    # LLM Models
    llm_primary_model: str = "openai/gpt-oss-120b"
    llm_fast_model: str = "openai/gpt-oss-20b"

    # Speech
    stt_model: str = "whisper-large-v3-turbo"
    tts_model: str = "canopylabs/orpheus-v1-english"
    tts_voice_female: str = "hannah"
    tts_voice_male: str = "daniel"

    # File storage
    upload_dir: str = "./uploads"
    max_file_size_mb: int = 10
    allowed_resume_types: str = "application/pdf"

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    # Vector store
    vector_store_type: str = "faiss"
    vector_store_path: str = "./vector_store"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # Rate limiting
    rate_limit_per_minute: int = 60


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
