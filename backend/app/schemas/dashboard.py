"""Pydantic schemas for Dashboard and analytics."""
from typing import Optional, Any
from pydantic import BaseModel


class CategoryAnalysis(BaseModel):
    category: str  # "technical", "communication", "clarity", "relevance", "completeness"
    label: str     # "Technical Accuracy", "Communication", "Clarity", "Relevance", "Completeness"
    average_score: float
    benchmark_score: float = 8.0
    status: str    # "exceptional", "proficient", "needs_focus"
    description: str
    strengths: list[str] = []
    improvements: list[str] = []
    recommendations: list[str] = []


class CategoryAverages(BaseModel):
    technical: float = 0.0
    communication: float = 0.0
    clarity: float = 0.0
    relevance: float = 0.0
    completeness: float = 0.0


class DashboardStats(BaseModel):
    total_interviews: int
    completed_interviews: int
    average_score: float
    total_voice_answers: int
    total_text_answers: int
    strongest_topics: list[str]
    weakest_topics: list[str]
    recent_interviews: list["RecentInterviewItem"]
    score_trend: list["ScoreTrendPoint"]
    category_averages: CategoryAverages
    category_analysis: list[CategoryAnalysis]


class RecentInterviewItem(BaseModel):
    id: str
    target_role: str
    mode: str
    difficulty: str
    overall_score: Optional[float]
    status: str
    created_at: Any
    duration_minutes: int


class ScoreTrendPoint(BaseModel):
    date: str
    overall_score: float
    interview_id: str


class InterviewHistoryItem(BaseModel):
    id: str
    target_role: str
    mode: str
    difficulty: str
    experience_level: str
    duration_minutes: int
    status: str
    overall_score: Optional[float]
    total_questions: Optional[int]
    voice_answers_count: Optional[int]
    text_answers_count: Optional[int]
    created_at: Any
    ended_at: Optional[Any]


class ReportResponse(BaseModel):
    id: str
    interview_id: str
    overall_score: float
    technical_score: float
    communication_score: float
    clarity_score: float
    relevance_score: float
    completeness_score: float
    strong_topics: Optional[list] = []
    weak_topics: Optional[list] = []
    missing_concepts: Optional[list] = []
    recommendations: Optional[list] = []
    preparation_plan: Optional[dict] = {}
    total_questions: int
    voice_answers_count: int
    text_answers_count: int
    actual_duration_seconds: Optional[float] = None
    pdf_path: Optional[str] = None
    created_at: Any
    category_feedback: Optional[list[CategoryAnalysis]] = []

    model_config = {"from_attributes": True}
