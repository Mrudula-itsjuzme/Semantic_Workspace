from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.databases import get_db
from app.services import graph_sync
from app.services.graph_sync import is_graph_enabled

router = APIRouter(prefix="/graph")


@router.get("/status")
def graph_status():
    return {
        "enabled": is_graph_enabled(),
        "uri_configured": bool(get_settings().neo4j_uri),
    }


@router.get("/snapshot")
def graph_snapshot(limit: int = Query(default=200, le=1000)):
    if not is_graph_enabled():
        raise HTTPException(status_code=503, detail="Neo4j is not configured")
    try:
        return graph_sync.full_graph_snapshot(limit=limit)
    except Exception:
        raise HTTPException(status_code=502, detail="Graph query failed")


@router.get("/papers/{paper_id}/neighbours")
def neighbours(paper_id: int, limit: int = Query(default=25, le=100)):
    if not is_graph_enabled():
        raise HTTPException(status_code=503, detail="Neo4j is not configured")
    try:
        return {"paper_id": paper_id, "neighbours": graph_sync.graph_neighbours(paper_id, limit)}
    except Exception:
        raise HTTPException(status_code=502, detail="Graph query failed")


@router.get("/papers/{source_id}/path/{target_id}")
def citation_path(
    source_id: int,
    target_id: int,
    max_depth: int = Query(default=4, ge=1, le=6),
):
    if not is_graph_enabled():
        raise HTTPException(status_code=503, detail="Neo4j is not configured")
    try:
        return {
            "source": source_id,
            "target": target_id,
            "paths": graph_sync.citation_path(source_id, target_id, max_depth),
        }
    except Exception:
        raise HTTPException(status_code=502, detail="Graph query failed")


@router.get("/papers/{paper_id}/shared-authors")
def shared_authors(paper_id: int, limit: int = Query(default=15, le=50)):
    if not is_graph_enabled():
        raise HTTPException(status_code=503, detail="Neo4j is not configured")
    try:
        return {"paper_id": paper_id, "shared_authors": graph_sync.shared_authors(paper_id, limit)}
    except Exception:
        raise HTTPException(status_code=502, detail="Graph query failed")


@router.get("/papers/{paper_id}/topics")
def paper_topics(paper_id: int, limit: int = Query(default=10, le=30)):
    if not is_graph_enabled():
        raise HTTPException(status_code=503, detail="Neo4j is not configured")
    try:
        return {"paper_id": paper_id, "topics": graph_sync.co_citation_topics(paper_id, limit)}
    except Exception:
        raise HTTPException(status_code=502, detail="Graph query failed")


@router.post("/papers/{paper_id}/sync")
def sync_paper_to_graph(paper_id: int, db: Session = Depends(get_db)):
    """Idempotently push one paper (with authors + citations) into Neo4j."""
    from sqlalchemy import text

    if not is_graph_enabled():
        raise HTTPException(status_code=503, detail="Neo4j is not configured")

    row = db.execute(
        text("SELECT id, title, publication_year, doi, venue, abstract FROM papers WHERE id=:pid"),
        {"pid": paper_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Paper not found")

    authors = db.execute(
        text(
            "SELECT a.name, pa.author_order FROM paper_authors pa "
            "JOIN authors a ON a.id=pa.author_id WHERE pa.paper_id=:pid"
        ),
        {"pid": paper_id},
    ).fetchall()
    cited = db.execute(
        text("SELECT cited_paper_id FROM citations WHERE citing_paper_id=:pid"),
        {"pid": paper_id},
    ).fetchall()

    try:
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
    except Exception:
        raise HTTPException(status_code=502, detail="Graph sync failed")

    return {"message": "Paper synced to graph", "paper_id": paper_id}
