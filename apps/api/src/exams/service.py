"""Exam analysis pipeline orchestrator.

Execution flow:
  upload → OCR → parse questions → grade → weakness analysis
         → statistics → practice generation → persist results

Each stage updates Exam.status so the frontend can poll progress.
The entire pipeline runs as a background task (worker or BackgroundTasks).
"""

import uuid
from collections import defaultdict

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.exams.models import (
    Exam,
    ExamQuestion,
    ExamStatus,
    PracticeSet,
    QuestionType,
    WeaknessAnalysis,
)
from src.exams.prompts import (
    PRACTICE_GENERATION_SYSTEM,
    QUESTION_PARSE_SYSTEM,
    STATISTICS_SYSTEM,
    SUBJECTIVE_GRADING_SYSTEM,
    WEAKNESS_ANALYSIS_SYSTEM,
    build_practice_generation_prompt,
    build_question_parse_prompt,
    build_statistics_prompt,
    build_subjective_grading_prompt,
    build_weakness_analysis_prompt,
)
from src.exams.schemas import (
    ParsedExamResult,
    PracticeSetResult,
    StatisticsResult,
    SubjectiveGradingResult,
    WeaknessAnalysisResult,
)
from src.lib.ai.openai import OpenAIProvider

logger = structlog.get_logger(__name__)


