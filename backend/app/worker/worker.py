import os

from redis import Redis
from rq import Worker, Queue
from minio import Minio


# ============================================================
# REDIS CONFIGURATION
# ============================================================

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))


redis_connection = Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
)


queue = Queue(
    "paper_tasks",
    connection=redis_connection,
)


# ============================================================
# MINIO CONFIGURATION
# ============================================================

MINIO_HOST = os.getenv("MINIO_HOST", "minio")
MINIO_PORT = int(os.getenv("MINIO_PORT", "9000"))

MINIO_ACCESS_KEY = os.getenv(
    "MINIO_ACCESS_KEY",
    "minioadmin",
)

MINIO_SECRET_KEY = os.getenv(
    "MINIO_SECRET_KEY",
    "minioadmin",
)


minio_client = Minio(
    f"{MINIO_HOST}:{MINIO_PORT}",
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False,
)


# ============================================================
# PAPER PROCESSING JOB
# ============================================================
def process_paper_job(
    paper_id: int,
    object_name: str,
):

    print(
        f"[WORKER] Processing paper {paper_id}"
    )

    bucket = "papers"

    local_path = f"/tmp/{paper_id}_{object_name}"

    print(
        f"[WORKER] Downloading "
        f"{bucket}/{object_name} from MinIO"
    )

    # --------------------------------------------------------
    # Download PDF from MinIO
    # --------------------------------------------------------

    minio_client.fget_object(
        bucket,
        object_name,
        local_path,
    )

    print(
        f"[WORKER] Downloaded object "
        f"to {local_path}"
    )

    # --------------------------------------------------------
    # Extract PDF text
    # --------------------------------------------------------

    from pypdf import PdfReader

    print(
        "[WORKER] Extracting text from PDF"
    )

    reader = PdfReader(local_path)

    page_count = len(reader.pages)

    text_parts = []

    for page_number, page in enumerate(
        reader.pages,
        start=1,
    ):

        text = page.extract_text() or ""

        text_parts.append(text)

        print(
            f"[WORKER] Page {page_number}: "
            f"{len(text)} characters"
        )

    content = "\n".join(text_parts)

    # --------------------------------------------------------
    # Extraction results
    # --------------------------------------------------------

    print(
        f"[WORKER] PDF pages: {page_count}"
    )

    print(
        f"[WORKER] Extracted characters: "
        f"{len(content)}"
    )

    print(
        "[WORKER] Text preview:"
    )

    print(
        content[:1000]
    )

    print(
        f"[WORKER] Finished paper {paper_id}"
    )

    return {
        "paper_id": paper_id,
        "status": "completed",
        "object": object_name,
        "pages": page_count,
        "characters": len(content),
    }
#======================================================
# WORKER STARTUP
# ============================================================

if __name__ == "__main__":

    print(
        f"[WORKER] Connecting to Redis "
        f"{REDIS_HOST}:{REDIS_PORT}"
    )

    print(
        f"[WORKER] Connecting to MinIO "
        f"{MINIO_HOST}:{MINIO_PORT}"
    )

    worker = Worker(
        [queue],
        connection=redis_connection,
    )

    print(
        "[WORKER] Waiting for jobs..."
    )

    worker.work()