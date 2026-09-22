import logging

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_cors_origins
from app.api import health, papers, search, jobs, ai, graph, graphrag, dbms, metrics, ingestion

app = FastAPI(
    title="Semantic Research Workspace API",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    from app.db.bootstrap import bootstrap_database

    bootstrap_database()


app.include_router(health.router)
app.include_router(papers.router)
app.include_router(search.router)
app.include_router(graph.router)
app.include_router(metrics.router)
app.include_router(jobs.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(graphrag.router, prefix="/api")
app.include_router(dbms.router, prefix="/api")
app.include_router(ingestion.router, prefix="/api")
app.add_middleware(metrics.MetricsMiddleware)


@app.get("/")
def root():
    return {
        "project": "Semantic Research Workspace",
        "status": "running",
    }
