from sqlalchemy import Column, Integer, Text
from sqlalchemy.orm import relationship

from app.db.databases import Base
from app.models.paper import paper_authors


class Author(Base):

    __tablename__ = "authors"

    id = Column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    name = Column(
        Text,
        nullable=False,
    )

    papers = relationship(
        "Paper",
        secondary=paper_authors,
        back_populates="authors",
    )