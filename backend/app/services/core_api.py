import httpx

from app.schemas.external_paper import (
    ExternalPaper,
    ExternalAuthor,
)


OPENALEX_URL = "https://api.openalex.org/works"


def reconstruct_abstract(inverted_index):
    if not inverted_index:
        return None

    words = []

    for word, positions in inverted_index.items():
        for position in positions:
            words.append((position, word))

    words.sort(key=lambda x: x[0])

    return " ".join(word for _, word in words)


def normalize_openalex_work(work) -> ExternalPaper:

    authors = []

    for index, authorship in enumerate(
        work.get("authorships", []),
        start=1
    ):

        author = authorship.get("author")

        if not author:
            continue

        authors.append(
        ExternalAuthor(
            name=author.get("display_name"),
            external_id=author.get("id"),
            position=index,
            )
        )   

    pdf_url = None

    best_oa = work.get("best_oa_location")

    if best_oa:
        pdf_url = best_oa.get("pdf_url")

    return ExternalPaper(
        source="openalex",
        source_id=work.get("id"),

        title=work.get("display_name"),

        doi=work.get("doi"),

        publication_year=work.get(
            "publication_year"
        ),

        abstract=reconstruct_abstract(
            work.get("abstract_inverted_index")
        ),

        pdf_url=pdf_url,

        authors=authors,

        cited_by_count=work.get(
            "cited_by_count"
        ),

        cited_paper_ids=work.get(
            "referenced_works",
            []
        ),
    )


async def search_openalex(
    query: str,
    per_page: int = 10
):

    params = {
        "search": query,
        "per-page": per_page,
    }

    async with httpx.AsyncClient(
        timeout=30.0
    ) as client:

        response = await client.get(
            OPENALEX_URL,
            params=params,
        )

        response.raise_for_status()

        data = response.json()

    return [
        normalize_openalex_work(work)
        for work in data.get("results", [])
    ]