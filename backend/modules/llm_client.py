from __future__ import annotations
"""统一 LLM 调用客户端

支持 OpenAI 兼容 API / Anthropic / 本地模型。
所有模块通过此客户端调用大模型，方便统一管理 token 用量和切换模型。
"""

import json
import httpx

import config


async def call_llm(
    prompt: str,
    system: str = "你是一个专业的科研助手。",
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 4096,
    response_format: str | None = None,
) -> tuple[str, int]:
    """
    调用 LLM，返回 (response_text, token_usage)。
    支持 OpenAI 兼容 API 格式。
    """
    model = model or config.OPENAI_MODEL

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

    headers = {
        "Authorization": f"Bearer {config.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    max_retries = 3
    last_err = None
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=180) as client:
                resp = await client.post(
                    f"{config.OPENAI_BASE_URL}/chat/completions",
                    json=body,
                    headers=headers,
                )
                resp.raise_for_status()
                data = resp.json()
                break
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout) as e:
            last_err = e
            if attempt < max_retries - 1:
                import asyncio
                await asyncio.sleep(2 ** attempt)
            else:
                raise last_err

    text = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})
    total_tokens = usage.get("total_tokens", 0)

    return text, total_tokens


async def call_llm_json(
    prompt: str,
    system: str = "你是一个专业的科研助手。请用 JSON 格式回答。",
    **kwargs,
) -> tuple[dict, int]:
    """调用 LLM 并解析 JSON 返回"""
    text, tokens = await call_llm(prompt, system, response_format="json", **kwargs)
    # 尝试提取 JSON
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1])
    return json.loads(text), tokens
