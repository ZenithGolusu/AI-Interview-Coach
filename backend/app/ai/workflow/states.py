"""LangGraph interview workflow state definition."""
from typing import Optional, Annotated
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages


class InterviewConfig(TypedDict):
    """Immutable interview configuration."""
    interview_id: str
    user_id: str
    mode: str
    experience_level: str
    difficulty: str
    duration_minutes: int
    target_role: str
    language: str
    voice_gender: str
    enable_followup: bool
    feedback_mode: str
    resume_id: Optional[str]
    job_description_id: Optional[str]


class QuestionRecord(TypedDict):
    """A question that was asked."""
    id: str
    text: str
    category: str
    topic: Optional[str]
    difficulty_level: str
    sequence_number: int
    is_followup: bool


class AnswerRecord(TypedDict):
    """A user's answer to a question."""
    question_id: str
    text: str
    answer_mode: str  # "voice" or "text"
    duration_seconds: Optional[float]
    thinking_time_seconds: Optional[float]
    evaluation: Optional[dict]


class InterviewState(TypedDict):
    """
    Complete mutable state of the interview workflow.
    Maintained by LangGraph throughout the interview session.
    """
    # Configuration (set once at start)
    config: InterviewConfig

    # Resume/JD context
    resume_parsed_data: Optional[dict]
    resume_store_id: Optional[str]       # FAISS store ID for resume
    jd_parsed_data: Optional[dict]
    jd_store_id: Optional[str]           # FAISS store ID for JD

    # Candidate-role analysis (for Resume+JD mode)
    candidate_role_analysis: Optional[dict]

    # Dynamic interview state
    questions_asked: list[QuestionRecord]
    answers_given: list[AnswerRecord]
    current_question: Optional[QuestionRecord]

    # Topic tracking — prevents repetitive questions
    topics_covered: list[str]
    topics_strong: list[str]    # topics where user answered well
    topics_weak: list[str]      # topics where user struggled

    # Adaptive state
    current_difficulty: str     # may adjust slightly based on performance
    consecutive_weak: int       # count of consecutive weak answers
    consecutive_strong: int     # count of consecutive strong answers

    # Time tracking
    started_at: Optional[str]   # ISO timestamp
    elapsed_seconds: float
    time_limit_seconds: float

    # Interview control
    interview_complete: bool
    completion_reason: Optional[str]  # "time_limit", "question_limit", "user_ended"

    # Workflow messages (LangGraph standard)
    messages: Annotated[list, add_messages]
