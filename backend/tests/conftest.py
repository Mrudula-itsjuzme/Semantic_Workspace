"""Pytest fixtures.

By default tests run against the docker-compose Postgres/Redis (real
integration tests). Set SKIP_INTEGRATION=1 to skip tests that need them.
"""
import os

import pytest

SKIP = os.getenv("SKIP_INTEGRATION") == "1"


def _db_available() -> bool:
    if SKIP:
        return False
    try:
        from sqlalchemy import text

        from app.db.databases import engine

        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
        return True
    except Exception:
        return False


@pytest.fixture(scope="session")
def db_available():
    return _db_available()


requires_db = pytest.mark.skipif(
    "not config.getoption('--run-integration') and not os.environ.get('RUN_INTEGRATION')",
    reason="integration tests need docker-compose services; pass -m integration or RUN_INTEGRATION=1",
)


@pytest.fixture
def db_session():
    from app.db.databases import SessionLocal

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def test_paper(db_session):
    """Create a disposable paper, delete on teardown (DB + Neo4j)."""
    from sqlalchemy import text

    from app.core.config import get_settings

    marker = f"__test_{get_settings().embedding_dim}__"
    row = db_session.execute(
        text(
            "INSERT INTO papers (title, abstract, ingestion_status) "
            "VALUES (:t, 'test paper abstract', 'pending') RETURNING id"
        ),
        {"t": f"{marker} paper"},
    ).scalar_one()
    db_session.commit()
    yield row
    db_session.execute(text("DELETE FROM papers WHERE id=:pid"), {"pid": row})
    db_session.commit()
    try:
        from app.services.graph_sync import run_query

        run_query("MATCH (p:Paper {pg_id:$pid}) DETACH DELETE p", {"pid": row})
    except Exception:
        pass
