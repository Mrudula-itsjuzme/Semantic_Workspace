from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.services.openalex_api import search_openalex
from app.services.ingestion import ingest_paper
from app.db.databases import get_db
from app.schemas.external_paper import ExternalPaper


router = APIRouter()


@router.get("/search")
async def search_papers(q: str):

    if not q.strip():
        raise HTTPException(
            status_code=400,
            detail="Search query cannot be empty"
        )

    try:
        return await search_openalex(q)

    except Exception as e:
        print("OpenAlex error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


@router.post("/papers/import")
async def import_paper(
    paper: ExternalPaper,
    db: Session = Depends(get_db)
):
    try:

        stored_paper = await ingest_paper(
            db,
            paper
        )

        return {
            "message": "Paper imported successfully",
            "paper_id": stored_paper.id,
            "title": stored_paper.title
        }

    except Exception as e:

        db.rollback()

        print("Import error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )