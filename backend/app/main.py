"""FastAPI application entry point with middleware and route registration."""
import structlog
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.core.config import get_settings
from app.core.database import create_tables
from app.api.v1 import auth, resumes, job_descriptions, interviews, speech, dashboard

logger = structlog.get_logger()
settings = get_settings()

# Rate limiter
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    logger.info("Starting AI Interview Coach API", env=settings.app_env)

    # Create upload directories
    for subdir in ["resumes", "audio", "reports"]:
        Path(settings.upload_dir).joinpath(subdir).mkdir(parents=True, exist_ok=True)

    # Create vector store base directory
    Path(settings.vector_store_path).mkdir(parents=True, exist_ok=True)

    # Always create database tables on startup (safe: does nothing if tables already exist)
    await create_tables()
    logger.info("Database tables created/verified")

    yield

    logger.info("Shutting down AI Interview Coach API")


# ─── FastAPI App ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="AI Interview Coach API",
    description="Production-quality AI-powered mock interview platform with voice interaction and RAG personalization.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── Middleware ───────────────────────────────────────────────────────────────

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Static file serving for uploads ─────────────────────────────────────────

upload_path = Path(settings.upload_dir)
upload_path.mkdir(parents=True, exist_ok=True)
# Guard: only mount if directory exists (always true after mkdir above)
if upload_path.exists():
    app.mount("/uploads", StaticFiles(directory=str(upload_path)), name="uploads")

# ─── Routes ───────────────────────────────────────────────────────────────────

API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(resumes.router, prefix=API_PREFIX)
app.include_router(job_descriptions.router, prefix=API_PREFIX)
app.include_router(interviews.router, prefix=API_PREFIX)
app.include_router(speech.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)


# ─── Global error handlers ────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception", path=request.url.path, error=str(exc), exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred. Please try again."},
    )


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "1.0.0", "service": "AI Interview Coach"}
