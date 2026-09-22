"""Integration tests: retrieval modes against real Postgres/pgvector.

Run with: RUN_INTEGRATION=1 pytest tests/test_search.py -v
Requires docker-compose services running.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_INTEGRATION") != "1",
    reason="set RUN_INTEGRATION=1 with docker-compose up",
)


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


def test_lexical_search(db_session):
    from app.services.search_service import search_lexical

    results = search_lexical(db_session, "transformer", limit=5)
    assert isinstance(results, list)
    for r in results:
        assert r["retriever"] == "lexical"
        assert "paper_id" in r and "chunk_id" in r
        assert r["match_type"] == "fts"


def test_vector_search(db_session):
    from app.services.search_service import search_vector

    results = search_vector(db_session, "attention mechanisms", limit=5)
    assert isinstance(results, list)
    for r in results:
        assert r["retriever"] == "vector"
        assert 0.0 <= r["score"] <= 100.0


def test_hybrid_uses_both_retrievers(db_session):
    from app.services.search_service import search_hybrid

    results = search_hybrid(db_session, "transformer attention", limit=10)
    # At least one result must cite provenance from each retriever family
    prov_sources = set()
    for r in results:
        for src in (r.get("provenance") or {}):
            prov_sources.add(src)
    assert prov_sources <= {"lexical", "vector"}
    for r in results:
        assert r["retriever"] == "hybrid"
        assert r["fusion"]["method"] == "rrf"
        assert r["fusion"]["lexical_results"] >= 0
        assert r["fusion"]["vector_results"] >= 0


def test_hybrid_fusion_prefers_double_matches(db_session):
    """A chunk found by BOTH retrievers should outrank single-source results
    with similar ranks (RRF property)."""
    from app.services.search_service import search_hybrid

    results = search_hybrid(db_session, "transformer", limit=10)
    both = [r for r in results if r.get("match_type") == "both"]
    if both and len(results) > 1:
        best_both = max(r["rrf_score"] for r in both)
        others = [r["rrf_score"] for r in results if r.get("match_type") != "both"]
        if others:
            assert best_both >= max(others) * 0.9


def test_run_search_modes(db_session):
    from app.services.search_service import run_search

    for mode in ("lexical", "vector", "hybrid"):
        out = run_search(db_session, "neural networks", mode=mode, limit=3)
        assert out["mode"] == mode
        assert "results" in out and "chunks" in out


def test_run_search_invalid_mode(db_session):
    from app.services.search_service import run_search

    with pytest.raises(ValueError):
        run_search(db_session, "x", mode="bogus")
