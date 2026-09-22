from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import database_url, get_settings


engine = create_engine(database_url(), pool_pre_ping=True)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


@event.listens_for(engine, "connect")
def _register_vector_type(dbapi_connection, _connection_record):
    """Ensure pgvector extension objects are usable on every new connection."""
    if dbapi_connection.info.server_version >= 90000:
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("CREATE EXTENSION IF NOT EXISTS vector")
            dbapi_connection.commit()
        except Exception:
            dbapi_connection.rollback()
        finally:
            cursor.close()


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


def check_db_connection() -> bool:
    """Cheap connectivity probe used by health endpoints."""
    try:
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
        return True
    except Exception:
        return False
