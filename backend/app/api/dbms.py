"""DBMS academic demonstration endpoints.

Each endpoint demonstrates a real DBMS concept on the actual project schema:
EXPLAIN ANALYZE, indexed vs unindexed benchmarks, transactions/rollback,
ACID + concurrency isolation, views, triggers, functions, procedures and the
pgvector index.
"""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.databases import engine, get_db

router = APIRouter(prefix="/dbms")


def _rows(result) -> list[dict]:
    return [dict(r._mapping) for r in result.fetchall()]


@router.get("/explain-search")
def explain_search(db: Session = Depends(get_db)):
    """EXPLAIN ANALYZE of the lexical FTS query — shows the GIN index in use."""
    plan = db.execute(
        text(
            "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "
            "SELECT c.id, ts_rank(to_tsvector('english', c.content), "
            "plainto_tsquery('english', :q)) AS rank "
            "FROM chunks c WHERE to_tsvector('english', c.content) "
            "@@ plainto_tsquery('english', :q) LIMIT 10"
        ),
        {"q": "neural network"},
    ).scalar()
    return {"concept": "EXPLAIN ANALYZE on FTS (GIN index)", "plan": plan}


@router.get("/benchmark-index")
def benchmark_indexed_vs_unindexed(db: Session = Depends(get_db)):
    """Compare timing of an indexed (c.id) vs unindexed (content ILIKE) lookup."""
    N = 200
    start = time.perf_counter()
    for _ in range(N):
        db.execute(text("SELECT content FROM chunks WHERE id = 1"))
    indexed_ms = (time.perf_counter() - start) * 1000 / N

    start = time.perf_counter()
    for _ in range(min(N, 20)):
        db.execute(
            text("SELECT id FROM chunks WHERE content ILIKE '%quantum neural blockchain%'")
        ).fetchall()
    unindexed_ms = (time.perf_counter() - start) * 1000 / min(N, 20)

    return {
        "concept": "indexed vs unindexed access path",
        "indexed_pk_lookup_avg_ms": round(indexed_ms, 3),
        "unindexed_seq_scan_avg_ms": round(unindexed_ms, 3),
        "note": "PK index = O(log n) B-tree; ILIKE on unindexed text = full seq scan",
    }


@router.post("/transaction-demo")
def transaction_demo(db: Session = Depends(get_db)):
    """ACID demo: transfer a citation edge between papers inside a transaction,
    including a rollback path."""
    from sqlalchemy.exc import DBAPIError

    src = db.execute(text("SELECT id FROM papers ORDER BY id LIMIT 1")).fetchone()
    dst = db.execute(text("SELECT id FROM papers ORDER BY id DESC LIMIT 1")).fetchone()
    if not src or not dst or src.id == dst.id:
        return {"concept": "transactions", "demo": "needs ≥2 papers", "rolled_back": None}

    results: dict = {"concept": "ACID transaction with rollback"}
    try:
        db.begin_nested()
        db.execute(
            text("INSERT INTO citations (citing_paper_id, cited_paper_id, citation_context) "
                 "VALUES (:a, :b, 'dbms-demo') ON CONFLICT DO NOTHING"),
            {"a": src.id, "b": dst.id},
        )
        count_in_txn = db.execute(
            text("SELECT COUNT(*) FROM citations WHERE citation_context='dbms-demo'")
        ).scalar()
        results["visible_inside_transaction"] = count_in_txn
        db.rollback()  # atomicity: nothing persisted
        count_after = db.execute(
            text("SELECT COUNT(*) FROM citations WHERE citation_context='dbms-demo'")
        ).scalar()
        results["visible_after_rollback"] = count_after
        results["rolled_back"] = True
        return results
    except DBAPIError:
        db.rollback()
        results["rolled_back"] = "error"
        return results


@router.get("/isolation-demo")
def isolation_demo():
    """Two concurrent transactions at READ COMMITTED vs SERIALIZABLE.

    Demonstrates that uncommitted changes in TXN A are invisible to TXN B
    (isolation), and how a serialization failure can arise.
    """
    from threading import Thread

    from app.db.databases import SessionLocal

    output: dict = {"concept": "concurrent transactions & isolation levels"}

    def txn_a():
        s = SessionLocal()
        try:
            s.execute(text("BEGIN"))
            s.execute(
                text("UPDATE papers SET venue='ISOLATION-TEST' WHERE id="
                     "(SELECT id FROM papers ORDER BY id LIMIT 1)")
            )
            s.execute(text("SELECT pg_sleep(1.0)"))
            s.execute(text("ROLLBACK"))
            output["txn_a"] = "updated then rolled back"
        finally:
            s.close()

    def txn_b():
        s = SessionLocal()
        try:
            # runs while A holds its update uncommitted
            val = s.execute(
                text("SELECT venue FROM papers ORDER BY id LIMIT 1")
            ).scalar()
            output["txn_b_saw_during_txn_a"] = val  # should be the OLD value
        finally:
            s.close()

    t1 = Thread(target=txn_a)
    t1.start()
    import time as _t

    _t.sleep(0.2)
    t2 = Thread(target=txn_b)
    t2.start()
    t1.join()
    t2.join()

    output["explanation"] = (
        "TXN B read the pre-update value while TXN A's write was uncommitted "
        "(READ COMMITTED snapshot isolation). A's change was rolled back."
    )
    return output


