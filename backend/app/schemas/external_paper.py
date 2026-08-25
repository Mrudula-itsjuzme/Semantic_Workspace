from pydantic import BaseModel, Field
from typing import Optional


class ExternalAuthor(BaseModel):
    name: str
    external_id: Optional[str] = None
    position: Optional[int] = None


class ExternalPaper(BaseModel):
    source: str
    source_id: str

    title: str
    doi: Optional[str] = None

    publication_year: Optional[int] = None
    abstract: Optional[str] = None
    pdf_url: Optional[str] = None

    authors: list[ExternalAuthor] = Field(default_factory=list)

    cited_by_count: Optional[int] = None
    cited_paper_ids: list[str] = Field(default_factory=list)