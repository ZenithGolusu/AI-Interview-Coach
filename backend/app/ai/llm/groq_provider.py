"""Groq LLM provider using OpenAI-compatible client."""
import json
import structlog
from typing import Optional
from openai import AsyncOpenAI, RateLimitError, APIStatusError
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_not_exception_type
from fastapi import HTTPException

from app.ai.llm.base import BaseLLMProvider
from app.core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


def _is_quota_error(exc: Exception) -> bool:
    """Return True if the error is a Groq rate-limit / quota-exceeded error."""
    if isinstance(exc, RateLimitError):
        return True
    if isinstance(exc, APIStatusError) and exc.status_code == 429:
        return True
    msg = str(exc).lower()
    return any(k in msg for k in ("rate limit", "quota", "insufficient", "token limit", "daily limit"))


def _raise_quota_error() -> None:
    raise HTTPException(
        status_code=429,
        detail={
            "code": "quota_exceeded",
            "message": (
                "Your AI API daily quota has been reached or your remaining credits are "
                "insufficient to start or continue a session. Please try again later or "
                "check your API plan."
            ),
        },
    )


class GroqProvider(BaseLLMProvider):
    """
    Groq LLM provider. Uses OpenAI client pointed at the Groq base URL.
    Supports GPT OSS 120B (primary) and GPT OSS 20B (fast) models.
    """

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.groq_api_key,
            base_url=settings.groq_base_url,
        )
        self.primary_model = settings.llm_primary_model    # openai/gpt-oss-120b
        self.fast_model = settings.llm_fast_model          # openai/gpt-oss-20b

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
        retry=retry_if_not_exception_type((RateLimitError, HTTPException)),
    )
    async def complete(
        self,
        messages: list[dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: Optional[dict] = None,
    ) -> str:
        """Send a chat completion request and return the text content."""
        selected_model = model or self.primary_model
        kwargs = {
            "model": selected_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format

        try:
            logger.debug("LLM request", model=selected_model, message_count=len(messages))
            response = await self.client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content
            logger.debug("LLM response received", model=selected_model, tokens=response.usage.total_tokens)
            return content
        except Exception as exc:
            if _is_quota_error(exc):
                logger.warning("Groq quota/rate-limit hit", error=str(exc))
                _raise_quota_error()
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
        retry=retry_if_not_exception_type((RateLimitError, HTTPException)),
    )
    async def complete_json(
        self,
        messages: list[dict],
        schema: Optional[dict] = None,
        model: Optional[str] = None,
        temperature: float = 0.3,
    ) -> dict:
        """
        Request a JSON structured response.
        Instructs the model to return valid JSON matching the provided schema.
        """
        selected_model = model or self.primary_model

        # Add JSON instruction to system message
        system_injection = (
            "\n\nIMPORTANT: You MUST respond with valid JSON only. "
            "Do not include markdown code blocks, explanation, or any text outside the JSON object."
        )
        if schema:
            system_injection += f"\n\nExpected JSON schema:\n{json.dumps(schema, indent=2)}"

        modified_messages = []
        has_system = False
        for msg in messages:
            if msg.get("role") == "system":
                modified_messages.append({
                    "role": "system",
                    "content": msg["content"] + system_injection
                })
                has_system = True
            else:
                modified_messages.append(msg)

        if not has_system:
            modified_messages.insert(0, {
                "role": "system",
                "content": "You are a helpful assistant." + system_injection
            })

        try:
            response = await self.client.chat.completions.create(
                model=selected_model,
                messages=modified_messages,
                temperature=temperature,
                max_tokens=4096,
                response_format={"type": "json_object"},
            )
        except Exception as exc:
            if _is_quota_error(exc):
                logger.warning("Groq quota/rate-limit hit in complete_json", error=str(exc))
                _raise_quota_error()
            raise
        content = response.choices[0].message.content
        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            logger.error("Failed to parse LLM JSON response", error=str(e), content=content[:500])
            raise ValueError(f"LLM returned invalid JSON: {e}")

    async def fast_complete(self, messages: list[dict], **kwargs) -> str:
        """Use the fast model (20B) for quick, simple tasks."""
        return await self.complete(messages, model=self.fast_model, **kwargs)

    async def fast_complete_json(self, messages: list[dict], **kwargs) -> dict:
        """Use the fast model (20B) for quick JSON tasks."""
        return await self.complete_json(messages, model=self.fast_model, **kwargs)


# ─── Singleton factory ────────────────────────────────────────────────────────

_llm_provider: Optional[GroqProvider] = None


def get_llm_provider() -> GroqProvider:
    """Return the configured LLM provider singleton."""
    global _llm_provider
    if _llm_provider is None:
        _llm_provider = GroqProvider()
    return _llm_provider
