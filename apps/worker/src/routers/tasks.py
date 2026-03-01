import structlog
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["Tasks"])


class TaskPayload(BaseModel):
    task_type: str
    data: dict[str, object]


@router.post("/process")
async def process_task(
    payload: TaskPayload,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    background_tasks.add_task(execute_task, payload)
    return {"status": "accepted"}


async def execute_task(payload: TaskPayload) -> None:
    match payload.task_type:
        case "exam_analysis":
            exam_id = payload.data.get("exam_id")
            if not exam_id:
                logger.error("exam_analysis_missing_id")
                return
            logger.info("exam_analysis_start", exam_id=exam_id)
            # In production, import and run the pipeline here:
            # from src.exams.service import ExamPipelineService
            # from src.lib.ai.openai import get_openai_provider
            # from src.lib.database import async_session_factory
            # async with async_session_factory() as session:
            #     ai = get_openai_provider()
            #     pipeline = ExamPipelineService(ai=ai, db=session)
            #     await pipeline.run_pipeline(UUID(exam_id))
            #     await session.commit()
        case "analysis":
            pass
        case "embedding":
            pass
        case _:
            logger.warning("unknown_task_type", task_type=payload.task_type)