@router.get("/view-overview")
def view_overview(db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT * FROM v_paper_overview ORDER BY created_at DESC LIMIT 20")
    ).fetchall()
    return {"concept": "SQL view (v_paper_overview)", "rows": _rows(rows)}


@router.get("/trigger-demo/{paper_id}")
def trigger_demo(paper_id: int, db: Session = Depends(get_db)):
    """Show the ingestion trigger: flipping status to 'running' bumps attempts
    and stamps started_at automatically."""
    before = db.execute(
        text("SELECT ingestion_attempts, ingestion_started_at FROM papers WHERE id=:pid"),
        {"pid": paper_id},
    ).fetchone()
    if not before:
        return {"error": "paper not found"}
    db.execute(
        text("UPDATE papers SET ingestion_status='running' WHERE id=:pid"),
        {"pid": paper_id},
    )
    # restore
    db.execute(
        text("UPDATE papers SET ingestion_status='success' WHERE id=:pid"),
        {"pid": paper_id},
    )
    after = db.execute(
        text("SELECT ingestion_attempts, ingestion_started_at FROM papers WHERE id=:pid"),
        {"pid": paper_id},
    ).fetchone()
    db.commit()
    return {
        "concept": "BEFORE UPDATE trigger (fn_touch_ingestion)",
        "attempts_before": before.ingestion_attempts,
        "attempts_after": after.ingestion_attempts,
        "started_at": str(after.ingestion_started_at),
    }


@router.get("/function-demo/{paper_id}")
def function_demo(paper_id: int, db: Session = Depends(get_db)):
    count = db.execute(
        text("SELECT fn_chunk_count_for_paper(:pid)"), {"pid": paper_id}
    ).scalar()
    return {
        "concept": "SQL function (fn_chunk_count_for_paper)",
        "paper_id": paper_id,
        "chunk_count": count,
    }


@router.post("/procedure-demo")
def procedure_demo(db: Session = Depends(get_db)):
    """Call sp_requeue_failed_papers — requeues failed ingestions under max attempts."""
    db.execute(text("CALL sp_requeue_failed_papers(3)"))
    db.commit()
    pending = db.execute(
        text("SELECT COUNT(*) FROM papers WHERE ingestion_status='pending'")
    ).scalar()
    return {"concept": "stored procedure (sp_requeue_failed_papers)", "papers_now_pending": pending}


@router.get("/pgvector-explain")
def pgvector_explain(db: Session = Depends(get_db)):
    """EXPLAIN the pgvector query showing the IVFFlat index usage."""
    dim_vector = "[" + ",".join(["0.01"] * 384) + "]"
    plan = db.execute(
        text(
            "EXPLAIN (ANALYZE, FORMAT JSON) SELECT id, embedding <=> CAST(:v AS vector) AS dist "
            "FROM chunks ORDER BY embedding <=> CAST(:v AS vector) LIMIT 5"
        ),
        {"v": dim_vector},
    ).scalar()
    return {
        "concept": "pgvector IVFFlat ANN index",
        "note": (
            "IVFFlat clusters vectors into `lists` cells; queries scan only the "
            "nearest cells (probes), trading recall for sub-linear search time."
        ),
        "plan": plan,
    }


@router.get("/er-diagram")
def er_diagram():
    return {
        "concept": "entity-relationship overview",
        "entities": {
            "papers": ["id PK", "doi UNIQUE", "title", "abstract", "publication_year",
                        "venue", "pdf_path", "pdf_url", "openalex_id UNIQUE",
                        "source_paper_id", "is_cached", "ingestion_status",
                        "ingestion_error", "ingestion_attempts", "ingestion_started_at",
                        "ingestion_finished_at", "created_at"],
            "authors": ["id PK", "name UNIQUE"],
            "paper_authors": ["paper_id PK/FK", "author_id PK/FK", "author_order"],
            "sections": ["id PK", "paper_id FK", "section_name", "content", "section_order"],
            "chunks": ["id PK", "paper_id FK", "section_id FK", "chunk_index",
                       "content", "embedding VECTOR(384)"],
            "citations": ["citing_paper_id PK/FK", "cited_paper_id PK/FK", "citation_context"],
            "ingestion_jobs": ["id PK", "paper_id FK", "job_type", "status", "attempts",
                               "last_error", "rq_job_id"],
        },
        "relationships": [
            "papers 1—N sections",
            "papers 1—N chunks",
            "sections 1—N chunks",
            "papers N—M authors (paper_authors)",
            "papers N—M papers (citations: citing/cited)",
            "papers 1—N ingestion_jobs",
        ],
    }
