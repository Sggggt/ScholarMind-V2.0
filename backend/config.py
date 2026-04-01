from __future__ import annotations
"""Global runtime configuration."""

import os
from pathlib import Path

from dotenv import load_dotenv, set_key

BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"

load_dotenv(ENV_FILE, override=True)

# Paths
REPOS_DIR = BASE_DIR / "repos"
WORKSPACE_DIR = BASE_DIR / "workspace"
WORKSPACE_DIR.mkdir(exist_ok=True)

# Defaults
DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_OPENAI_MODEL = "gpt-4o"
DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514"
DEFAULT_GPT_API_BASE = "https://api.gptsapi.net/v1"
DEFAULT_SEARCH_PROVIDER = "brave"


def _read_str(key: str, fallback: str = "") -> str:
    value = os.getenv(key)
    return value.strip() if value is not None else fallback


def _read_int(key: str, fallback: int) -> int:
    raw = os.getenv(key)
    if raw is None:
        return fallback
    try:
        return int(raw)
    except ValueError:
        return fallback


def _read_bool(key: str, fallback: bool) -> bool:
    raw = os.getenv(key)
    if raw is None:
        return fallback
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def refresh_runtime_config() -> None:
    """Reload exported module globals from the current process environment."""
    global LLM_PROVIDER
    global OPENAI_API_KEY
    global OPENAI_BASE_URL
    global OPENAI_MODEL
    global ANTHROPIC_API_KEY
    global ANTHROPIC_MODEL
    global SEARCH_PROVIDER
    global SEMANTIC_SCHOLAR_API_KEY
    global SERPER_API_KEY
    global TAVILY_API_KEY
    global BRAVE_API_KEY
    global GPT_API_KEY
    global GPT_API_BASE
    global SSH_HOST
    global SSH_PORT
    global SSH_USER
    global SSH_KEY_PATH
    global SSH_PASSWORD
    global SSH_WORK_DIR
    global SSH_CONDA_ENV
    global SSH_ENABLED
    global DATABASE_URL
    global SANDBOX_ENABLED
    global SANDBOX_IMAGE
    global SANDBOX_TIMEOUT
    global DEFAULT_MAX_PAPERS
    global DEFAULT_MAX_IDEAS
    global DEFAULT_EXPERIMENT_RETRIES
    global DEFAULT_REVIEW_ROUNDS
    global HOST
    global PORT

    LLM_PROVIDER = _read_str("LLM_PROVIDER", "openai")
    OPENAI_API_KEY = _read_str("OPENAI_API_KEY", "")
    OPENAI_BASE_URL = _read_str("OPENAI_BASE_URL", DEFAULT_OPENAI_BASE_URL)
    OPENAI_MODEL = _read_str("OPENAI_MODEL", DEFAULT_OPENAI_MODEL)

    ANTHROPIC_API_KEY = _read_str("ANTHROPIC_API_KEY", "")
    ANTHROPIC_MODEL = _read_str("ANTHROPIC_MODEL", DEFAULT_ANTHROPIC_MODEL)

    SEARCH_PROVIDER = _read_str("SEARCH_PROVIDER", DEFAULT_SEARCH_PROVIDER).lower()
    SEMANTIC_SCHOLAR_API_KEY = _read_str("SEMANTIC_SCHOLAR_API_KEY", "")
    SERPER_API_KEY = _read_str("SERPER_API_KEY", "")
    TAVILY_API_KEY = _read_str("TAVILY_API_KEY", "")
    BRAVE_API_KEY = _read_str("BRAVE_API_KEY", "")

    GPT_API_KEY = _read_str("GPT_API_KEY", "")
    GPT_API_BASE = _read_str("GPT_API_BASE", DEFAULT_GPT_API_BASE)

    SSH_HOST = _read_str("SSH_HOST", "")
    SSH_PORT = _read_int("SSH_PORT", 22)
    SSH_USER = _read_str("SSH_USER", "")
    SSH_KEY_PATH = _read_str("SSH_KEY_PATH", "")
    SSH_PASSWORD = _read_str("SSH_PASSWORD", "")
    SSH_WORK_DIR = _read_str("SSH_WORK_DIR", "/tmp/scholarmind")
    SSH_CONDA_ENV = _read_str("SSH_CONDA_ENV", "")
    SSH_ENABLED = bool(SSH_HOST and SSH_USER)

    DATABASE_URL = _read_str("DATABASE_URL", f"sqlite+aiosqlite:///{BASE_DIR / 'research.db'}")

    SANDBOX_ENABLED = _read_bool("SANDBOX_ENABLED", False)
    SANDBOX_IMAGE = _read_str("SANDBOX_IMAGE", "research-sandbox:latest")
    SANDBOX_TIMEOUT = _read_int("SANDBOX_TIMEOUT", 600)

    DEFAULT_MAX_PAPERS = _read_int("DEFAULT_MAX_PAPERS", 20)
    DEFAULT_MAX_IDEAS = _read_int("DEFAULT_MAX_IDEAS", 5)
    DEFAULT_EXPERIMENT_RETRIES = _read_int("DEFAULT_EXPERIMENT_RETRIES", 3)
    DEFAULT_REVIEW_ROUNDS = _read_int("DEFAULT_REVIEW_ROUNDS", 4)

    HOST = _read_str("HOST", "0.0.0.0")
    PORT = _read_int("PORT", 8000)


def get_runtime_settings() -> dict[str, str]:
    """Return the runtime model/provider settings exposed to the frontend."""
    return {
        "llm_provider": LLM_PROVIDER,
        "api_key": OPENAI_API_KEY,
        "model": OPENAI_MODEL,
        "provider_base_url": OPENAI_BASE_URL,
        "search_provider": SEARCH_PROVIDER,
        "env_path": str(ENV_FILE),
    }


def save_runtime_settings(settings: dict[str, str]) -> dict[str, str]:
    """Persist runtime settings into backend/.env and apply them immediately."""
    updates = {
        "LLM_PROVIDER": settings.get("llm_provider", LLM_PROVIDER).strip() or "openai",
        "OPENAI_API_KEY": settings.get("api_key", OPENAI_API_KEY).strip(),
        "OPENAI_MODEL": settings.get("model", OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL,
        "OPENAI_BASE_URL": settings.get("provider_base_url", OPENAI_BASE_URL).strip() or DEFAULT_OPENAI_BASE_URL,
        "SEARCH_PROVIDER": settings.get("search_provider", SEARCH_PROVIDER).strip().lower() or DEFAULT_SEARCH_PROVIDER,
    }

    if not ENV_FILE.exists():
        ENV_FILE.write_text("", encoding="utf-8")

    for key, value in updates.items():
        set_key(str(ENV_FILE), key, value)
        os.environ[key] = value

    refresh_runtime_config()
    return get_runtime_settings()


refresh_runtime_config()
