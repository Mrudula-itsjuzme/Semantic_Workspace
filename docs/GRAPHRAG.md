# GraphRAG Pipeline

```
                         ┌────────────────────┐
        question ──────► │ 1. Vector seeds    │  pgvector cosine over
                         │    (top-6 chunks)  │  chunk embeddings (384d)
                         └─────────┬──────────┘
                                   │ seed paper ids
                         ┌─────────▼──────────┐
                         │ 2. Graph expansion │  Neo4j: CITES/AUTHORED
                         │  (1-3 hops, ≤12)   │  neighbours of seed papers
                         └─────────┬──────────┘
                                   │ +1 chunk per expanded paper
                         ┌─────────▼──────────┐
                         │ 3. Candidate fusion│  dedupe by chunk_id,
                         │  keep best score   │  merge provenance
                         └─────────┬──────────┘
                         ┌─────────▼──────────┐
                         │ 4. Evidence select │  cosine ≥ 0.15, top-K (≤6)
                         └─────────┬──────────┘
                         ┌─────────▼──────────┐
                         │ 5. Grounded        │  OpenAI (if configured) or
                         │    generation      │  deterministic extractive
                         └─────────┬──────────┘
                         ┌─────────▼──────────┐
                         │ 6. Citation        │  every [n] must exist in
                         │    validation      │  evidence; fabrications stripped
                         └────────────────────┘
```

## Guarantees

1. **Grounding** — the generator sees only numbered evidence blocks; the
   extractive fallback literally emits evidence sentences with markers.
2. **Provenance** — each citation carries paper_id, chunk_id, title, year,
   DOI, similarity score, graph-hop count, and which retrievers found it.
3. **Insufficient evidence** — when no chunk passes the floor, the answer is
   an explicit "insufficient evidence" message; nothing is invented.
4. **No fabricated citations** — `_CITE_RE` extracts every `[n]`; markers not
   present in evidence are stripped and reported in `citation_check`.
5. **Graceful degradation** — Neo4j down ⇒ pipeline continues with vector
   seeds only (`graph_enabled: false` in response); LLM down ⇒ extractive.

## API

```
POST /api/graphrag/ask     {"question": "...", "expand_hops": 1..3}
GET  /api/graphrag/explain  (this pipeline, machine-readable)
POST /api/ai/ask            (backward-compatible wrapper, same engine)
```

Example response fields: `answer`, `citations[]`, `grounded`,
`citation_check{cited_markers, valid_markers, fabricated_citations,
all_citations_valid}`, `retrieval{seeds, graph_expanded, evidence_used,
graph_enabled}`.

## Synthesis (cross-paper)

`POST /api/ai/synthesize` reuses the same evidence machinery per selected
paper, classifies chunks (method / finding / limitation) and asks the
generator to compare methods, findings, limitations, disagreements and gaps —
every claim carries an evidence marker; `evidence_stats.aspects` reports the
evidence mix.
