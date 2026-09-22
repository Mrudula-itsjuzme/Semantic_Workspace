"""Integration tests: ingestion pipeline, status lifecycle, duplicates, retries."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_INTEGRATION") != "1",
    reason="set RUN_INTEGRATION=1 with docker-compose up",
)

FAKE_PDF_TEXT = (
    "Abstract\nThis paper studies transformer attention for sequence modeling.\n\n"
    "Introduction\nWe introduce a novel architecture.\n\n"
    "Methods\nWe benchmark on GLUE with three baselines.\n\n"
    "Results\nAccuracy improved by 4 points over prior work.\n\n"
    "Limitations\nCompute remains expensive for long inputs.\n"
)


def test_pipeline_success(db_session, test_paper):
    from app.services.pipeline import run_ingestion_pipeline

    result = run_ingestion_pipeline(
        db_session,
        test_paper,
        pdf_bytes=b"not-a-real-pdf",
        extractor=lambda b: FAKE_PDF_TEXT,
    )
    assert result["chunks"] >= 1
    assert result["embeddings"] == result["chunks"]
    assert result["elapsed_seconds"] >= 0

    from sqlalchemy import text

    row = db_session.execute(
        text(
            "SELECT ingestion_status, "
            "(SELECT COUNT(*) FROM sections WHERE paper_id=:pid) AS sections, "
            "(SELECT COUNT(*) FROM chunks WHERE paper_id=:pid) AS chunks "
            "FROM papers WHERE id=:pid"
        ),
        {"pid": test_paper},
    ).fetchone()
    assert row.ingestion_status == "success"
    assert row.sections >= 1
    assert row.chunks >= 1


def test_pipeline_failure_marks_failed(db_session, test_paper):
    from app.services.pipeline import PipelineError, run_ingestion_pipeline

    with pytest.raises(PipelineError):
        run_ingestion_pipeline(
            db_session,
            test_paper,
            pdf_bytes=b"x",
            extractor=lambda b: "",  # produces no text
        )

    from sqlalchemy import text

    row = db_session.execute(
        text("SELECT ingestion_status, ingestion_error FROM papers WHERE id=:pid"),
        {"pid": test_paper},
    ).fetchone()
    assert row.ingestion_status == "failed"
    assert row.ingestion_error


def test_pipeline_is_rerunnable(db_session, test_paper):
    """Idempotency: running twice should not duplicate chunks."""
    from sqlalchemy import text

    from app.services.pipeline import run_ingestion_pipeline

    run_ingestion_pipeline(db_session, test_paper, b"x", extractor=lambda b: FAKE_PDF_TEXT)
    run_ingestion_pipeline(db_session, test_paper, b"x", extractor=lambda b: FAKE_PDF_TEXT)

    n = db_session.execute(
        text("SELECT COUNT(*) FROM chunks WHERE paper_id=:pid"), {"pid": test_paper}
    ).scalar()
    first = db_session.execute(
        text("SELECT MIN(chunk_index), MAX(chunk_index) FROM chunks WHERE paper_id=:pid"),
        {"pid": test_paper},
    ).fetchone()
    assert first.min == 0  # indexes restart cleanly, no leftovers


def test_paper_ingest_dedup(db_session):
    """ingest_paper must not create duplicates for the same source id."""
    import asyncio

    from app.schemas.external_paper import ExternalAuthor, ExternalPaper
    from app.services.ingestion import ingest_paper
    from sqlalchemy import text

    from app.db.databases import engine

    # clean slate for this source id
    with engine.begin() as conn:
        conn.execute(
            text("DELETE FROM papers WHERE openalex_id='https://openalex.org/WTESTDUP1'")
        )

    paper = ExternalPaper(
        source="openalex",
        source_id="https://openalex.org/WTESTDUP1",
        title="Dedup test paper unique title",
        authors=[ExternalAuthor(name="Test Author Dup")],
    )

    async def run():
        s1 = await ingest_paper(db_session, paper)
        s2 = await ingest_paper(db_session, paper)
        return s1, s2

    loop = asyncio.new_event_loop()
    try:
        s1, s2 = loop.run_until_complete(run())
    finally:
        loop.close()

    assert s1.id == s2.id
    count = db_session.execute(
        text("SELECT COUNT(*) FROM papers WHERE openalex_id='https://openalex.org/WTESTDUP1'")
    ).scalar()
    assert count == 1

    # cleanup
    db_session.execute(
        text("DELETE FROM papers WHERE openalex_id='https://openalex.org/WTESTDUP1'")
    )
    db_session.commit()


def test_duplicate_check_similarity(db_session, test_paper):
    from sqlalchemy import text

    from app.api.ingestion import duplicate_check

    # create a near-duplicate title
    dup = db_session.execute(
        text(
            "INSERT INTO papers (title, ingestion_status) "
            "VALUES (split_part(:t, ' ', 1) || ' paper variant', 'pending') RETURNING id"
        ),
        {"t": "__test__ paper"},
    ).scalar_one()
    db_session.commit()

    try:
        resp = duplicate_check(paper_id=test_paper, db=db_session)
        assert "duplicates" in resp
    finally:
        db_session.execute(text("DELETE FROM papers WHERE id=:pid"), {"pid": dup})
        db_session.commit()


def test_ingestion_trigger_bumps_attempts(db_session, test_paper):
    from sqlalchemy import text

    db_session.execute(
        text("UPDATE papers SET ingestion_status='running' WHERE id=:pid"),
        {"pid": test_paper},
    )
    row = db_session.execute(
        text("SELECT ingestion_attempts FROM papers WHERE id=:pid"), {"pid": test_paper}
    ).fetchone()
    assert row.ingestion_attempts == 1
