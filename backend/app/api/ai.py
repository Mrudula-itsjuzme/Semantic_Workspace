from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.databases import get_db
from app.services.graphrag import answer_question
from app.services.synthesis import synthesize_papers


router = APIRouter()


class AskRequest(BaseModel):
    question: str


@router.post("/ai/ask")
def ask_ai(req: AskRequest, db: Session = Depends(get_db)):
    """Backward-compatible RAG Q&A — now grounded via the GraphRAG pipeline."""
    q = req.question.strip()
    if not q:
        return {"answer": "Please provide a question.", "citations": []}
    try:
        result = answer_question(db, q)
        # Keep the old response shape (answer + citations) and add extras.
        return {
            "answer": result["answer"],
            "citations": result["citations"],
            "grounded": result["grounded"],
            "citation_check": result["citation_check"],
            "retrieval": result["retrieval"],
        }
    except Exception:
        return {
            "answer": "An error occurred while searching your indexed papers. Check server logs.",
            "citations": [],
        }


class SynthesizeRequest(BaseModel):
    paper_ids: list[int] = []
    focus_query: str = "methods findings limitations"


@router.post("/ai/synthesize")
def synthesize(req: SynthesizeRequest, db: Session = Depends(get_db)):
    """Evidence-grounded cross-paper synthesis (methods / findings / limitations /
    disagreements / gaps) with citations."""
    try:
        return synthesize_papers(db, req.paper_ids, req.focus_query)
    except Exception:
        return {
            "executive_summary": "Synthesis failed. Check server logs.",
            "key_insights": [],
            "citations": [],
        }


class ParseWorkspaceRequest(BaseModel):
    canvas_nodes: list = []
    project_name: str = ""


@router.post("/ai/parse-workspace")
def parse_workspace(req: ParseWorkspaceRequest, db: Session = Depends(get_db)):
    """Workspace suggestions derived from real library + graph state."""
    try:
        paper_count = db.execute(text("SELECT COUNT(*) FROM papers")).scalar() or 0
        chunk_count = db.execute(text("SELECT COUNT(*) FROM chunks")).scalar() or 0
        canvas_count = len(req.canvas_nodes)

        papers = db.execute(
            text("SELECT id, title, publication_year FROM papers ORDER BY created_at DESC LIMIT 20")
        ).fetchall()

        suggestions: list[dict] = []
        related_papers: list[dict] = []
        todos: list[dict] = []

        if paper_count == 0:
            suggestions.append(
                {"type": "action", "text": "Your library is empty. Use Literature Search to ingest papers."}
            )
        else:
            suggestions.append(
                {"type": "stat", "text": f"Library: {paper_count} papers indexed with {chunk_count} vector chunks."}
            )

        if canvas_count == 0 and paper_count:
            suggestions.append(
                {"type": "action", "text": "Your canvas is empty. Add papers to start mapping connections."}
            )

        for p in papers:
            related_papers.append(
                {"id": p.id, "title": p.title, "publication_year": p.publication_year,
                 "reason": "In library"}
            )

        if paper_count >= 3:
            todos.append({"text": "Run a synthesis comparison on key papers", "priority": "Medium", "due_date": "Soon"})
        if chunk_count == 0 and paper_count > 0:
            todos.append({"text": "Upload PDFs so ingestion can build vector chunks", "priority": "High", "due_date": "This week"})

        return {
            "suggestions": suggestions,
            "related_papers": related_papers[:5],
            "todos": todos,
            "stats": {
                "total_papers": paper_count,
                "total_chunks": chunk_count,
                "canvas_nodes": canvas_count,
            },
        }
    except Exception:
        return {
            "suggestions": [{"type": "error", "text": "Workspace analysis failed."}],
            "related_papers": [],
            "todos": [],
            "stats": {},
        }
