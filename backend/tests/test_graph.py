"""Graph (Neo4j) integration tests."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_INTEGRATION") != "1",
    reason="set RUN_INTEGRATION=1 with docker-compose up",
)


def test_graph_enabled():
    from app.services.graph_sync import is_graph_enabled

    assert is_graph_enabled() is True


def test_sync_paper_idempotent():
    from app.services.graph_sync import sync_full_paper

    for _ in range(2):
        sync_full_paper(
            paper_id=999001,
            title="Graph Test Paper",
            year=2026,
            doi="10.0/test-graph",
            venue="TestConf",
            abstract="Graph sync test",
            authors=[("Graph Test Author", 1)],
            cited_ids=[],
            topics=["testing"],
        )


def test_neighbours_after_sync():
    from app.services.graph_sync import graph_neighbours

    nb = graph_neighbours(999001)
    assert any(n.get("name") == "Graph Test Author" for n in nb)


def test_sync_citation_edge():
    from app.services.graph_sync import graph_neighbours, sync_citation, sync_paper

    sync_paper(999002, "Graph Test Paper B", 2025, None, None, "b abstract")
    sync_citation(999001, 999002)

    nb = graph_neighbours(999001)
    assert any(n.get("rel") == "CITES" and n.get("paper_id") == 999002 for n in nb)


def test_shared_authors():
    from app.services.graph_sync import shared_authors, sync_authorship, sync_paper

    sync_paper(999003, "Graph Test Paper C", 2024, None, None, "c abstract")
    sync_authorship(999003, "Graph Test Author", 1)

    shared = shared_authors(999001)
    assert any(s["author"] == "Graph Test Author" for s in shared)


def test_snapshot_contains_nodes():
    from app.services.graph_sync import full_graph_snapshot

    snap = full_graph_snapshot(limit=100)
    ids = {n["id"] for n in snap["nodes"]}
    assert 999001 in ids and 999002 in ids


def test_graphrag_expansion():
    from app.services.graph_sync import graph_expand

    expanded = graph_expand([999001], max_hops=1, limit=10)
    ids = {e["paper_id"] for e in expanded}
    assert 999002 in ids


# ---- cleanup ----
def test_zz_cleanup_test_nodes():
    from app.services.graph_sync import run_query

    run_query("MATCH (p:Paper) WHERE p.pg_id >= 999001 DETACH DELETE p")
    run_query("MATCH (a:Author {name:'Graph Test Author'}) DETACH DELETE a")
    run_query("MATCH (t:Topic {name:'testing'}) DETACH DELETE t")
    assert True
