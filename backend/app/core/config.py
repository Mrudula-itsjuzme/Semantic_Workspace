from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    postgres_db: str = "semantic_workspace"
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 5432

    core_api_key: str
    openalex_api_key: str

    class Config:
        env_file = ".env"

settings = Settings()