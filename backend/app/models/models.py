"""SQLAlchemy ORM models for the AI Interview Coach application."""
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    String, Text, Integer, Float, Boolean, DateTime, ForeignKey, JSON, Enum as SAEnum
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


# ─── Enums ────────────────────────────────────────────────────────────────────

class InterviewMode(str, enum.Enum):
    GENERAL = "general"
    RESUME_BASED = "resume_based"
    JD_BASED = "jd_based"
    RESUME_JD = "resume_jd"
    HR = "hr"
    TECHNICAL = "technical"


class ExperienceLevel(str, enum.Enum):
    FRESHER = "fresher"
    JUNIOR = "junior"          # 1-3 years
    MID = "mid"                # 3-5 years
    SENIOR = "senior"


class Difficulty(str, enum.Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class InterviewDuration(int, enum.Enum):
    TEN = 10
    TWENTY = 20
    THIRTY = 30


class InterviewStatus(str, enum.Enum):
    SETUP = "setup"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


class AnswerMode(str, enum.Enum):
    VOICE = "voice"
    TEXT = "text"


class VoiceGender(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"


# ─── Models ───────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    resumes: Mapped[list["Resume"]] = relationship("Resume", back_populates="user", cascade="all, delete-orphan")
    job_descriptions: Mapped[list["JobDescription"]] = relationship("JobDescription", back_populates="user", cascade="all, delete-orphan")
    interviews: Mapped[list["Interview"]] = relationship("Interview", back_populates="user", cascade="all, delete-orphan")


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_text: Mapped[Optional[str]] = mapped_column(Text)
    # Structured extracted data: {skills, projects, experience, education, certifications}
    parsed_data: Mapped[Optional[dict]] = mapped_column(JSON)
    # FAISS index IDs for this resume's chunks
    vector_ids: Mapped[Optional[list]] = mapped_column(JSON)
    vector_store_path: Mapped[Optional[str]] = mapped_column(String(1000))
    is_processed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="resumes")
    interviews: Mapped[list["Interview"]] = relationship("Interview", back_populates="resume")


class JobDescription(Base):
    __tablename__ = "job_descriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    # Structured: {title, required_skills, preferred_skills, responsibilities, technologies, experience}
    parsed_data: Mapped[Optional[dict]] = mapped_column(JSON)
    vector_ids: Mapped[Optional[list]] = mapped_column(JSON)
    vector_store_path: Mapped[Optional[str]] = mapped_column(String(1000))
    is_processed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="job_descriptions")
    interviews: Mapped[list["Interview"]] = relationship("Interview", back_populates="job_description")


class Interview(Base):
    __tablename__ = "interviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    resume_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("resumes.id", ondelete="SET NULL"))
    job_description_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("job_descriptions.id", ondelete="SET NULL"))

    # Configuration
    mode: Mapped[str] = mapped_column(SAEnum(InterviewMode), nullable=False)
    experience_level: Mapped[str] = mapped_column(SAEnum(ExperienceLevel), nullable=False)
    difficulty: Mapped[str] = mapped_column(SAEnum(Difficulty), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    target_role: Mapped[str] = mapped_column(String(255), nullable=False)
    language: Mapped[str] = mapped_column(String(50), default="english")
    voice_gender: Mapped[str] = mapped_column(SAEnum(VoiceGender), default=VoiceGender.FEMALE)
    enable_followup: Mapped[bool] = mapped_column(Boolean, default=True)
    feedback_mode: Mapped[str] = mapped_column(String(50), default="final")  # "each" or "final"

    # State
    status: Mapped[str] = mapped_column(SAEnum(InterviewStatus), default=InterviewStatus.SETUP)
    current_question_index: Mapped[int] = mapped_column(Integer, default=0)
    # Serialized LangGraph state
    workflow_state: Mapped[Optional[dict]] = mapped_column(JSON)

    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="interviews")
    resume: Mapped[Optional["Resume"]] = relationship("Resume", back_populates="interviews")
    job_description: Mapped[Optional["JobDescription"]] = relationship("JobDescription", back_populates="interviews")
    questions: Mapped[list["Question"]] = relationship("Question", back_populates="interview", cascade="all, delete-orphan", order_by="Question.sequence_number")
    report: Mapped[Optional["InterviewReport"]] = relationship("InterviewReport", back_populates="interview", uselist=False)


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    interview_id: Mapped[str] = mapped_column(String(36), ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False)
    parent_question_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("questions.id", ondelete="SET NULL"))

    text: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(100))           # technical, behavioral, situational, etc.
    topic: Mapped[Optional[str]] = mapped_column(String(200))    # specific topic (e.g. "React Hooks")
    difficulty_level: Mapped[str] = mapped_column(SAEnum(Difficulty))
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    is_followup: Mapped[bool] = mapped_column(Boolean, default=False)
    audio_url: Mapped[Optional[str]] = mapped_column(String(1000))  # TTS audio file path
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    interview: Mapped["Interview"] = relationship("Interview", back_populates="questions")
    answer: Mapped[Optional["Answer"]] = relationship("Answer", back_populates="question", uselist=False)
    followups: Mapped[list["Question"]] = relationship("Question")


