"""Text-to-Speech using Groq Orpheus English voices."""
import structlog
from typing import Literal
from openai import AsyncOpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

# Available Orpheus English voices
ORPHEUS_VOICES = {
    "female": settings.tts_voice_female,  # hannah
    "male": settings.tts_voice_male,      # daniel
}


class GroqTTSProvider:
    """
    Text-to-Speech provider using Groq's Orpheus v1 English model.
    Supports male and female AI interviewer voices.
    NOTE: Requires accepting terms at https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english
    """

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.groq_api_key,
            base_url=settings.groq_base_url,
        )
        self.model = settings.tts_model  # canopylabs/orpheus-v1-english

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def synthesize(
        self,
        text: str,
        voice_gender: Literal["male", "female"] = "female",
        voice_name: str | None = None,
    ) -> bytes:
        """
        Synthesize text to speech audio bytes (WAV/PCM format).

        Args:
            text: Text to convert to speech
            voice_gender: "male" or "female" — maps to Orpheus voice
            voice_name: Optional override for specific voice name

        Returns:
            Audio bytes (WAV format)
        """
        voice = voice_name or ORPHEUS_VOICES.get(voice_gender, ORPHEUS_VOICES["female"])

        logger.debug("TTS synthesis request", model=self.model, voice=voice, text_length=len(text))

        # Clean text for TTS (remove excessive whitespace, markdown)
        clean_text = _clean_for_tts(text)

        response = await self.client.audio.speech.create(
            model=self.model,
            voice=voice,
            input=clean_text,
            response_format="wav",
        )

        audio_bytes = response.content
        logger.debug("TTS synthesis complete", audio_size=len(audio_bytes))
        return audio_bytes

    async def synthesize_question(
        self, question_text: str, voice_gender: Literal["male", "female"] = "female"
    ) -> bytes:
        """Convenience wrapper for synthesizing interview questions."""
        return await self.synthesize(question_text, voice_gender=voice_gender)


def _clean_for_tts(text: str) -> str:
    """Remove markdown and normalize whitespace for TTS input."""
    import re
    # Remove markdown bold/italic
    text = re.sub(r"\*+([^*]+)\*+", r"\1", text)
    # Remove markdown code blocks
    text = re.sub(r"`+[^`]*`+", "", text)
    # Normalize whitespace
    text = " ".join(text.split())
    return text.strip()


# ─── Singleton ────────────────────────────────────────────────────────────────

_tts_provider: GroqTTSProvider | None = None


def get_tts_provider() -> GroqTTSProvider:
    global _tts_provider
    if _tts_provider is None:
        _tts_provider = GroqTTSProvider()
    return _tts_provider
