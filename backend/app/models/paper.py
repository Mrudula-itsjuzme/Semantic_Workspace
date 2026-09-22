from sqlalchemy import (
    Column,
    Integer,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    Table,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.databases import Base


# Association table
paper_authors = Table(
    "paper_authors",
    Base.metadata,

    Column(
        "paper_id",
        Integer,
        ForeignKey("papers.id", ondelete="CASCADE"),
        primary_key=True,
    ),

    Column(
        "author_id",
        Integer,
        ForeignKey("authors.id", ondelete="CASCADE"),
        primary_key=True,
    ),

    Column(
        "author_order",
        Integer,
        nullable=True,
    ),
)

INGESTION_STATUSES = ("pending", "running", "success", "failed")


class Paper(Base):

    __tablename__ = "papers"

    id = Column(Integer, primary_key=True, autoincrement=True)

    doi = Column(Text, unique=True, nullable=True)
    title = Column(Text, nullable=False)
    abstract = Column(Text, nullable=True)
    publication_year = Column(Integer, nullable=True)
    venue = Column(Text, nullable=True)
    pdf_path = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.current_timestamp())

    source_paper_id = Column(Text, nullable=True)
    pdf_url = Column(Text, nullable=True)
    is_cached = Column(Boolean, default=False)
    openalex_id = Column(Text, unique=True, nullable=True)

    # Ingestion lifecycle
    ingestion_status = Column(Text, nullable=False, default="pending")
    ingestion_error = Column(Text, nullable=True)
    ingestion_attempts = Column(Integer, nullable=False, default=0)
    ingestion_started_at = Column(DateTime, nullable=True)
    ingestion_finished_at = Column(DateTime, nullable=True)

    authors = relationship(
        "Author",
        secondary=paper_authors,
        back_populates="papers",
    )

    sections = relationship(
        "Section",
        cascade="all, delete-orphan",
        back_populates="paper",
    )

    chunks = relationship(
        "Chunk",
        cascade="all, delete-orphan",
        back_populates="paper",
    )
