import os

from redis import Redis
from rq import Queue


REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))


redis_connection = Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
)


paper_queue = Queue(
    "paper_tasks",
    connection=redis_connection,
)