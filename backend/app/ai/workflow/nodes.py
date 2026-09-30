"""LangGraph interview orchestration workflow nodes."""
import uuid
import structlog

from app.ai.workflow.states import InterviewState
from app.ai.workflow.prompts import (
    build_question_generation_prompt,
    build_evaluation_prompt,
    build_followup_decision_prompt,
)
from app.ai.llm.groq_provider import get_llm_provider
from app.ai.rag.vectorstore import get_vector_store

logger = structlog.get_logger()

# Scoring thresholds for adaptive difficulty
WEAK_THRESHOLD = 5.5      # scores below this are "weak"
STRONG_THRESHOLD = 7.5    # scores above this are "strong"
CONSECUTIVE_TO_ADJUST = 3  # consecutive weak/strong before adjusting difficulty


async def generate_next_question(state: InterviewState) -> InterviewState:
    """
    Generate the next interview question using LLM with RAG context.
    This is the core adaptive question generation node.
    """
    llm = get_llm_provider()
    vector_store = get_vector_store()
    config = state["config"]

    # ─── Retrieve relevant context ────────────────────────────────────────
    resume_context = ""
    jd_context = ""

    # Build clean query from target role and mode
    query = f"{config['target_role']} {config['mode']} interview requirements"

    if state.get("resume_store_id"):
        results = vector_store.retrieve(query, state["resume_store_id"], top_k=3)
        resume_context = "\n\n".join(r["text"] for r in results)

    if state.get("jd_store_id"):
        results = vector_store.retrieve(query, state["jd_store_id"], top_k=3)
        jd_context = "\n\n".join(r["text"] for r in results)

    # ─── Build multi-turn dialogue history ────────────────────────────────
    recent_dialogue = []
    questions = state.get("questions_asked", [])
    answers = state.get("answers_given", [])
    for i in range(min(len(questions), len(answers))):
        recent_dialogue.append({
            "question": questions[i].get("text", ""),
            "answer": answers[i].get("text", ""),
        })

    last_question = questions[-1] if questions else None
    last_answer_text = answers[-1].get("text", "") if answers else ""

    messages = build_question_generation_prompt(
        config=config,
        resume_context=resume_context,
        jd_context=jd_context,
        questions_asked=questions,
        topics_covered=state.get("topics_covered", []),
        topics_strong=state.get("topics_strong", []),
        topics_weak=state.get("topics_weak", []),
        current_difficulty=state.get("current_difficulty", config["difficulty"]),
        candidate_role_analysis=state.get("candidate_role_analysis"),
        last_answer=last_answer_text,
        last_question=last_question,
        recent_dialogue=recent_dialogue,
    )

    try:
        result = await llm.complete_json(messages, temperature=0.7)
    except Exception as e:
        logger.error("Question generation failed", error=str(e))
        # Fallback generic question
        seq = len(questions) + 1
        fallback_text = (
            "Welcome! Could you briefly introduce yourself and share your core technical background?"
            if seq == 1
            else f"Tell me about a key technical project you built in {config['target_role']} and the architecture choices you made."
        )
        result = {
            "question": fallback_text,
            "category": "introduction" if seq == 1 else "technical",
            "topic": "Overview",
            "difficulty_level": state.get("current_difficulty", config["difficulty"]),
            "is_followup": False,
            "reasoning": "Fallback question due to generation error",
        }

    question_record = {
        "id": str(uuid.uuid4()),
        "text": result["question"],
        "category": result.get("category", "general"),
        "topic": result.get("topic"),
        "difficulty_level": result.get("difficulty_level", state.get("current_difficulty")),
        "sequence_number": len(state.get("questions_asked", [])) + 1,
        "is_followup": result.get("is_followup", False),
    }

    logger.info(
        "Question generated",
        sequence=question_record["sequence_number"],
        category=question_record["category"],
        topic=question_record["topic"],
        is_followup=question_record["is_followup"],
    )

    return {**state, "current_question": question_record}


