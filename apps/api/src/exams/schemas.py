"""Pydantic schemas for exam analysis pipeline."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

# ── OpenAI Structured Output Schemas ─────────────────────────────────────────

class ParsedQuestion(BaseModel):
    """Single question parsed from OCR text."""

    number: int
    type: str = Field(description="multiple_choice or subjective")
    question_text: str
    choices: list[str] | None = None
    correct_answer: str
    user_answer: str


class ParsedExamResult(BaseModel):
    """Full parse result from OpenAI question structuring call."""

    questions: list[ParsedQuestion]


class SubjectiveGradingItem(BaseModel):
    """Grading result for a single subjective question."""

    question_number: int
    is_correct: bool
    similarity_score: float = Field(ge=0.0, le=1.0)
    reasoning: str


class SubjectiveGradingResult(BaseModel):
    """Batch grading result for subjective questions."""

    results: list[SubjectiveGradingItem]


class WeaknessItem(BaseModel):
    """Weakness classification for a single wrong answer."""

    question_number: int
    category: str
    sub_category: str
    error_type: str


class WeaknessAnalysisResult(BaseModel):
    """Full weakness analysis output."""

    weakness_analysis: list[WeaknessItem]


class PracticeQuestion(BaseModel):
    """A single generated practice question."""

    question: str
    choices: list[str] | None = None
    answer: str


class PracticeSetItem(BaseModel):
    """Practice set for one weakness category."""

    category: str
    questions: list[PracticeQuestion]


class PracticeSetResult(BaseModel):
    """Full practice generation output."""

    practice_sets: list[PracticeSetItem]


class CategoryStat(BaseModel):
    """Accuracy breakdown by category."""

    category: str
    total: int
    correct: int
    accuracy: float


class RadarDataPoint(BaseModel):
    """Single axis for skill radar chart."""

    axis: str
    value: float = Field(ge=0.0, le=1.0)


class StatisticsResult(BaseModel):
    """Full statistics output from OpenAI."""

    category_accuracy: list[CategoryStat]
    most_frequent_mistake: str
    radar_data: list[RadarDataPoint]
    performance_summary: str


# ── API Request / Response Schemas ───────────────────────────────────────────

class ExamUploadResponse(BaseModel):
    """Returned immediately after upload; analysis runs async."""

    exam_id: UUID
    status: str


class GradingSummary(BaseModel):
    total_questions: int
    correct: int
    incorrect: int
    accuracy_rate: float


class QuestionResponse(BaseModel):
    number: int
    type: str
    question_text: str
    choices: list[str] | None = None
    correct_answer: str
    user_answer: str
    is_correct: bool | None
    similarity_score: float | None = None


class WeaknessResponse(BaseModel):
    question_number: int
    category: str
    sub_category: str
    error_type: str


class PracticeQuestionResponse(BaseModel):
    question: str
    choices: list[str] | None = None
    answer: str


class PracticeSetResponse(BaseModel):
    category: str
    questions: list[PracticeQuestionResponse]


class StatisticsResponse(BaseModel):
    category_accuracy: list[CategoryStat]
    most_frequent_mistake: str
    radar_data: list[RadarDataPoint]
    performance_summary: str


class ExamDetailResponse(BaseModel):
    """Complete exam analysis result."""

    exam_id: UUID
    title: str | None
    status: str
    created_at: datetime
    grading: GradingSummary | None = None
    questions: list[QuestionResponse] = []
    weakness_analysis: list[WeaknessResponse] = []
    statistics: StatisticsResponse | None = None
    practice_sets: list[PracticeSetResponse] = []
    error_message: str | None = None


class ExamListItem(BaseModel):
    """Summary for exam list endpoint."""

    exam_id: UUID
    title: str | None
    status: str
    accuracy_rate: float | None
    total_questions: int | None
    created_at: datetime
