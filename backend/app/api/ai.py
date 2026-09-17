from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.databases import get_db


router = APIRouter()


class AskRequest(BaseModel):
    question: str


@router.post("/ai/ask")
def ask_ai(req: AskRequest, db: Session = Depends(get_db)):
    """
    Simple RAG-style Q&A: searches chunk embeddings / full-text
    for relevant context, then returns the top matching snippets
    as an answer with citations.
    """
    q = req.question.strip()
    if not q:
        return {"answer": "Please provide a question.", "citations": []}

    try:
        # Full-text search across chunks joined with papers
        rows = db.execute(
            text("""
                SELECT
                    p.id AS paper_id,
                    p.title,
                    p.publication_year,
                    c.content AS snippet,
                    ts_rank(
                        to_tsvector('english', c.content),
                        plainto_tsquery('english', :q)
                    ) AS rank
                FROM chunks c
                JOIN papers p ON p.id = c.paper_id
                WHERE to_tsvector('english', c.content)
                      @@ plainto_tsquery('english', :q)
                ORDER BY rank DESC
                LIMIT 5
            """),
            {"q": q},
        ).fetchall()

        if not rows:
            # Fallback 2: ILIKE on chunk content (catches acronyms, partial words)
            rows = db.execute(
                text("""
                    SELECT
                        p.id AS paper_id,
                        p.title,
                        p.publication_year,
                        c.content AS snippet,
                        1.0 AS rank
                    FROM chunks c
                    JOIN papers p ON p.id = c.paper_id
                    WHERE c.content ILIKE '%' || :q || '%'
                    LIMIT 5
                """),
                {"q": q},
            ).fetchall()

        if not rows:
            # Fallback 3: ILIKE on paper title/abstract
            rows = db.execute(
                text("""
                    SELECT
                        p.id AS paper_id,
                        p.title,
                        p.publication_year,
                        COALESCE(p.abstract, p.title) AS snippet,
                        1.0 AS rank
                    FROM papers p
                    WHERE p.title ILIKE '%' || :q || '%'
                       OR p.abstract ILIKE '%' || :q || '%'
                    LIMIT 5
                """),
                {"q": q},
            ).fetchall()

        if not rows:
            # Final fallback: return all papers so user knows what's indexed
            rows = db.execute(
                text("""
                    SELECT
                        p.id AS paper_id,
                        p.title,
                        p.publication_year,
                        COALESCE(p.abstract, p.title) AS snippet,
                        0.5 AS rank
                    FROM papers p
                    LIMIT 5
                """),
            ).fetchall()

            if rows:
                paper_titles = ", ".join(f'"{r.title}"' for r in rows[:5])
                return {
                    "answer": (
                        f"I couldn't find chunks matching \"{q}\" specifically, "
                        f"but here are some papers in your library you can ask about:\n\n"
                        + "\n".join(f"• {r.title} ({r.publication_year or 'N/A'})" for r in rows)
                    ),
                    "citations": [],
                }

        if not rows:
            return {
                "answer": (
                    f"I couldn't find any indexed papers or chunks matching \"{q}\". "
                    "Try ingesting more papers or rephrasing your question."
                ),
                "citations": [],
            }

        # Build citations
        citations = []
        for r in rows:
            snippet_text = r.snippet[:300] + "..." if len(r.snippet) > 300 else r.snippet
            citations.append({
                "title": r.title,
                "year": r.publication_year,
                "relevance_score": round(float(r.rank) * 100, 1),
                "snippet": snippet_text,
            })

        # Build a simple synthesized answer from the top chunks
        top = rows[0]
        answer_parts = [
            f"Based on {len(rows)} relevant chunk(s) from your indexed papers:\n"
        ]
        for i, r in enumerate(rows, 1):
            snippet_preview = r.snippet[:200] + "..." if len(r.snippet) > 200 else r.snippet
            answer_parts.append(
                f"{i}. \"{r.title}\" ({r.publication_year or 'N/A'}): "
                f"{snippet_preview}\n"
            )

        return {
            "answer": "\n".join(answer_parts),
            "citations": citations,
        }

    except Exception as e:
        print("AI ask error:", repr(e))
        return {
            "answer": (
                "An error occurred while searching your indexed papers. "
                f"Details: {str(e)}"
            ),
            "citations": [],
        }


# -----------------------------------------------------------
# POST /api/ai/synthesize
# -----------------------------------------------------------

class SynthesizeRequest(BaseModel):
    paper_ids: list[int] = []


