"""Full PDF ingestion pipeline.

PDF (MinIO) → text extraction → sections → chunks → embeddings → pgvector
→ graph sync (Neo4j when configured).

Used by the RQ worker and callable directly in tests with a fake extractor.
"""
from __future__ import annotations

import logging
import time
from typing import Callable

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.services import graph_sync
from app.services.chunking import chunk_sections
from app.services.embeddings import get_embedding_service
from app.services.vector_store import insert_chunks

logger = logging.getLogger(__name__)


class PipelineError(RuntimeError):
    pass


def run_ingestion_pipeline(
    db: Session,
    paper_id: int,
    pdf_bytes: bytes,
    *,
    extractor: Callable[[bytes], str] | None = None,
) -> dict:
    """Process one paper end-to-end. Raises PipelineError on failure.

    Steps are individually idempotent; re-running replaces prior chunks.
    """
    settings = get_settings()
    started = time.monotonic()

    # ---- mark running (trigger bumps attempts) ----
    db.execute(
        text(
            "UPDATE papers SET ingestion_status='running', ingestion_error=NULL "
            "WHERE id=:pid"
        ),
        {"pid": paper_id},
    )
    db.commit()

    try:
        # 1. Extract text
        if extractor is None:
            extractor = _default_extractor
        raw_text = extractor(pdf_bytes)
        if not raw_text or not raw_text.strip():
            raise PipelineError("PDF extraction produced no text")

        # pypdf can emit NUL bytes for some embedded fonts; PostgreSQL rejects
        # them, so strip control characters before any persistence.
        raw_text = raw_text.replace("\x00", "")

        # 2. Sections + chunks
        sections = [
            (name, order, body)
            for order, (name, body) in enumerate(_named_sections(raw_text))
        ]
        chunks = chunk_sections(raw_text)
        if not chunks:
            raise PipelineError("Chunking produced no chunks")

        # 3. Embeddings (single shared model instance)
        vectors = get_embedding_service().embed([c.content for c in chunks])

        # 4. Persist — replace previous extraction atomically
        db.execute(text("DELETE FROM chunks WHERE paper_id=:pid"), {"pid": paper_id})
        db.execute(text("DELETE FROM sections WHERE paper_id=:pid"), {"pid": paper_id})
        insert_chunks(
            db,
            paper_id,
            sections=[(name, order, body) for name, order, body in sections],
            chunk_rows=[
                {
                    "section_order": c.section_order,
                    "chunk_index": c.chunk_index,
                    "content": c.content,
                }
                for c in chunks
            ],
            embeddings=vectors,
        )
        db.execute(
            text(
                "UPDATE papers SET pdf_path=COALESCE(pdf_path, :p), is_cached=TRUE "
                "WHERE id=:pid"
            ),
            {"p": f"minio://{settings.minio_bucket}/{paper_id}.pdf", "pid": paper_id},
        )
        db.commit()

        # 5. Graph sync (best-effort, never fails ingestion)
        _sync_graph(db, paper_id)

        elapsed = round(time.monotonic() - started, 2)
        db.execute(
            text(
                "UPDATE papers SET ingestion_status='success' WHERE id=:pid"
            ),
            {"pid": paper_id},
        )
        db.commit()
        return {
            "paper_id": paper_id,
            "sections": len(sections),
            "chunks": len(chunks),
            "embeddings": len(vectors),
            "elapsed_seconds": elapsed,
        }

    except Exception as exc:
        db.rollback()
        msg = str(exc)[:500]
        db.execute(
            text(
                "UPDATE papers SET ingestion_status='failed', ingestion_error=:err "
                "WHERE id=:pid"
            ),
            {"err": msg, "pid": paper_id},
        )
        db.commit()
        logger.exception("Ingestion failed for paper %s", paper_id)
        raise PipelineError(msg) from exc


def _named_sections(raw_text: str) -> list[tuple[str, str]]:
    from app.services.chunking import split_sections

    secs = split_sections(raw_text)
    return [(name, body) for name, body in secs]


def _default_extractor(pdf_bytes: bytes) -> str:
    import io

    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def _sync_graph(db: Session, paper_id: int) -> None:
    if not graph_sync.is_graph_enabled():
        return
    row = db.execute(
        text(
            "SELECT id, title, publication_year, doi, venue, abstract "
            "FROM papers WHERE id=:pid"
        ),
        {"pid": paper_id},
    ).fetchone()
    if not row:
        return
    authors = db.execute(
        text(
            "SELECT a.name, pa.author_order FROM paper_authors pa "
            "JOIN authors a ON a.id=pa.author_id WHERE pa.paper_id=:pid "
            "ORDER BY pa.author_order"
        ),
        {"pid": paper_id},
    ).fetchall()
    cited = db.execute(
        text("SELECT cited_paper_id FROM citations WHERE citing_paper_id=:pid"),
        {"pid": paper_id},
    ).fetchall()
    graph_sync.sync_full_paper(
        paper_id=row.id,
        title=row.title,
        year=row.publication_year,
        doi=row.doi,
        venue=row.venue,
        abstract=row.abstract,
        authors=[(a.name, a.author_order or 0) for a in authors],
        cited_ids=[c.cited_paper_id for c in cited],
    )
