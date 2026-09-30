"""LLM prompt templates for the interview workflow."""
from typing import Optional


def build_question_generation_prompt(
    config: dict,
    resume_context: str,
    jd_context: str,
    questions_asked: list[dict],
    topics_covered: list[str],
    topics_strong: list[str],
    topics_weak: list[str],
    current_difficulty: str,
    candidate_role_analysis: Optional[dict] = None,
    last_answer: Optional[str] = None,
    last_question: Optional[dict] = None,
    recent_dialogue: Optional[list[dict]] = None,
) -> list[dict]:
    """Build the prompt for generating the next interview question with dynamic conversational intelligence."""

    mode = config.get("mode", "general")
    role = config.get("target_role", "Software Engineer")
    experience = config.get("experience_level", "mid")
    difficulty = current_difficulty
    enable_followup = config.get("enable_followup", True)
    sequence_number = len(questions_asked) + 1

    # Format previously asked questions to avoid repetition
    asked_summary = ""
    if questions_asked:
        asked_summary = "\nPreviously asked questions (DO NOT repeat or closely rephrase):\n" + "\n".join(
            f"- Q{q['sequence_number']}: {q['text']}" for q in questions_asked
        )

    # Multi-turn conversational context
    dialogue_context = ""
    if recent_dialogue:
        dialogue_context = "\nRecent Conversation History:\n" + "\n".join(
            f"Interviewer: {turn.get('question', '')}\nCandidate: {turn.get('answer', '')}"
            for turn in recent_dialogue[-3:]
        )
    elif last_question and last_answer:
        dialogue_context = f"\nLast Exchange:\nInterviewer: {last_question.get('text', '')}\nCandidate: {last_answer}"

    # Topic tracking context
    topic_context = ""
    if topics_covered:
        topic_context += f"\nTopics already covered: {', '.join(topics_covered)}"
    if topics_strong:
        topic_context += f"\nCandidate strengths shown in: {', '.join(topics_strong)}"
    if topics_weak:
        topic_context += f"\nTopics where candidate struggled / admitted not knowing: {', '.join(topics_weak)}"

    # Candidate-role gap analysis
    analysis_context = ""
    if candidate_role_analysis:
        gaps = candidate_role_analysis.get("skill_gaps", [])
        strengths = candidate_role_analysis.get("matching_strengths", [])
        if gaps:
            analysis_context += f"\nKey skill areas to evaluate: {', '.join(gaps[:5])}"
        if strengths:
            analysis_context += f"\nCandidate background highlights: {', '.join(strengths[:5])}"

    # Mode-Specific Progression Arc Guidelines
    mode_instructions = ""
    if mode == "general":
        if sequence_number == 1:
            mode_instructions = """CURRENT STAGE: WARM INTRODUCTION (Question 1)
- Welcome the candidate warmly.
- Ask them to give a brief introduction of themselves, their background in software/tech, and their primary tech stack."""
        elif sequence_number == 2:
            mode_instructions = """CURRENT STAGE: PROJECT & ARCHITECTURE HIGHLIGHT (Question 2)
- Ask the candidate to talk about a recent notable project they worked on, their specific role, tech stack choices, or architecture."""
        elif 3 <= sequence_number <= 5:
            mode_instructions = f"""CURRENT STAGE: CORE TECHNICAL COMPETENCY (Question {sequence_number})
- Ask a focused technical/design question directly relevant to {role} at a {difficulty} level.
- Ensure the question covers a fresh, distinct topic (e.g. state management, API design, concurrency, database indexing, caching)."""
        else:
            mode_instructions = f"""CURRENT STAGE: BEHAVIORAL & PROBLEM-SOLVING (Question {sequence_number})
- Ask a situational, practical engineering, or collaboration question (e.g., handling production incidents, code reviews, technical debt vs deadlines)."""
    elif mode == "hr":
        if sequence_number == 1:
            mode_instructions = """CURRENT STAGE: INTRODUCTION & MOTIVATION
- Welcome the candidate and ask for their career journey overview and what motivates them in this role."""
        else:
            mode_instructions = f"""CURRENT STAGE: BEHAVIORAL & CULTURE FIT (Question {sequence_number})
- Ask STAR-method behavioral questions on leadership, conflict resolution, dealing with failure, adaptability, and teamwork."""
    elif mode == "technical":
        mode_instructions = f"""CURRENT STAGE: DEEP TECHNICAL & SYSTEM DESIGN (Question {sequence_number})
- Ask hands-on technical architecture, system design, coding paradigms, scalability, or performance optimization for {role} at {difficulty} level."""
    elif mode in ["resume_based", "resume_jd"]:
        mode_instructions = f"""CURRENT STAGE: RESUME DEEP DIVE (Question {sequence_number})
- Connect questions directly to the candidate's resume projects, claimed skills, and tech stack impact."""
    elif mode == "jd_based":
        mode_instructions = f"""CURRENT STAGE: JOB DESCRIPTION FIT (Question {sequence_number})
- Target key requirements, responsibilities, and specialized qualifications specified in the Job Description."""

    system_prompt = f"""You are an elite, highly dynamic AI Interviewer conducting a live interactive voice mock interview. You think, listen, and adapt in real time as a natural conversational interviewer.

INTERVIEW CONFIGURATION:
- Target Role: {role}
- Interview Mode: {mode.upper()}
- Experience Level: {experience}
- Difficulty: {difficulty}
- Current Question Number: {sequence_number}
- Follow-ups Allowed: {'Yes' if enable_followup else 'No'}

{mode_instructions}

CONTEXT:
Resume Context:
{resume_context if resume_context else "No resume provided."}

Job Description Context:
{jd_context if jd_context else "No job description provided."}
{analysis_context}
{topic_context}
{asked_summary}
{dialogue_context}

DYNAMIC CONVERSATIONAL RULES (CRITICAL):
1. NATURAL CONVERSATIONAL SEGUES:
   - When following up or transitioning from the candidate's last answer, start with a natural, conversational segue.
   - Example (after great answer): "That's a very clear explanation of X. Building on that, how would you handle..."
   - Example (after candidate says 'I don't know' / 'skip' / 'pass'): "No worries at all, let's switch gears and look at another area. Tell me about..."
   - Example (after partial answer): "Got it, that makes sense. Moving on to another key area..."
2. PIVOT INSTANTLY ON "DON'T KNOW":
   - If the candidate stated or implied they don't know the previous topic (e.g. 'I don't know', 'not sure', 'skip', 'pass', 'no idea'):
     - DO NOT ask any follow-up on that topic.
     - Acknowledge politely and PIVOT to a COMPLETELY NEW topic or technology area.
3. TOPIC DIVERSITY:
   - Max 1 follow-up per topic (never ask more than 2 questions total on the same topic across the entire interview).
   - Ensure a broad, balanced evaluation across different domains of {role}.
4. CONCISE & SPOKEN:
   - The question must be 1 to 3 sentences max, phrased naturally for speech synthesis.

Return ONLY a JSON object:
{{
  "question": "Conversational transition + clear question text",
  "category": "introduction|technical|behavioral|situational|architecture|conceptual",
  "topic": "specific topic (e.g. Tech Stack Background, React State, Database Indexing)",
  "difficulty_level": "easy|medium|hard",
  "is_followup": true|false,
  "reasoning": "Brief reason for choosing this question and transition"
}}"""

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Generate Question #{sequence_number} now."}
    ]


