"""Pydantic schemas for Interview configuration and state."""
from typing import Optional, Any
from pydantic import BaseModel, field_validator
from app.models.models import (
    InterviewMode, ExperienceLevel, Difficulty, InterviewStatus, VoiceGender, AnswerMode
)


class InterviewCreateRequest(BaseModel):
    mode: InterviewMode
    experience_level: ExperienceLevel
    difficulty: Difficulty
    duration_minutes: int
    target_role: str
    language: str = "english"
    voice_gender: VoiceGender = VoiceGender.FEMALE
    enable_followup: bool = True
    feedback_mode: str = "final"  # "each" or "final"
    resume_id: Optional[str] = None
    job_description_id: Optional[str] = None

    @field_validator("resume_id", "job_description_id", mode="before")
    @classmethod
    def empty_str_to_none(cls, v: Any) -> Optional[str]:
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @field_validator("duration_minutes")
    @classmethod
    def validate_duration(cls, v: int) -> int:
        if v not in [10, 20, 30]:
            raise ValueError("Duration must be 10, 20, or 30 minutes")
        return v

    @field_validator("target_role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Target role cannot be empty")
        return v.strip()

    @field_validator("feedback_mode")
    @classmethod
    def validate_feedback_mode(cls, v: str) -> str:
        if v not in ["each", "final"]:
            raise ValueError("Feedback mode must be 'each' or 'final'")
        return v


class InterviewResponse(BaseModel):
    id: str
    mode: InterviewMode
    experience_level: ExperienceLevel
    difficulty: Difficulty
    duration_minutes: int
    target_role: str
    language: str
    voice_gender: VoiceGender
    enable_followup: bool
    feedback_mode: str
    status: InterviewStatus
    current_question_index: int
    resume_id: Optional[str]
    job_description_id: Optional[str]
    started_at: Optional[Any]
    ended_at: Optional[Any]
    created_at: Any

    model_config = {"from_attributes": True}


class AnswerEvaluationResponse(BaseModel):
    id: str
    technical_accuracy: float
    relevance: float
    clarity: float
    completeness: float
    communication: float
    overall_score: float
    strengths: Optional[list] = None
    improvements: Optional[list] = None
    missing_concepts: Optional[list] = None
    suggestions: Optional[list] = None
    example_answer: Optional[str] = None

    model_config = {"from_attributes": True}


class AnswerResponse(BaseModel):
    id: str
    text: str
    answer_mode: AnswerMode
    duration_seconds: Optional[float] = None
    evaluation: Optional[AnswerEvaluationResponse] = None

    model_config = {"from_attributes": True}


class QuestionResponse(BaseModel):
    id: str
    text: str
    category: str
    topic: Optional[str] = None
    difficulty_level: Difficulty
    sequence_number: int
    is_followup: bool
    audio_url: Optional[str] = None
    answer: Optional[AnswerResponse] = None

    model_config = {"from_attributes": True}


class AnswerSubmitRequest(BaseModel):
    question_id: str
    interview_id: str
    text: str
    answer_mode: AnswerMode
    duration_seconds: Optional[float] = None
    thinking_time_seconds: Optional[float] = None


class NextQuestionResponse(BaseModel):
    question: Optional[QuestionResponse]
    evaluation: Optional[AnswerEvaluationResponse]
    interview_complete: bool
    remaining_time_seconds: Optional[float]


class JobDescriptionCreateRequest(BaseModel):
    raw_text: str

    @field_validator("raw_text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        if len(v.strip()) < 100:
            raise ValueError("Job description must be at least 100 characters")
        return v.strip()


class JobDescriptionResponse(BaseModel):
    id: str
    raw_text: str
    parsed_data: Optional[dict]
    is_processed: bool
    created_at: Any

    model_config = {"from_attributes": True}


class ResumeResponse(BaseModel):
    id: str
    filename: str
    file_size_bytes: int
    parsed_data: Optional[dict]
    is_processed: bool
    created_at: Any

    model_config = {"from_attributes": True}
