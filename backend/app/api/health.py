from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.databases import get_db

router = APIRouter()


def _check_redis() -> dict:
    try:
        from app.services.redis_queue import redis_connection

        info = redis_connection.info("clients")
        return {"status": "ok", "clients": info.get("connected_clients")}
    except Exception as exc:
        return {"status": "unavailable", "error": type(exc).__name__}


def _check_minio() -> dict:
    try:
        from app.core.config import get_settings

        s = get_settings()
        from minio import Minio

        client = Minio(
            f"{s.minio_host}:{s.minio_port}",
            access_key=s.minio_access_key,
            secret_key=s.minio_secret_key,
            secure=s.minio_secure,
        )
        buckets = [b.name for b in client.list_buckets()]
        return {"status": "ok", "buckets": buckets}
    except Exception as exc:
        return {"status": "unavailable", "error": type(exc).__name__}


def _check_workers() -> dict:
    try:
        from app.services.redis_queue import redis_connection
        from rq.registry import StartedJobRegistry, FailedJobRegistry
        from rq.worker import Worker as RQWorker

        conn = redis_connection
        workers = RQWorker.all(conn)
        started = StartedJobRegistry("paper_tasks", conn).count
        failed = FailedJobRegistry("paper_tasks", conn).count
        return {
            "status": "ok" if workers else "no_workers",
            "workers": len(workers),
            "jobs_running": started,
            "jobs_failed": failed,
        }
    except Exception as exc:
        return {"status": "unavailable", "error": type(exc).__name__}


def _check_embeddings() -> dict:
    try:
        from app.services.embeddings import get_embedding_service

        svc = get_embedding_service()
        return {
            "status": "ok" if svc.is_ready() else "loading",
            "model": svc.model_name,
            "dimension": svc.dim,
        }
    except Exception as exc:
        return {"status": "unavailable", "error": type(exc).__name__}


def _check_neo4j() -> dict:
    from app.core.config import get_settings

    if not get_settings().neo4j_uri:
        return {"status": "not_configured"}
    try:
        from app.services import graph_sync

        records = graph_sync.run_query("MATCH (p:Paper) RETURN count(p) AS n")
        return {"status": "ok", "paper_nodes": records[0]["n"] if records else 0}
    except Exception as exc:
        return {"status": "unavailable", "error": type(exc).__name__}


@router.get("/health")
def health(db: Session = Depends(get_db)):
    """Aggregate health across all infrastructure components."""
    db_ok = True
    paper_count = chunk_count = 0
    queue_depth = 0
    try:
        paper_count = db.execute(text("SELECT COUNT(*) FROM papers")).scalar() or 0
        chunk_count = db.execute(text("SELECT COUNT(*) FROM chunks")).scalar() or 0
        db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    try:
        from app.services.redis_queue import redis_connection

        queue_depth = redis_connection.llen("rq:queue:paper_tasks")
    except Exception:
        queue_depth = None

    components = {
        "postgres": {
            "status": "ok" if db_ok else "unavailable",
            "total_papers": paper_count,
            "total_vector_chunks": chunk_count,
        },
        "redis": _check_redis(),
        "minio": _check_minio(),
        "workers": _check_workers(),
        "embeddings": _check_embeddings(),
        "neo4j": _check_neo4j(),
    }

    critical = ["postgres", "redis"]
    all_ok = all(components[c]["status"] == "ok" for c in critical)
    status = "healthy" if all_ok else ("degraded" if db_ok else "unhealthy")

    return {
        "status": status,
        "database": "connected" if db_ok else "offline",
        "queue_depth": queue_depth,
        "components": components,
        # Back-compat fields used by the frontend sidebar
        "total_papers": paper_count,
        "total_vector_chunks": chunk_count,
    }
