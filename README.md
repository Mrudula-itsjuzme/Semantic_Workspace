# Semantic Research Workspace — Cloud-Native GraphRAG Research Platform

A functional research platform: paper ingestion with real PDF processing,
three genuinely different retrieval modes over PostgreSQL/pgvector, a Neo4j
knowledge graph, grounded GraphRAG Q&A with citation validation, cross-paper
synthesis, DBMS academic demonstrations, and a full observability story.

## Architecture

```
┌──────────────┐   Vite/React (nginx)          ┌───────────────────────┐
│   Frontend   │◄──── VITE_API_BASE_URL ───────►│   FastAPI Backend     │
└──────────────┘                                │  ├─ /search           │
                                                │  ├─ /graph            │
┌──────────────┐    PDF upload                  │  ├─ /api/graphrag     │
│    MinIO     │◄──────────────────────────────►│  ├─ /api/ai/synthesize│
│ (PDF storage)│        RQ queue                │  ├─ /api/dbms         │
└──────────────┘◄──┐    ┌──────────────┐        │  ├─ /api/ingestion    │
                   │    │  RQ Worker   │───────►│  ├─ /health /metrics  │
                   │    │ pdf→sections │  SQL   └───────────┬───────────┘
                   │    │ →chunks→embed│                    │
                   │    └──────┬───────┘            ┌───────▼────────┐
                   │           │ embeddings         │ PostgreSQL 16  │
                   │           ▼                    │ + pgvector     │
                   │    ┌──────────────┐            │  papers/authors│
                   │    │   fastembed  │            │  sections/chunk│
                   │    │ bge-small-en │            │  citations/jobs│
                   │    └──────────────┘            └───────┬────────┘
                   │                                        │ sync
                   │    ┌──────────────┐            ┌───────▼────────┐
                   └────│    Redis     │            │     Neo4j 5    │
                        │  (RQ broker) │            │ Paper/Author/  │
                        └──────────────┘            │ CITES/AUTHORED │
                                                    └────────────────┘
```

## Quick start

```bash
cp .env.example .env              # defaults work for local dev
cd infrastructure
docker compose up -d --build
# backend  → http://localhost:8000  (docs at /docs)
# frontend → http://localhost:5173
# neo4j    → http://localhost:7474  (neo4j / neo4jpassword)
# minio    → http://localhost:9001  (minioadmin / minioadmin)
```

The backend runs `alembic upgrade head` (or a create_all fallback) at startup.

## Core capabilities

### Ingestion pipeline (PDF → graph)
`/api/ingestion/papers/{id}/pdf` (upload) → RQ worker:
**PDF text extraction (pypdf) → section detection → overlap chunking →
fastembed embeddings → pgvector (vector 384, IVFFlat) → Neo4j sync.**
Status lifecycle `pending → running → success | failed` is trigger-enforced
in Postgres; failed jobs re-enqueue with exponential backoff (max attempts
via `INGESTION_MAX_RETRIES`); near-duplicates detected via `pg_trgm`
similarity and DOI/OpenAlex identity.

### Search — three real modes
| Mode | Engine | Fusion |
|------|--------|--------|
| `lexical` | PostgreSQL FTS (ts_rank + GIN) | — |
| `vector` | pgvector cosine (bge-small-en-v1.5, 384d) | — |
| `hybrid` | both of the above | Reciprocal Rank Fusion (k=60) |

Every result carries provenance: which retriever(s) found it, per-source rank
and raw score, plus RRF fusion diagnostics. `match_type: "both"` marks chunks
found by both retrievers.

### Graph layer (Neo4j)
- `(:Paper)-[:CITES]->(:Paper)`, `(:Author)-[:AUTHORED {order}]->(:Paper)`,
  `(:Paper)-[:ABOUT]->(:Topic)`
- populated automatically during ingestion (idempotent MERGEs; failure never
  breaks ingestion)
- endpoints: `/graph/snapshot`, `/graph/papers/{id}/neighbours`,
  `/graph/papers/{src}/path/{dst}` (shortest citation path),
  `/graph/papers/{id}/shared-authors`, `/graph/papers/{id}/topics`,
  `/graph/papers/{id}/sync`
