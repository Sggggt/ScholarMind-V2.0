from __future__ import annotations

"""Task-scoped runtime configuration helpers."""

from contextvars import ContextVar, Token
from typing import Any, Mapping

import config

RUNTIME_SETTINGS_KEY = "runtime_settings"

_runtime_settings_var: ContextVar[dict[str, Any] | None] = ContextVar(
    "task_runtime_settings",
    default=None,
)


def capture_current_runtime_settings() -> dict[str, Any]:
    """Snapshot the mutable provider/search settings for a task."""
    return {
        "llm_provider": config.LLM_PROVIDER,
        "openai_api_key": config.OPENAI_API_KEY,
        "openai_base_url": config.OPENAI_BASE_URL,
        "openai_model": config.OPENAI_MODEL,
        "aider_python": getattr(config, "AIDER_PYTHON", ""),
        "aider_exe": getattr(config, "AIDER_EXE", ""),
        "anthropic_api_key": config.ANTHROPIC_API_KEY,
        "anthropic_model": config.ANTHROPIC_MODEL,
        "search_provider": config.SEARCH_PROVIDER,
        "semantic_scholar_api_key": config.SEMANTIC_SCHOLAR_API_KEY,
        "serper_api_key": config.SERPER_API_KEY,
        "tavily_api_key": config.TAVILY_API_KEY,
        "brave_api_key": config.BRAVE_API_KEY,
        "gpt_api_key": config.GPT_API_KEY,
        "gpt_api_base": config.GPT_API_BASE,
        "local_engine": getattr(config, "LOCAL_LLM_ENGINE", ""),
        "local_server_url": getattr(config, "LOCAL_LLM_SERVER_URL", ""),
        "local_model_path": getattr(config, "LOCAL_LLM_MODEL_PATH", ""),
        "local_model_alias": getattr(config, "LOCAL_LLM_MODEL_ALIAS", ""),
        "local_context_size": getattr(config, "LOCAL_LLM_CONTEXT_SIZE", 4096),
        "local_gpu_layers": getattr(config, "LOCAL_LLM_GPU_LAYERS", 0),
    }


def _normalize_snapshot(snapshot: Mapping[str, Any] | None) -> dict[str, Any]:
    current = capture_current_runtime_settings()
    if not snapshot:
        return current

    normalized = dict(current)
    for key, value in snapshot.items():
        normalized[key] = value

    return normalized


def ensure_runtime_settings(task_config: dict[str, Any] | None) -> dict[str, Any]:
    config_payload = dict(task_config or {})
    snapshot = _normalize_snapshot(config_payload.get(RUNTIME_SETTINGS_KEY))
    config_payload[RUNTIME_SETTINGS_KEY] = snapshot
    return config_payload


def resolve_runtime_settings(task_config: Mapping[str, Any] | None) -> dict[str, Any]:
    if not task_config:
        return capture_current_runtime_settings()
    return _normalize_snapshot(task_config.get(RUNTIME_SETTINGS_KEY))


def bind_runtime_settings(snapshot: Mapping[str, Any] | None) -> Token:
    return _runtime_settings_var.set(_normalize_snapshot(snapshot))


def reset_runtime_settings(token: Token) -> None:
    _runtime_settings_var.reset(token)


def current_runtime_settings() -> dict[str, Any]:
    snapshot = _runtime_settings_var.get()
    if snapshot is None:
        return capture_current_runtime_settings()
    return snapshot


def get_llm_provider() -> str:
    return str(current_runtime_settings().get("llm_provider", config.LLM_PROVIDER)).strip()


def get_openai_api_key() -> str:
    return str(current_runtime_settings().get("openai_api_key", config.OPENAI_API_KEY))


def get_openai_base_url() -> str:
    return str(current_runtime_settings().get("openai_base_url", config.OPENAI_BASE_URL)).rstrip("/")


def get_openai_model() -> str:
    return str(current_runtime_settings().get("openai_model", config.OPENAI_MODEL)).strip()


def get_aider_python() -> str:
    return str(current_runtime_settings().get("aider_python", getattr(config, "AIDER_PYTHON", ""))).strip()


def get_aider_exe() -> str:
    return str(current_runtime_settings().get("aider_exe", getattr(config, "AIDER_EXE", ""))).strip()


def get_search_provider() -> str:
    return str(current_runtime_settings().get("search_provider", config.SEARCH_PROVIDER)).strip().lower()


def get_semantic_scholar_api_key() -> str:
    return str(current_runtime_settings().get("semantic_scholar_api_key", config.SEMANTIC_SCHOLAR_API_KEY))


def get_serper_api_key() -> str:
    return str(current_runtime_settings().get("serper_api_key", config.SERPER_API_KEY))


def get_tavily_api_key() -> str:
    return str(current_runtime_settings().get("tavily_api_key", config.TAVILY_API_KEY))


def get_brave_api_key() -> str:
    return str(current_runtime_settings().get("brave_api_key", config.BRAVE_API_KEY))


def get_gpt_api_key() -> str:
    return str(current_runtime_settings().get("gpt_api_key", config.GPT_API_KEY))


def get_gpt_api_base() -> str:
    return str(current_runtime_settings().get("gpt_api_base", config.GPT_API_BASE)).rstrip("/")
