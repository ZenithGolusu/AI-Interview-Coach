"""Speech-to-Text using Groq Whisper Large v3 Turbo."""
import io
import structlog
from pathlib import Path
from openai import AsyncOpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


class GroqSTTProvider:
    """
    Speech-to-Text provider using Groq's Whisper Large v3 Turbo.
    Accepts audio bytes and returns transcript text.
    """

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.groq_api_key,
            base_url=settings.groq_base_url,
        )
        self.model = settings.stt_model  # whisper-large-v3-turbo

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def transcribe(
        self,
        audio_bytes: bytes,
        filename: str = "audio.webm",
        language: str = "en",
    ) -> dict:
        """
        Transcribe audio bytes to text.

        Returns:
            dict with 'text' (transcript) and 'language' fields
        """
        if not audio_bytes:
            raise ValueError("Audio bytes cannot be empty")

        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename

        logger.debug("STT transcription request", model=self.model, audio_size=len(audio_bytes))

        content_type = "audio/mp4" if filename.endswith((".mp4", ".m4a")) else "audio/wav" if filename.endswith(".wav") else "audio/webm"
        transcript = await self.client.audio.transcriptions.create(
            model=self.model,
            file=(filename, audio_bytes, content_type),
            language=language if language != "english" else "en",
            response_format="verbose_json",
        )

        logger.debug("STT transcription complete", text_length=len(transcript.text))
        return {
            "text": transcript.text.strip(),
            "language": getattr(transcript, "language", language),
            "duration": getattr(transcript, "duration", None),
        }

    async def transcribe_file(self, file_path: Path, language: str = "en") -> dict:
        """Transcribe an audio file from disk."""
        audio_bytes = file_path.read_bytes()
        return await self.transcribe(audio_bytes, filename=file_path.name, language=language)


# ─── Singleton ────────────────────────────────────────────────────────────────

_stt_provider: GroqSTTProvider | None = None


def get_stt_provider() -> GroqSTTProvider:
    global _stt_provider
    if _stt_provider is None:
        _stt_provider = GroqSTTProvider()
    return _stt_provider
