# DBMS Academic Layer

All demonstrations run on the real project schema — no toy examples.

## 1. Entity-Relationship diagram

```
┌─────────────┐        ┌──────────────┐        ┌─────────────┐
│   papers    │1      N│   sections   │1      N│    chunks   │
│─────────────│───────►│──────────────│───────►│─────────────│
│ id PK       │        │ id PK        │        │ id PK       │
│ doi UQ      │        │ paper_id FK  │        │ paper_id FK │
│ title       │        │ section_name │        │ section_id  │
│ abstract    │        │ content      │        │ chunk_index │
│ year, venue │        │ section_order│        │ content     │
│ openalex_id │        └──────────────┘        │ embedding   │
│ source,doi… │                                │ VECTOR(384) │
│ ingestion_* │                                └─────────────┘
└──┬───┬───┬──┘
   │1  │1  │1
   │N  │N  │N
┌──▼──────────┐ ┌─▼──────────────┐ ┌▼──────────────────┐
│citations    │ │ ingestion_jobs │ │   paper_authors   │N  1┌─────────┐
│citing PK/FK │ │ paper_id FK    │ │ paper_id PK/FK    │───►│ authors │
│cited PK/FK  │ │ status/attempts│ │ author_id PK/FK   │    │ id PK   │
│context      │ │ rq_job_id      │ │ author_order      │    │ name UQ │
└─────────────┘ └────────────────┘ └───────────────────┘    └─────────┘
```
Live endpoint: `GET /api/dbms/er-diagram`.

## 2. Normalization

- **1NF** — all attributes atomic (title, year, …).
- **2NF** — `paper_authors` composite key (paper_id, author_id); author_order
  depends on the whole key.
- **3NF** — author names live only in `authors` (no transitive dependency via
  papers); citation context separated into `citations`.
- Embeddings are stored with their chunk (1:1 dependence, no redundancy).

## 3. Indexes

| Index | Type | Serves |
|---|---|---|
| `idx_chunks_content_fts` | GIN on to_tsvector | lexical search |
| `idx_chunks_content_trgm` | GIN trigram | fuzzy/duplicate detection |
| `idx_chunks_embedding_ivfflat` | IVFFlat cosine | vector search |
| `idx_papers_title_fts` | GIN | paper FTS |
| `idx_papers_ingestion_status` | B-tree | status filtering |
| PK/FK B-trees | default | joins, lookups |

## 4. Trigger — `fn_touch_ingestion`

`BEFORE UPDATE OF ingestion_status ON papers`:
validates the status value; on `running` stamps `ingestion_started_at` and
increments `ingestion_attempts`; on `success|failed` stamps
`ingestion_finished_at`. Demo: `GET /api/dbms/trigger-demo/1`.

## 5. Function & procedure

- `fn_chunk_count_for_paper(pid)` — `SELECT fn_chunk_count_for_paper(1)`,
  demo: `/api/dbms/function-demo/1`
- `sp_requeue_failed_papers(max_attempts)` — `CALL …`, requeues failed papers,
  demo: `POST /api/dbms/procedure-demo`

## 6. View — `v_paper_overview`

Aggregated paper catalogue (author/section/chunk counts + ingestion state).
Demo: `GET /api/dbms/view-overview`.

## 7. Transactions, rollback, ACID

`POST /api/dbms/transaction-demo` inserts a citation edge inside a
transaction (savepoint), reads it (visible), rolls back, reads again
(gone) — atomicity & consistency demonstrated on live data.

## 8. Concurrency & isolation

`GET /api/dbms/isolation-demo` runs two threads: TXN A updates a paper's
venue and sleeps uncommitted; TXN B reads the venue — observes the
**pre-update** value (READ COMMITTED snapshot), then A rolls back.

## 9. EXPLAIN ANALYZE

`GET /api/dbms/explain-search` shows the planner using
`idx_chunks_content_fts` (Bitmap Index Scan on the GIN index).

## 10. Indexed vs unindexed benchmark

`GET /api/dbms/benchmark-index` compares PK B-tree lookups vs unindexed
`ILIKE` sequential scans on `chunks.content`.

## 11. pgvector index

`GET /api/dbms/pgvector-explain` explains IVFFlat: vectors clustered into
`lists` inverted cells; queries scan nearest cells only — sub-linear search
trading recall for speed. Our config: `lists=100`, cosine ops.
