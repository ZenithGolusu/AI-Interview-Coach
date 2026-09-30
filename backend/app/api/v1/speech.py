"""Speech routes: STT transcription and TTS synthesis."""
import structlog
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.config import get_settings
from app.api.deps import get_current_user
from app.models.models import User, Question
from app.ai.speech.stt.groq_stt import get_stt_provider
from app.ai.speech.tts.groq_tts import get_tts_provider

router = APIRouter(prefix="/speech", tags=["Speech"])
logger = structlog.get_logger()
settings = get_settings()


class TTSRequest(BaseModel):
    text: str
    voice_gender: str = "female"
    question_id: str | None = None


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: str = "en",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Transcribe audio to text using Groq Whisper Large v3 Turbo.
    Accepts WebM, MP4, WAV, MP3 audio files.
    """

    # Be permissive with content types since browsers vary
    content_type = audio.content_type or "audio/webm"
    if not any(t in content_type for t in ["audio", "video"]):
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported audio format. Got: {content_type}"
        )

    audio_bytes = await audio.read()
    if len(audio_bytes) < 100:
        raise HTTPException(status_code=422, detail="Audio recording is too short or empty")

    max_audio_size = 25 * 1024 * 1024  # 25MB Groq limit
    if len(audio_bytes) > max_audio_size:
        raise HTTPException(status_code=413, detail="Audio file exceeds 25MB limit")

    stt = get_stt_provider()
    try:
        result = await stt.transcribe(
            audio_bytes=audio_bytes,
            filename=audio.filename or "recording.webm",
            language=language,
        )
    except Exception as e:
        logger.error("STT transcription failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    if not result.get("text"):
        raise HTTPException(
            status_code=422,
            detail="Could not transcribe audio. Please speak clearly and try again."
        )

    return {
        "transcript": result["text"],
        "language": result.get("language", language),
        "duration": result.get("duration"),
    }


@router.post("/synthesize")
async def synthesize_speech(
    request: TTSRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Convert text to speech using Groq Orpheus English.
    Returns WAV audio bytes. Frontend plays this directly.
    """
    if not request.text or len(request.text.strip()) < 2:
        raise HTTPException(status_code=422, detail="Text cannot be empty")

    if len(request.text) > 4000:
        raise HTTPException(status_code=422, detail="Text exceeds 4000 character limit")

    voice_gender = request.voice_gender if request.voice_gender in ["male", "female"] else "female"

    tts = get_tts_provider()
    try:
        audio_bytes = await tts.synthesize(request.text, voice_gender=voice_gender)
    except Exception as e:
        logger.warning("TTS synthesis failed — returning no-audio response", error=str(e))
        # Return 204 No Content so the frontend silently skips audio
        # instead of showing an error. Interview continues in text-only mode.
        return Response(status_code=204)

    # Optionally save the audio and update the question record
    if request.question_id:
        try:
            audio_dir = Path(settings.upload_dir) / "audio" / current_user.id
            audio_dir.mkdir(parents=True, exist_ok=True)
            audio_path = audio_dir / f"{request.question_id}.wav"
            audio_path.write_bytes(audio_bytes)

            # Update question audio_url
            q_result = await db.execute(select(Question).where(Question.id == request.question_id))
            question = q_result.scalar_one_or_none()
            if question:
                question.audio_url = f"/uploads/audio/{current_user.id}/{request.question_id}.wav"
                db.add(question)
        except Exception as e:
            logger.warning("Failed to save TTS audio file", error=str(e))

    return Response(
        content=audio_bytes,
        media_type="audio/wav",
        headers={
            "Content-Length": str(len(audio_bytes)),
            "Content-Disposition": "inline; filename=question.wav",
        },
    )
