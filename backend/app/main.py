from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.papers import router as papers_router
from app.api.search import router as search_router
from app.api.jobs import router as jobs_router
from app.api.ai import router as ai_router

app = FastAPI(
    title="Semantic Research Workspace API",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(papers_router)
app.include_router(search_router)
app.include_router(
    jobs_router,
    prefix="/api"
)
app.include_router(
    ai_router,
    prefix="/api"
)

@app.get("/")
def root():
    return {
        "project": "Semantic Research Workspace",
        "status": "running"
    }