def build_evaluation_prompt(
    question: str,
    answer: str,
    category: str,
    topic: Optional[str],
    role: str,
    experience_level: str,
    resume_context: str = "",
    jd_context: str = "",
    thinking_time_seconds: Optional[float] = None,
    duration_seconds: Optional[float] = None,
) -> list[dict]:
    """Build the prompt for evaluating a candidate's answer with an ideal model answer."""

    timing_context = ""
    if thinking_time_seconds is not None or duration_seconds is not None:
        timing_parts = []
        if thinking_time_seconds is not None:
            timing_parts.append(f"Thinking Pause: {thinking_time_seconds:.1f}s (2-6s is healthy formulation time)")
        if duration_seconds is not None:
            timing_parts.append(f"Spoken Answer Duration: {duration_seconds:.1f}s")
        timing_context = "\nDelivery Timing:\n" + "\n".join(timing_parts) + "\n"

    system_prompt = f"""You are an expert technical hiring manager and executive talent evaluator.

Evaluate the candidate's interview response with deep intelligence and constructive feedback.

Role: {role}
Experience Level: {experience_level}
Question Category: {category}
Topic: {topic or 'General'}
{timing_context}
Question: {question}
Candidate's Answer: {answer}

EVALUATION CRITERIA (score 0.0 - 10.0 each):
- technical_accuracy: Accuracy of concepts and principles. (If candidate honestly admits 'I don't know', score technical accuracy ~2.0-3.0, but acknowledge their honesty).
- relevance: How directly it addresses the specific question asked.
- clarity: Structure, coherence, and flow of thought.
- completeness: Coverage of key factors, trade-offs, and examples.
- communication: Articulation, professional tone, and pacing.

CRITICAL REQUIREMENT:
You MUST ALWAYS provide a comprehensive, exemplary "example_answer" (the ideal model answer that an exceptional {experience_level} candidate would give) so the candidate can learn.

Return ONLY a valid JSON object:
{{
  "technical_accuracy": 7.5,
  "relevance": 8.0,
  "clarity": 7.0,
  "completeness": 6.5,
  "communication": 7.5,
  "overall_score": 7.3,
  "strengths": ["1-3 specific positive points in their response or communication"],
  "improvements": ["1-3 constructive areas to improve"],
  "missing_concepts": ["Key technical concepts, trade-offs, or details that should have been mentioned"],
  "suggestions": ["1-2 actionable tips to refine this answer for future interviews"],
  "example_answer": "A clear, well-structured, exemplary model answer demonstrating best practices."
}}"""

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": "Evaluate the answer now."}
    ]


