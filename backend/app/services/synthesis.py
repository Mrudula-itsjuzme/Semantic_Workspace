"""Cross-paper research synthesis.

Unlike the previous implementation (which concatenated abstracts), this
retrieves evidence per paper via vector search, groups evidence by section
type (methods / results / limitations), and produces a comparison grounded in
cited chunks. Uses the LLM when configured, else a deterministic comparator.
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.embeddings import get_embedding_service
from app.services.graphrag import _extractive_answer, _generate_llm, validate_citations
from app.services.vector_store import vector_search

SECTION_HINTS = {
    "method": ("method", "approach", "model", "architecture", "experiment", "procedure"),
    "finding": ("result", "finding", "show", "achiev", "outperform", "accuracy", "improve"),
    "limitation": ("limitation", "however", "fail", "drawback", "future work", "constraint"),
}


def _classify(text_content: str) -> str:
    low = text_content.lower()
    scores = {k: sum(1 for h in hs if h in low) for k, hs in SECTION_HINTS.items()}
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] > 0 else "general"


def gather_paper_evidence(
    db: Session,
    paper_id: int,
    focus_query: str,
    per_paper: int = 4,
) -> list[dict[str, Any]]:
    title_row = db.execute(
        text("SELECT title FROM papers WHERE id=:pid"), {"pid": paper_id}
    ).fetchone()
    query = focus_query
    if title_row and title_row.title:
        query = f"{focus_query} {title_row.title}"

    emb = get_embedding_service().embed_one(query)
    hits = vector_search(db, emb, limit=per_paper, min_score=0.1)
    hits = [h for h in hits if h["paper_id"] == paper_id]

    # Fallback: top chunks by recency of index (paper has no semantic match)
    if not hits:
        rows = db.execute(
            text(
                "SELECT id AS chunk_id, paper_id, content "
                "FROM chunks WHERE paper_id=:pid LIMIT :lim"
            ),
            {"pid": paper_id, "lim": per_paper},
        ).fetchall()
        hits = [
            {
                "chunk_id": r.chunk_id,
                "paper_id": r.paper_id,
                "content": r.content,
                "score": 0.0,
            }
            for r in rows
        ]
    for h in hits:
        h["aspect"] = _classify(h.get("content", ""))
    return hits


def synthesize_papers(
    db: Session,
    paper_ids: list[int],
    focus_query: str = "methods findings limitations",
) -> dict[str, Any]:
    if not paper_ids:
        return {"executive_summary": "No papers were selected for synthesis.", "key_insights": []}

    papers_meta = db.execute(
        text(
            "SELECT id, title, publication_year AS year, venue, abstract "
            "FROM papers WHERE id = ANY(:ids)"
        ),
        {"ids": paper_ids},
    ).fetchall()
    if not papers_meta:
        return {
            "executive_summary": "None of the selected paper IDs were found.",
            "key_insights": [],
        }

    # Evidence per paper
    evidence_by_paper: dict[int, list[dict[str, Any]]] = {}
    for p in papers_meta:
        evidence_by_paper[p.id] = gather_paper_evidence(db, p.id, focus_query)

    # Build comparative context
    blocks: list[str] = []
    flat_citations: list[dict[str, Any]] = []
    marker = 1
    for p in papers_meta:
        for ev in evidence_by_paper.get(p.id, []):
            blocks.append(
                f"[{marker}] Paper #{p.id} \"{p.title}\" ({p.year or 'n.d.'}) "
                f"[aspect: {ev['aspect']}] chunk #{ev['chunk_id']}:\n{(ev['content'] or '')[:700]}"
            )
            flat_citations.append(
                {
                    "marker": f"[{marker}]",
                    "paper_id": p.id,
                    "chunk_id": ev["chunk_id"],
                    "title": p.title,
                    "year": p.year,
                    "aspect": ev["aspect"],
                    "score": round(float(ev.get("score", 0)) * 100, 1),
                    "snippet": (ev.get("content") or "")[:240],
                }
            )
            marker += 1

    meta_lines = [
        f"- Paper #{p.id}: \"{p.title}\" ({p.year or 'n.d.'}, venue: {p.venue or 'unknown'})"
        for p in papers_meta
    ]
    question = (
        "Compare these papers across: (1) methods, (2) findings, (3) limitations, "
        "(4) disagreements, (5) research gaps. Cite evidence markers."
    )

    context = "\n".join(meta_lines) + "\n\nEVIDENCE:\n" + "\n\n".join(blocks)
    if not blocks:
        context = "\n".join(meta_lines) + "\n\n(No indexed chunks available — metadata only.)"

    synthesis = _generate_llm(question, context)
    grounded_by_llm = synthesis is not None

    if synthesis is None:
        synthesis = _deterministic_synthesis(papers_meta, evidence_by_paper, flat_citations)

    check = validate_citations(synthesis, flat_citations)
    if not check["all_citations_valid"]:
        for m in check["fabricated_citations"]:
            synthesis = synthesis.replace(m, "")
        check["fabricated_citations_removed"] = True

    aspects = {}
    for c in flat_citations:
        aspects.setdefault(c["aspect"], 0)
        aspects[c["aspect"]] += 1

    return {
        "executive_summary": synthesis,
        "key_insights": _key_insights(papers_meta, evidence_by_paper, aspects),
        "citations": flat_citations,
        "citation_check": check,
        "grounded": grounded_by_llm or bool(flat_citations),
        "evidence_stats": {
            "papers": len(papers_meta),
            "chunks_used": len(flat_citations),
            "aspects": aspects,
        },
    }


def _deterministic_synthesis(
    papers_meta, evidence_by_paper, citations: list[dict[str, Any]]
) -> str:
    lines = [f"Comparative synthesis of {len(papers_meta)} paper(s), grounded in "
             f"{len(citations)} evidence chunk(s):", ""]
    for p in papers_meta:
        evs = evidence_by_paper.get(p.id, [])
        lines.append(f"Paper #{p.id} — \"{p.title}\" ({p.year or 'n.d.'})")
        for aspect in ("method", "finding", "limitation"):
            ev_aspect = [e for e in evs if e["aspect"] == aspect]
            if ev_aspect:
                idx = next(
                    (c["marker"] for c in citations if c["chunk_id"] == ev_aspect[0]["chunk_id"]),
                    None,
                )
                snippet = re.split(r"(?<=[.!?])\s+", ev_aspect[0]["content"] or "")[0]
                lines.append(f"  • {aspect.capitalize()} {idx or ''}: {snippet[:260]}")
        lines.append("")
    if not citations:
        lines.append(
            "Note: no indexed chunks were available; this comparison is metadata-only. "
            "Run PDF ingestion to enable evidence-grounded synthesis."
        )
    return "\n".join(lines)


def _key_insights(papers_meta, evidence_by_paper, aspects: dict[str, int]) -> list[str]:
    insights: list[str] = []
    years = [p.year for p in papers_meta if p.year]
    if years:
        insights.append(f"Publication span: {min(years)}–{max(years)}")
    if aspects.get("method"):
        insights.append(f"{aspects['method']} method-focused chunk(s) compared")
    if aspects.get("limitation"):
        insights.append(f"{aspects['limitation']} limitation-focused chunk(s) — candidate research gap")
    if aspects.get("finding"):
        insights.append(f"{aspects['finding']} finding-focused chunk(s) compared")
    chunks_total = sum(len(v) for v in evidence_by_paper.values())
    if chunks_total == 0:
        insights.append("No indexed chunks found — ingest PDFs for evidence-grounded synthesis")
    return insights
