from fastapi import APIRouter

from app.services.redis_queue import paper_queue


router = APIRouter()


@router.post("/jobs/test/{paper_id}")
def create_test_job(
    paper_id: int,
    object_name: str = "test-paper.txt",
):

    job = paper_queue.enqueue(
        "app.worker.worker.process_paper_job",
        paper_id,
        object_name,
    )

    return {
        "message": "Job queued successfully",
        "job_id": job.id,
        "paper_id": paper_id,
        "object_name": object_name,
        "queue": "paper_tasks",
    }