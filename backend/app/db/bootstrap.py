"""Runtime schema bootstrap.

Strategy:
1. If an Alembic version table exists, stamp/upgrade to head.
2. If the database is empty, run `alembic upgrade head`.
3. If Alembic is unavailable (e.g. trimmed production image), fall back to
   Base.metadata.create_all for the core tables so the API still works.
"""
from __future__ import annotations

import logging

from sqlalchemy import text

from app.db.databases import Base, engine

logger = logging.getLogger(__name__)


def _has_alembic_version() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1 FROM alembic_version LIMIT 1"))
        return True
    except Exception:
        return False


def bootstrap_database() -> None:
    import app.models  # noqa: F401 — ensure models are registered

    if _has_alembic_version():
        try:
            from alembic import command
            from alembic.config import Config

            cfg = Config("alembic.ini")
            command.upgrade(cfg, "head")
            logger.info("Alembic upgrade to head complete")
            return
        except Exception as exc:
            logger.warning("Alembic upgrade failed (%s); falling back to create_all", exc)

    Base.metadata.create_all(bind=engine)
    _create_extras()
    logger.info("Database bootstrap via create_all complete")


def _create_extras() -> None:
    """Objects Alembic normally owns, created defensively for create_all path."""
    stmts = [
        "CREATE EXTENSION IF NOT EXISTS vector",
        "CREATE EXTENSION IF NOT EXISTS pg_trgm",
        "ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(384)",
        "CREATE INDEX IF NOT EXISTS idx_chunks_content_fts ON chunks USING GIN (to_tsvector('english', content))",
        "CREATE INDEX IF NOT EXISTS idx_chunks_embedding_ivfflat ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)",
        "CREATE INDEX IF NOT EXISTS idx_papers_ingestion_status ON papers(ingestion_status)",
        """
        CREATE OR REPLACE FUNCTION fn_touch_ingestion() RETURNS TRIGGER AS $$
        BEGIN
            IF NEW.ingestion_status NOT IN ('pending','running','success','failed') THEN
                RAISE EXCEPTION 'invalid ingestion_status %', NEW.ingestion_status;
            END IF;
            IF NEW.ingestion_status = 'running' THEN
                NEW.ingestion_started_at := COALESCE(OLD.ingestion_started_at, now());
                NEW.ingestion_attempts := OLD.ingestion_attempts + 1;
            END IF;
            IF NEW.ingestion_status IN ('success','failed') THEN
                NEW.ingestion_finished_at := now();
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """,
        "DROP TRIGGER IF EXISTS trg_papers_ingestion ON papers",
        "CREATE TRIGGER trg_papers_ingestion BEFORE UPDATE OF ingestion_status ON papers FOR EACH ROW EXECUTE FUNCTION fn_touch_ingestion()",
    ]
    with engine.begin() as conn:
        for stmt in stmts:
            try:
                conn.execute(text(stmt))
            except Exception as exc:
                logger.debug("bootstrap extra skipped: %s", exc)
