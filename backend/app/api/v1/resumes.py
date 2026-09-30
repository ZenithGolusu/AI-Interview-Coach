"""Resume upload and processing routes."""
import uuid
import structlog
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.config import get_settings
from app.api.deps import get_current_user
from app.models.models import User, Resume
from app.schemas.interview import ResumeResponse
from app.ai.document.pdf_parser import extract_text_from_pdf, clean_resume_text, extract_structured_info
from app.ai.rag.vectorstore import get_vector_store, chunk_resume

router = APIRouter(prefix="/resumes", tags=["Resumes"])
logger = structlog.get_logger()
settings = get_settings()


@router.post("/upload", response_model=ResumeResponse, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a PDF resume. Extracts text, parses structured data, and indexes for RAG.
    """
    # ─── Validate file ────────────────────────────────────────────────────
    if file.content_type not in ["application/pdf", "application/x-pdf"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only PDF files are accepted for resume upload",
        )

    max_size = settings.max_file_size_mb * 1024 * 1024
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds {settings.max_file_size_mb}MB limit",
        )

    if len(content) < 1000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded PDF appears to be empty or too small",
        )

    # ─── Save file to disk ────────────────────────────────────────────────
    upload_dir = Path(settings.upload_dir) / "resumes" / current_user.id
    upload_dir.mkdir(parents=True, exist_ok=True)

    resume_id = str(uuid.uuid4())
    safe_filename = f"{resume_id}_{file.filename.replace(' ', '_')}"
    file_path = upload_dir / safe_filename

    with open(file_path, "wb") as f:
        f.write(content)

    # ─── Extract and process text ─────────────────────────────────────────
    try:
        raw_text = extract_text_from_pdf(file_path)
        if not raw_text or len(raw_text.strip()) < 100:
            raise ValueError("Could not extract readable text from PDF")
        clean_text = clean_resume_text(raw_text)
    except Exception as e:
        file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to extract text from PDF: {str(e)}",
        )

    # ─── LLM-based structured extraction ─────────────────────────────────
    parsed_data = await extract_structured_info(clean_text)

    # ─── Chunk and index for RAG ──────────────────────────────────────────
    chunks, metadatas = chunk_resume(parsed_data, clean_text)
    vector_store = get_vector_store()
    store_id = f"resume_{resume_id}"
    vector_info = vector_store.create_index(chunks, metadatas, store_id)

    # ─── Persist to database ──────────────────────────────────────────────
    resume = Resume(
        id=resume_id,
        user_id=current_user.id,
        filename=file.filename,
        file_path=str(file_path),
        file_size_bytes=len(content),
        raw_text=clean_text,
        parsed_data=parsed_data,
        vector_store_path=vector_info["store_path"],
        is_processed=True,
    )
    db.add(resume)
    await db.flush()
    await db.refresh(resume)

    logger.info("Resume uploaded and processed", resume_id=resume_id, user_id=current_user.id)
    return ResumeResponse.model_validate(resume)


@router.get("/", response_model=list[ResumeResponse])
async def list_resumes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all resumes uploaded by the current user."""
    result = await db.execute(
        select(Resume).where(Resume.user_id == current_user.id).order_by(Resume.created_at.desc())
    )
    return [ResumeResponse.model_validate(r) for r in result.scalars().all()]


@router.get("/{resume_id}", response_model=ResumeResponse)
async def get_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific resume by ID."""
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return ResumeResponse.model_validate(resume)


@router.delete("/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a resume and its vector store."""
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Clean up file and vector store
    if resume.file_path:
        Path(resume.file_path).unlink(missing_ok=True)
    vector_store = get_vector_store()
    vector_store.delete_store(f"resume_{resume_id}")

    await db.delete(resume)
