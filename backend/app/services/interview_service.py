"""
Main interview service — bridges the API layer with the LangGraph workflow.
Handles state persistence to PostgreSQL and orchestrates the AI workflow.
"""
import uuid
import json
import structlog
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import (
    Interview, Question, Answer, AnswerEvaluation, InterviewReport,
    InterviewStatus, AnswerMode
)
from app.schemas.interview import InterviewCreateRequest, AnswerSubmitRequest
from app.ai.workflow.states import InterviewState, InterviewConfig, QuestionRecord, AnswerRecord
from app.ai.workflow.nodes import generate_next_question, evaluate_answer
from app.ai.workflow.prompts import build_final_report_prompt
from app.ai.llm.groq_provider import get_llm_provider
from app.ai.rag.vectorstore import get_vector_store
from app.ai.document.pdf_parser import extract_structured_info, parse_job_description

logger = structlog.get_logger()


class InterviewService:
    """
    Orchestrates the full interview workflow.
    State is persisted to PostgreSQL after every interaction.
    """

    async def create_interview(
        self, db: AsyncSession, user_id: str, request: InterviewCreateRequest
    ) -> Interview:
        """Create a new interview record from configuration."""
        # Normalize empty strings to None — frontend may send "" instead of null
        resume_id = request.resume_id or None
        job_description_id = request.job_description_id or None

        interview = Interview(
            id=str(uuid.uuid4()),
            user_id=user_id,
            resume_id=resume_id,
            job_description_id=job_description_id,
            mode=request.mode,
            experience_level=request.experience_level,
            difficulty=request.difficulty,
            duration_minutes=request.duration_minutes,
            target_role=request.target_role,
            language=request.language,
            voice_gender=request.voice_gender,
            enable_followup=request.enable_followup,
            feedback_mode=request.feedback_mode,
            status=InterviewStatus.SETUP,
            current_question_index=0,
        )
        db.add(interview)
        await db.flush()
        await db.refresh(interview)
        logger.info("Interview created", interview_id=interview.id, mode=request.mode)
        return interview

    async def start_interview(
        self, db: AsyncSession, interview_id: str, user_id: str
    ) -> tuple[Interview, Question]:
        """
        Start an interview: initialize state, generate first question, synthesize speech.
        If interview is already IN_PROGRESS (e.g. page refreshed), resume existing session cleanly!
        """
        interview = await self._get_interview(db, interview_id, user_id)

        if interview.status == InterviewStatus.ABANDONED:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail="This interview was discarded. Please start a new interview from the setup page."
            )

        if interview.status == InterviewStatus.COMPLETED:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail="This interview is already completed. Please view the performance report."
            )

        # If already in progress and started, check if time limit has already expired!
        if interview.status == InterviewStatus.IN_PROGRESS and interview.started_at:
            started_tz = interview.started_at.replace(tzinfo=timezone.utc) if interview.started_at.tzinfo is None else interview.started_at
            elapsed = (datetime.now(timezone.utc) - started_tz).total_seconds()
            time_limit = interview.duration_minutes * 60

            if elapsed >= time_limit:
                logger.info("Interview session timed out", interview_id=interview_id, elapsed=elapsed, limit=time_limit)
                # Check if report already exists, otherwise finalize
                rpt_stmt = select(InterviewReport).where(InterviewReport.interview_id == interview_id)
                rpt_res = await db.execute(rpt_stmt)
                rpt = rpt_res.scalar_one_or_none()
                if not rpt:
                    try:
                        await self.end_interview(db, interview_id, user_id)
                    except Exception as e:
                        logger.warning("Auto report generation on timeout failed", error=str(e))
                        interview.status = InterviewStatus.COMPLETED
                        interview.ended_at = datetime.now(timezone.utc)
                        db.add(interview)
                        await db.flush()

                from fastapi import HTTPException
                raise HTTPException(
                    status_code=400,
                    detail="This interview session has reached its time limit and is completed. Please view the report."
                )

            q_stmt = (
                select(Question)
                .where(Question.interview_id == interview_id)
                .order_by(Question.sequence_number.desc())
            )
            q_result = await db.execute(q_stmt)
            latest_question = q_result.scalars().first()
            if latest_question:
                logger.info(
                    "Resuming in-progress interview",
                    interview_id=interview_id,
                    current_question=latest_question.id,
                )
                return interview, latest_question

        # Otherwise initialize new session
        state = await self._build_initial_state(db, interview)

        # Generate first question
        state = await generate_next_question(state)
        q_data = state["current_question"]

        # Persist question to DB
        question = await self._persist_question(db, interview, q_data)

        # Update interview state
        state["questions_asked"].append(q_data)
        interview.status = InterviewStatus.IN_PROGRESS
        interview.started_at = datetime.now(timezone.utc)
        interview.workflow_state = self._serialize_state(state)
        interview.current_question_index = 1
        db.add(interview)
        await db.flush()

        logger.info("Interview started", interview_id=interview_id, first_question=question.id)
        return interview, question

    async def abandon_interview(
        self, db: AsyncSession, interview_id: str, user_id: str
    ) -> Interview:
        """Mark an interview as abandoned so it is discarded and excluded from all scores/stats."""
        interview = await self._get_interview(db, interview_id, user_id)
        interview.status = InterviewStatus.ABANDONED
        interview.ended_at = datetime.now(timezone.utc)
        db.add(interview)
        await db.flush()
        logger.info("Interview abandoned and discarded", interview_id=interview_id)
        return interview

    async def submit_answer_and_next(
        self, db: AsyncSession, request: AnswerSubmitRequest, user_id: str
    ) -> dict:
        """
        Submit an answer, evaluate it, and generate the next question.
        Returns: {evaluation, next_question, interview_complete}
        """
        interview = await self._get_interview(db, request.interview_id, user_id)
        state = self._deserialize_state(interview.workflow_state or {})

        # Recalculate elapsed time
        elapsed = 0.0
        if interview.started_at:
            elapsed = (datetime.now(timezone.utc) - interview.started_at.replace(tzinfo=timezone.utc)).total_seconds()
        state["elapsed_seconds"] = elapsed
        state["time_limit_seconds"] = interview.duration_minutes * 60

        # ─── Persist the answer ────────────────────────────────────────────
        answer_record: AnswerRecord = {
            "question_id": request.question_id,
            "text": request.text,
            "answer_mode": request.answer_mode,
            "duration_seconds": request.duration_seconds,
            "thinking_time_seconds": request.thinking_time_seconds,
            "evaluation": None,
        }

        db_answer = Answer(
            id=str(uuid.uuid4()),
            question_id=request.question_id,
            interview_id=request.interview_id,
            text=request.text,
            answer_mode=request.answer_mode,
            duration_seconds=request.duration_seconds,
        )
        db.add(db_answer)
        await db.flush()

        # Update state with the answer
        state["answers_given"].append(answer_record)
        state["current_question"] = next(
            (q for q in state.get("questions_asked", []) if q["id"] == request.question_id),
            state.get("current_question"),
        )

        # ─── Evaluate the answer ───────────────────────────────────────────
        state = await evaluate_answer(state)
        evaluation_data = state["answers_given"][-1].get("evaluation", {})

        # Persist evaluation to DB
        db_evaluation = AnswerEvaluation(
            id=str(uuid.uuid4()),
            answer_id=db_answer.id,
            technical_accuracy=evaluation_data.get("technical_accuracy", 5.0),
            relevance=evaluation_data.get("relevance", 5.0),
            clarity=evaluation_data.get("clarity", 5.0),
            completeness=evaluation_data.get("completeness", 5.0),
            communication=evaluation_data.get("communication", 5.0),
            overall_score=evaluation_data.get("overall_score", 5.0),
            strengths=evaluation_data.get("strengths", []),
            improvements=evaluation_data.get("improvements", []),
            missing_concepts=evaluation_data.get("missing_concepts", []),
            suggestions=evaluation_data.get("suggestions", []),
            example_answer=evaluation_data.get("example_answer"),
            raw_llm_response=evaluation_data,
        )
        db.add(db_evaluation)

        # ─── Check if interview should end ────────────────────────────────
        time_up = elapsed >= (interview.duration_minutes * 60 - 30)

        if time_up:
            interview.status = InterviewStatus.COMPLETED
            interview.ended_at = datetime.now(timezone.utc)
            interview.workflow_state = self._serialize_state(state)
            db.add(interview)
            await db.flush()
            logger.info("Interview completed by time limit", interview_id=interview.id)
            return {
                "evaluation": db_evaluation,
                "next_question": None,
                "interview_complete": True,
            }

        # ─── Generate next question ────────────────────────────────────────
        state = await generate_next_question(state)
        next_q_data = state["current_question"]

        # Persist next question
        next_question = await self._persist_question(db, interview, next_q_data)
        state["questions_asked"].append(next_q_data)

        interview.workflow_state = self._serialize_state(state)
        interview.current_question_index = len(state["questions_asked"])
        db.add(interview)
        await db.flush()

        return {
            "evaluation": db_evaluation,
            "next_question": next_question,
            "interview_complete": False,
        }

    async def end_interview(
        self, db: AsyncSession, interview_id: str, user_id: str
    ) -> InterviewReport:
        """End the interview early and generate the final report."""
        interview = await self._get_interview(db, interview_id, user_id)

        interview.status = InterviewStatus.COMPLETED
        interview.ended_at = datetime.now(timezone.utc)
        db.add(interview)
        await db.flush()

        return await self.generate_report(db, interview_id, user_id)

    async def generate_report(
        self, db: AsyncSession, interview_id: str, user_id: str
    ) -> InterviewReport:
        """Generate and persist the final interview report."""
        interview = await self._get_interview(db, interview_id, user_id)

        # Load all questions and answers with evaluations eagerly
        from sqlalchemy.orm import selectinload
        questions_result = await db.execute(
            select(Question)
            .options(selectinload(Question.answer).selectinload(Answer.evaluation))
            .where(Question.interview_id == interview_id)
            .order_by(Question.sequence_number)
        )
        questions = list(questions_result.scalars().all())

        qa_data = []
        voice_count = 0
        text_count = 0
        all_scores = []

        for q in questions:
            if q.answer:
                ans = q.answer
                if ans.answer_mode == AnswerMode.VOICE:
                    voice_count += 1
                else:
                    text_count += 1

                eval_data = {}
                if ans.evaluation:
                    e = ans.evaluation
                    eval_data = {
                        "overall_score": e.overall_score,
                        "technical_accuracy": e.technical_accuracy,
                        "relevance": e.relevance,
                        "clarity": e.clarity,
                        "completeness": e.completeness,
                        "communication": e.communication,
                    }
                    all_scores.append(e.overall_score)

                qa_data.append({
                    "question": {"text": q.text, "category": q.category, "topic": q.topic},
                    "answer": {"text": ans.text, "mode": ans.answer_mode},
                    "evaluation": eval_data,
                })

        # Calculate aggregate scores
        def avg(scores, key):
            vals = [s.get(key, 0) for s in [d.get("evaluation", {}) for d in qa_data] if s.get(key)]
            return sum(vals) / len(vals) if vals else 0.0

        overall_score = sum(all_scores) / len(all_scores) if all_scores else 0.0

        # Generate LLM analysis
        state = self._deserialize_state(interview.workflow_state or {})
        config = state.get("config", {
            "target_role": interview.target_role,
            "mode": interview.mode,
            "experience_level": interview.experience_level,
        })

        llm = get_llm_provider()
        try:
            messages = build_final_report_prompt(
                config=config,
                questions=[{"text": q.text} for q in questions],
                answers_with_evaluations=qa_data,
            )
            analysis = await llm.complete_json(messages, temperature=0.3)
        except Exception as e:
            logger.error("Report generation LLM call failed", error=str(e))
            analysis = {
                "strong_topics": state.get("topics_strong", []),
                "weak_topics": state.get("topics_weak", []),
                "missing_concepts": [],
                "recommendations": ["Review the interview questions and improve your answers"],
                "preparation_plan": {"immediate": [], "short_term": [], "long_term": []},
            }

        duration_seconds = None
        if interview.started_at and interview.ended_at:
            duration_seconds = (interview.ended_at - interview.started_at).total_seconds()

        report = InterviewReport(
            id=str(uuid.uuid4()),
            interview_id=interview_id,
            overall_score=round(overall_score, 2),
            technical_score=round(avg(qa_data, "technical_accuracy"), 2),
            communication_score=round(avg(qa_data, "communication"), 2),
            clarity_score=round(avg(qa_data, "clarity"), 2),
            relevance_score=round(avg(qa_data, "relevance"), 2),
            completeness_score=round(avg(qa_data, "completeness"), 2),
            strong_topics=analysis.get("strong_topics", []),
            weak_topics=analysis.get("weak_topics", []),
            missing_concepts=analysis.get("missing_concepts", []),
            recommendations=analysis.get("recommendations", []),
            preparation_plan=analysis.get("preparation_plan", {}),
            total_questions=len(questions),
            voice_answers_count=voice_count,
            text_answers_count=text_count,
            actual_duration_seconds=duration_seconds,
        )
        db.add(report)
        await db.flush()
        await db.refresh(report)

        logger.info("Interview report generated", interview_id=interview_id, overall_score=overall_score)
        return report

    # ─── Private helpers ───────────────────────────────────────────────────

    async def _get_interview(self, db: AsyncSession, interview_id: str, user_id: str) -> Interview:
        result = await db.execute(
            select(Interview).where(
                Interview.id == interview_id,
                Interview.user_id == user_id
            )
        )
        interview = result.scalar_one_or_none()
        if not interview:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=404, detail="Interview not found")
        return interview

    async def _build_initial_state(self, db: AsyncSession, interview: Interview) -> InterviewState:
        """Build the initial LangGraph state from interview configuration."""
        from app.models.models import Resume, JobDescription

        config: InterviewConfig = {
            "interview_id": interview.id,
            "user_id": interview.user_id,
            "mode": interview.mode,
            "experience_level": interview.experience_level,
            "difficulty": interview.difficulty,
            "duration_minutes": interview.duration_minutes,
            "target_role": interview.target_role,
            "language": interview.language,
            "voice_gender": interview.voice_gender,
            "enable_followup": interview.enable_followup,
            "feedback_mode": interview.feedback_mode,
            "resume_id": interview.resume_id,
            "job_description_id": interview.job_description_id,
        }

        resume_parsed = None
        resume_store_id = None
        jd_parsed = None
        jd_store_id = None
        candidate_role_analysis = None

        if interview.resume_id:
            result = await db.execute(select(Resume).where(Resume.id == interview.resume_id))
            resume = result.scalar_one_or_none()
            if resume:
                resume_parsed = resume.parsed_data
                resume_store_id = f"resume_{interview.resume_id}"

        if interview.job_description_id:
            result = await db.execute(select(JobDescription).where(JobDescription.id == interview.job_description_id))
            jd = result.scalar_one_or_none()
            if jd:
                jd_parsed = jd.parsed_data
                jd_store_id = f"jd_{interview.job_description_id}"

        # Candidate-role analysis for resume+jd mode
        if resume_parsed and jd_parsed and interview.mode == "resume_jd":
            llm = get_llm_provider()
            from app.ai.workflow.prompts import build_candidate_role_analysis_prompt
            try:
                messages = build_candidate_role_analysis_prompt(resume_parsed, jd_parsed)
                candidate_role_analysis = await llm.fast_complete_json(messages)
            except Exception as e:
                logger.warning("Candidate-role analysis failed", error=str(e))

        return {
            "config": config,
            "resume_parsed_data": resume_parsed,
            "resume_store_id": resume_store_id,
            "jd_parsed_data": jd_parsed,
            "jd_store_id": jd_store_id,
            "candidate_role_analysis": candidate_role_analysis,
            "questions_asked": [],
            "answers_given": [],
            "current_question": None,
            "topics_covered": [],
            "topics_strong": [],
            "topics_weak": [],
            "current_difficulty": interview.difficulty,
            "consecutive_weak": 0,
            "consecutive_strong": 0,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "elapsed_seconds": 0.0,
            "time_limit_seconds": interview.duration_minutes * 60,
            "interview_complete": False,
            "completion_reason": None,
            "messages": [],
        }

    async def _persist_question(
        self, db: AsyncSession, interview: Interview, q_data: dict
    ) -> Question:
        """Save a generated question to the database."""
        question = Question(
            id=q_data["id"],
            interview_id=interview.id,
            text=q_data["text"],
            category=q_data.get("category", "general"),
            topic=q_data.get("topic"),
            difficulty_level=q_data.get("difficulty_level", interview.difficulty),
            sequence_number=q_data["sequence_number"],
            is_followup=q_data.get("is_followup", False),
        )
        db.add(question)
        await db.flush()
        await db.refresh(question)
        return question

    def _serialize_state(self, state: InterviewState) -> dict:
        """Serialize LangGraph state for JSON storage in PostgreSQL."""
        # Remove non-serializable message objects
        serializable = {k: v for k, v in state.items() if k != "messages"}
        return serializable

    def _deserialize_state(self, state_dict: dict) -> InterviewState:
        """Deserialize state from PostgreSQL JSON field."""
        state_dict["messages"] = []
        return state_dict


interview_service = InterviewService()
