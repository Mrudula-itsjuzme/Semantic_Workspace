"""Neo4j synchronization service.

Mirrors PostgreSQL graph-shaped data into Neo4j:
  (:Paper)-[:CITES]->(:Paper)
  (:Author)-[:AUTHORED {order}]->(:Paper)
  (:Paper)-[:ABOUT]->(:Topic)

All operations are idempotent (MERGE) so re-syncing is safe.
If Neo4j is not configured (NEO4J_URI empty) every function is a no-op and
the rest of the system continues to work.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def is_graph_enabled() -> bool:
    return bool(get_settings().neo4j_uri)


def _driver():
    from neo4j import GraphDatabase  # imported lazily so Neo4j is optional

    s = get_settings()
    return GraphDatabase.driver(
        s.neo4j_uri,
        auth=(s.neo4j_user, s.neo4j_password),
    )


def run_query(cypher: str, params: Optional[dict[str, Any]] = None) -> list[dict[str, Any]]:
    """Run a single idempotent query; returns records as dicts."""
    if not is_graph_enabled():
        return []
    driver = _driver()
    try:
        with driver.session() as session:
            result = session.run(cypher, params or {})
            return [r.data() for r in result]
    finally:
        driver.close()


def ensure_constraints() -> None:
    run_query("CREATE CONSTRAINT paper_id IF NOT EXISTS FOR (p:Paper) REQUIRE p.pg_id IS UNIQUE")
    run_query("CREATE CONSTRAINT author_name IF NOT EXISTS FOR (a:Author) REQUIRE a.name IS UNIQUE")
    run_query("CREATE CONSTRAINT topic_name IF NOT EXISTS FOR (t:Topic) REQUIRE t.name IS UNIQUE")


def delete_paper(paper_id: int) -> None:
    """Remove a paper (and its relationships) from the graph.

    Also removes Author/Topic nodes left with no remaining relationships so
    the graph does not accumulate orphans when papers are deleted.
    """
    run_query("MATCH (p:Paper {pg_id: $pid}) DETACH DELETE p", {"pid": paper_id})
    run_query("MATCH (a:Author) WHERE NOT (a)--() DETACH DELETE a")
    run_query("MATCH (t:Topic) WHERE NOT (t)--() DETACH DELETE t")


def sync_paper(
    paper_id: int,
    title: str,
    year: int | None,
    doi: str | None,
    venue: str | None,
    abstract: str | None,
) -> None:
    run_query(
        """
        MERGE (p:Paper {pg_id: $pid})
        SET p.title = $title,
            p.year = $year,
            p.doi = $doi,
            p.venue = $venue,
            p.abstract = $abstract
        """,
        {
            "pid": paper_id,
            "title": title,
            "year": year,
            "doi": doi,
            "venue": venue,
            "abstract": (abstract or "")[:4000],
        },
    )


def sync_authorship(paper_id: int, author_name: str, order: int) -> None:
    run_query(
        """
        MERGE (a:Author {name: $name})
        MERGE (p:Paper {pg_id: $pid})
        MERGE (a)-[r:AUTHORED]->(p)
        SET r.order = $order
        """,
        {"name": author_name, "pid": paper_id, "order": order},
    )


def sync_citation(citing_id: int, cited_id: int) -> None:
    run_query(
        """
        MERGE (a:Paper {pg_id: $citing})
        MERGE (b:Paper {pg_id: $cited})
        MERGE (a)-[:CITES]->(b)
        """,
        {"citing": citing_id, "cited": cited_id},
    )


def sync_topics(paper_id: int, topics: list[str]) -> None:
    for topic in topics[:8]:
        run_query(
            """
            MERGE (t:Topic {name: $topic})
            MERGE (p:Paper {pg_id: $pid})
            MERGE (p)-[:ABOUT]->(t)
            """,
            {"topic": topic, "pid": paper_id},
        )


def sync_full_paper(
    paper_id: int,
    title: str,
    year: int | None,
    doi: str | None,
    venue: str | None,
    abstract: str | None,
    authors: list[tuple[str, int]],
    cited_ids: list[int],
    topics: list[str] | None = None,
) -> None:
    """One-shot idempotent sync for a paper — used during ingestion."""
    if not is_graph_enabled():
        return
    try:
        ensure_constraints()
        sync_paper(paper_id, title, year, doi, venue, abstract)
        for name, order in authors:
            sync_authorship(paper_id, name, order)
        for cited in cited_ids:
            sync_citation(paper_id, cited)
        if topics:
            sync_topics(paper_id, topics)
    except Exception as exc:
        # Graph sync must never break ingestion — log and continue.
        logger.warning("Neo4j sync failed for paper %s: %s", paper_id, exc)


# ============================================================
# Retrieval queries used by the graph API + GraphRAG
# ============================================================

def graph_neighbours(paper_id: int, limit: int = 25) -> list[dict[str, Any]]:
    return run_query(
        """
        MATCH (p:Paper {pg_id: $pid})-[r]-(n)
        RETURN type(r) AS rel,
               labels(n)[0] AS node_type,
               coalesce(n.title, n.name) AS name,
               n.pg_id AS paper_id,
               n.year AS year
        LIMIT $limit
        """,
        {"pid": paper_id, "limit": limit},
    )


def citation_path(source_id: int, target_id: int, max_depth: int = 4) -> list[dict[str, Any]]:
    return run_query(
        """
        MATCH path = shortestPath((a:Paper {pg_id: $src})-[:CITES*..%d]->(b:Paper {pg_id: $dst}))
        RETURN [n IN nodes(path) | coalesce(n.title, toString(n.pg_id))] AS titles,
               length(path) AS depth
        """ % max(1, min(max_depth, 6)),
        {"src": source_id, "dst": target_id},
    )


def shared_authors(paper_id: int, limit: int = 15) -> list[dict[str, Any]]:
    return run_query(
        """
        MATCH (a:Author)-[:AUTHORED]->(:Paper {pg_id: $pid})
        MATCH (a)-[:AUTHORED]->(other:Paper)
        WHERE other.pg_id <> $pid
        RETURN a.name AS author, collect(other.title)[..3] AS shared_papers, count(other) AS n
        ORDER BY n DESC
        LIMIT $limit
        """,
        {"pid": paper_id, "limit": limit},
    )


def co_citation_topics(paper_id: int, limit: int = 10) -> list[dict[str, Any]]:
    return run_query(
        """
        MATCH (p:Paper {pg_id: $pid})-[:ABOUT]->(t:Topic)<-[:ABOUT]-(related:Paper)
        WHERE related.pg_id <> $pid
        RETURN t.name AS topic, collect(related.title)[..5] AS papers, count(related) AS n
        ORDER BY n DESC
        LIMIT $limit
        """,
        {"pid": paper_id, "limit": limit},
    )


def graph_expand(seed_ids: list[int], max_hops: int = 1, limit: int = 30) -> list[dict[str, Any]]:
    """GraphRAG expansion: neighbours of seeds (citations + shared authors)."""
    if not seed_ids:
        return []
    if max_hops <= 1:
        return run_query(
            """
            UNWIND $seeds AS sid
            MATCH (seed:Paper {pg_id: sid})-[:CITES|AUTHORED*1..1]-(n:Paper)
            WHERE NOT n.pg_id IN $seeds
            RETURN DISTINCT n.pg_id AS paper_id, n.title AS title,
                   n.year AS year,
                   1 AS hops
            LIMIT $limit
            """,
            {"seeds": seed_ids, "limit": limit},
        )
    return run_query(
        """
        UNWIND $seeds AS sid
        MATCH (seed:Paper {pg_id: sid})-[:CITES*1..%d]-(n:Paper)
        WHERE NOT n.pg_id IN $seeds
        RETURN DISTINCT n.pg_id AS paper_id, n.title AS title,
               n.year AS year,
               min(length(path)) AS hops
        ORDER BY hops
        LIMIT $limit
        """ % max(1, min(max_hops, 3)),
        {"seeds": seed_ids, "limit": limit},
    )


def full_graph_snapshot(limit: int = 200) -> dict[str, Any]:
    """Nodes + edges snapshot for the frontend graph UI."""
    nodes = run_query(
        """
        MATCH (p:Paper)
        RETURN p.pg_id AS id, p.title AS title, p.year AS year,
               p.venue AS venue, 'paper' AS type
        LIMIT $limit
        """,
        {"limit": limit},
    )
    edges = run_query(
        """
        MATCH (a:Paper)-[r:CITES|AUTHORED]-(b:Paper)
        RETURN DISTINCT a.pg_id AS source, b.pg_id AS target,
               CASE WHEN type(r) = 'CITES' THEN 'CITES' ELSE 'AUTHORED' END AS type
        LIMIT $limit
        """,
        {"limit": limit * 3},
    )
    return {"nodes": nodes, "edges": edges}
