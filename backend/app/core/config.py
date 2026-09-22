from functools import lru_cache
import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Single source of truth for configuration.

    Every service (API, worker, tests) imports `get_settings()`.
    Values come from environment variables or a .env file next to
    the backend working directory.
    """

    # ---------- PostgreSQL ----------
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 5432
    postgres_db: str = "semantic_workspace"
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"

    # ---------- Redis ----------
    redis_host: str = "127.0.0.1"
    redis_port: int = 6379

    # ---------- MinIO ----------
    minio_host: str = "127.0.0.1"
    minio_port: int = 9000
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "papers"
    minio_secure: bool = False

    # ---------- Embeddings ----------
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_dim: int = 384

    # ---------- Neo4j ----------
    neo4j_uri: str = ""          # empty => graph layer disabled
    neo4j_user: str = "neo4j"
    neo4j_password: str = "neo4jpassword"

    # ---------- External APIs ----------
    openalex_api_key: str = ""
    core_api_key: str = ""

    # ---------- LLM ----------
    llm_provider: str = "none"   # none | openai
    openai_api_key: str = ""
    llm_model: str = "gpt-4o-mini"

    # ---------- HTTP ----------
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # ---------- Ingestion ----------
    max_citations_to_resolve: int = 10
    chunk_size: int = 1200
    chunk_overlap: int = 150
    ingestion_max_retries: int = 3

    model_config = {
        "env_file": os.getenv("ENV_FILE", ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
        "case_sensitive": False,
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_cors_origins() -> list[str]:
    return [o.strip() for o in get_settings().cors_origins.split(",") if o.strip()]


def database_url() -> str:
    s = get_settings()
    return (
        f"postgresql://{s.postgres_user}:{s.postgres_password}"
        f"@{s.postgres_host}:{s.postgres_port}/{s.postgres_db}"
    )