class Answer(Base):
    __tablename__ = "answers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    question_id: Mapped[str] = mapped_column(String(36), ForeignKey("questions.id", ondelete="CASCADE"), unique=True, nullable=False)
    interview_id: Mapped[str] = mapped_column(String(36), ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False)

    text: Mapped[str] = mapped_column(Text, nullable=False)          # Final answer text (transcribed or typed)
    answer_mode: Mapped[str] = mapped_column(SAEnum(AnswerMode), nullable=False)
    audio_file_path: Mapped[Optional[str]] = mapped_column(String(1000))  # Original audio file
    transcript_raw: Mapped[Optional[str]] = mapped_column(Text)           # Raw STT output
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    question: Mapped["Question"] = relationship("Question", back_populates="answer")
    evaluation: Mapped[Optional["AnswerEvaluation"]] = relationship("AnswerEvaluation", back_populates="answer", uselist=False)


class AnswerEvaluation(Base):
    __tablename__ = "answer_evaluations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    answer_id: Mapped[str] = mapped_column(String(36), ForeignKey("answers.id", ondelete="CASCADE"), unique=True, nullable=False)

    # Scores out of 10
    technical_accuracy: Mapped[float] = mapped_column(Float, default=0.0)
    relevance: Mapped[float] = mapped_column(Float, default=0.0)
    clarity: Mapped[float] = mapped_column(Float, default=0.0)
    completeness: Mapped[float] = mapped_column(Float, default=0.0)
    communication: Mapped[float] = mapped_column(Float, default=0.0)
    overall_score: Mapped[float] = mapped_column(Float, default=0.0)

    strengths: Mapped[Optional[list]] = mapped_column(JSON)           # list of strings
    improvements: Mapped[Optional[list]] = mapped_column(JSON)        # list of strings
    missing_concepts: Mapped[Optional[list]] = mapped_column(JSON)    # list of strings
    suggestions: Mapped[Optional[list]] = mapped_column(JSON)         # list of strings
    example_answer: Mapped[Optional[str]] = mapped_column(Text)       # Optional ideal answer
    raw_llm_response: Mapped[Optional[dict]] = mapped_column(JSON)    # Full LLM JSON output

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    answer: Mapped["Answer"] = relationship("Answer", back_populates="evaluation")


class InterviewReport(Base):
    __tablename__ = "interview_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    interview_id: Mapped[str] = mapped_column(String(36), ForeignKey("interviews.id", ondelete="CASCADE"), unique=True, nullable=False)

    # Summary scores
    overall_score: Mapped[float] = mapped_column(Float, default=0.0)
    technical_score: Mapped[float] = mapped_column(Float, default=0.0)
    communication_score: Mapped[float] = mapped_column(Float, default=0.0)
    clarity_score: Mapped[float] = mapped_column(Float, default=0.0)
    relevance_score: Mapped[float] = mapped_column(Float, default=0.0)
    completeness_score: Mapped[float] = mapped_column(Float, default=0.0)

    # Rich analysis
    strong_topics: Mapped[Optional[list]] = mapped_column(JSON)
    weak_topics: Mapped[Optional[list]] = mapped_column(JSON)
    missing_concepts: Mapped[Optional[list]] = mapped_column(JSON)
    recommendations: Mapped[Optional[list]] = mapped_column(JSON)
    preparation_plan: Mapped[Optional[dict]] = mapped_column(JSON)

    # Statistics
    total_questions: Mapped[int] = mapped_column(Integer, default=0)
    voice_answers_count: Mapped[int] = mapped_column(Integer, default=0)
    text_answers_count: Mapped[int] = mapped_column(Integer, default=0)
    actual_duration_seconds: Mapped[Optional[float]] = mapped_column(Float)

    pdf_path: Mapped[Optional[str]] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    interview: Mapped["Interview"] = relationship("Interview", back_populates="report")
