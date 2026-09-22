# Cloud Architecture

## Production topology (single Azure VM + Docker Compose)

```
                      Internet
                          │  80/443
                 ┌────────▼─────────┐
                 │  Nginx (TLS)     │  reverse proxy, HSTS,
                 │  certs: Key Vault│  security headers,
                 └───┬──────────┬───┘  60MB uploads
        / (API)      │          │
             ┌───────▼──┐   ┌───▼────────┐
             │ FastAPI  │   │ Frontend   │
             │ 2 workers│   │ nginx:alpine│
             └───┬──────┘   └────────────┘
                 │
   ┌─────────────┼──────────────┬──────────────┐
┌──▼───┐   ┌────▼────┐   ┌─────▼─────┐  ┌────▼─────┐
│ Neo4j│   │Postgres │   │   Redis   │  │  MinIO   │
│ 2GB  │   │ pgvector│   │ RQ broker │  │ PDF store│
└──────┘   │  2GB    │   │  768MB    │  │   1GB    │
           └─────────┘   └─────┬─────┘  └──────────┘
                               │
                        ┌──────▼─────┐
                        │ RQ Worker  │  PDF pipeline,
                        │ (fastembed)│  embeddings, graph sync
                        └────────────┘
```

- All state in named volumes (survive redeploys); backup/restore in
  `infrastructure/azure/README.md`.
- `restart: always` on every service; healthchecks gate startup order.
- Secrets via `.env` (chmod 600) or Key Vault injection; never in git.
- Resource limits per service in `docker-compose.prod.yml`.
- `/metrics` is firewalled to private ranges at the proxy.

## Scaling path (when needed, not before)

1. More `worker` replicas (`docker compose up -d --scale worker=3`).
2. Azure Database for PostgreSQL + Azure Cache for Redis (managed).
3. Blob Storage backed MinIO gateway.
4. Prometheus + Grafana sidecars scraping `/metrics`.

# Demo Script (5–8 minutes)

1. **Stack health** — `curl localhost:8000/health | jq .components` —
   postgres, redis, minio, workers, embeddings, neo4j all ok.
2. **Ingest a PDF** — Library tab → **PDF** on a paper → pick a PDF →
   status flips `pending → running → success`, chunk count appears.
3. **Three search modes** — Literature Search tab: `attention` with
   Lexical FTS (keyword hits), Semantic Vector (semantic neighbours),
   Hybrid RRF (fused; hover provenance showing both retrievers' ranks).
4. **Knowledge Graph** — Graph tab: papers + citation/authorship edges from
   Neo4j; click a node to inspect.
5. **GraphRAG Q&A** — AI Assistant: "What do the transformer papers study?"
   — grounded answer with citation markers; citation check passes.
6. **Synthesis** — select 2–3 papers → Generate AI Synthesis — comparative
   methods/findings/limitations with evidence citations.
7. **DBMS demos** — hit `/api/dbms/transaction-demo` (rollback proof),
   `/api/dbms/isolation-demo` (concurrent snapshot), `/api/dbms/explain-search`
   (GIN index plan), `/api/dbms/trigger-demo/1` (attempts bump).
8. **Observability** — `curl localhost:8000/metrics | head` — request counts,
   latency quantiles, queue depth.

# Limitations (current)

- Extractive synthesis without an LLM key (config `LLM_PROVIDER=openai`).
- IVFFlat tuned for demo scale; re-tune `lists`/`probes` for larger corpora.
- Citation edges limited to top-10 resolved OpenAlex references.
- Metrics are in-process (reset on restart); scrape for history.
- No multi-tenancy/auth (single-user research workspace by design).
