import httpx

from app.core.config import get_settings
from app.schemas.external_paper import ExternalPaper, ExternalAuthor


OPENALEX_URL = "https://api.openalex.org/works"


# =========================================================
# RECONSTRUCT ABSTRACT
# =========================================================

def reconstruct_abstract(inverted_index):
    if not inverted_index:
        return None

    words = []

    for word, positions in inverted_index.items():
        for position in positions:
            words.append((position, word))

    words.sort(key=lambda x: x[0])

    return " ".join(
        word for _, word in words
    )


# =========================================================
# NORMALIZE OPENALEX WORK
# =========================================================

def normalize_openalex_work(work) -> ExternalPaper:

    authors = []

    for index, authorship in enumerate(
        work.get("authorships", []),
        start=1
    ):
        author = authorship.get("author")

        if not author:
            continue

        name = author.get("display_name")

        if not name:
            continue

        authors.append(
            ExternalAuthor(
                name=name,
                external_id=author.get("id"),
                position=index,
            )
        )

    # ---------------------------------------------------------
    # PDF URL
    # ---------------------------------------------------------

    pdf_url = None

    best_oa_location = work.get(
        "best_oa_location"
    )

    if best_oa_location:
        pdf_url = best_oa_location.get(
            "pdf_url"
        )

    # ---------------------------------------------------------
    # NORMALIZED PAPER
    # ---------------------------------------------------------

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


# =========================================================
# SEARCH OPENALEX
# =========================================================

async def search_openalex(
    query: str,
    per_page: int = 10
):

    params = {
        "search": query,
        "per-page": per_page,
    }
    api_key = get_settings().openalex_api_key
    if api_key:
        params["api_key"] = api_key

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
        for work in data.get(
            "results",
            []
        )
    ]


# =========================================================
# GET ONE OPENALEX PAPER
# =========================================================

async def get_openalex_work(
    openalex_id: str,
):
    """
    Fetch one specific OpenAlex work.

    Accepts either:

        https://openalex.org/W123456789

    or:

        W123456789
    """

    # ---------------------------------------------------------
    # Extract OpenAlex work ID
    # ---------------------------------------------------------

    work_id = (
        openalex_id
        .rstrip("/")
        .split("/")[-1]
    )

    url = f"{OPENALEX_URL}/{work_id}"

    params = {}
    api_key = get_settings().openalex_api_key
    if api_key:
        params["api_key"] = api_key

    # ---------------------------------------------------------
    # Request
    # ---------------------------------------------------------

    async with httpx.AsyncClient(
        timeout=30.0
    ) as client:

        response = await client.get(
            url,
            params=params,
        )

        response.raise_for_status()

        work = response.json()

    # ---------------------------------------------------------
    # Normalize immediately
    # ---------------------------------------------------------

    return normalize_openalex_work(work)