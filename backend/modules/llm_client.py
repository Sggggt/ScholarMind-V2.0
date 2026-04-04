from __future__ import annotations

"""Unified LLM client."""

import asyncio
import json
import random
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

from runtime_config import get_openai_api_key, get_openai_base_url, get_openai_model


def _chat_completions_url() -> str:
    return f"{get_openai_base_url()}/chat/completions"


def _request_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    api_key = get_openai_api_key().strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _is_retryable_status(status_code: int) -> bool:
    return status_code in {408, 409, 429, 500, 502, 503, 504}


def _parse_retry_after(value: str | None) -> float | None:
    raw = (value or "").strip()
    if not raw:
        return None

    try:
        return max(float(raw), 0.0)
    except ValueError:
        pass

    try:
        retry_at = parsedate_to_datetime(raw)
    except (TypeError, ValueError, IndexError, OverflowError):
        return None

    if retry_at.tzinfo is None:
        retry_at = retry_at.replace(tzinfo=timezone.utc)

    return max((retry_at - datetime.now(timezone.utc)).total_seconds(), 0.0)


def _compute_retry_delay(attempt: int, response: httpx.Response | None = None) -> float:
    retry_after = _parse_retry_after(response.headers.get("Retry-After") if response else None)
    if retry_after is not None:
        return min(retry_after, 60.0)

    backoff = min(60.0, float(2**attempt))
    jitter = random.uniform(0.0, 0.5)
    return backoff + jitter


async def call_llm(
    prompt: str,
    system: str = "You are a professional research assistant.",
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 4096,
    response_format: str | None = None,
) -> tuple[str, int]:
    """
    Call the configured LLM and return (response_text, token_usage).

    All runtime providers are normalized into an OpenAI-compatible endpoint.
    """
    model = model or get_openai_model()

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    body = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_format == "json":
        body["response_format"] = {"type": "json_object"}

    max_retries = 6
    last_err: Exception | None = None

    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=30.0)) as client:
                resp = await client.post(
                    _chat_completions_url(),
                    json=body,
                    headers=_request_headers(),
                )
                resp.raise_for_status()
                data = resp.json()
                break
        except httpx.HTTPStatusError as err:
            last_err = err
            status_code = err.response.status_code if err.response is not None else None
            if status_code is not None and _is_retryable_status(status_code) and attempt < max_retries - 1:
                await asyncio.sleep(_compute_retry_delay(attempt, err.response))
                continue
            raise
        except (
            httpx.ConnectError,
            httpx.ReadTimeout,
            httpx.ConnectTimeout,
            httpx.RemoteProtocolError,
            httpx.NetworkError,
        ) as err:
            last_err = err
            if attempt < max_retries - 1:
                await asyncio.sleep(_compute_retry_delay(attempt))
                continue
            raise
    else:
        if last_err is not None:
            raise last_err
        raise RuntimeError("LLM request failed without an explicit exception")

    text = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})
    total_tokens = usage.get("total_tokens", 0)

    return text, total_tokens


async def call_llm_json(
    prompt: str,
    system: str = "You are a professional research assistant. Reply in JSON.",
    **kwargs,
) -> tuple[dict, int]:
    """Call the configured LLM and parse a JSON response."""
    text, tokens = await call_llm(prompt, system, response_format="json", **kwargs)
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1])
    return json.loads(text), tokens
