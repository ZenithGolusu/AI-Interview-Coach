"""Interview lifecycle routes: create, start, submit answer, end, report."""
import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.models import User, Interview, Question, Answer, InterviewReport, InterviewStatus
from app.schemas.interview import (
    InterviewCreateRequest, InterviewResponse, QuestionResponse,
    AnswerSubmitRequest, NextQuestionResponse, AnswerEvaluationResponse
)
from app.schemas.dashboard import ReportResponse
from app.services.interview_service import interview_service

router = APIRouter(prefix="/interviews", tags=["Interviews"])
logger = structlog.get_logger()


@router.post("/", response_model=InterviewResponse, status_code=status.HTTP_201_CREATED)
async def create_interview(
    request: InterviewCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new interview with the given configuration."""
    # Validate mode-specific requirements
    mode = request.mode
    if mode in ["resume_based", "resume_jd"] and not request.resume_id:
        raise HTTPException(
            status_code=422,
            detail="Resume is required for Resume-Based and Resume+JD interview modes"
        )
    if mode in ["jd_based", "resume_jd"] and not request.job_description_id:
        raise HTTPException(
            status_code=422,
            detail="Job description is required for JD-Based and Resume+JD interview modes"
        )

    interview = await interview_service.create_interview(db, current_user.id, request)
    return InterviewResponse.model_validate(interview)


@router.post("/{interview_id}/start", response_model=dict)
async def start_interview(
    interview_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start an interview and get the first question."""
    interview, first_question = await interview_service.start_interview(db, interview_id, current_user.id)
    # Re-fetch question with eager-loaded answer relationship so Pydantic can
    # serialize QuestionResponse.answer without triggering an async lazy-load.
    q_result = await db.execute(
        select(Question)
        .options(selectinload(Question.answer).selectinload(Answer.evaluation))
        .where(Question.id == first_question.id)
    )
    first_question_loaded = q_result.scalar_one()
    return {
        "interview": InterviewResponse.model_validate(interview),
        "first_question": QuestionResponse.model_validate(first_question_loaded),
    }


@router.post("/submit-answer", response_model=NextQuestionResponse)
async def submit_answer(
    request: AnswerSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit an answer for the current question.
    Returns evaluation of the answer and the next question (or signals completion).
    """
    result = await interview_service.submit_answer_and_next(db, request, current_user.id)

    evaluation_response = None
    if result["evaluation"]:
        evaluation_response = AnswerEvaluationResponse.model_validate(result["evaluation"])

    next_q_response = None
    if result.get("next_question"):
        # Re-fetch with eager-loaded answer so QuestionResponse serializes cleanly
        nq = result["next_question"]
        nq_result = await db.execute(
            select(Question)
            .options(selectinload(Question.answer).selectinload(Answer.evaluation))
            .where(Question.id == nq.id)
        )
        next_q_loaded = nq_result.scalar_one()
        next_q_response = QuestionResponse.model_validate(next_q_loaded)

    return NextQuestionResponse(
        question=next_q_response,
        evaluation=evaluation_response,
        interview_complete=result["interview_complete"],
        remaining_time_seconds=None,  # Calculated client-side
    )


@router.post("/{interview_id}/end", response_model=ReportResponse)
async def end_interview(
    interview_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """End the interview and generate the final report."""
    report = await interview_service.end_interview(db, interview_id, current_user.id)
    return ReportResponse.model_validate(report)


@router.post("/{interview_id}/abandon", response_model=InterviewResponse)
async def abandon_interview(
    interview_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Abandon and discard an in-progress interview so it is excluded from stats and scoring."""
    interview = await interview_service.abandon_interview(db, interview_id, current_user.id)
    return InterviewResponse.model_validate(interview)


@router.get("/{interview_id}", response_model=InterviewResponse)
async def get_interview(
    interview_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get interview details by ID."""
    result = await db.execute(
        select(Interview).where(
            Interview.id == interview_id,
            Interview.user_id == current_user.id
        )
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    return InterviewResponse.model_validate(interview)


@router.get("/{interview_id}/questions", response_model=list[QuestionResponse])
async def get_interview_questions(
    interview_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all questions for an interview."""
    # Verify ownership
    result = await db.execute(
        select(Interview).where(
            Interview.id == interview_id, Interview.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Interview not found")

    q_result = await db.execute(
        select(Question)
        .options(
            selectinload(Question.answer).selectinload(Answer.evaluation)
        )
        .where(Question.interview_id == interview_id)
        .order_by(Question.sequence_number)
    )
    return [QuestionResponse.model_validate(q) for q in q_result.scalars().all()]


@router.get("/{interview_id}/report", response_model=ReportResponse)
async def get_interview_report(
    interview_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the final report for a completed interview."""
    # Verify ownership
    result = await db.execute(
        select(Interview).where(
            Interview.id == interview_id, Interview.user_id == current_user.id
        )
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    # Check if report exists
    report_result = await db.execute(
        select(InterviewReport).where(InterviewReport.interview_id == interview_id)
    )
    report = report_result.scalar_one_or_none()

    if not report:
        if interview.status != InterviewStatus.COMPLETED:
            raise HTTPException(
                status_code=400,
                detail="Interview is not yet completed. End the interview first."
            )
        # Generate report on demand
        report = await interview_service.generate_report(db, interview_id, current_user.id)

    return ReportResponse.model_validate(report)
