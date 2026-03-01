"""Exam analysis API endpoints."""

import uuid

import structlog
from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.exams.models import Exam, ExamStatus
from src.exams.schemas import (
    ExamDetailResponse,
    ExamListItem,
    ExamUploadResponse,
    GradingSummary,
    PracticeQuestionResponse,
    PracticeSetResponse,
    QuestionResponse,
    StatisticsResponse,
    WeaknessResponse,
)
from src.exams.service import ExamPipelineService
from src.lib.ai.openai import OpenAIProvider, get_openai_provider
from src.lib.dependencies import CurrentUser, DBSession

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["exams"])

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


# ── Upload & Trigger Pipeline ────────────────────────────────────────────────


@router.post("/", status_code=status.HTTP_202_ACCEPTED)
async def upload_exam(
    file: UploadFile,
    db: DBSession,
    user: CurrentUser,
    background_tasks: BackgroundTasks,
    title: str | None = None,
) -> ExamUploadResponse:
    """Upload an exam sheet and start async analysis pipeline."""
    # Validate file type
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {file.content_type}. "
            f"Allowed: {', '.join(ALLOWED_CONTENT_TYPES)}",
        )

    # Read and validate size
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024 * 1024)} MB",
        )

    # Generate storage key
    exam_id = uuid.uuid4()
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "bin"
    file_key = f"exams/{user.sub}/{exam_id}.{ext}"

    # TODO: Upload to storage provider in production
    # await storage.upload(bucket, file_key, file_bytes, file.content_type)

    # Run OCR synchronously during upload (GPT-4o vision) so the pipeline
    # has raw_ocr_text ready when it starts. For large PDFs, this could be
    # offloaded to the worker queue instead.
    ai = get_openai_provider()
    ocr_text = ""
    if file.content_type in {"image/jpeg", "image/png", "image/webp"}:
        ocr_text = await ai.analyze_image(file_bytes)
    elif file.content_type == "application/pdf":
        # Convert PDF pages to images for vision OCR
        ocr_text = await _extract_pdf_text(file_bytes, ai)

    # Create exam record
    exam = Exam(
        id=exam_id,
        user_id=uuid.UUID(user.sub),
        title=title,
        file_key=file_key,
        file_type=file.content_type or "application/octet-stream",
        raw_ocr_text=ocr_text,
        status=ExamStatus.UPLOADED,
    )
    db.add(exam)
    await db.flush()

    # Queue background pipeline
    background_tasks.add_task(_run_pipeline_background, exam_id)

    logger.info("exam_uploaded", exam_id=str(exam_id), file_type=file.content_type)
    return ExamUploadResponse(exam_id=exam_id, status=ExamStatus.UPLOADED.value)