async def evaluate_answer(state: InterviewState) -> InterviewState:
    """
    Evaluate the most recent answer using LLM with structured JSON output.
    Updates topic tracking and adaptive difficulty.
    """
    llm = get_llm_provider()
    vector_store = get_vector_store()

    if not state.get("answers_given"):
        return state

    last_answer = state["answers_given"][-1]
    current_question = state.get("current_question") or (
        state["questions_asked"][-1] if state.get("questions_asked") else None
    )

    if not current_question:
        return state

    # Retrieve context for evaluation
    resume_context = ""
    jd_context = ""
    query = current_question.get("topic") or current_question.get("text", "")[:100]

    if state.get("resume_store_id"):
        results = vector_store.retrieve(query, state["resume_store_id"], top_k=2)
        resume_context = " ".join(r["text"] for r in results)

    if state.get("jd_store_id"):
        results = vector_store.retrieve(query, state["jd_store_id"], top_k=2)
        jd_context = " ".join(r["text"] for r in results)

    thinking_time = last_answer.get("thinking_time_seconds")
    answer_duration = last_answer.get("duration_seconds")

    messages = build_evaluation_prompt(
        question=current_question["text"],
        answer=last_answer["text"],
        category=current_question.get("category", "general"),
        topic=current_question.get("topic"),
        role=state["config"]["target_role"],
        experience_level=state["config"]["experience_level"],
        resume_context=resume_context,
        jd_context=jd_context,
        thinking_time_seconds=thinking_time,
        duration_seconds=answer_duration,
    )

    try:
        evaluation = await llm.complete_json(messages, temperature=0.2)
    except Exception as e:
        logger.error("Answer evaluation failed", error=str(e))
        evaluation = {
            "technical_accuracy": 5.0,
            "relevance": 5.0,
            "clarity": 5.0,
            "completeness": 5.0,
            "communication": 5.0,
            "overall_score": 5.0,
            "strengths": ["Answer was recorded"],
            "improvements": ["Could not evaluate due to technical error"],
            "missing_concepts": [],
            "suggestions": ["Please retry or contact support"],
        }

    overall = float(evaluation.get("overall_score", 5.0))
    topic = current_question.get("topic", "general")

    # Update topic tracking
    topics_covered = list(state.get("topics_covered", []))
    topics_strong = list(state.get("topics_strong", []))
    topics_weak = list(state.get("topics_weak", []))

    if topic and topic not in topics_covered:
        topics_covered.append(topic)

    if overall >= STRONG_THRESHOLD and topic and topic not in topics_strong:
        topics_strong.append(topic)
    elif overall < WEAK_THRESHOLD and topic and topic not in topics_weak:
        topics_weak.append(topic)

    # Update adaptive difficulty
    consecutive_weak = state.get("consecutive_weak", 0)
    consecutive_strong = state.get("consecutive_strong", 0)
    current_difficulty = state.get("current_difficulty", state["config"]["difficulty"])

    if overall < WEAK_THRESHOLD:
        consecutive_weak += 1
        consecutive_strong = 0
    elif overall >= STRONG_THRESHOLD:
        consecutive_strong += 1
        consecutive_weak = 0
    else:
        consecutive_weak = 0
        consecutive_strong = 0

    # Adjust difficulty (within one step, never extreme jumps)
    difficulty_order = ["easy", "medium", "hard"]
    current_idx = difficulty_order.index(current_difficulty) if current_difficulty in difficulty_order else 1

    if consecutive_weak >= CONSECUTIVE_TO_ADJUST and current_idx > 0:
        current_difficulty = difficulty_order[current_idx - 1]
        consecutive_weak = 0
        logger.info("Difficulty decreased", new_difficulty=current_difficulty)
    elif consecutive_strong >= CONSECUTIVE_TO_ADJUST and current_idx < 2:
        current_difficulty = difficulty_order[current_idx + 1]
        consecutive_strong = 0
        logger.info("Difficulty increased", new_difficulty=current_difficulty)

    # Store evaluation in the last answer record
    updated_answers = list(state.get("answers_given", []))
    if updated_answers:
        updated_answers[-1] = {**updated_answers[-1], "evaluation": evaluation}

    return {
        **state,
        "answers_given": updated_answers,
        "topics_covered": topics_covered,
        "topics_strong": topics_strong,
        "topics_weak": topics_weak,
        "current_difficulty": current_difficulty,
        "consecutive_weak": consecutive_weak,
        "consecutive_strong": consecutive_strong,
    }


async def check_should_continue(state: InterviewState) -> InterviewState:
    """
    Check if the interview should continue or end.
    Checks time limit and interview completeness.
    """
    config = state["config"]
    elapsed = state.get("elapsed_seconds", 0.0)
    time_limit = state.get("time_limit_seconds", config["duration_minutes"] * 60)

    # Check time limit (allow 30 second buffer)
    if elapsed >= (time_limit - 30):
        logger.info("Interview time limit reached", elapsed=elapsed, limit=time_limit)
        return {**state, "interview_complete": True, "completion_reason": "time_limit"}

    return {**state, "interview_complete": False}


async def check_followup_needed(state: InterviewState) -> str:
    """
    Router node: decide whether to ask a follow-up or move to next topic.
    Returns edge name for LangGraph routing.
    """
    if not state.get("answers_given") or not state["config"].get("enable_followup"):
        return "next_question"

    last_answer = state["answers_given"][-1]
    answer_text = (last_answer.get("text") or "").strip().lower()

    # Immediate skip circuit-breaker for admission of not knowing
    unknown_phrases = [
        "don't know", "dont know", "no idea", "not sure", "skip",
        "pass", "no clue", "haven't used", "havent used", "not familiar",
        "never used", "can't recall", "cant recall"
    ]
    if any(phrase in answer_text for phrase in unknown_phrases) or len(answer_text) < 8:
        logger.info("Candidate skipped or stated unknown topic; pivoting to next topic")
        return "next_question"

    last_evaluation = last_answer.get("evaluation", {})
    overall_score = last_evaluation.get("overall_score", 5.0)
    current_question = state.get("current_question")

    # Don't follow-up on a follow-up (max 1 follow-up)
    if not current_question or current_question.get("is_followup"):
        return "next_question"

    # Enforce max 2 questions per topic across the interview
    topic = current_question.get("topic")
    if topic:
        topic_count = sum(1 for q in state.get("questions_asked", []) if q.get("topic") == topic)
        if topic_count >= 2:
            return "next_question"

    # Only follow-up if answer is in the 5.0 - 7.5 range where there is a meaningful partial answer
    if 5.0 <= overall_score <= 7.5:
        llm = get_llm_provider()
        try:
            messages = build_followup_decision_prompt(
                question=current_question["text"],
                answer=last_answer["text"],
                category=current_question.get("category", "general"),
                enable_followup=state["config"].get("enable_followup", True),
                topics_weak=state.get("topics_weak", []),
            )
            result = await llm.fast_complete_json(messages, temperature=0.1)
            if result.get("needs_followup"):
                return "followup_question"
        except Exception as e:
            logger.warning("Follow-up decision failed", error=str(e))

    return "next_question"
