from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.databases import get_db

router = APIRouter()


@router.get("/papers")
def list_papers(db: Session = Depends(get_db)):
    result = db.execute(text("""
        SELECT id, title, abstract, publication_year, doi, venue, pdf_path, created_at
        FROM papers
        ORDER BY created_at DESC
    """))
    rows = result.fetchall()
    return [
        {
            "id": r.id,
            "title": r.title,
            "abstract": r.abstract,
            "publication_year": r.publication_year,
            "doi": r.doi,
            "venue": r.venue,
            "pdf_path": r.pdf_path,
            "created_at": str(r.created_at) if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/papers/{paper_id}")
def get_paper(paper_id: int, db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT id, title, abstract, publication_year, doi, venue, pdf_path FROM papers WHERE id = :pid"),
        {"pid": paper_id},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Paper not found")

    # Get chunks for this paper
    chunks = db.execute(
        text("SELECT id, chunk_index, content FROM chunks WHERE paper_id = :pid ORDER BY chunk_index"),
        {"pid": paper_id},
    ).fetchall()

    # Get authors
    authors = db.execute(
        text("""
            SELECT a.name, pa.author_order
            FROM authors a
            JOIN paper_authors pa ON pa.author_id = a.id
            WHERE pa.paper_id = :pid
            ORDER BY pa.author_order
        """),
        {"pid": paper_id},
    ).fetchall()

    return {
        "id": row.id,
        "title": row.title,
        "abstract": row.abstract,
        "publication_year": row.publication_year,
        "doi": row.doi,
        "venue": row.venue,
        "pdf_path": row.pdf_path,
        "authors": [{"name": a.name, "position": a.author_order} for a in authors],
        "chunks": [{"id": c.id, "chunk_index": c.chunk_index, "content": c.content} for c in chunks],
    }


@router.delete("/papers/{paper_id}")
def delete_paper(paper_id: int, db: Session = Depends(get_db)):
    # Check if paper exists
    exists = db.execute(
        text("SELECT id FROM papers WHERE id = :pid"),
        {"pid": paper_id},
    ).fetchone()

    if not exists:
        raise HTTPException(status_code=404, detail="Paper not found")

    # Delete cascades to chunks, sections, paper_authors via FK constraints
    db.execute(text("DELETE FROM papers WHERE id = :pid"), {"pid": paper_id})
    db.commit()

    return {"message": "Paper deleted", "paper_id": paper_id}