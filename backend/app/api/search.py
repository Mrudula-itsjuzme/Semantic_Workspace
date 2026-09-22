import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.services.openalex_api import search_openalex
from app.services.ingestion import ingest_paper
from app.services.search_service import run_search
from app.db.databases import get_db
from app.schemas.external_paper import ExternalPaper

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/search")
async def search_papers(
    q: str,
    mode: str = "hybrid",
    min_score: int = 0,
    limit: int = Query(default=15, le=50),
    db: Session = Depends(get_db),
):
    if not q.strip():
        raise HTTPException(status_code=400, detail="Search query cannot be empty")

    if mode == "live":
        try:
            results = await search_openalex(q, per_page=limit)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"OpenAlex unavailable: {type(exc).__name__}")
        return {
            "results": [
                r.model_dump() if hasattr(r, "model_dump") else r.dict() for r in results
            ],
            "mode": "live",
            "query": q,
        }

    try:
        return run_search(db, q=q, mode=mode, limit=limit, min_score=min_score / 100.0)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        # Never expose internals
        raise HTTPException(status_code=500, detail="Search failed. Check server logs.")


@router.post("/papers/import")
async def import_paper(paper: ExternalPaper, db: Session = Depends(get_db)):
    try:
        stored_paper = await ingest_paper(db, paper)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Paper import failed. Check server logs.")

    # Queue background processing when a source PDF is available; otherwise
    # the paper is metadata-only and is finalized immediately.
    job_id = None
    if paper.pdf_url:
        from sqlalchemy import text

        from app.services.redis_queue import paper_queue

        job = paper_queue.enqueue(
            "app.worker.worker.process_paper_job", stored_paper.id
        )
        job_id = job.id
        try:
            db.execute(
                text(
                    "INSERT INTO ingestion_jobs (paper_id, rq_job_id, status) "
                    "VALUES (:pid, :jid, 'queued')"
                ),
                {"pid": stored_paper.id, "jid": job.id},
            )
            db.execute(
                text("UPDATE papers SET ingestion_status='pending' WHERE id=:pid"),
                {"pid": stored_paper.id},
            )
            db.commit()
        except Exception:
            db.rollback()
    else:
        from sqlalchemy import text

        from app.services import graph_sync

        try:
            db.execute(
                text("UPDATE papers SET ingestion_status='success' WHERE id=:pid"),
                {"pid": stored_paper.id},
            )
            db.commit()
        except Exception:
            db.rollback()
        if graph_sync.is_graph_enabled():
            try:
                graph_sync.sync_full_paper(
                    paper_id=stored_paper.id,
                    title=stored_paper.title,
                    year=stored_paper.publication_year,
                    doi=stored_paper.doi,
                    venue=stored_paper.venue,
                    abstract=stored_paper.abstract,
                    authors=[
                        (a.name, a.position or 0) for a in paper.authors
                    ],
                    cited_ids=[],
                )
            except Exception:
                logger.warning("graph sync failed for paper %s", stored_paper.id)

    return {
        "message": "Paper imported successfully",
        "paper_id": stored_paper.id,
        "title": stored_paper.title,
        "ingestion": "queued" if paper.pdf_url else "metadata_only",
        "job_id": job_id,
    }
