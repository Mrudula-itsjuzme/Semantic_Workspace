from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.databases import get_db

router = APIRouter()


@router.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        # Check DB connectivity and gather stats
        paper_count = db.execute(
            text("SELECT COUNT(*) FROM papers")
        ).scalar() or 0

        chunk_count = db.execute(
            text("SELECT COUNT(*) FROM chunks")
        ).scalar() or 0

        return {
            "status": "healthy",
            "database": "connected",
            "total_papers": paper_count,
            "total_vector_chunks": chunk_count,
        }

    except Exception:
        return {
            "status": "degraded",
            "database": "offline",
            "total_papers": 0,
            "total_vector_chunks": 0,
        }
