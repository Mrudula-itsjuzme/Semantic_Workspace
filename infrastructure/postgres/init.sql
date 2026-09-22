CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- Papers
-- ============================================================
CREATE TABLE IF NOT EXISTS papers (
    id SERIAL PRIMARY KEY,
    doi TEXT UNIQUE,
    title TEXT NOT NULL,
    abstract TEXT,
    publication_year INTEGER,
    venue TEXT,
    pdf_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source TEXT,
    source_paper_id TEXT,
    pdf_url TEXT,
    is_cached BOOLEAN DEFAULT FALSE,
    openalex_id TEXT UNIQUE,
    -- Ingestion lifecycle: pending | running | success | failed
    ingestion_status TEXT NOT NULL DEFAULT 'pending',
    ingestion_error TEXT,
    ingestion_attempts INTEGER NOT NULL DEFAULT 0,
    ingestion_started_at TIMESTAMP,
    ingestion_finished_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS authors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    CONSTRAINT uq_author_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS paper_authors (
    paper_id INTEGER REFERENCES papers(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES authors(id) ON DELETE CASCADE,
    author_order INTEGER,
    PRIMARY KEY (paper_id, author_id)
);

-- ============================================================
-- Extracted sections (persisted PDF structure)
-- ============================================================
CREATE TABLE IF NOT EXISTS sections (
    id SERIAL PRIMARY KEY,
    paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    section_name TEXT NOT NULL,
    content TEXT NOT NULL,
    section_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sections_paper ON sections(paper_id);

-- ============================================================
-- Chunks with embeddings
-- ============================================================
CREATE TABLE IF NOT EXISTS chunks (
    id SERIAL PRIMARY KEY,
    paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    section_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(384),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (paper_id, chunk_index)
);

-- ============================================================
-- Citations
-- ============================================================
CREATE TABLE IF NOT EXISTS citations (
    citing_paper_id INTEGER REFERENCES papers(id) ON DELETE CASCADE,
    cited_paper_id INTEGER REFERENCES papers(id) ON DELETE CASCADE,
    citation_context TEXT,
    PRIMARY KEY (citing_paper_id, cited_paper_id)
);

-- ============================================================
-- Job log (worker pipeline observability)
-- ============================================================
CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id SERIAL PRIMARY KEY,
    paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL DEFAULT 'pdf_pipeline',
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    rq_job_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_paper ON ingestion_jobs(paper_id);

-- ============================================================
-- Indexes: FTS, trigram, vector (IVFFlat explained in docs/DBMS_DEMO.md)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_papers_title_fts
    ON papers USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,'')));
CREATE INDEX IF NOT EXISTS idx_chunks_content_fts
    ON chunks USING GIN (to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_chunks_content_trgm
    ON chunks USING GIN (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_ivfflat
    ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_papers_openalex ON papers(openalex_id);
CREATE INDEX IF NOT EXISTS idx_papers_source_paper ON papers(source_paper_id);
CREATE INDEX IF NOT EXISTS idx_papers_ingestion_status ON papers(ingestion_status);

-- ============================================================
-- DBMS academic layer: view + trigger + function
-- ============================================================

-- View: searchable paper catalogue joining metadata + ingestion state
CREATE OR REPLACE VIEW v_paper_overview AS
SELECT
    p.id,
    p.title,
    p.publication_year,
    p.venue,
    p.doi,
    p.ingestion_status,
    p.ingestion_attempts,
    COUNT(DISTINCT a.id) AS author_count,
    COUNT(DISTINCT s.id) AS section_count,
    COUNT(DISTINCT c.id) AS chunk_count,
    p.created_at
FROM papers p
LEFT JOIN paper_authors pa ON pa.paper_id = p.id
LEFT JOIN authors a ON a.id = pa.author_id
LEFT JOIN sections s ON s.paper_id = p.id
LEFT JOIN chunks c ON c.paper_id = p.id
GROUP BY p.id;

-- Function: enforce at least one valid ingestion status transition
CREATE OR REPLACE FUNCTION fn_touch_ingestion() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ingestion_status NOT IN ('pending','running','success','failed') THEN
        RAISE EXCEPTION 'invalid ingestion_status %', NEW.ingestion_status;
    END IF;
    IF NEW.ingestion_status = 'running' THEN
        NEW.ingestion_started_at := COALESCE(OLD.ingestion_started_at, now());
        NEW.ingestion_attempts := OLD.ingestion_attempts + 1;
    END IF;
    IF NEW.ingestion_status IN ('success','failed') THEN
        NEW.ingestion_finished_at := now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_papers_ingestion
BEFORE UPDATE OF ingestion_status ON papers
FOR EACH ROW EXECUTE FUNCTION fn_touch_ingestion();

-- Function + procedure demo used by /api/dbms endpoints
CREATE OR REPLACE FUNCTION fn_chunk_count_for_paper(pid INTEGER)
RETURNS INTEGER AS $$
    SELECT COUNT(*)::INTEGER FROM chunks WHERE paper_id = pid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE PROCEDURE sp_requeue_failed_papers(max_attempts INTEGER DEFAULT 3)
LANGUAGE plpgsql AS $$
DECLARE
    requeued INTEGER := 0;
BEGIN
    UPDATE papers
       SET ingestion_status = 'pending',
           ingestion_error = NULL
     WHERE ingestion_status = 'failed'
       AND ingestion_attempts < max_attempts;
    GET DIAGNOSTICS requeued = ROW_COUNT;
    RAISE NOTICE 'requeued % papers', requeued;
END;
$$;
