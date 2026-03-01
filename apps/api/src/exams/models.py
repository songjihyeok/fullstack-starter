"""Database models for exam analysis."""

import enum
import uuid as uuid_lib
from datetime import datetime
from typing import Any

from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.lib.database import Base


class ExamStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    OCR_PROCESSING = "ocr_processing"
    PARSING = "parsing"
    GRADING = "grading"
    ANALYZING = "analyzing"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class QuestionType(str, enum.Enum):
    MULTIPLE_CHOICE = "multiple_choice"
    SUBJECTIVE = "subjective"


class Exam(Base):
    """Root entity for a single exam submission."""

    __tablename__ = "exams"

    id: Mapped[uuid_lib.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid_lib.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid_lib.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[ExamStatus] = mapped_column(
        Enum(
            ExamStatus,
            name="exam_status",
            values_callable=lambda e: [x.value for x in e],
        ),
        default=ExamStatus.UPLOADED,
        server_default="uploaded",
    )
    file_key: Mapped[str] = mapped_column(
        String(500), comment="Cloud storage object key"
    )
    file_type: Mapped[str] = mapped_column(
        String(50), comment="image/jpeg, image/png, application/pdf"
    )
    raw_ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_questions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    correct_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    incorrect_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    accuracy_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    statistics: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True, comment="Category stats, radar data, summary"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    # Relationships
    questions: Mapped[list["ExamQuestion"]] = relationship(
        back_populates="exam",
        cascade="all, delete-orphan",
        order_by="ExamQuestion.number",
    )
    weaknesses: Mapped[list["WeaknessAnalysis"]] = relationship(
        back_populates="exam", cascade="all, delete-orphan"
    )
    practice_sets: Mapped[list["PracticeSet"]] = relationship(
        back_populates="exam", cascade="all, delete-orphan"
    )


class ExamQuestion(Base):
    """Individual question extracted from an exam."""

    __tablename__ = "exam_questions"

    id: Mapped[uuid_lib.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid_lib.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    exam_id: Mapped[uuid_lib.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exams.id", ondelete="CASCADE"),
        index=True,
    )
    number: Mapped[int] = mapped_column(Integer)
    question_type: Mapped[QuestionType] = mapped_column(
        Enum(
            QuestionType,
            name="question_type",
            values_callable=lambda e: [x.value for x in e],
        ),
    )
    question_text: Mapped[str] = mapped_column(Text)
    choices: Mapped[list[Any] | None] = mapped_column(
        JSONB, nullable=True, comment='["A) ...", "B) ...", ...]'
    )
    correct_answer: Mapped[str] = mapped_column(Text)
    user_answer: Mapped[str] = mapped_column(Text)
    is_correct: Mapped[bool | None] = mapped_column(nullable=True)
    similarity_score: Mapped[float | None] = mapped_column(
        Float, nullable=True, comment="Semantic similarity for subjective (0.0-1.0)"
    )

    # Relationships
    exam: Mapped["Exam"] = relationship(back_populates="questions")


class WeaknessAnalysis(Base):
    """Weakness categorization for a wrong answer."""

    __tablename__ = "weakness_analyses"

    id: Mapped[uuid_lib.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid_lib.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    exam_id: Mapped[uuid_lib.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exams.id", ondelete="CASCADE"),
        index=True,
    )
    question_number: Mapped[int] = mapped_column(Integer)
    category: Mapped[str] = mapped_column(String(255))
    sub_category: Mapped[str] = mapped_column(String(255))
    error_type: Mapped[str] = mapped_column(String(255))

    # Relationships
    exam: Mapped["Exam"] = relationship(back_populates="weaknesses")


class PracticeSet(Base):
    """Generated practice questions for a weakness category."""

    __tablename__ = "practice_sets"

    id: Mapped[uuid_lib.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid_lib.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    exam_id: Mapped[uuid_lib.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exams.id", ondelete="CASCADE"),
        index=True,
    )
    category: Mapped[str] = mapped_column(String(255))
    questions: Mapped[list[Any]] = mapped_column(
        JSONB, comment='[{"question": "...", "choices": [...], "answer": "..."}]'
    )

    # Relationships
    exam: Mapped["Exam"] = relationship(back_populates="practice_sets")
