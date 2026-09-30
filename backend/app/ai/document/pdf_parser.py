"""PDF resume parsing and structured information extraction."""
import re
import structlog
from pathlib import Path

import pdfplumber
from app.ai.llm.groq_provider import get_llm_provider
from app.core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


def extract_text_from_pdf(file_path: str | Path) -> str:
    """Extract raw text from a PDF file using pdfplumber."""
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"PDF file not found: {file_path}")

    text_pages = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text(x_tolerance=3, y_tolerance=3)
            if page_text:
                text_pages.append(page_text)

    raw_text = "\n\n".join(text_pages)
    logger.debug("PDF text extracted", pages=len(text_pages), chars=len(raw_text))
    return raw_text


def clean_resume_text(raw_text: str) -> str:
    """Normalize and clean extracted PDF text."""
    # Remove excessive whitespace but preserve paragraph breaks
    text = re.sub(r"\n{3,}", "\n\n", raw_text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\r\n", "\n", text)
    # Remove non-printable characters
    text = re.sub(r"[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]", "", text)
    return text.strip()


async def extract_structured_info(raw_text: str) -> dict:
    """
    Use LLM to extract structured information from resume text.
    Returns: {skills, projects, experience, education, certifications, summary}
    """
    llm = get_llm_provider()

    prompt = f"""You are an expert resume parser. Extract structured information from the following resume text.

Return ONLY a valid JSON object with this exact structure:
{{
  "candidate_name": "string or null",
  "email": "string or null",
  "phone": "string or null",
  "location": "string or null",
  "summary": "brief professional summary, 2-3 sentences",
  "skills": {{
    "technical": ["list of technical skills"],
    "soft": ["list of soft skills"],
    "tools": ["list of tools and technologies"],
    "languages": ["programming languages"],
    "frameworks": ["frameworks and libraries"],
    "databases": ["databases"],
    "cloud": ["cloud platforms and services"]
  }},
  "experience": [
    {{
      "company": "company name",
      "title": "job title",
      "duration": "e.g. Jan 2022 - Dec 2023",
      "duration_months": number,
      "responsibilities": ["key responsibilities and achievements"],
      "technologies": ["technologies used"]
    }}
  ],
  "education": [
    {{
      "institution": "university/college name",
      "degree": "degree type",
      "field": "field of study",
      "year": "graduation year or expected",
      "gpa": "GPA if mentioned"
    }}
  ],
  "projects": [
    {{
      "name": "project name",
      "description": "1-2 sentence description",
      "technologies": ["technologies used"],
      "highlights": ["key achievements or features"]
    }}
  ],
  "certifications": [
    {{
      "name": "certification name",
      "issuer": "issuing organization",
      "year": "year obtained"
    }}
  ],
  "total_experience_years": number
}}

Resume text:
{raw_text[:8000]}"""

    try:
        result = await llm.complete_json(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )
        logger.info("Resume structured extraction complete", sections=list(result.keys()))
        return result
    except Exception as e:
        logger.error("Failed to extract structured resume info", error=str(e))
        # Return minimal structure on failure
        return {
            "summary": "Resume parsing failed. Using raw text.",
            "skills": {"technical": [], "soft": [], "tools": [], "languages": [], "frameworks": [], "databases": [], "cloud": []},
            "experience": [],
            "education": [],
            "projects": [],
            "certifications": [],
            "total_experience_years": 0,
        }


async def parse_job_description(raw_text: str) -> dict:
    """
    Extract structured information from a job description using LLM.
    Returns: {title, required_skills, preferred_skills, responsibilities, technologies, experience}
    """
    llm = get_llm_provider()

    prompt = f"""You are an expert job description analyzer. Extract structured information from the following job description.

Return ONLY a valid JSON object with this exact structure:
{{
  "job_title": "extracted or inferred job title",
  "company": "company name if mentioned",
  "required_skills": ["list of required technical skills"],
  "preferred_skills": ["list of preferred/nice-to-have skills"],
  "responsibilities": ["key job responsibilities"],
  "technologies": ["technologies, tools, frameworks mentioned"],
  "experience_required_years": number or null,
  "experience_level": "fresher/junior/mid/senior",
  "education_requirement": "education requirement if mentioned",
  "key_requirements": ["top 5 most important requirements for this role"],
  "domain": "industry domain e.g. fintech, healthcare, e-commerce"
}}

Job Description:
{raw_text[:6000]}"""

    try:
        result = await llm.complete_json(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )
        return result
    except Exception as e:
        logger.error("Failed to parse job description", error=str(e))
        return {
            "job_title": "Unknown",
            "required_skills": [],
            "preferred_skills": [],
            "responsibilities": [],
            "technologies": [],
            "experience_required_years": None,
            "experience_level": "mid",
            "key_requirements": [],
        }