- the frontend **Knowledge Graph** tab renders the live snapshot

### GraphRAG pipeline
```
question → vector seed retrieval → graph expansion (Neo4j neighbours)
→ candidate fusion (dedupe + provenance) → evidence selection (score floor)
→ grounded generation (LLM if configured, else extractive)
→ citation validation (every [n] must map to real evidence)
```
Insufficient evidence is stated explicitly; fabricated citation markers are
stripped and reported. `POST /api/graphrag/ask`, pipeline docs at
`/api/graphrag/explain`.

### Research synthesis
`POST /api/ai/synthesize` retrieves per-paper evidence (vector search),
classifies chunks as method / finding / limitation, and produces a
comparison with citation markers — not abstract concatenation.

### DBMS demonstrations (`/api/dbms/*`)
| Endpoint | Concept |
|---|---|
| `/explain-search` | EXPLAIN ANALYZE on GIN-indexed FTS |
| `/benchmark-index` | indexed vs unindexed timing |
| `/transaction-demo` | ACID transaction + rollback proof |
| `/isolation-demo` | concurrent TXNs, READ COMMITTED snapshot |
| `/trigger-demo/{id}` | BEFORE UPDATE trigger (ingestion attempts) |
| `/function-demo/{id}` | SQL function |
| `/procedure-demo` | stored procedure (requeue failed) |
| `/view-overview` | `v_paper_overview` view |
| `/pgvector-explain` | IVFFlat ANN index plan |
| `/er-diagram` | entity-relationship map |

### Observability
- `/health` — Postgres, Redis, MinIO, RQ workers, embedding readiness, Neo4j,
  queue depth
- `/metrics` — Prometheus text format: request counts, latency quantiles,
  error rates, queue depth, DB gauges
- structured JSON logs in API and worker

### Evaluation
```bash
docker exec srw_backend python evaluation/evaluate.py --k 5
```
Reports Precision@K, Recall@K, MRR, latency and citation correctness per
retrieval mode + GraphRAG (see `evaluation/queries.json`, results in
`evaluation/results.json`).

## Testing

```bash
# unit tests only (no services)
cd backend && python -m pytest tests/test_unit.py -v

# full integration suite (docker compose stack running)
cd backend && RUN_INTEGRATION=1 python -m pytest tests/ -v
```

Covers: API, database, ingestion pipeline, duplicate handling, retrieval
modes, hybrid fusion properties, graph operations, worker pipeline,
failure/retry cases.

## Production deployment

```bash
cp .env.example .env   # real secrets
# TLS certs into infrastructure/nginx/certs/ (see infrastructure/nginx/README.md)
docker compose -f infrastructure/docker-compose.yml \
               -f infrastructure/docker-compose.prod.yml up -d
```
Adds nginx TLS termination, security headers, resource limits, no dev
mounts/ports. Azure guide incl. backup/restore: `infrastructure/azure/README.md`.

CI (`.github/workflows/ci.yml`): backend tests → frontend lint+build →
docker compose validation + image builds → optional Azure deploy.

## Configuration

All configuration is environment-based — see `.env.example`.
Key variables: `EMBEDDING_MODEL` / `EMBEDDING_DIM` (384),
`NEO4J_URI` (empty disables the graph layer gracefully), `LLM_PROVIDER`
(`none` = deterministic extractive generation; `openai` uses `OPENAI_API_KEY`
+ `LLM_MODEL`), `CORS_ORIGINS`, `VITE_API_BASE_URL`.

## Limitations

- Extractive fallback synthesis is sentence-level; enable `LLM_PROVIDER=openai`
  for abstractive grounded answers.
- IVFFlat index is built for the demo corpus scale (`lists=100`); rebuild with
  more probes/lists for larger corpora.
- Citation extraction relies on OpenAlex `referenced_works` (top 10 resolved).
- In-process metrics reset on restart; scrape into Prometheus for history.
- Neo4j sync is per-paper at ingestion time; a bulk `/graph/papers/{id}/sync`
  endpoint exists for backfill.