class ExamPipelineService:
    """Orchestrates the full exam analysis pipeline."""

    def __init__(self, ai: OpenAIProvider, db: AsyncSession) -> None:
        self._ai = ai
        self._db = db

    # ── Public entry point ───────────────────────────────────────────────

    async def run_pipeline(self, exam_id: uuid.UUID) -> None:
        """Execute the full pipeline for an exam. Called as a background task."""
        exam = await self._get_exam(exam_id)
        if not exam:
            logger.error("exam_not_found", exam_id=str(exam_id))
            return

        try:
            # Stage 1 — OCR (image → text)
            await self._update_status(exam, ExamStatus.OCR_PROCESSING)
            ocr_text = await self._run_ocr(exam)

            # Stage 2 — Parse questions
            await self._update_status(exam, ExamStatus.PARSING)
            parsed = await self._parse_questions(ocr_text)
            questions = await self._save_parsed_questions(exam, parsed)

            # Stage 3 — Grade
            await self._update_status(exam, ExamStatus.GRADING)
            await self._grade_questions(exam, questions)

            # Stage 4 — Weakness analysis (only wrong answers)
            await self._update_status(exam, ExamStatus.ANALYZING)
            wrong = [q for q in questions if not q.is_correct]
            weaknesses = await self._analyze_weaknesses(exam, wrong)

            # Stage 5 — Statistics
            stats = await self._generate_statistics(exam, questions, weaknesses)
            exam.statistics = stats.model_dump()

            # Stage 6 — Practice generation
            await self._update_status(exam, ExamStatus.GENERATING)
            await self._generate_practice(exam, wrong, weaknesses)

            # Done
            await self._update_status(exam, ExamStatus.COMPLETED)
            logger.info("pipeline_completed", exam_id=str(exam_id))

        except Exception:
            exam.status = ExamStatus.FAILED
            import traceback

            exam.error_message = traceback.format_exc()[-2000:]
            await self._db.commit()
            logger.exception("pipeline_failed", exam_id=str(exam_id))

    # ── Stage implementations ────────────────────────────────────────────

    async def _run_ocr(self, exam: Exam) -> str:
        """Extract text from uploaded file via GPT-4o vision."""
        if exam.raw_ocr_text:
            return exam.raw_ocr_text

        # Download file from storage (caller must ensure file_key is populated)
        from src.lib.config import settings

        # For images: use GPT-4o vision directly
        # For PDFs: convert pages to images first (handled at upload time)
        # The file bytes should be fetched from storage before calling pipeline,
        # stored in raw_ocr_text if already extracted, or passed in via context.
        # Here we use the AI provider's analyze_image for vision-based OCR.
        #
        # In production, integrate with a StorageProvider to download:
        #   file_bytes = await storage.download(bucket, exam.file_key)
        #
        # For now, we rely on raw_ocr_text being pre-populated by the upload
        # handler (which extracts text before queuing the pipeline).
        if exam.raw_ocr_text:
            return exam.raw_ocr_text

        raise ValueError(
            "raw_ocr_text is empty and file download is not configured. "
            "Ensure OCR text is extracted at upload time."
        )

    async def _parse_questions(self, ocr_text: str) -> ParsedExamResult:
        """OpenAI call #1: OCR text → structured questions."""
        prompt = build_question_parse_prompt(ocr_text)
        return await self._ai.generate_structured(
            prompt,
            ParsedExamResult,
            system=QUESTION_PARSE_SYSTEM,
        )

    async def _save_parsed_questions(
        self, exam: Exam, parsed: ParsedExamResult
    ) -> list[ExamQuestion]:
        """Persist parsed questions to DB, return the ORM objects."""
        questions: list[ExamQuestion] = []
        for pq in parsed.questions:
            q = ExamQuestion(
                exam_id=exam.id,
                number=pq.number,
                question_type=(
                    QuestionType.MULTIPLE_CHOICE
                    if pq.type == "multiple_choice"
                    else QuestionType.SUBJECTIVE
                ),
                question_text=pq.question_text,
                choices=pq.choices,
                correct_answer=pq.correct_answer,
                user_answer=pq.user_answer,
            )
            self._db.add(q)
            questions.append(q)
        await self._db.flush()
        return questions

    async def _grade_questions(
        self, exam: Exam, questions: list[ExamQuestion]
    ) -> None:
        """Grade all questions. Objective = exact match, subjective = AI."""
        subjective_batch: list[dict] = []

        for q in questions:
            if q.question_type == QuestionType.MULTIPLE_CHOICE:
                # Exact match (case-insensitive, strip whitespace)
                q.is_correct = (
                    q.user_answer.strip().upper() == q.correct_answer.strip().upper()
                )
                q.similarity_score = 1.0 if q.is_correct else 0.0
            else:
                subjective_batch.append(
                    {
                        "number": q.number,
                        "question_text": q.question_text,
                        "correct_answer": q.correct_answer,
                        "user_answer": q.user_answer,
                    }
                )

        # Batch-grade subjective questions in a single API call
        if subjective_batch:
            prompt = build_subjective_grading_prompt(subjective_batch)
            grading = await self._ai.generate_structured(
                prompt,
                SubjectiveGradingResult,
                system=SUBJECTIVE_GRADING_SYSTEM,
            )
            grading_map = {r.question_number: r for r in grading.results}
            for q in questions:
                if q.question_type == QuestionType.SUBJECTIVE:
                    result = grading_map.get(q.number)
                    if result:
                        q.is_correct = result.is_correct
                        q.similarity_score = result.similarity_score

        # Update exam-level stats
        correct = sum(1 for q in questions if q.is_correct)
        total = len(questions)
        exam.total_questions = total
        exam.correct_count = correct
        exam.incorrect_count = total - correct
        exam.accuracy_rate = correct / total if total > 0 else 0.0
        await self._db.flush()

    async def _analyze_weaknesses(
        self,
        exam: Exam,
        wrong_questions: list[ExamQuestion],
    ) -> list[WeaknessAnalysis]:
        """OpenAI call #2: classify each wrong answer."""
        if not wrong_questions:
            return []

        prompt = build_weakness_analysis_prompt(
            [
                {
                    "number": q.number,
                    "question_text": q.question_text,
                    "correct_answer": q.correct_answer,
                    "user_answer": q.user_answer,
                }
                for q in wrong_questions
            ]
        )
        analysis = await self._ai.generate_structured(
            prompt,
            WeaknessAnalysisResult,
            system=WEAKNESS_ANALYSIS_SYSTEM,
        )

        weakness_models: list[WeaknessAnalysis] = []
        for item in analysis.weakness_analysis:
            w = WeaknessAnalysis(
                exam_id=exam.id,
                question_number=item.question_number,
                category=item.category,
                sub_category=item.sub_category,
                error_type=item.error_type,
            )
            self._db.add(w)
            weakness_models.append(w)
        await self._db.flush()
        return weakness_models

    async def _generate_statistics(
        self,
        exam: Exam,
        questions: list[ExamQuestion],
        weaknesses: list[WeaknessAnalysis],
    ) -> StatisticsResult:
        """Generate statistics summary (runs alongside grading data)."""
        prompt = build_statistics_prompt(
            [
                {
                    "number": q.number,
                    "type": q.question_type.value,
                    "is_correct": q.is_correct,
                    "question_text": q.question_text,
                }
                for q in questions
            ],
            [
                {
                    "question_number": w.question_number,
                    "category": w.category,
                    "sub_category": w.sub_category,
                    "error_type": w.error_type,
                }
                for w in weaknesses
            ],
        )
        return await self._ai.generate_structured(
            prompt,
            StatisticsResult,
            system=STATISTICS_SYSTEM,
        )

    async def _generate_practice(
        self,
        exam: Exam,
        wrong_questions: list[ExamQuestion],
        weaknesses: list[WeaknessAnalysis],
    ) -> None:
        """OpenAI call #3: generate practice questions per weakness category."""
        if not weaknesses:
            return

        # Group wrong questions by weakness category
        category_map: dict[str, list[dict]] = defaultdict(list)
        weakness_by_qnum = {w.question_number: w for w in weaknesses}
        for q in wrong_questions:
            w = weakness_by_qnum.get(q.number)
            if w:
                category_map[w.category].append(
                    {
                        "question_text": q.question_text,
                        "correct_answer": q.correct_answer,
                        "user_answer": q.user_answer,
                    }
                )

        weakness_groups = [
            {"category": cat, "examples": examples}
            for cat, examples in category_map.items()
        ]

        prompt = build_practice_generation_prompt(weakness_groups)
        result = await self._ai.generate_structured(
            prompt,
            PracticeSetResult,
            system=PRACTICE_GENERATION_SYSTEM,
        )

        for ps in result.practice_sets:
            practice = PracticeSet(
                exam_id=exam.id,
                category=ps.category,
                questions=[q.model_dump() for q in ps.questions],
            )
            self._db.add(practice)
        await self._db.flush()

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _get_exam(self, exam_id: uuid.UUID) -> Exam | None:
        result = await self._db.execute(
            select(Exam)
            .where(Exam.id == exam_id)
            .options(
                selectinload(Exam.questions),
                selectinload(Exam.weaknesses),
                selectinload(Exam.practice_sets),
            )
        )
        return result.scalar_one_or_none()

    async def _update_status(self, exam: Exam, status: ExamStatus) -> None:
        exam.status = status
        exam.error_message = None
        await self._db.flush()
        logger.info("pipeline_stage", exam_id=str(exam.id), status=status.value)
