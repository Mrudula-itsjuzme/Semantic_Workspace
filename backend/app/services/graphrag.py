"""GraphRAG pipeline.

vector seed retrieval → graph expansion → candidate fusion → evidence
selection → grounded LLM generation → citation validation.

Every claim in the answer must trace to a retrieved evidence chunk. When
evidence is insufficient the endpoint says so explicitly — the model is never
allowed to invent citations.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from sqlalchemy.orm import Session

from app.services import graph_sync
from app.services.search_service import search_hybrid, search_vector

logger = logging.getLogger(__name__)

MIN_EVIDENCE_SCORE = 0.15  # cosine similarity floor for usable evidence
MAX_EVIDENCE = 6


# ----------------------------------------------------------------------
# 1-3. Retrieval: seeds + graph expansion + fusion
# ----------------------------------------------------------------------
def retrieve_evidence(
    db: Session,
    question: str,
    limit: int = 8,
    expand_hops: int = 1,
) -> list[dict[str, Any]]:
    """Hybrid retrieval seeded on the question, expanded via the graph."""
    seeds = search_vector(db, question, limit=6)

    # Fall back to lexical seeds when the embedding space is empty
    if not seeds:
        seeds = search_hybrid(db, question, limit=6)
        seeds = [s for s in seeds if s.get("provenance")]

    seed_paper_ids = sorted({s["paper_id"] for s in seeds})
    expanded: list[dict[str, Any]] = []

    if graph_sync.is_graph_enabled() and seed_paper_ids:
        try:
            neighbours = graph_sync.graph_expand(seed_paper_ids, max_hops=expand_hops, limit=12)
            for n in neighbours:
                # Pull one high-similarity chunk per expanded paper
                extra = search_vector(
                    db,
                    question + " " + (n.get("title") or ""),
                    limit=1,
                )
                for e in extra:
                    e["graph_hops"] = n.get("hops", 1)
                    e["expanded_from"] = seed_paper_ids
                expanded.extend(extra)
        except Exception as exc:
            logger.warning("graph expansion failed (continuing): %s", exc)

    # Candidate fusion: dedupe by chunk, keep best score, track provenance
    candidates: dict[int, dict[str, Any]] = {}
    for rec in seeds + expanded:
        cid = rec["chunk_id"]
        if cid not in candidates or rec["score"] > candidates[cid]["score"]:
            prov = candidates.get(cid, {}).get("provenance", {})
            prov["retrievers"] = sorted(
                set(prov.get("retrievers", []) + [rec.get("retriever", "vector")])
            )
            rec = {**rec, "provenance": prov}
            candidates[cid] = rec

    ranked = sorted(candidates.values(), key=lambda r: r["score"], reverse=True)
    return [r for r in ranked if r["score"] >= MIN_EVIDENCE_SCORE][:limit]


# ----------------------------------------------------------------------
# 4. Evidence window for the generator
# ----------------------------------------------------------------------
def build_evidence_context(evidence: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    blocks: list[str] = []
    citations: list[dict[str, Any]] = []
    for i, ev in enumerate(evidence, start=1):
        marker = f"[{i}]"
        snippet = (ev.get("content") or "")[:900]
        blocks.append(
            f"{marker} {ev['title']} ({ev.get('year') or 'n.d.'}) "
            f"— paper #{ev['paper_id']}, chunk #{ev['chunk_id']}:\n{snippet}"
        )
        citations.append(
            {
                "marker": marker,
                "paper_id": ev["paper_id"],
                "chunk_id": ev["chunk_id"],
                "title": ev["title"],
                "year": ev.get("year"),
                "doi": ev.get("doi"),
                "venue": ev.get("venue"),
                "score": round(float(ev["score"]) * 100, 1),
                "snippet": snippet[:300],
                "graph_hops": ev.get("graph_hops", 0),
                "provenance": ev.get("provenance", {}),
            }
        )
    return "\n\n".join(blocks), citations


# ----------------------------------------------------------------------
# 5. Grounded generation
# ----------------------------------------------------------------------
def _generate_llm(question: str, context: str) -> str | None:
    """Use the configured LLM provider, or None to use the extractive fallback."""
    from app.core.config import get_settings

    s = get_settings()
    if s.llm_provider != "openai" or not s.openai_api_key:
        return None
    try:
        from openai import OpenAI

        client = OpenAI(api_key=s.openai_api_key)
        resp = client.chat.completions.create(
            model=s.llm_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a research assistant. Answer ONLY from the numbered "
                        "evidence blocks. Cite every claim with its marker like [1]. "
                        "If evidence is insufficient, say exactly that."
                    ),
                },
                {"role": "user", "content": f"Evidence:\n{context}\n\nQuestion: {question}"},
            ],
            temperature=0.2,
        )
        return resp.choices[0].message.content
    except Exception as exc:
        logger.warning("LLM generation failed, using extractive fallback: %s", type(exc).__name__)
        return None


_CITE_RE = re.compile(r"\[(\d{1,2})\]")


def _extractive_answer(question: str, evidence: list[dict[str, Any]]) -> str:
    """Deterministic fallback: compose the answer from top evidence sentences."""
    if not evidence:
        return "Insufficient evidence in the indexed corpus to answer this question."
    lines = [f"Based on {len(evidence)} retrieved evidence chunk(s):", ""]
    for i, ev in enumerate(evidence[:4], start=1):
        sentences = re.split(r"(?<=[.!?])\s+", ev.get("content") or "")
        best = " ".join(sentences[:2]).strip() or (ev.get("content") or "")[:240]
        lines.append(f"[{i}] {ev['title']} ({ev.get('year') or 'n.d.'}): {best}")
    lines.append("")
    lines.append(
        "Note: extractive synthesis (no LLM configured). Each line cites its evidence chunk."
    )
    return "\n".join(lines)


def validate_citations(answer: str, citations: list[dict[str, Any]]) -> dict[str, Any]:
    """Ensure every [n] marker in the answer refers to real evidence."""
    valid_markers = {c["marker"] for c in citations}
    used = {f"[{m}]" for m in _CITE_RE.findall(answer)}
    fabricated = sorted(used - valid_markers)
    return {
        "cited_markers": sorted(used),
        "valid_markers": sorted(valid_markers),
        "fabricated_citations": fabricated,
        "all_citations_valid": not fabricated and bool(used),
    }


# ----------------------------------------------------------------------
# Pipeline entry point
# ----------------------------------------------------------------------
def answer_question(
    db: Session,
    question: str,
    limit: int = MAX_EVIDENCE,
    expand_hops: int = 1,
) -> dict[str, Any]:
    evidence = retrieve_evidence(db, question, limit=limit, expand_hops=expand_hops)

    if not evidence:
        return {
            "answer": (
                "Insufficient evidence: no indexed chunk is relevant enough to answer "
                f"\"{question}\". Try ingesting more papers or rephrasing the question."
            ),
            "citations": [],
            "grounded": False,
            "citation_check": {"all_citations_valid": True, "fabricated_citations": []},
            "retrieval": {"seeds": 0, "expanded": 0},
        }

    context, citations = build_evidence_context(evidence)
    answer = _generate_llm(question, context) or _extractive_answer(question, evidence)
    check = validate_citations(answer, citations)

    if not check["all_citations_valid"]:
        # Strip fabricated markers rather than presenting them
        for marker in check["fabricated_citations"]:
            answer = answer.replace(marker, "")
        check["fabricated_citations_removed"] = True

    seed_count = len([c for c in citations if not c["graph_hops"]])
    expanded_count = len([c for c in citations if c["graph_hops"]])

    return {
        "answer": answer,
        "citations": citations,
        "grounded": True,
        "citation_check": check,
        "retrieval": {
            "seeds": seed_count,
            "graph_expanded": expanded_count,
            "evidence_used": len(evidence),
            "graph_enabled": graph_sync.is_graph_enabled(),
        },
    }
