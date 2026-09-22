"""pgvector persistence helpers.

Embeddings are stored as vector(384). We pass vectors as text literals
`'[0.1,0.2,...]'` cast to vector, which is the standard pgvector pattern with
psycopg2 without a registered adapter.
"""
from __future__ import annotations

from typing import Any, Sequence

from sqlalchemy import text
from sqlalchemy.orm import Session


def to_pgvector(vec: Sequence[float]) -> str:
    """Format a float sequence as a pgvector text literal."""
    return "[" + ",".join(f"{x:.7f}" for x in vec) + "]"


def insert_chunks(
    db: Session,
    paper_id: int,
    sections: list[tuple[str, int, str]],
    chunk_rows: list[dict[str, Any]],
    embeddings: list[list[float]],
) -> int:
    """Insert sections + chunks with embeddings.

    section_rows: list of (section_name, section_order, content)
    chunk_rows:   list of dicts with section_order, chunk_index, content
    """
    section_ids: dict[int, int] = {}
    for name, order, content in sections:
        row = db.execute(
            text(
                "INSERT INTO sections (paper_id, section_name, content, section_order) "
                "VALUES (:pid, :name, :content, :ord) RETURNING id"
            ),
            {"pid": paper_id, "name": name, "content": content, "ord": order},
        ).scalar_one()
        section_ids[order] = row

    count = 0
    for i, (chunk, emb) in enumerate(zip(chunk_rows, embeddings)):
        db.execute(
            text(
                "INSERT INTO chunks (paper_id, section_id, chunk_index, content, embedding) "
                "VALUES (:pid, :sid, :idx, :content, CAST(:emb AS vector)) "
                "ON CONFLICT (paper_id, chunk_index) DO UPDATE "
                "SET content = EXCLUDED.content, embedding = EXCLUDED.embedding, "
                "section_id = EXCLUDED.section_id"
            ),
            {
                "pid": paper_id,
                "sid": section_ids.get(chunk["section_order"]),
                "idx": chunk["chunk_index"],
                "content": chunk["content"],
                "emb": to_pgvector(emb),
            },
        )
        count += 1

    return count


def delete_paper_vectors(db: Session, paper_id: int) -> None:
    db.execute(text("DELETE FROM chunks WHERE paper_id = :pid"), {"pid": paper_id})
    db.execute(text("DELETE FROM sections WHERE paper_id = :pid"), {"pid": paper_id})


def vector_search(
    db: Session,
    query_embedding: Sequence[float],
    limit: int = 10,
    min_score: float = 0.0,
) -> list[dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT c.id AS chunk_id,
                   c.paper_id,
                   p.title,
                   p.publication_year AS year,
                   p.doi,
                   p.venue,
                   c.content,
                   1 - (c.embedding <=> CAST(:emb AS vector)) AS score
            FROM chunks c
            JOIN papers p ON p.id = c.paper_id
            WHERE 1 - (c.embedding <=> CAST(:emb AS vector)) >= :min_score
            ORDER BY c.embedding <=> CAST(:emb AS vector)
            LIMIT :lim
            """
        ),
        {"emb": to_pgvector(query_embedding), "min_score": min_score, "lim": limit},
    ).fetchall()
    return [dict(r._mapping) for r in rows]


def lexical_search(
    db: Session,
    query: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT c.id AS chunk_id,
                   c.paper_id,
                   p.title,
                   p.publication_year AS year,
                   p.doi,
                   p.venue,
                   c.content,
                   ts_rank(to_tsvector('english', c.content),
                           plainto_tsquery('english', :q)) AS score
            FROM chunks c
            JOIN papers p ON p.id = c.paper_id
            WHERE to_tsvector('english', c.content) @@ plainto_tsquery('english', :q)
            ORDER BY score DESC
            LIMIT :lim
            """
        ),
        {"q": query, "lim": limit},
    ).fetchall()

    if len(rows) >= limit:
        return [dict(r._mapping) for r in rows]

    # `plainto_tsquery` is strict AND; multi-word queries where no chunk
    # contains every term would return nothing. Fall back to OR semantics for
    # the remaining slots so the closest documents still surface.
    or_rows = db.execute(
        text(
            """
            SELECT c.id AS chunk_id,
                   c.paper_id,
                   p.title,
                   p.publication_year AS year,
                   p.doi,
                   p.venue,
                   c.content,
                   ts_rank(to_tsvector('english', c.content),
                           to_tsquery('english', :oq)) AS score
            FROM chunks c
            JOIN papers p ON p.id = c.paper_id
            WHERE to_tsvector('english', c.content) @@ to_tsquery('english', :oq)
            ORDER BY score DESC
            LIMIT :lim
            """
        ),
        {
            "oq": " | ".join(
                t.replace("'", "") for t in query.split() if t.strip()
            ) or query,
            "lim": limit,
        },
    ).fetchall()

    seen = {r[0] for r in rows}
    merged = [dict(r._mapping) for r in rows] + [
        dict(r._mapping) for r in or_rows if r[0] not in seen
    ]
    return merged[:limit]
