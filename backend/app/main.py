from fastapi import FastAPI

from app.api.health import router as health_router
from app.api.papers import router as papers_router
from app.api.search import router as search_router
from app.api.jobs import router as jobs_router

app = FastAPI(
    title="Semantic Research Workspace API",
    version="0.1.0"
)

app.include_router(health_router)
app.include_router(papers_router)
app.include_router(search_router)
app.include_router(
    jobs_router,
    prefix="/api"
)

@app.get("/")
def root():
    return {
        "project": "Semantic Research Workspace",
        "status": "running"
    }