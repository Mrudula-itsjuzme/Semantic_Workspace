from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.services.openalex_api import search_openalex
from app.services.ingestion import ingest_paper
from app.db.databases import get_db
from app.schemas.external_paper import ExternalPaper


router = APIRouter()


@router.get("/search")
async def search_papers(
    q: str,
    mode: str = "semantic",
    min_score: int = 50,
    limit: int = 15,
    db: Session = Depends(get_db),
):
    if not q.strip():
        raise HTTPException(
            status_code=400,
            detail="Search query cannot be empty"
        )

    try:
        results = []

        if mode == "live":
            # OpenAlex live API search
            results = await search_openalex(q, per_page=limit)
            # Convert Pydantic models to dicts for JSON response
            results = [
                r.model_dump() if hasattr(r, "model_dump") else r.dict()
                for r in results
            ]

        elif mode == "local":
            # Local SQL full-text search on title/abstract
            rows = db.execute(
                text("""
                    SELECT id, title, abstract, publication_year, doi, venue
                    FROM papers
                    WHERE to_tsvector('english', title || ' ' || COALESCE(abstract, ''))
                          @@ plainto_tsquery('english', :q)
                    LIMIT :lim
                """),
                {"q": q, "lim": limit},
            ).fetchall()

            # Fallback: ILIKE for acronyms / short queries
            if not rows:
                rows = db.execute(
                    text("""
                        SELECT id, title, abstract, publication_year, doi, venue
                        FROM papers
                        WHERE title ILIKE '%' || :q || '%'
                           OR abstract ILIKE '%' || :q || '%'
                        LIMIT :lim
                    """),
                    {"q": q, "lim": limit},
                ).fetchall()

            results = [
                {
                    "id": r.id,
                    "title": r.title,
                    "abstract": r.abstract,
                    "publication_year": r.publication_year,
                    "doi": r.doi,
                    "venue": r.venue,
                    "source": "local",
                }
                for r in rows
            ]

        elif mode == "semantic":
            # pgvector cosine similarity search on chunk embeddings
            try:
                from fastembed import TextEmbedding

                model = TextEmbedding("BAAI/bge-small-en-v1.5")
                embedding = list(model.embed([q]))[0].tolist()

                threshold = min_score / 100.0

                rows = db.execute(
                    text("""
                        SELECT
                            p.id,
                            p.title,
                            p.abstract,
                            p.publication_year,
                            p.doi,
                            p.venue,
                            c.content AS matching_snippet,
                            1 - (c.embedding <=> CAST(:emb AS vector)) AS score
                        FROM chunks c
                        JOIN papers p ON p.id = c.paper_id
                        WHERE 1 - (c.embedding <=> CAST(:emb AS vector)) >= :threshold
                        ORDER BY c.embedding <=> CAST(:emb AS vector)
                        LIMIT :lim
                    """),
                    {"emb": str(embedding), "threshold": threshold, "lim": limit},
                ).fetchall()

                results = [
                    {
                        "id": r.id,
                        "title": r.title,
                        "abstract": r.abstract,
                        "publication_year": r.publication_year,
                        "doi": r.doi,
                        "venue": r.venue,
                        "matching_snippet": r.matching_snippet,
                        "score": round(float(r.score) * 100, 1),
                        "source": "semantic",
                    }
                    for r in rows
                ]
            except ImportError:
                # fastembed not installed — fall back to local SQL
                return await search_papers(
                    q=q, mode="local", min_score=min_score, limit=limit, db=db
                )

        elif mode == "hybrid":
            # Hybrid: combine SQL full-text + semantic (if available), fall back to local
            return await search_papers(
                q=q, mode="local", min_score=min_score, limit=limit, db=db
            )

        else:
            # Default fallback to OpenAlex live
            results = await search_openalex(q, per_page=limit)
            results = [
                r.model_dump() if hasattr(r, "model_dump") else r.dict()
                for r in results
            ]

        return {"results": results, "mode": mode, "query": q}

    except Exception as e:
        print("Search error:", repr(e))
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