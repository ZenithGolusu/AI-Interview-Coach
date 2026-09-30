"""Abstract base class for LLM providers."""
from abc import ABC, abstractmethod
from typing import Optional


class BaseLLMProvider(ABC):
    """All LLM providers must implement this interface."""

    @abstractmethod
    async def complete(
        self,
        messages: list[dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: Optional[dict] = None,
    ) -> str:
        """Return text completion from the LLM."""
        ...

    @abstractmethod
    async def complete_json(
        self,
        messages: list[dict],
        schema: Optional[dict] = None,
        model: Optional[str] = None,
        temperature: float = 0.3,
    ) -> dict:
        """Return structured JSON completion from the LLM."""
        ...
