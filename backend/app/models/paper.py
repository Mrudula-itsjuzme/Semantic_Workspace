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


# Existing PostgreSQL association table
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


class Paper(Base):

    __tablename__ = "papers"

    id = Column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    doi = Column(
        Text,
        unique=True,
        nullable=True,
    )

    title = Column(
        Text,
        nullable=False,
    )

    abstract = Column(
        Text,
        nullable=True,
    )

    publication_year = Column(
        Integer,
        nullable=True,
    )

    venue = Column(
        Text,
        nullable=True,
    )

    pdf_path = Column(
        Text,
        nullable=True,
    )

    created_at = Column(
        DateTime,
        server_default=func.current_timestamp(),
    )

    source_paper_id = Column(
        Text,
        nullable=True,
    )

    pdf_url = Column(
        Text,
        nullable=True,
    )

    is_cached = Column(
        Boolean,
        default=False,
    )

    openalex_id = Column(
        Text,
        nullable=True,
        unique=True,
    )

    authors = relationship(
        "Author",
        secondary=paper_authors,
        back_populates="papers",
    )