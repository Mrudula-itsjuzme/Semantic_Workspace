from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.databases import get_db
from app.services.graphrag import answer_question

router = APIRouter(prefix="/graphrag")


class GraphRagRequest(BaseModel):
    question: str
    expand_hops: int = Field(default=1, ge=1, le=3)


@router.post("/ask")
def ask(req: GraphRagRequest, db: Session = Depends(get_db)):
    q = req.question.strip()
    if not q:
        return {
            "answer": "Please provide a question.",
            "citations": [],
            "grounded": False,
            "citation_check": {"all_citations_valid": True, "fabricated_citations": []},
            "retrieval": {"seeds": 0, "graph_expanded": 0, "evidence_used": 0},
        }
    try:
        return answer_question(db, q, expand_hops=req.expand_hops)
    except Exception:
        # Never leak internals to the client
        return {
            "answer": "GraphRAG pipeline failed while retrieving evidence. Check server logs.",
            "citations": [],
            "grounded": False,
            "citation_check": {"all_citations_valid": True, "fabricated_citations": []},
            "retrieval": {"seeds": 0, "graph_expanded": 0, "evidence_used": 0},
            "error": "pipeline_failure",
        }


@router.get("/explain")
def explain():
    """Pipeline description for the UI/docs."""
    return {
        "pipeline": [
            "vector seed retrieval (pgvector cosine on chunk embeddings)",
            "graph expansion (Neo4j CITES/AUTHORED neighbours, when configured)",
            "candidate fusion (dedupe by chunk, keep best score + provenance)",
            "evidence selection (similarity floor, top-K chunks)",
            "grounded generation (LLM or extractive fallback, citation markers)",
            "citation validation (every [n] must map to real evidence)",
        ]
    }
