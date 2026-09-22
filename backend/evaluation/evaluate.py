"""Reproducible retrieval / RAG evaluation.

Measures over evaluation/queries.json:
  - Precision@K, Recall@K, MRR for lexical / vector / hybrid retrieval
  - latency per mode
  - GraphRAG citation correctness

Usage (with docker-compose stack running):
  RUN_EVAL=1 python evaluation/evaluate.py [--k 5]
or inside the backend container:
  RUN_EVAL=1 python evaluation/evaluate.py
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

QUERIES_FILE = Path(__file__).parent / "queries.json"


def load_queries() -> list[dict]:
    with open(QUERIES_FILE) as fh:
        data = json.load(fh)
    return data["queries"]


def evaluate_retrieval(db, queries: list[dict], k: int) -> dict:
    from app.services.search_service import run_search

    report: dict[str, dict] = {}
    for mode in ("lexical", "vector", "hybrid"):
        precisions, recalls, rrs, latencies = [], [], [], []

        for q in queries:
            t0 = time.perf_counter()
            out = run_search(db, q["query"], mode=mode, limit=k)
            latencies.append((time.perf_counter() - t0) * 1000)

            got_ids = [r["id"] for r in out["results"]][:k]
            rel = set(q["relevant_paper_ids"])

            hits = [1 if pid in rel else 0 for pid in got_ids]
            precisions.append(sum(hits) / k if k else 0.0)
            recalls.append(sum(hits) / len(rel) if rel else 0.0)

            rr = 0.0
            for rank, pid in enumerate(got_ids, start=1):
                if pid in rel:
                    rr = 1.0 / rank
                    break
            rrs.append(rr)

        report[mode] = {
            f"precision@{k}": round(statistics.mean(precisions), 4),
            f"recall@{k}": round(statistics.mean(recalls), 4),
            "mrr": round(statistics.mean(rrs), 4),
            "latency_ms_avg": round(statistics.mean(latencies), 1),
            "latency_ms_p95": round(sorted(latencies)[int(len(latencies) * 0.95) - 1], 1),
        }
    return report


def evaluate_graphrag(db, queries: list[dict]) -> dict:
    from app.services.graphrag import answer_question

    latencies: list[float] = []
    grounded_count = 0
    citation_correct = 0
    answered = 0

    for q in queries:
        t0 = time.perf_counter()
        result = answer_question(db, q["query"])
        latencies.append((time.perf_counter() - t0) * 1000)

        if result["grounded"] and result["citations"]:
            answered += 1
            grounded_count += 1
            if result["citation_check"]["all_citations_valid"]:
                citation_correct += 1
        elif not result["grounded"]:
            # explicit "insufficient evidence" is correct behaviour
            citation_correct += 1

    return {
        "queries": len(queries),
        "grounded_answers": grounded_count,
        "citation_correctness": round(citation_correct / len(queries), 4),
        "latency_ms_avg": round(statistics.mean(latencies), 1),
        "latency_ms_p95": round(sorted(latencies)[int(len(latencies) * 0.95) - 1], 1),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--k", type=int, default=5)
    args = parser.parse_args()

    from app.db.databases import SessionLocal

    db = SessionLocal()
    try:
        queries = load_queries()
        retrieval = evaluate_retrieval(db, queries, args.k)
        graphrag = evaluate_graphrag(db, queries)

        report = {
            "dataset": "srw-retrieval-eval-v1",
            "k": args.k,
            "retrieval": retrieval,
            "graphrag": graphrag,
        }
        print(json.dumps(report, indent=2))

        out = Path(__file__).parent / "results.json"
        out.write_text(json.dumps(report, indent=2))
        print(f"\nSaved to {out}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
