"""Dashboard and analytics routes."""
import structlog
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.models import (
    User, Interview, InterviewReport, Answer, AnswerEvaluation,
    AnswerMode, InterviewStatus,
)
from app.schemas.dashboard import (
    DashboardStats, RecentInterviewItem, ScoreTrendPoint,
    InterviewHistoryItem, CategoryAverages, CategoryAnalysis,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])
logger = structlog.get_logger()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _status(score: float) -> str:
    if score >= 7.5:
        return "exceptional"
    if score >= 5.0:
        return "proficient"
    return "needs_focus"


def _description(category: str, score: float) -> str:
    level = _status(score)
    msgs = {
        "technical": {
            "exceptional":  "Excellent technical depth — you explain concepts accurately and confidently.",
            "proficient":   "Solid technical knowledge with room to add more depth and precision.",
            "needs_focus":  "Technical accuracy needs work — focus on fundamentals and practice explaining concepts clearly.",
        },
        "communication": {
            "exceptional":  "Outstanding communication — your answers are structured and easy to follow.",
            "proficient":   "Good communication style; work on being more concise and structured.",
            "needs_focus":  "Communication clarity needs improvement — practice the STAR/structured answer method.",
        },
        "clarity": {
            "exceptional":  "Your answers are clear, jargon-free and very easy to understand.",
            "proficient":   "Generally clear, but some answers could be simplified further.",
            "needs_focus":  "Answers are often unclear or ambiguous — focus on simple, direct language.",
        },
        "relevance": {
            "exceptional":  "Every answer is highly relevant and directly addresses the question asked.",
            "proficient":   "Mostly on-point, but occasionally you drift off-topic.",
            "needs_focus":  "Answers frequently miss the point of the question — practise active listening and targeted responses.",
        },
        "completeness": {
            "exceptional":  "Comprehensive answers that cover all key aspects of each question.",
            "proficient":   "Good coverage; add examples and edge-cases to boost completeness.",
            "needs_focus":  "Answers tend to be too brief or miss key points — aim for fuller, more detailed responses.",
        },
    }
    return msgs.get(category, {}).get(level, "No data yet.")


CATEGORY_DEFAULTS = {
    "technical": {
        "strengths": [
            "Accurate application of core technical concepts and syntax.",
            "Demonstrates good familiarity with domain terminology.",
        ],
        "improvements": [
            "Include more specific implementation details and edge-case handling.",
            "Explain underlying architectural trade-offs explicitly.",
        ],
        "recommendations": [
            "Practice explaining algorithms and architecture step-by-step.",
            "Brush up on fundamentals for lower-scoring technical topics.",
        ],
    },
    "communication": {
        "strengths": [
            "Structured response style with clear pacing.",
            "Maintains a professional and confident conversational tone.",
        ],
        "improvements": [
            "Minimize filler words and repetitive phrases.",
            "Use structured frameworks (like STAR) consistently across all answers.",
        ],
        "recommendations": [
            "Practice brief 60-second summary answers to master conciseness.",
            "Outline your main points upfront before elaborating.",
        ],
    },
    "clarity": {
        "strengths": [
            "Clear explanations without excessive technical jargon.",
            "Easy-to-follow explanations of complex concepts.",
        ],
        "improvements": [
            "State your core conclusion or main answer upfront.",
            "Avoid winding backstories that obscure the main takeaway.",
        ],
        "recommendations": [
            "Use clear signal phrases like 'First', 'Second', and 'In summary'.",
            "Focus on simple, direct sentence structures.",
        ],
    },
    "relevance": {
        "strengths": [
            "Directly answers the main prompt asked by the interviewer.",
            "Stays focused on the topic without going off on side tangents.",
        ],
        "improvements": [
            "Ensure all sub-questions within multi-part prompts are explicitly answered.",
            "Avoid drifting into tangential past project details.",
        ],
        "recommendations": [
            "Pause for 2 seconds to align your answer with the interviewer's exact question.",
            "Re-confirm you answered all constraints in the question before wrapping up.",
        ],
    },
    "completeness": {
        "strengths": [
            "Covers necessary depth and context in answers.",
            "Provides practical examples alongside theoretical explanations.",
        ],
        "improvements": [
            "Include concrete real-world examples and trade-off considerations.",
            "Conclude answers with explicit summary statements or metrics.",
        ],
        "recommendations": [
            "Follow a standard format: Problem -> Approach -> Implementation -> Results.",
            "Include edge cases and trade-offs to make your answers fully comprehensive.",
        ],
    },
}