def build_followup_decision_prompt(
    question: str,
    answer: str,
    category: str,
    enable_followup: bool,
    topics_weak: list[str],
) -> list[dict]:
    """Quick LLM call to decide if a follow-up question is appropriate."""
    system = f"""You decide if a follow-up question is appropriate after a candidate's answer.

CRITICAL RULES:
1. If the candidate said 'I don't know', 'not sure', 'skip', 'pass', 'no idea', or gave a blank answer:
   Return needs_followup = false. NEVER follow up on an unknown topic.
2. If the candidate already gave a solid or complete answer:
   Return needs_followup = false (move to a new topic).
3. Only follow up if the candidate gave an interesting partial answer with a specific intriguing gap worth exploring.

Question: {question}
Answer: {answer[:400]}

Return ONLY JSON:
{{
  "needs_followup": true|false,
  "reason": "brief reason"
}}"""

    return [{"role": "system", "content": system}, {"role": "user", "content": "Decide now."}]


def build_final_report_prompt(
    config: dict,
    questions: list[dict],
    answers_with_evaluations: list[dict],
    resume_parsed: Optional[dict] = None,
    jd_parsed: Optional[dict] = None,
) -> list[dict]:
    """Build the prompt for generating the final interview report."""

    role = config.get("target_role", "Software Engineer")
    mode = config.get("mode", "general")
    experience = config.get("experience_level", "mid")

    # Summarize Q&A
    qa_summary = []
    for item in answers_with_evaluations:
        q = item.get("question", {})
        a = item.get("answer", {})
        e = item.get("evaluation", {})
        qa_summary.append(
            f"Q: {q.get('text', '')[:100]}\n"
            f"A: {a.get('text', '')[:150]}\n"
            f"Score: {e.get('overall_score', 0):.1f}/10"
        )

    system = f"""You are generating a detailed interview performance report.

Role: {role}
Mode: {mode}
Experience Level: {experience}
Total Questions: {len(questions)}

Interview Q&A Summary:
{chr(10).join(qa_summary[:20])}

Generate a comprehensive final report. Return ONLY JSON:
{{
  "strong_topics": ["list of topics where candidate excelled"],
  "weak_topics": ["list of topics needing improvement"],
  "missing_concepts": ["important concepts the candidate consistently missed"],
  "recommendations": ["specific, actionable recommendations for improvement"],
  "preparation_plan": {{
    "immediate": ["things to study/practice this week"],
    "short_term": ["things to focus on in next 2-4 weeks"],
    "long_term": ["skills to develop over next few months"]
  }},
  "overall_assessment": "2-3 sentence overall performance summary",
  "interview_readiness": "ready|needs_improvement|not_ready"
}}"""

    return [{"role": "system", "content": system}, {"role": "user", "content": "Generate the report now."}]


def build_candidate_role_analysis_prompt(
    resume_parsed: dict,
    jd_parsed: dict,
) -> list[dict]:
    """For Resume+JD mode: analyze candidate fit and identify gaps."""
    system = f"""Analyze how well this candidate fits the job description.

Resume Summary:
- Skills: {resume_parsed.get('skills', {})}
- Experience: {resume_parsed.get('total_experience_years', 0)} years
- Summary: {resume_parsed.get('summary', '')}

Job Requirements:
- Required Skills: {jd_parsed.get('required_skills', [])}
- Preferred Skills: {jd_parsed.get('preferred_skills', [])}
- Experience Required: {jd_parsed.get('experience_required_years', 'Not specified')}
- Key Requirements: {jd_parsed.get('key_requirements', [])}

Return ONLY JSON:
{{
  "overall_fit_score": 7.5,
  "matching_strengths": ["skills/experience that match well"],
  "skill_gaps": ["required skills the candidate lacks"],
  "experience_gaps": ["experience areas to probe"],
  "areas_to_focus": ["what to focus interview questions on"],
  "assessment": "brief candidate-role fit assessment"
}}"""

    return [{"role": "system", "content": system}, {"role": "user", "content": "Analyze now."}]
