from pydantic import BaseModel


class PaperResponse(BaseModel):
    id: int
    title: str | None = None
    publication_year: int | None = None
    venue: str | None = None

    class Config:
        from_attributes = True