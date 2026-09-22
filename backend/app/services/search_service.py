"""Search service: lexical (Postgres FTS), vector (pgvector), hybrid (RRF).

The hybrid mode runs BOTH lexical and vector retrieval, then fuses ranked
lists with Reciprocal Rank Fusion. Provenance (which retrievers contributed,
per-source ranks, scores) is preserved on every result.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.embeddings import get_embedding_service
from app.services.vector_store import lexical_search, vector_search

RRF_K = 60  # standard RRF constant


# ------------------------------------------------------------------
# Lexical
# ------------------------------------------------------------------
def search_lexical(db: Session, q: str, limit: int = 15) -> list[dict[str, Any]]:
    results = lexical_search(db, q, limit=limit)
    for i, r in enumerate(results):
        r.update(
            {
                "retriever": "lexical",
                "rank": i + 1,
                "score": round(float(r.get("score") or 0.0) * 100, 2),
                "match_type": "fts",
            }
        )
    return results


# ------------------------------------------------------------------
# Vector
# ------------------------------------------------------------------
def search_vector(
    db: Session, q: str, limit: int = 15, min_score: float = 0.0
) -> list[dict[str, Any]]:
    emb = get_embedding_service().embed_one(q)
    results = vector_search(db, emb, limit=limit, min_score=min_score)
    for i, r in enumerate(results):
        r.update(
            {
                "retriever": "vector",
                "rank": i + 1,
                "score": round(float(r.get("score") or 0.0) * 100, 2),
                "match_type": "cosine",
            }
        )
    return results


# ------------------------------------------------------------------
# Hybrid — Reciprocal Rank Fusion of both retrievers
# ------------------------------------------------------------------
def search_hybrid(
    db: Session,
    q: str,
    limit: int = 15,
    lexical_weight: float = 0.5,
    vector_weight: float = 0.5,
    min_score: float = 0.0,
) -> list[dict[str, Any]]:
    lexical = search_lexical(db, q, limit=limit)
    vector = search_vector(db, q, limit=limit, min_score=min_score)

    fused: dict[int, dict[str, Any]] = {}

    def upsert(rec: dict[str, Any], retriever: str, rank: int, weight: float) -> None:
        key = rec["chunk_id"]
        if key not in fused:
            fused[key] = {**rec, "provenance": {}}
        entry = fused[key]
        rrf_score = weight / (RRF_K + rank)
        entry["rrf_score"] = entry.get("rrf_score", 0.0) + rrf_score
        entry["provenance"][retriever] = {"rank": rank, "raw_score": rec.get("score")}
        entry["match_type"] = (
            "both" if len(entry["provenance"]) == 2 else entry.get("match_type", retriever)
        )

    for rank, rec in enumerate(lexical, start=1):
        upsert(rec, "lexical", rank, lexical_weight)
    for rank, rec in enumerate(vector, start=1):
        upsert(rec, "vector", rank, vector_weight)

    merged = sorted(fused.values(), key=lambda r: r["rrf_score"], reverse=True)[:limit]

    for i, r in enumerate(merged):
        r["retriever"] = "hybrid"
        r["rank"] = i + 1
        r["fusion"] = {
            "method": "rrf",
            "k": RRF_K,
            "weights": {"lexical": lexical_weight, "vector": vector_weight},
            "lexical_results": len(lexical),
            "vector_results": len(vector),
        }
    return merged


# ------------------------------------------------------------------
# Aggregate entry point (kept API-compatible with existing /search)
# ------------------------------------------------------------------
def run_search(
    db: Session,
    q: str,
    mode: str = "hybrid",
    limit: int = 15,
    min_score: float = 0.0,
) -> dict[str, Any]:
    mode = (mode or "hybrid").lower()
    if mode == "lexical":
        results = search_lexical(db, q, limit)
    elif mode == "vector":
        results = search_vector(db, q, limit, min_score)
    elif mode == "hybrid":
        results = search_hybrid(db, q, limit, min_score=min_score)
    else:
        raise ValueError(f"unsupported mode: {mode}")

    # Paper-level projection for UI cards (chunk-level info kept too)
    papers: dict[int, dict[str, Any]] = {}
    for r in results:
        pid = r["paper_id"]
        if pid not in papers:
            papers[pid] = {
                "id": pid,
                "paper_id": pid,
                "title": r["title"],
                "abstract": None,
                "publication_year": r.get("year"),
                "doi": r.get("doi"),
                "venue": r.get("venue"),
                "score": r.get("score"),
                "rrf_score": r.get("rrf_score"),
                "retriever": r.get("retriever"),
                "match_type": r.get("match_type"),
                "provenance": r.get("provenance"),
                "fusion": r.get("fusion"),
                "matching_snippet": r.get("content"),
                "chunks": [],
            }
        papers[pid]["chunks"].append(
            {
                "chunk_id": r["chunk_id"],
                "snippet": (r.get("content") or "")[:280],
                "score": r.get("score"),
                "rank": r.get("rank"),
                "provenance": r.get("provenance"),
            }
        )

    return {"results": list(papers.values()), "mode": mode, "query": q, "chunks": results}
