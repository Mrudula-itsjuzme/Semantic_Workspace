from redis import Redis
from rq import Queue

from app.core.config import get_settings


settings = get_settings()

redis_connection = Redis(
    host=settings.redis_host,
    port=settings.redis_port,
)

# Long-lived pipeline jobs (PDF download, extraction, embedding) need far more
# than RQ's 180s default; 30 minutes covers the slowest cold-start run.
INGESTION_JOB_TIMEOUT = 1800


paper_queue = Queue(
    "paper_tasks",
    connection=redis_connection,
    default_timeout=INGESTION_JOB_TIMEOUT,
)