async def _extract_pdf_text(pdf_bytes: bytes, ai: OpenAIProvider) -> str:
    """Convert PDF pages to images and run OCR on each."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PDF processing library (PyMuPDF) not installed.",
        )

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_images: list[bytes] = []
    for page in doc:
        pix = page.get_pixmap(dpi=200)
        page_images.append(pix.tobytes("png"))
    doc.close()

    if not page_images:
        return ""

    # Send all page images in a single vision call (up to ~20 pages)
    # For very large docs, batch in groups of 5
    all_text_parts: list[str] = []
    batch_size = 5
    for i in range(0, len(page_images), batch_size):
        batch = page_images[i : i + batch_size]
        text = await ai.analyze_image(batch)
        all_text_parts.append(text)

    return "\n\n---PAGE BREAK---\n\n".join(all_text_parts)


async def _run_pipeline_background(exam_id: uuid.UUID) -> None:
    """Background task wrapper that creates its own DB session."""
    from src.lib.ai.openai import get_openai_provider
    from src.lib.database import async_session_factory

    async with async_session_factory() as session:
        try:
            ai = get_openai_provider()
            pipeline = ExamPipelineService(ai=ai, db=session)
            await pipeline.run_pipeline(exam_id)
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("background_pipeline_failed", exam_id=str(exam_id))


# ── Get Exam Result ──────────────────────────────────────────────────────────


@router.get("/{exam_id}")
async def get_exam(
    exam_id: uuid.UUID,
    db: DBSession,
    user: CurrentUser,
) -> ExamDetailResponse:
    """Get full exam analysis result. Frontend polls this until status=completed."""
    result = await db.execute(
        select(Exam)
        .where(Exam.id == exam_id, Exam.user_id == uuid.UUID(user.sub))
        .options(
            selectinload(Exam.questions),
            selectinload(Exam.weaknesses),
            selectinload(Exam.practice_sets),
        )
    )
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Build response
    grading = None
    if exam.total_questions is not None:
        grading = GradingSummary(
            total_questions=exam.total_questions,
            correct=exam.correct_count or 0,
            incorrect=exam.incorrect_count or 0,
            accuracy_rate=exam.accuracy_rate or 0.0,
        )

    questions = [
        QuestionResponse(
            number=q.number,
            type=q.question_type.value,
            question_text=q.question_text,
            choices=q.choices,
            correct_answer=q.correct_answer,
            user_answer=q.user_answer,
            is_correct=q.is_correct,
            similarity_score=q.similarity_score,
        )
        for q in exam.questions
    ]

    weakness_analysis = [
        WeaknessResponse(
            question_number=w.question_number,
            category=w.category,
            sub_category=w.sub_category,
            error_type=w.error_type,
        )
        for w in exam.weaknesses
    ]

    statistics = None
    if exam.statistics:
        statistics = StatisticsResponse(**exam.statistics)

    practice_sets = [
        PracticeSetResponse(
            category=ps.category,
            questions=[PracticeQuestionResponse(**q) for q in ps.questions],
        )
        for ps in exam.practice_sets
    ]

    return ExamDetailResponse(
        exam_id=exam.id,
        title=exam.title,
        status=exam.status.value,
        created_at=exam.created_at,
        grading=grading,
        questions=questions,
        weakness_analysis=weakness_analysis,
        statistics=statistics,
        practice_sets=practice_sets,
        error_message=exam.error_message if exam.status == ExamStatus.FAILED else None,
    )


# ── List User Exams ──────────────────────────────────────────────────────────


@router.get("/")
async def list_exams(
    db: DBSession,
    user: CurrentUser,
    page: int = 1,
    limit: int = 20,
) -> dict:
    """List all exams for the current user."""
    offset = (page - 1) * limit

    # Count total
    from sqlalchemy import func

    count_result = await db.execute(
        select(func.count(Exam.id)).where(Exam.user_id == uuid.UUID(user.sub))
    )
    total = count_result.scalar() or 0

    # Fetch page
    result = await db.execute(
        select(Exam)
        .where(Exam.user_id == uuid.UUID(user.sub))
        .order_by(Exam.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    exams = result.scalars().all()

    items = [
        ExamListItem(
            exam_id=e.id,
            title=e.title,
            status=e.status.value,
            accuracy_rate=e.accuracy_rate,
            total_questions=e.total_questions,
            created_at=e.created_at,
        )
        for e in exams
    ]

    total_pages = (total + limit - 1) // limit if total > 0 else 0
    return {
        "data": [item.model_dump() for item in items],
        "meta": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": total_pages,
        },
    }


# ── Retry Failed Exam ───────────────────────────────────────────────────────


@router.post("/{exam_id}/retry", status_code=status.HTTP_202_ACCEPTED)
async def retry_exam(
    exam_id: uuid.UUID,
    db: DBSession,
    user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> ExamUploadResponse:
    """Retry a failed exam analysis."""
    result = await db.execute(
        select(Exam).where(
            Exam.id == exam_id,
            Exam.user_id == uuid.UUID(user.sub),
            Exam.status == ExamStatus.FAILED,
        )
    )
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(
            status_code=404,
            detail="Exam not found or not in failed state",
        )

    exam.status = ExamStatus.UPLOADED
    exam.error_message = None
    await db.flush()

    background_tasks.add_task(_run_pipeline_background, exam_id)

    return ExamUploadResponse(exam_id=exam.id, status=ExamStatus.UPLOADED.value)
