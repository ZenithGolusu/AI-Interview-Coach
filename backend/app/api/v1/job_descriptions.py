"""Job description processing routes."""
import uuid
import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.models import User, JobDescription
from app.schemas.interview import JobDescriptionCreateRequest, JobDescriptionResponse
from app.ai.document.pdf_parser import parse_job_description
from app.ai.rag.vectorstore import get_vector_store, chunk_job_description

router = APIRouter(prefix="/job-descriptions", tags=["Job Descriptions"])
logger = structlog.get_logger()


@router.post("/", response_model=JobDescriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_job_description(
    request: JobDescriptionCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a job description for parsing and RAG indexing."""
    jd_id = str(uuid.uuid4())

    # Parse structured data from JD text
    parsed_data = await parse_job_description(request.raw_text)

    # Chunk and index for RAG retrieval
    chunks, metadatas = chunk_job_description(parsed_data, request.raw_text)
    vector_store = get_vector_store()
    store_id = f"jd_{jd_id}"
    vector_info = vector_store.create_index(chunks, metadatas, store_id)

    jd = JobDescription(
        id=jd_id,
        user_id=current_user.id,
        raw_text=request.raw_text,
        parsed_data=parsed_data,
        vector_store_path=vector_info["store_path"],
        is_processed=True,
    )
    db.add(jd)
    await db.flush()
    await db.refresh(jd)

    logger.info("Job description created", jd_id=jd_id, title=parsed_data.get("job_title"))
    return JobDescriptionResponse.model_validate(jd)


@router.get("/", response_model=list[JobDescriptionResponse])
async def list_job_descriptions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(JobDescription)
        .where(JobDescription.user_id == current_user.id)
        .order_by(JobDescription.created_at.desc())
        .limit(20)
    )
    return [JobDescriptionResponse.model_validate(jd) for jd in result.scalars().all()]


@router.get("/{jd_id}", response_model=JobDescriptionResponse)
async def get_job_description(
    jd_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(JobDescription).where(
            JobDescription.id == jd_id, JobDescription.user_id == current_user.id
        )
    )
    jd = result.scalar_one_or_none()
    if not jd:
        raise HTTPException(status_code=404, detail="Job description not found")
    return JobDescriptionResponse.model_validate(jd)
