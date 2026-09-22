"""Lightweight application metrics.

Collects request counts, latency and error rates in-process (no extra infra),
plus worker/queue/DB gauges read live from Redis and Postgres. Exposed in
Prometheus text exposition format for scraping.
"""
from __future__ import annotations

import time
from collections import defaultdict

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.databases import get_db

router = APIRouter(prefix="/metrics")

_METRICS: dict[str, float] = defaultdict(float)
_HISTOGRAM: dict[str, list[float]] = defaultdict(list)
_START = time.time()


def record_request(path: str, method: str, status_code: int, duration_s: float) -> None:
    label = f'{method} {path} {{code="{status_code}"}}'
    _METRICS[f'http_requests_total{{path="{path}",method="{method}",code="{status_code}"}}'] += 1
    _HISTOGRAM[label].append(duration_s)
    if status_code >= 500:
        _METRICS[f'http_errors_total{{path="{path}",method="{method}"}}'] += 1


class MetricsMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        status_holder = {"code": 500}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_holder["code"] = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration = time.perf_counter() - start
            path = scope.get("path", "unknown")
            if not path.startswith("/metrics"):
                record_request(path, scope.get("method", "?"), status_holder["code"], duration)


@router.get("")
def prometheus_metrics(db: Session = Depends(get_db)):
    lines: list[str] = []
    uptime = time.time() - _START

    lines.append("# HELP app_uptime_seconds Process uptime")
    lines.append("# TYPE app_uptime_seconds gauge")
    lines.append(f"app_uptime_seconds {uptime:.0f}")

    lines.append("# HELP http_requests_total HTTP requests")
    lines.append("# TYPE http_requests_total counter")
    for metric, value in sorted(_METRICS.items()):
        lines.append(f"{metric} {int(value)}")

    lines.append("# HELP http_request_duration_seconds Request latency summary")
    lines.append("# TYPE http_request_duration_seconds summary")
    for label, values in _HISTOGRAM.items():
        if values:
            path_method = label.rsplit("{", 1)[0]
            vals = sorted(values)
            p50 = vals[len(vals) // 2]
            p95 = vals[int(len(vals) * 0.95) - 1 if len(vals) > 1 else 0]
            lines.append(f'{path_method}{{quantile="0.5"}} {p50:.4f}')
            lines.append(f'{path_method}{{quantile="0.95"}} {p95:.4f}')
            lines.append(f'{path_method}_sum {sum(vals):.4f}')
            lines.append(f'{path_method}_count {len(vals)}')

    # Worker / queue gauges
    try:
        from app.services.redis_queue import redis_connection

        depth = redis_connection.llen("rq:queue:paper_tasks")
        lines.append("# HELP queue_depth Pending jobs in paper_tasks queue")
        lines.append("# TYPE queue_depth gauge")
        lines.append(f"queue_depth {depth}")
        from rq.worker import Worker as RQWorker

        lines.append(f"workers_active {len(RQWorker.all(redis_connection))}")
    except Exception:
        pass

    # DB gauges
    try:
        papers = db.execute(text("SELECT COUNT(*) FROM papers")).scalar() or 0
        chunks = db.execute(text("SELECT COUNT(*) FROM chunks")).scalar() or 0
        failed = db.execute(
            text("SELECT COUNT(*) FROM papers WHERE ingestion_status='failed'")
        ).scalar() or 0
        lines.append(f"db_papers_total {papers}")
        lines.append(f"db_chunks_total {chunks}")
        lines.append(f"db_papers_failed_ingestion {failed}")
    except Exception:
        pass

    return Response(content="\n".join(lines) + "\n", media_type="text/plain")
