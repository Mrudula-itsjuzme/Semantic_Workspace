"""baseline schema: papers, authors, sections, chunks, citations, ingestion_jobs

Revision ID: 0001_baseline
Revises:
Create Date: 2026-09-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "papers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("doi", sa.Text(), unique=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("abstract", sa.Text()),
        sa.Column("publication_year", sa.Integer()),
        sa.Column("venue", sa.Text()),
        sa.Column("pdf_path", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp()),
        sa.Column("source_paper_id", sa.Text()),
        sa.Column("pdf_url", sa.Text()),
        sa.Column("is_cached", sa.Boolean(), server_default=sa.false()),
        sa.Column("openalex_id", sa.Text(), unique=True),
        sa.Column("ingestion_status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("ingestion_error", sa.Text()),
        sa.Column("ingestion_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ingestion_started_at", sa.DateTime()),
        sa.Column("ingestion_finished_at", sa.DateTime()),
    )

    op.create_table(
        "authors",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.Text(), nullable=False, unique=True),
    )

    op.create_table(
        "paper_authors",
        sa.Column("paper_id", sa.Integer(), sa.ForeignKey("papers.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("authors.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("author_order", sa.Integer()),
    )

    op.create_table(
        "sections",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("paper_id", sa.Integer(), sa.ForeignKey("papers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("section_name", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("section_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp()),
    )
    op.create_index("idx_sections_paper", "sections", ["paper_id"])

    op.create_table(
        "chunks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("paper_id", sa.Integer(), sa.ForeignKey("papers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("section_id", sa.Integer(), sa.ForeignKey("sections.id", ondelete="CASCADE")),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp()),
        sa.UniqueConstraint("paper_id", "chunk_index", name="uq_chunks_paper_index"),
    )
    op.execute("ALTER TABLE chunks ADD COLUMN embedding vector(384)")

    op.create_table(
        "citations",
        sa.Column("citing_paper_id", sa.Integer(), sa.ForeignKey("papers.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("cited_paper_id", sa.Integer(), sa.ForeignKey("papers.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("citation_context", sa.Text()),
    )

    op.create_table(
        "ingestion_jobs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("paper_id", sa.Integer(), sa.ForeignKey("papers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_type", sa.Text(), nullable=False, server_default="pdf_pipeline"),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text()),
        sa.Column("rq_job_id", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.current_timestamp()),
    )
    op.create_index("idx_ingestion_jobs_paper", "ingestion_jobs", ["paper_id"])

    # FTS / trigram / vector indexes
    op.execute("CREATE INDEX idx_papers_title_fts ON papers USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,'')))")
    op.execute("CREATE INDEX idx_chunks_content_fts ON chunks USING GIN (to_tsvector('english', content))")
    op.execute("CREATE INDEX idx_chunks_content_trgm ON chunks USING GIN (content gin_trgm_ops)")
    op.execute("CREATE INDEX idx_chunks_embedding_ivfflat ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)")
    op.create_index("idx_papers_openalex", "papers", ["openalex_id"])
    op.create_index("idx_papers_source_paper", "papers", ["source_paper_id"])
    op.create_index("idx_papers_ingestion_status", "papers", ["ingestion_status"])

    # View + trigger + function + procedure (DBMS academic layer)
    op.execute("""
        CREATE OR REPLACE VIEW v_paper_overview AS
        SELECT
            p.id, p.title, p.publication_year, p.venue, p.doi,
            p.ingestion_status, p.ingestion_attempts,
            COUNT(DISTINCT a.id) AS author_count,
            COUNT(DISTINCT s.id) AS section_count,
            COUNT(DISTINCT c.id) AS chunk_count,
            p.created_at
        FROM papers p
        LEFT JOIN paper_authors pa ON pa.paper_id = p.id
        LEFT JOIN authors a ON a.id = pa.author_id
        LEFT JOIN sections s ON s.paper_id = p.id
        LEFT JOIN chunks c ON c.paper_id = p.id
        GROUP BY p.id
    """)

    op.execute("""
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
        $$ LANGUAGE plpgsql
    """)
    op.execute("CREATE TRIGGER trg_papers_ingestion BEFORE UPDATE OF ingestion_status ON papers FOR EACH ROW EXECUTE FUNCTION fn_touch_ingestion()")

    op.execute("""
        CREATE OR REPLACE FUNCTION fn_chunk_count_for_paper(pid INTEGER)
        RETURNS INTEGER AS $$
            SELECT COUNT(*)::INTEGER FROM chunks WHERE paper_id = pid;
        $$ LANGUAGE sql STABLE
    """)

    op.execute("""
        CREATE OR REPLACE PROCEDURE sp_requeue_failed_papers(max_attempts INTEGER DEFAULT 3)
        LANGUAGE plpgsql AS $block$
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
        $block$
    """)


def downgrade() -> None:
    op.execute("DROP PROCEDURE IF EXISTS sp_requeue_failed_papers(INTEGER)")
    op.execute("DROP FUNCTION IF EXISTS fn_chunk_count_for_paper(INTEGER)")
    op.execute("DROP TRIGGER IF EXISTS trg_papers_ingestion ON papers")
    op.execute("DROP FUNCTION IF EXISTS fn_touch_ingestion")
    op.execute("DROP VIEW IF EXISTS v_paper_overview")
    op.drop_index("idx_papers_ingestion_status", "papers")
    op.drop_index("idx_papers_source_paper", "papers")
    op.drop_index("idx_papers_openalex", "papers")
    op.execute("DROP INDEX IF EXISTS idx_chunks_embedding_ivfflat")
    op.execute("DROP INDEX IF EXISTS idx_chunks_content_trgm")
    op.execute("DROP INDEX IF EXISTS idx_chunks_content_fts")
    op.execute("DROP INDEX IF EXISTS idx_papers_title_fts")
    op.drop_index("idx_ingestion_jobs_paper", "ingestion_jobs")
    op.drop_table("ingestion_jobs")
    op.drop_table("citations")
    op.drop_table("chunks")
    op.drop_index("idx_sections_paper", "sections")
    op.drop_table("sections")
    op.drop_table("paper_authors")
    op.drop_table("authors")
    op.drop_table("papers")