@router.post("/ai/synthesize")
def synthesize_papers(req: SynthesizeRequest, db: Session = Depends(get_db)):
    """
    Generate a synthesis summary across multiple papers.
    Compares their titles, abstracts, and chunks to produce
    an executive summary and key comparative insights.
    """
    if not req.paper_ids:
        return {
            "executive_summary": "No papers were selected for synthesis.",
            "key_insights": [],
        }

    try:
        # Fetch the selected papers
        placeholders = ", ".join(str(int(pid)) for pid in req.paper_ids)
        rows = db.execute(
            text(f"""
                SELECT id, title, abstract, publication_year, venue
                FROM papers
                WHERE id IN ({placeholders})
            """),
        ).fetchall()

        if not rows:
            return {
                "executive_summary": "None of the selected paper IDs were found in the database.",
                "key_insights": [],
            }

        # Build executive summary from paper metadata
        paper_summaries = []
        for r in rows:
            abstract_snippet = (r.abstract[:200] + "...") if r.abstract and len(r.abstract) > 200 else (r.abstract or "No abstract available")
            paper_summaries.append(
                f"• \"{r.title}\" ({r.publication_year or 'N/A'}): {abstract_snippet}"
            )

        executive_summary = (
            f"Comparative analysis of {len(rows)} selected paper(s):\n\n"
            + "\n\n".join(paper_summaries)
        )

        # Generate key insights by comparing papers
        key_insights = []

        years = [r.publication_year for r in rows if r.publication_year]
        if years:
            key_insights.append(
                f"Publication range: {min(years)} – {max(years)} "
                f"(spanning {max(years) - min(years)} year(s))"
            )

        venues = list(set(r.venue for r in rows if r.venue))
        if venues:
            key_insights.append(f"Venues represented: {', '.join(venues)}")

        key_insights.append(
            f"{len(rows)} paper(s) selected for cross-paper comparison"
        )

        # Check for shared chunk themes
        if len(req.paper_ids) >= 2:
            chunk_rows = db.execute(
                text(f"""
                    SELECT DISTINCT p.title, c.content
                    FROM chunks c
                    JOIN papers p ON p.id = c.paper_id
                    WHERE p.id IN ({placeholders})
                    LIMIT 10
                """),
            ).fetchall()

            if chunk_rows:
                key_insights.append(
                    f"{len(chunk_rows)} indexed chunk(s) available across selected papers for deep comparison"
                )

        return {
            "executive_summary": executive_summary,
            "key_insights": key_insights,
        }

    except Exception as e:
        print("Synthesize error:", repr(e))
        return {
            "executive_summary": f"Error during synthesis: {str(e)}",
            "key_insights": [],
        }


# -----------------------------------------------------------
# POST /api/ai/parse-workspace
# -----------------------------------------------------------

class ParseWorkspaceRequest(BaseModel):
    canvas_nodes: list = []
    project_name: str = ""


@router.post("/ai/parse-workspace")
def parse_workspace(req: ParseWorkspaceRequest, db: Session = Depends(get_db)):
    """
    Scan the workspace (canvas nodes + indexed papers) and return
    suggested actions, related papers, and tasks.
    """
    try:
        # Get library stats
        paper_count = db.execute(text("SELECT COUNT(*) FROM papers")).scalar() or 0
        chunk_count = db.execute(text("SELECT COUNT(*) FROM chunks")).scalar() or 0

        # Get all paper titles for context
        papers = db.execute(
            text("SELECT id, title, publication_year FROM papers LIMIT 20")
        ).fetchall()

        canvas_count = len(req.canvas_nodes)
        paper_titles_on_canvas = [
            n.get("title", "") for n in req.canvas_nodes
            if n.get("type") == "paper"
        ]

        suggestions = []
        related_papers = []
        todos = []

        # Generate suggestions based on workspace state
        if paper_count == 0:
            suggestions.append({
                "type": "action",
                "text": "Your library is empty. Use Literature Search to find and ingest papers.",
            })
        else:
            suggestions.append({
                "type": "stat",
                "text": f"Library: {paper_count} papers indexed with {chunk_count} vector chunks.",
            })

        if canvas_count == 0:
            suggestions.append({
                "type": "action",
                "text": "Your canvas is empty. Add papers from the library to start mapping connections.",
            })
        else:
            suggestions.append({
                "type": "stat",
                "text": f"Canvas has {canvas_count} node(s). Consider adding connections between related papers.",
            })

        # Suggest related papers not yet on canvas
        for p in papers:
            if p.title not in paper_titles_on_canvas:
                related_papers.append({
                    "id": p.id,
                    "title": p.title,
                    "publication_year": p.publication_year,
                    "reason": "In library but not on canvas",
                })

        # Generate suggested tasks
        if paper_count > 0 and canvas_count == 0:
            todos.append({
                "text": f"Add key papers to canvas for {req.project_name or 'your project'}",
                "priority": "High",
                "due_date": "This week",
            })

        if paper_count >= 3:
            todos.append({
                "text": "Run synthesis comparison on top papers",
                "priority": "Medium",
                "due_date": "Soon",
            })

        todos.append({
            "text": "Search for recent related work on OpenAlex",
            "priority": "Medium",
            "due_date": "Soon",
        })

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

    except Exception as e:
        print("Parse workspace error:", repr(e))
        return {
            "suggestions": [{"type": "error", "text": f"Error: {str(e)}"}],
            "related_papers": [],
            "todos": [],
            "stats": {},
        }