CATEGORY_KEYWORDS = {
    "technical": ["technical", "code", "concept", "knowledge", "definition", "fundamental", "architecture", "algorithm", "syntax", "lifecycle", "browser", "class", "object", "system", "logic", "database", "api"],
    "communication": ["communication", "pacing", "tone", "enthusiasm", "greeting", "filler", "articulate", "structure", "star", "confidence", "fluent", "speech", "speaking", "manner", "delivery"],
    "clarity": ["clarity", "clear", "jargon", "simple", "understand", "concise", "direct", "rambling", "explanation", "vague", "ambiguous", "straightforward"],
    "relevance": ["relevance", "relevant", "prompt", "question", "topic", "tangent", "addressed", "focus", "drift", "asked", "missed", "off-topic"],
    "completeness": ["completeness", "complete", "missing", "depth", "coverage", "thorough", "example", "detail", "edge", "trade-off", "brief", "partial", "full"],
}


def _extract_category_feedback(all_evals: list[AnswerEvaluation], category_key: str):
    score_attr_map = {
        "technical": "technical_accuracy",
        "communication": "communication",
        "clarity": "clarity",
        "relevance": "relevance",
        "completeness": "completeness",
    }
    attr_name = score_attr_map.get(category_key, "overall_score")
    keywords = CATEGORY_KEYWORDS.get(category_key, [])

    def matches_category(text: str) -> bool:
        lower = text.lower()
        return any(kw in lower for kw in keywords)

    # Sort evals for strengths (highest score for this dimension first)
    evals_high = sorted(all_evals, key=lambda e: getattr(e, attr_name, 0.0) or 0.0, reverse=True)
    # Sort evals for improvements/suggestions (lowest score for this dimension first)
    evals_low = sorted(all_evals, key=lambda e: getattr(e, attr_name, 0.0) or 0.0)

    eval_strengths: list[str] = []
    eval_improvements: list[str] = []
    eval_recommendations: list[str] = []

    for ev in evals_high:
        for s in (ev.strengths or []):
            if matches_category(s):
                eval_strengths.append(s)

    for ev in evals_low:
        for imp in (ev.improvements or []):
            if matches_category(imp):
                eval_improvements.append(imp)
        for sug in (ev.suggestions or []):
            if matches_category(sug):
                eval_recommendations.append(sug)
        if category_key == "technical" and ev.missing_concepts:
            eval_recommendations.extend([f"Review concept: {mc}" for mc in ev.missing_concepts])

    defaults = CATEGORY_DEFAULTS.get(category_key, {})
    
    # Combine category-specific defaults with matching user evals
    strengths = list(defaults.get("strengths", [])) + eval_strengths
    improvements = list(defaults.get("improvements", [])) + eval_improvements
    recommendations = list(defaults.get("recommendations", [])) + eval_recommendations

    return strengths, improvements, recommendations


