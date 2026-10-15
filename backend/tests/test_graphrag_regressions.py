"""Regression tests for GraphRAG score calibration and graph-neighbour provenance."""
from unittest.mock import patch

from app.services import graphrag


def _hit(paper, chunk, score):
    return {"paper_id": paper, "chunk_id": chunk, "score": score,
            "retriever": "vector", "title": f"Paper {paper}", "content": "Evidence"}


def test_graph_expansion_restricts_chunks_to_neighbour_papers():
    def fake_search(db, question, limit=6, min_score=0.0, paper_id=None):
        if paper_id is None:
            return [_hit(1, 10, 80.0)]
        assert paper_id == 2
        assert min_score == 0.15
        return [_hit(2, 20, 55.0)]

    with patch.object(graphrag, "search_vector", side_effect=fake_search), \\
         patch.object(graphrag.graph_sync, "is_graph_enabled", return_value=True), \\
         patch.object(graphrag.graph_sync, "graph_expand", return_value=[{"paper_id": 2, "hops": 1}]):
        result = graphrag.retrieve_evidence(None, "research question")
    assert {x["paper_id"] for x in result} == {1, 2}
    assert next(x for x in result if x["paper_id"] == 2)["graph_hops"] == 1


def test_evidence_threshold_uses_percent_scale():
    with patch.object(graphrag, "search_vector", return_value=[_hit(1, 10, 8.0), _hit(2, 20, 19.0)]), \\
         patch.object(graphrag.graph_sync, "is_graph_enabled", return_value=False):
        result = graphrag.retrieve_evidence(None, "research question")
    assert [r["chunk_id"] for r in result] == [20]


def test_citation_score_is_not_multiplied_again():
    _, citations = graphrag.build_evidence_context([_hit(1, 10, 82.5)])
    assert citations[0]["score"] == 82.5
