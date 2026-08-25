from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.databases import get_db

router = APIRouter()


@router.get("/papers")
def list_papers(db: Session = Depends(get_db)):
    result = db.execute(text("SELECT id, title FROM papers"))
    rows = result.fetchall()
    return [{"id": r.id, "title": r.title} for r in rows]