from sqlalchemy import Column, Integer, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.databases import Base
from app.models.paper import paper_authors


class Author(Base):

    __tablename__ = "authors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False, unique=True)

    papers = relationship(
        "Paper",
        secondary=paper_authors,
        back_populates="authors",
    )


class Section(Base):

    __tablename__ = "sections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    section_name = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    section_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.current_timestamp())

    paper = relationship("Paper", back_populates="sections")
    chunks = relationship("Chunk", back_populates="section")


class Chunk(Base):

    __tablename__ = "chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    section_id = Column(Integer, ForeignKey("sections.id", ondelete="CASCADE"), nullable=True)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Text)  # pgvector stored as string '<...>' — see vector helpers
    created_at = Column(DateTime, server_default=func.current_timestamp())

    paper = relationship("Paper", back_populates="chunks")
    section = relationship("Section", back_populates="chunks")