def _build_category_analysis(
    category: str,
    label: str,
    score: float,
    all_evals: list[AnswerEvaluation],
) -> CategoryAnalysis:
    # Deduplicate preserving order
    def dedup(lst: list[str]) -> list[str]:
        seen: set[str] = set()
        out = []
        for item in lst:
            key = item.strip().lower()
            if key not in seen:
                seen.add(key)
                out.append(item.strip())
        return out

    strengths, improvements, recommendations = _extract_category_feedback(all_evals, category)

    return CategoryAnalysis(
        category=category,
        label=label,
        average_score=round(score, 2),
        benchmark_score=8.0,
        status=_status(score),
        description=_description(category, score),
        strengths=dedup(strengths)[:4],
        improvements=dedup(improvements)[:4],
        recommendations=dedup(recommendations)[:4],
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get comprehensive dashboard statistics for the current user."""
    user_id = current_user.id

    # Total non-abandoned interviews
    total_result = await db.execute(
        select(func.count(Interview.id)).where(
            Interview.user_id == user_id,
            Interview.status != InterviewStatus.ABANDONED,
        )
    )
    total_interviews = total_result.scalar() or 0

    # Completed interviews
    completed_result = await db.execute(
        select(func.count(Interview.id)).where(
            Interview.user_id == user_id,
            Interview.status == InterviewStatus.COMPLETED,
        )
    )
    completed_interviews = completed_result.scalar() or 0

    # Average overall score from completed reports
    avg_result = await db.execute(
        select(func.avg(InterviewReport.overall_score))
        .join(Interview, InterviewReport.interview_id == Interview.id)
        .where(
            Interview.user_id == user_id,
            Interview.status == InterviewStatus.COMPLETED,
        )
    )
    average_score = float(avg_result.scalar() or 0.0)

    # Voice vs text answer counts
    voice_result = await db.execute(
        select(func.count(Answer.id))
        .join(Interview, Answer.interview_id == Interview.id)
        .where(
            Interview.user_id == user_id,
            Interview.status == InterviewStatus.COMPLETED,
            Answer.answer_mode == AnswerMode.VOICE,
        )
    )
    text_result = await db.execute(
        select(func.count(Answer.id))
        .join(Interview, Answer.interview_id == Interview.id)
        .where(
            Interview.user_id == user_id,
            Interview.status == InterviewStatus.COMPLETED,
            Answer.answer_mode == AnswerMode.TEXT,
        )
    )
    voice_count = voice_result.scalar() or 0
    text_count = text_result.scalar() or 0

    # Recent interviews (last 5 non-abandoned)
    recent_result = await db.execute(
        select(Interview)
        .where(
            Interview.user_id == user_id,
            Interview.status != InterviewStatus.ABANDONED,
        )
        .order_by(Interview.created_at.desc())
        .limit(5)
    )
    recent_interviews_db = list(recent_result.scalars().all())

    recent_items = []
    now_utc = datetime.now(timezone.utc)
    for iv in recent_interviews_db:
        if iv.status == InterviewStatus.IN_PROGRESS and iv.started_at:
            started_tz = iv.started_at.replace(tzinfo=timezone.utc) if iv.started_at.tzinfo is None else iv.started_at
            if (now_utc - started_tz).total_seconds() >= (iv.duration_minutes * 60):
                iv.status = InterviewStatus.COMPLETED
                iv.ended_at = now_utc
                db.add(iv)

        score = None
        rpt_result = await db.execute(
            select(InterviewReport).where(InterviewReport.interview_id == iv.id)
        )
        rpt = rpt_result.scalar_one_or_none()
        if rpt:
            score = rpt.overall_score
        recent_items.append(RecentInterviewItem(
            id=iv.id,
            target_role=iv.target_role,
            mode=iv.mode,
            difficulty=iv.difficulty,
            overall_score=score,
            status=iv.status,
            created_at=iv.created_at,
            duration_minutes=iv.duration_minutes,
        ))
    await db.flush()

    # Score trend (last 10 completed)
    trend_result = await db.execute(
        select(Interview, InterviewReport)
        .join(InterviewReport, InterviewReport.interview_id == Interview.id)
        .where(Interview.user_id == user_id, Interview.status == InterviewStatus.COMPLETED)
        .order_by(Interview.created_at.asc())
        .limit(10)
    )
    score_trend = [
        ScoreTrendPoint(
            date=iv.created_at.strftime("%Y-%m-%d"),
            overall_score=rpt.overall_score,
            interview_id=iv.id,
        )
        for iv, rpt in trend_result.all()
    ]

    # All completed reports for topic + category aggregation
    all_reports_result = await db.execute(
        select(InterviewReport)
        .join(Interview, InterviewReport.interview_id == Interview.id)
        .where(
            Interview.user_id == user_id,
            Interview.status == InterviewStatus.COMPLETED,
        )
    )
    all_reports = all_reports_result.scalars().all()

    strong_topics: dict[str, int] = {}
    weak_topics: dict[str, int] = {}

    # Per-category score accumulators from report-level scores
    cat_scores: dict[str, list[float]] = {
        "technical": [], "communication": [], "clarity": [], "relevance": [], "completeness": []
    }
    for rpt in all_reports:
        for topic in (rpt.strong_topics or []):
            strong_topics[topic] = strong_topics.get(topic, 0) + 1
        for topic in (rpt.weak_topics or []):
            weak_topics[topic] = weak_topics.get(topic, 0) + 1
        if rpt.technical_score:
            cat_scores["technical"].append(rpt.technical_score)
        if rpt.communication_score:
            cat_scores["communication"].append(rpt.communication_score)
        if rpt.clarity_score:
            cat_scores["clarity"].append(rpt.clarity_score)
        if rpt.relevance_score:
            cat_scores["relevance"].append(rpt.relevance_score)
        if rpt.completeness_score:
            cat_scores["completeness"].append(rpt.completeness_score)

    top_strong = sorted(strong_topics, key=strong_topics.get, reverse=True)[:5]  # type: ignore[arg-type]
    top_weak = sorted(weak_topics, key=weak_topics.get, reverse=True)[:5]  # type: ignore[arg-type]

    def _avg(vals: list[float]) -> float:
        return sum(vals) / len(vals) if vals else 0.0

    tech_avg   = _avg(cat_scores["technical"])
    comm_avg   = _avg(cat_scores["communication"])
    clar_avg   = _avg(cat_scores["clarity"])
    rel_avg    = _avg(cat_scores["relevance"])
    comp_avg   = _avg(cat_scores["completeness"])

    # Also pull per-answer evaluations for richer feedback text
    evals_result = await db.execute(
        select(AnswerEvaluation)
        .join(Answer, AnswerEvaluation.answer_id == Answer.id)
        .join(Interview, Answer.interview_id == Interview.id)
        .where(
            Interview.user_id == user_id,
            Interview.status == InterviewStatus.COMPLETED,
        )
    )
    all_evals = evals_result.scalars().all()

    # Build category analysis objects with per-category distinct feedback
    category_analysis = [
        _build_category_analysis(
            "technical", "Technical Accuracy", tech_avg, all_evals,
        ),
        _build_category_analysis(
            "communication", "Communication", comm_avg, all_evals,
        ),
        _build_category_analysis(
            "clarity", "Clarity", clar_avg, all_evals,
        ),
        _build_category_analysis(
            "relevance", "Relevance", rel_avg, all_evals,
        ),
        _build_category_analysis(
            "completeness", "Completeness", comp_avg, all_evals,
        ),
    ]

    return DashboardStats(
        total_interviews=total_interviews,
        completed_interviews=completed_interviews,
        average_score=round(average_score, 2),
        total_voice_answers=voice_count,
        total_text_answers=text_count,
        strongest_topics=top_strong,
        weakest_topics=top_weak,
        recent_interviews=recent_items,
        score_trend=score_trend,
        category_averages=CategoryAverages(
            technical=round(tech_avg, 2),
            communication=round(comm_avg, 2),
            clarity=round(clar_avg, 2),
            relevance=round(rel_avg, 2),
            completeness=round(comp_avg, 2),
        ),
        category_analysis=category_analysis,
    )


@router.get("/history", response_model=list[InterviewHistoryItem])
async def get_interview_history(
    page: int = 1,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get paginated interview history for the current user."""
    offset = (page - 1) * limit
    result = await db.execute(
        select(Interview)
        .where(
            Interview.user_id == current_user.id,
            Interview.status != InterviewStatus.ABANDONED,
        )
        .order_by(Interview.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    interviews = list(result.scalars().all())

    history = []
    now_utc = datetime.now(timezone.utc)
    for iv in interviews:
        if iv.status == InterviewStatus.IN_PROGRESS and iv.started_at:
            started_tz = iv.started_at.replace(tzinfo=timezone.utc) if iv.started_at.tzinfo is None else iv.started_at
            if (now_utc - started_tz).total_seconds() >= (iv.duration_minutes * 60):
                iv.status = InterviewStatus.COMPLETED
                iv.ended_at = now_utc
                db.add(iv)

        score = total_q = voice_c = text_c = None
        rpt_result = await db.execute(
            select(InterviewReport).where(InterviewReport.interview_id == iv.id)
        )
        rpt = rpt_result.scalar_one_or_none()
        if rpt:
            score   = rpt.overall_score
            total_q = rpt.total_questions
            voice_c = rpt.voice_answers_count
            text_c  = rpt.text_answers_count

        history.append(InterviewHistoryItem(
            id=iv.id,
            target_role=iv.target_role,
            mode=iv.mode,
            difficulty=iv.difficulty,
            experience_level=iv.experience_level,
            duration_minutes=iv.duration_minutes,
            status=iv.status,
            overall_score=score,
            total_questions=total_q,
            voice_answers_count=voice_c,
            text_answers_count=text_c,
            created_at=iv.created_at,
            ended_at=iv.ended_at,
        ))
    await db.flush()

    return history
