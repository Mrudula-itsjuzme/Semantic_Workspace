from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.databases import get_db
from app.services.redis_queue import paper_queue

router = APIRouter(prefix="/ingestion")


def _minio_client():
    from minio import Minio

    s = get_settings()
    return Minio(
        f"{s.minio_host}:{s.minio_port}",
        access_key=s.minio_access_key,
        secret_key=s.minio_secret_key,
        secure=s.minio_secure,
    )


@router.post("/papers/{paper_id}/pdf")
async def upload_pdf(paper_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload a PDF to MinIO and enqueue the full processing pipeline."""
    paper = db.execute(
        text("SELECT id, ingestion_status FROM papers WHERE id=:pid"), {"pid": paper_id}
    ).fetchone()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    if (file.content_type or "") not in ("application/pdf",) and not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Only PDF files are accepted")

    data = await file.read()
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="PDF exceeds 50MB limit")

    s = get_settings()
    object_name = f"paper_{paper_id}.pdf"
    try:
        client = _minio_client()
        if not client.bucket_exists(s.minio_bucket):
            client.make_bucket(s.minio_bucket)
        import io

        client.put_object(
            s.minio_bucket,
            object_name,
            io.BytesIO(data),
            length=len(data),
            content_type="application/pdf",
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Object storage unavailable")

    job = paper_queue.enqueue(
        "app.worker.worker.process_paper_job", paper_id, object_name
    )
    db.execute(
        text(
            "INSERT INTO ingestion_jobs (paper_id, rq_job_id, status) "
            "VALUES (:pid, :jid, 'queued')"
        ),
        {"pid": paper_id, "jid": job.id},
    )
    db.execute(
        text("UPDATE papers SET ingestion_status='pending' WHERE id=:pid"),
        {"pid": paper_id},
    )
    db.commit()

    return {
        "message": "PDF uploaded; ingestion queued",
        "paper_id": paper_id,
        "job_id": job.id,
        "object": object_name,
    }


@router.get("/papers/{paper_id}/status")
def ingestion_status(paper_id: int, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            "SELECT id, title, ingestion_status, ingestion_error, ingestion_attempts, "
            "ingestion_started_at, ingestion_finished_at, "
            "(SELECT COUNT(*) FROM chunks WHERE paper_id=papers.id) AS chunk_count, "
            "(SELECT COUNT(*) FROM sections WHERE paper_id=papers.id) AS section_count "
            "FROM papers WHERE id=:pid"
        ),
        {"pid": paper_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Paper not found")
    return {
        "paper_id": row.id,
        "title": row.title,
        "status": row.ingestion_status,
        "error": row.ingestion_error,
        "attempts": row.ingestion_attempts,
        "started_at": str(row.ingestion_started_at) if row.ingestion_started_at else None,
        "finished_at": str(row.ingestion_finished_at) if row.ingestion_finished_at else None,
        "chunk_count": row.chunk_count,
        "section_count": row.section_count,
    }


@router.post("/papers/{paper_id}/retry")
def retry_ingestion(paper_id: int, db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT id, ingestion_status FROM papers WHERE id=:pid"), {"pid": paper_id}
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Paper not found")

    db.execute(
        text(
            "UPDATE papers SET ingestion_status='pending', ingestion_error=NULL WHERE id=:pid"
        ),
        {"pid": paper_id},
    )
    db.commit()

    # Object name intentionally omitted so the worker auto-resolves the PDF
    # (MinIO object or the paper's pdf_url).
    job = paper_queue.enqueue("app.worker.worker.process_paper_job", paper_id)
    db.execute(
        text(
            "INSERT INTO ingestion_jobs (paper_id, rq_job_id, status) VALUES (:pid, :jid, 'queued')"
        ),
        {"pid": paper_id, "jid": job.id},
    )
    db.commit()
    return {"message": "Re-ingestion queued", "paper_id": paper_id, "job_id": job.id}


@router.get("/papers/{paper_id}/duplicate-check")
def duplicate_check(paper_id: int, db: Session = Depends(get_db)):
    """Detect near-duplicate papers by DOI, openalex id and title similarity."""
    paper = db.execute(
        text("SELECT id, doi, openalex_id, title FROM papers WHERE id=:pid"),
        {"pid": paper_id},
    ).fetchone()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    duplicates = []
    if paper.title:
        rows = db.execute(
            text(
                "SELECT id, title, doi, openalex_id, "
                "similarity(title, :t) AS sim "
                "FROM papers WHERE id <> :pid AND similarity(title, :t) > 0.55 "
                "ORDER BY sim DESC LIMIT 5"
            ),
            {"t": paper.title, "pid": paper_id},
        ).fetchall()
        duplicates = [
            {"paper_id": r.id, "title": r.title, "doi": r.doi,
             "openalex_id": r.openalex_id, "title_similarity": round(float(r.sim), 3)}
            for r in rows
        ]
    return {"paper_id": paper_id, "duplicates": duplicates}


@router.get("/jobs")
def list_ingestion_jobs(limit: int = 50, db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            "SELECT j.id, j.paper_id, p.title, j.job_type, j.status, j.attempts, "
            "j.last_error, j.rq_job_id, j.created_at, j.updated_at "
            "FROM ingestion_jobs j JOIN papers p ON p.id = j.paper_id "
            "ORDER BY j.created_at DESC LIMIT :lim"
        ),
        {"lim": min(limit, 200)},
    ).fetchall()
    return [
        {
            "id": r.id, "paper_id": r.paper_id, "title": r.title,
            "job_type": r.job_type, "status": r.status, "attempts": r.attempts,
            "last_error": r.last_error, "rq_job_id": r.rq_job_id,
            "created_at": str(r.created_at), "updated_at": str(r.updated_at),
        }
        for r in rows
    ]
