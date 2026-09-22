"""API integration tests using FastAPI TestClient.

Covers: health, papers CRUD, search modes, GraphRAG, DBMS demos, metrics.
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
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


def test_root(client):
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["project"] == "Semantic Research Workspace"


def test_health_covers_all_components(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in ("healthy", "degraded")
    comps = body["components"]
    for name in ("postgres", "redis", "minio", "workers", "embeddings", "neo4j"):
        assert name in comps, f"missing component {name}"
    assert comps["postgres"]["status"] == "ok"
    assert comps["redis"]["status"] == "ok"
    assert "total_papers" in body  # back-compat field


def test_papers_list(client):
    r = client.get("/papers")
    assert r.status_code == 200
    papers = r.json()
    assert isinstance(papers, list)
    if papers:
        p = papers[0]
        for field in ("id", "title", "ingestion_status", "chunk_count"):
            assert field in p


def test_paper_detail_404(client):
    r = client.get("/papers/999999")
    assert r.status_code == 404


def test_search_lexical_mode(client):
    r = client.get("/search", params={"q": "transformer", "mode": "lexical", "limit": 5})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "lexical"
    for res in body["results"]:
        assert res["retriever"] == "lexical"


def test_search_vector_mode(client):
    r = client.get("/search", params={"q": "attention", "mode": "vector", "limit": 5})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "vector"
    for res in body["results"]:
        assert res["retriever"] == "vector"
        assert 0 <= res["score"] <= 100


def test_search_hybrid_mode(client):
    r = client.get("/search", params={"q": "transformer attention", "mode": "hybrid", "limit": 8})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "hybrid"
    for res in body["results"]:
        assert res["fusion"]["method"] == "rrf"
        prov = res.get("provenance") or {}
        assert set(prov) <= {"lexical", "vector"}


def test_search_empty_query_400(client):
    r = client.get("/search", params={"q": "  ", "mode": "lexical"})
    assert r.status_code == 400


def test_search_invalid_mode_400(client):
    r = client.get("/search", params={"q": "x", "mode": "doesnotexist"})
    assert r.status_code == 400


def test_graphrag_ask_grounded(client):
    r = client.post("/api/graphrag/ask", json={"question": "What do the transformer papers study?"})
    assert r.status_code == 200
    body = r.json()
    assert "answer" in body and "citations" in body
    assert body["grounded"] is True
    assert body["citation_check"]["all_citations_valid"] is True
    if body["citations"]:
        c = body["citations"][0]
        for field in ("marker", "paper_id", "chunk_id", "title", "snippet"):
            assert field in c


def test_graphrag_insufficient_evidence(client):
    r = client.post(
        "/api/graphrag/ask",
        json={"question": "qqqqzzzz unfindable topic xyzzy 12345"},
    )
    assert r.status_code == 200
    body = r.json()
    # Either grounded with citations, or explicit insufficient evidence
    if not body["citations"]:
        assert "nsufficient" in body["answer"] or body["grounded"] is False


def test_graphrag_explain(client):
    r = client.get("/api/graphrag/explain")
    assert r.status_code == 200
    assert len(r.json()["pipeline"]) == 6


def test_synthesize(client):
    r = client.post("/api/ai/synthesize", json={"paper_ids": [1, 2]})
    assert r.status_code == 200
    body = r.json()
    assert "executive_summary" in body
    if body.get("citations"):
        assert body["citation_check"]["all_citations_valid"] is True


def test_synthesize_empty(client):
    r = client.post("/api/ai/synthesize", json={"paper_ids": []})
    assert r.status_code == 200


def test_dbms_explain(client):
    r = client.get("/api/dbms/explain-search")
    assert r.status_code == 200
    plan = r.json()["plan"]
    assert plan[0]["Plan"]["Node Type"]


def test_dbms_transaction_rollback(client):
    r = client.post("/api/dbms/transaction-demo")
    assert r.status_code == 200
    body = r.json()
    if body.get("rolled_back") is True:
        assert body["visible_inside_transaction"] == 1
        assert body["visible_after_rollback"] == 0


def test_dbms_trigger(client):
    r = client.get("/api/dbms/trigger-demo/1")
    assert r.status_code == 200
    body = r.json()
    assert body["attempts_after"] == body["attempts_before"] + 1


def test_dbms_er_diagram(client):
    r = client.get("/api/dbms/er-diagram")
    assert r.status_code == 200
    assert "papers" in r.json()["entities"]


def test_graph_status(client):
    r = client.get("/graph/status")
    assert r.status_code == 200
    body = r.json()
    assert "enabled" in body


def test_graph_snapshot(client):
    r = client.get("/graph/snapshot", params={"limit": 20})
    assert r.status_code == 200
    body = r.json()
    assert "nodes" in body and "edges" in body


def test_metrics_endpoint(client):
    r = client.get("/metrics")
    assert r.status_code == 200
    assert "app_uptime_seconds" in r.text


def test_metrics_middleware_records(client):
    client.get("/health")
    r = client.get("/metrics")
    assert 'path="/health"' in r.text or "http_requests_total" in r.text
