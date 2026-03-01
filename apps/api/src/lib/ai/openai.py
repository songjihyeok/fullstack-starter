"""OpenAI provider implementation for structured generation."""

from collections.abc import AsyncIterator
from typing import Any

import httpx
import structlog

from src.lib.ai.base import AIProvider
from src.lib.config import settings

logger = structlog.get_logger(__name__)

# Base URL and default model
_BASE_URL = "https://api.openai.com/v1"
_DEFAULT_MODEL = "gpt-4o"
_VISION_MODEL = "gpt-4o"
_TIMEOUT = 120.0


class OpenAIProvider[T](AIProvider[T]):
    """OpenAI-backed AI provider using httpx (no vendor SDK dependency)."""

    def __init__(self, api_key: str | None = None, model: str = _DEFAULT_MODEL) -> None:
        self._api_key = api_key or settings.OPENAI_API_KEY
        if not self._api_key:
            raise ValueError("OPENAI_API_KEY is required")
        self._model = model
        self._headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    # ── Core chat completion (internal) ──────────────────────────────────

    async def _chat(
        self,
        messages: list[dict[str, Any]],
        *,
        response_format: dict | None = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
    ) -> str:
        body: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            body["response_format"] = response_format

        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{_BASE_URL}/chat/completions",
                headers=self._headers,
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()

        content: str = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        logger.info(
            "openai_call",
            model=self._model,
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
        )
        return content

    # ── AIProvider interface ─────────────────────────────────────────────

    async def analyze_image(self, image_data: bytes | list[bytes]) -> T:  # type: ignore[override]
        """Send image(s) to GPT-4o vision for OCR / analysis."""
        import base64

        images = image_data if isinstance(image_data, list) else [image_data]
        content: list[dict[str, Any]] = [
            {"type": "text", "text": "Extract all text from this exam image. Preserve question numbers, choices, and any markings."}
        ]
        for img in images:
            b64 = base64.b64encode(img).decode()
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"},
                }
            )

        messages = [{"role": "user", "content": content}]
        result = await self._chat(messages, max_tokens=8192)
        return result  # type: ignore[return-value]

    async def generate_text(self, prompt: str, **kwargs: Any) -> str:
        system = kwargs.pop("system", "You are a helpful assistant.")
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
        return await self._chat(messages, **kwargs)

    async def generate_stream(self, prompt: str, **kwargs: Any) -> AsyncIterator[str]:
        raise NotImplementedError("Streaming not needed for exam pipeline")

    async def generate_structured(
        self,
        prompt: str,
        schema: type[T],  # type: ignore[override]
        **kwargs: Any,
    ) -> T:
        """Generate a response and parse it into a Pydantic model.

        Uses json_object response format + schema instructions in the system
        prompt so the model returns parseable JSON.
        """
        import json

        system = kwargs.pop("system", "You are a helpful assistant.")
        # Append schema hint so the model knows the target shape
        schema_json = json.dumps(schema.model_json_schema(), indent=2)  # type: ignore[union-attr]
        system += f"\n\nYou MUST respond with valid JSON matching this schema:\n{schema_json}"

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
        raw = await self._chat(
            messages,
            response_format={"type": "json_object"},
            **kwargs,
        )
        return schema.model_validate_json(raw)  # type: ignore[union-attr]


def get_openai_provider(model: str = _DEFAULT_MODEL) -> OpenAIProvider:
    """Factory function for dependency injection."""
    return OpenAIProvider(model=model)
