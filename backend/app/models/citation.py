from sqlalchemy import Column, Integer, Text, ForeignKey

from app.db.databases import Base


class Citation(Base):

    __tablename__ = "citations"

    citing_paper_id = Column(
        Integer,
        ForeignKey("papers.id", ondelete="CASCADE"),
        primary_key=True,
    )

    cited_paper_id = Column(
        Integer,
        ForeignKey("papers.id", ondelete="CASCADE"),
        primary_key=True,
    )

    citation_context = Column(
        Text,
        nullable=True,
    )