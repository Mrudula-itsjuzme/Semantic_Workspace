from sqlalchemy.orm import Session

from app.models.paper import Paper, paper_authors
from app.models.author import Author
from app.models.citation import Citation
from app.schemas.external_paper import ExternalPaper
from app.services.openalex_api import get_openalex_work


# Maximum number of missing citations we automatically resolve
# during one paper import.
MAX_CITATIONS_TO_RESOLVE = 10


# =========================================================
# INGEST PAPER
# =========================================================

async def ingest_paper(
    db: Session,
    paper_data: ExternalPaper,
    process_citations: bool = True,
):
    """
    Import a normalized ExternalPaper into PostgreSQL.

    Handles:
    - paper deduplication
    - paper insertion
    - author insertion
    - paper-author relationships
    - citation relationships
    """

    # =====================================================
    # 1. FIND EXISTING PAPER
    # =====================================================

    existing = None

    # OpenAlex identity
    if paper_data.source == "openalex":

        existing = (
            db.query(Paper)
            .filter(
                Paper.openalex_id == paper_data.source_id
            )
            .first()
        )

    # CORE identity
    elif paper_data.source == "core":

        existing = (
            db.query(Paper)
            .filter(
                Paper.source_paper_id == paper_data.source_id
            )
            .first()
        )

    # DOI fallback
    if not existing and paper_data.doi:

        existing = (
            db.query(Paper)
            .filter(
                Paper.doi == paper_data.doi
            )
            .first()
        )

    # =====================================================
    # 2. CREATE PAPER IF IT DOESN'T EXIST
    # =====================================================

    if existing:

        paper = existing

    else:

        paper = Paper(
            doi=paper_data.doi,
            title=paper_data.title,
            abstract=paper_data.abstract,
            publication_year=paper_data.publication_year,
            pdf_url=paper_data.pdf_url,

            # OpenAlex ID
            openalex_id=(
                paper_data.source_id
                if paper_data.source == "openalex"
                else None
            ),

            # CORE ID
            source_paper_id=(
                paper_data.source_id
                if paper_data.source == "core"
                else None
            ),
        )

        db.add(paper)

        # Generate PostgreSQL ID
        db.flush()

    # =====================================================
    # 3. ADD AUTHORS
    # =====================================================

    for author_data in paper_data.authors:

        if not author_data.name:
            continue

        author_name = author_data.name.strip()

        if not author_name:
            continue

        # Find existing author
        author = (
            db.query(Author)
            .filter(
                Author.name == author_name
            )
            .first()
        )

        # Create author
        if not author:

            author = Author(
                name=author_name
            )

            db.add(author)
            db.flush()

        # Check paper-author relationship
        relationship_exists = (
            db.query(paper_authors)
            .filter(
                paper_authors.c.paper_id == paper.id,
                paper_authors.c.author_id == author.id,
            )
            .first()
        )

        # Create relationship
        if not relationship_exists:

            db.execute(
                paper_authors.insert().values(
                    paper_id=paper.id,
                    author_id=author.id,
                    author_order=author_data.position,
                )
            )

    # =====================================================
    # 4. PROCESS CITATIONS
    # =====================================================

    if process_citations:

        await ingest_citations(
            db=db,
            paper=paper,
            cited_paper_ids=paper_data.cited_paper_ids,
        )

    # =====================================================
    # 5. COMMIT
    # =====================================================

    db.commit()
    db.refresh(paper)

    # IMPORTANT:
    # Return the SQLAlchemy Paper object.
    #
    # api/search.py uses:
    #
    # stored_paper.id
    # stored_paper.title

    return paper


# =========================================================
# INGEST CITATIONS
# =========================================================

async def ingest_citations(
    db: Session,
    paper: Paper,
    cited_paper_ids: list[str],
):
    """
    Resolve cited papers and create citation edges.

    If a cited paper already exists locally:
        create citation directly.

    If it doesn't exist:
        fetch it from OpenAlex,
        ingest it,
        then create the citation.

    Newly fetched papers are NOT recursively processed.
    This prevents an uncontrolled citation explosion.
    """

    added = 0
    fetched = 0
    skipped = 0

    # -----------------------------------------------------
    # Limit automatic expansion
    # -----------------------------------------------------

    citations_to_process = cited_paper_ids[
        :MAX_CITATIONS_TO_RESOLVE
    ]

    for external_id in citations_to_process:

        # =================================================
        # 1. CHECK LOCAL DATABASE
        # =================================================

        cited_paper = (
            db.query(Paper)
            .filter(
                Paper.openalex_id == external_id
            )
            .first()
        )

        # =================================================
        # 2. FETCH MISSING PAPER
        # =================================================

        if not cited_paper:

            try:

                print(
                    f"Fetching cited paper: {external_id}"
                )

                external_paper = await get_openalex_work(
                    external_id
                )

                # IMPORTANT:
                # process_citations=False
                #
                # Otherwise:
                #
                # A → B → C → D → ...
                #
                # could recursively download the entire
                # citation graph.

                cited_paper = await ingest_paper(
                    db=db,
                    paper_data=external_paper,
                    process_citations=False,
                )

                fetched += 1

            except Exception as e:

                print(
                    "Citation fetch error:",
                    external_id,
                    repr(e),
                )

                skipped += 1
                continue

        # =================================================
        # 3. PREVENT SELF-CITATION
        # =================================================

        if cited_paper.id == paper.id:

            skipped += 1
            continue

        # =================================================
        # 4. CHECK DUPLICATE CITATION
        # =================================================

        existing_citation = (
            db.query(Citation)
            .filter(
                Citation.citing_paper_id == paper.id,
                Citation.cited_paper_id == cited_paper.id,
            )
            .first()
        )

        if existing_citation:

            skipped += 1
            continue

        # =================================================
        # 5. CREATE CITATION EDGE
        # =================================================

        citation = Citation(
            citing_paper_id=paper.id,
            cited_paper_id=cited_paper.id,
        )

        db.add(citation)

        added += 1

    return {
        "added": added,
        "fetched": fetched,
        "skipped": skipped,
    }