from __future__ import annotations
"""Global runtime configuration."""

import os
from pathlib import Path, PureWindowsPath

from dotenv import load_dotenv, set_key

BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"

# Let the process environment win over backend/.env so Docker/CI can inject
# container-specific values such as AIDER_PYTHON without being overwritten.
load_dotenv(ENV_FILE, override=False)

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

DEFAULT_LOCAL_LLM_ENGINE = "lm-studio"
DEFAULT_LOCAL_LLM_SERVER_URL = "http://127.0.0.1:1234/v1"
DEFAULT_LOCAL_LLM_MODEL = "local-gguf"
DEFAULT_LOCAL_LLM_CONTEXT_SIZE = 4096
DEFAULT_LOCAL_LLM_GPU_LAYERS = 0
DEFAULT_AIDER_VENV_NAME = ".venv-aider-py311"
DEFAULT_CONTAINER_WORKDIR_ROOT = "/external-workdir"
DEFAULT_DOCKER_SHARED_WORKDIR_ROOT = "/host-project-root"
DEFAULT_DOCKER_SHARED_WORKDIR_MARKER = "Project"
LOCAL_GGUF_PROVIDER = "local-gguf"


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


def _coerce_int(value: object, fallback: int) -> int:
    if value is None:
        return fallback
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return fallback


def _infer_local_model_alias(path: str, fallback: str = "") -> str:
    candidate = (fallback or "").strip()
    if candidate:
        return candidate

    normalized_path = (path or "").strip()
    if normalized_path:
        stem = Path(normalized_path).stem.strip()
        if stem:
            return stem

    return DEFAULT_LOCAL_LLM_MODEL


def _normalize_base_url(url: str, fallback: str) -> str:
    normalized = (url or "").strip().rstrip("/")
    if not normalized:
        return fallback
    return normalized


def _normalize_path(value: str) -> str:
    normalized = (value or "").strip()
    if not normalized:
        return ""
    return str(Path(normalized).expanduser())


def _looks_like_windows_path(value: str) -> bool:
    normalized = (value or "").strip().replace("/", "\\")
    return (
        len(normalized) >= 2 and normalized[1] == ":"
    ) or normalized.startswith("\\\\")


def _try_map_host_workdir(value: str) -> Path | None:
    raw_value = (value or "").strip()
    host_root = HOST_WORKDIR_ROOT.strip()
    if not raw_value or not host_root or not CONTAINER_WORKDIR_ROOT.strip():
        return None

    try:
        if _looks_like_windows_path(raw_value) or _looks_like_windows_path(host_root):
            relative = PureWindowsPath(raw_value).relative_to(PureWindowsPath(host_root))
        else:
            relative = Path(raw_value).expanduser().resolve().relative_to(
                Path(host_root).expanduser().resolve()
            )
    except (TypeError, ValueError, OSError):
        return None

    return (Path(CONTAINER_WORKDIR_ROOT).expanduser() / Path(*relative.parts)).resolve()


def _is_running_in_docker() -> bool:
    return Path("/.dockerenv").exists() or _read_bool("RUNNING_IN_DOCKER", False)


def _try_map_docker_shared_workdir(value: str) -> Path | None:
    raw_value = (value or "").strip()
    if not raw_value or not _is_running_in_docker():
        return None

    if not _looks_like_windows_path(raw_value):
        return None

    marker = DOCKER_SHARED_WORKDIR_MARKER.strip().strip("\\/")
    container_root = DOCKER_SHARED_WORKDIR_ROOT.strip()
    if not marker or not container_root:
        return None

    windows_path = PureWindowsPath(raw_value)
    normalized_parts = [part.rstrip("\\") for part in windows_path.parts]
    marker_index = -1
    for index, part in enumerate(normalized_parts):
        if part.lower() == marker.lower():
            marker_index = index
            break

    if marker_index < 0:
        return None

    relative_parts = [part for part in normalized_parts[marker_index + 1:] if part]
    return (Path(container_root).expanduser() / Path(*relative_parts)).resolve()


def resolve_task_work_dir(value: str) -> Path:
    raw_value = (value or "").strip()
    if not raw_value:
        return Path(".").resolve()

    direct_path = Path(raw_value).expanduser()
    if direct_path.exists():
        return direct_path.resolve()

    mapped_path = _try_map_host_workdir(raw_value)
    if mapped_path is not None:
        return mapped_path

    shared_mapped_path = _try_map_docker_shared_workdir(raw_value)
    if shared_mapped_path is not None:
        return shared_mapped_path

    return direct_path.resolve(strict=False)


def default_aider_python_path() -> str:
    venv_dir = BASE_DIR / DEFAULT_AIDER_VENV_NAME
    if os.name == "nt":
        return str(venv_dir / "Scripts" / "python.exe")
    return str(venv_dir / "bin" / "python")


def is_local_gguf_provider(provider: str | None = None) -> bool:
    return (provider or LLM_PROVIDER).strip().lower() == LOCAL_GGUF_PROVIDER


def has_llm_completion_config() -> bool:
    if is_local_gguf_provider():
        return bool(OPENAI_MODEL and OPENAI_BASE_URL)
    return bool(OPENAI_API_KEY and OPENAI_MODEL and OPENAI_BASE_URL)


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
    global LOCAL_LLM_ENGINE
    global LOCAL_LLM_SERVER_URL
    global LOCAL_LLM_MODEL_PATH
    global LOCAL_LLM_MODEL_ALIAS
    global LOCAL_LLM_CONTEXT_SIZE
    global LOCAL_LLM_GPU_LAYERS
    global AIDER_PYTHON
    global AIDER_EXE
    global HOST_WORKDIR_ROOT
    global CONTAINER_WORKDIR_ROOT
    global DOCKER_SHARED_WORKDIR_ROOT
    global DOCKER_SHARED_WORKDIR_MARKER
    global HOST_LAN_IPS
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
    global PUBLIC_BASE_URL
    global NGROK_API_URL
    global AI_SCIENTIST_TIMEOUT
    global PAPERQA_TIMEOUT
    global DEFAULT_MAX_PAPERS
    global DEFAULT_MAX_IDEAS
    global DEFAULT_EXPERIMENT_RETRIES
    global DEFAULT_REVIEW_ROUNDS
    global HOST
    global PORT
    global ALLOWED_ORIGINS
    global MDNS_ENABLED

    LLM_PROVIDER = _read_str("LLM_PROVIDER", "openai")
    OPENAI_API_KEY = _read_str("OPENAI_API_KEY", "")
    OPENAI_BASE_URL = _normalize_base_url(
        _read_str("OPENAI_BASE_URL", DEFAULT_OPENAI_BASE_URL),
        DEFAULT_OPENAI_BASE_URL,
    )
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

    LOCAL_LLM_ENGINE = _read_str("LOCAL_LLM_ENGINE", DEFAULT_LOCAL_LLM_ENGINE)
    LOCAL_LLM_MODEL_PATH = _read_str("LOCAL_LLM_MODEL_PATH", "")
    LOCAL_LLM_MODEL_ALIAS = _read_str("LOCAL_LLM_MODEL_ALIAS", "")
    LOCAL_LLM_CONTEXT_SIZE = _read_int("LOCAL_LLM_CONTEXT_SIZE", DEFAULT_LOCAL_LLM_CONTEXT_SIZE)
    LOCAL_LLM_GPU_LAYERS = _read_int("LOCAL_LLM_GPU_LAYERS", DEFAULT_LOCAL_LLM_GPU_LAYERS)
    local_server_fallback = OPENAI_BASE_URL if is_local_gguf_provider(LLM_PROVIDER) else DEFAULT_LOCAL_LLM_SERVER_URL
    LOCAL_LLM_SERVER_URL = _normalize_base_url(
        _read_str("LOCAL_LLM_SERVER_URL", local_server_fallback),
        local_server_fallback,
    )
    AIDER_PYTHON = _normalize_path(_read_str("AIDER_PYTHON", ""))
    AIDER_EXE = _normalize_path(_read_str("AIDER_EXE", ""))
    HOST_WORKDIR_ROOT = _read_str("HOST_WORKDIR_ROOT", "")
    CONTAINER_WORKDIR_ROOT = _read_str("CONTAINER_WORKDIR_ROOT", DEFAULT_CONTAINER_WORKDIR_ROOT)
    DOCKER_SHARED_WORKDIR_ROOT = _read_str(
        "DOCKER_SHARED_WORKDIR_ROOT",
        DEFAULT_DOCKER_SHARED_WORKDIR_ROOT,
    )
    DOCKER_SHARED_WORKDIR_MARKER = _read_str(
        "DOCKER_SHARED_WORKDIR_MARKER",
        DEFAULT_DOCKER_SHARED_WORKDIR_MARKER,
    )
    HOST_LAN_IPS = _read_str("HOST_LAN_IPS", "")

    SSH_HOST = _read_str("SSH_HOST", "")
    SSH_PORT = _read_int("SSH_PORT", 22)
    SSH_USER = _read_str("SSH_USER", "")
    SSH_KEY_PATH = _read_str("SSH_KEY_PATH", "")
    SSH_PASSWORD = _read_str("SSH_PASSWORD", "")
    SSH_WORK_DIR = _read_str("SSH_WORK_DIR", "/tmp/scholarmind")
    SSH_CONDA_ENV = _read_str("SSH_CONDA_ENV", "")
    SSH_ENABLED = bool(SSH_HOST and SSH_USER)

    DATABASE_URL = _read_str("DATABASE_URL", f"sqlite+aiosqlite:///{BASE_DIR / 'research.db'}")
    PUBLIC_BASE_URL = _normalize_base_url(_read_str("PUBLIC_BASE_URL", ""), "")
    NGROK_API_URL = _normalize_base_url(
        _read_str("NGROK_API_URL", "http://127.0.0.1:4040/api/tunnels"),
        "http://127.0.0.1:4040/api/tunnels",
    )

    SANDBOX_ENABLED = _read_bool("SANDBOX_ENABLED", False)
    SANDBOX_IMAGE = _read_str("SANDBOX_IMAGE", "research-sandbox:latest")
    SANDBOX_TIMEOUT = _read_int("SANDBOX_TIMEOUT", 600)
    AI_SCIENTIST_TIMEOUT = _read_int("AI_SCIENTIST_TIMEOUT", 120)
    PAPERQA_TIMEOUT = _read_int("PAPERQA_TIMEOUT", 45)

    DEFAULT_MAX_PAPERS = _read_int("DEFAULT_MAX_PAPERS", 20)
    DEFAULT_MAX_IDEAS = _read_int("DEFAULT_MAX_IDEAS", 5)
    DEFAULT_EXPERIMENT_RETRIES = _read_int("DEFAULT_EXPERIMENT_RETRIES", 3)
    DEFAULT_REVIEW_ROUNDS = _read_int("DEFAULT_REVIEW_ROUNDS", 4)

    HOST = _read_str("HOST", "0.0.0.0")
    PORT = _read_int("PORT", 8000)
    ALLOWED_ORIGINS = _read_str("ALLOWED_ORIGINS", "*")
    MDNS_ENABLED = _read_bool("MDNS_ENABLED", True)


def get_runtime_settings() -> dict[str, str | int]:
    """Return the runtime model/provider settings exposed to the frontend."""
    return {
        "llm_provider": LLM_PROVIDER,
        "api_key": OPENAI_API_KEY,
        "model": OPENAI_MODEL,
        "provider_base_url": OPENAI_BASE_URL,
        "search_provider": SEARCH_PROVIDER,
        "search_api_key": _get_search_api_key(),
        "local_engine": LOCAL_LLM_ENGINE,
        "local_server_url": LOCAL_LLM_SERVER_URL,
        "local_model_path": LOCAL_LLM_MODEL_PATH,
        "local_model_alias": LOCAL_LLM_MODEL_ALIAS or OPENAI_MODEL,
        "local_context_size": LOCAL_LLM_CONTEXT_SIZE,
        "local_gpu_layers": LOCAL_LLM_GPU_LAYERS,
        "public_base_url": PUBLIC_BASE_URL,
        "env_path": str(ENV_FILE),
    }


def _get_search_api_key() -> str:
    if SEARCH_PROVIDER == "brave":
        return BRAVE_API_KEY
    if SEARCH_PROVIDER == "tavily":
        return TAVILY_API_KEY
    if SEARCH_PROVIDER == "serper":
        return SERPER_API_KEY
    return ""


def save_runtime_settings(settings: dict[str, str | int]) -> dict[str, str | int]:
    """Persist runtime settings into backend/.env and apply them immediately."""
    provider = str(settings.get("llm_provider", LLM_PROVIDER)).strip().lower() or "openai"
    search_provider = str(settings.get("search_provider", SEARCH_PROVIDER)).strip().lower() or DEFAULT_SEARCH_PROVIDER

    local_engine = str(settings.get("local_engine", LOCAL_LLM_ENGINE)).strip() or DEFAULT_LOCAL_LLM_ENGINE
    local_model_path = str(settings.get("local_model_path", LOCAL_LLM_MODEL_PATH)).strip()
    local_model_alias = _infer_local_model_alias(
        local_model_path,
        str(settings.get("local_model_alias", LOCAL_LLM_MODEL_ALIAS)).strip(),
    )
    local_server_url = _normalize_base_url(
        str(settings.get("local_server_url", LOCAL_LLM_SERVER_URL)).strip(),
        DEFAULT_LOCAL_LLM_SERVER_URL,
    )
    local_context_size = _coerce_int(settings.get("local_context_size"), LOCAL_LLM_CONTEXT_SIZE)
    local_gpu_layers = _coerce_int(settings.get("local_gpu_layers"), LOCAL_LLM_GPU_LAYERS)

    requested_model = str(settings.get("model", OPENAI_MODEL)).strip()
    requested_api_key = str(settings.get("api_key", OPENAI_API_KEY)).strip()
    requested_base_url = str(settings.get("provider_base_url", OPENAI_BASE_URL)).strip()

    if provider == LOCAL_GGUF_PROVIDER:
        effective_model = _infer_local_model_alias(local_model_path, requested_model or local_model_alias)
        effective_base_url = local_server_url
        effective_api_key = requested_api_key or "not-needed"
    else:
        effective_model = requested_model or DEFAULT_OPENAI_MODEL
        effective_base_url = _normalize_base_url(requested_base_url, DEFAULT_OPENAI_BASE_URL)
        effective_api_key = requested_api_key

    updates = {
        "LLM_PROVIDER": provider,
        "OPENAI_API_KEY": effective_api_key,
        "OPENAI_MODEL": effective_model,
        "OPENAI_BASE_URL": effective_base_url,
        "SEARCH_PROVIDER": search_provider,
        "LOCAL_LLM_ENGINE": local_engine,
        "LOCAL_LLM_SERVER_URL": local_server_url,
        "LOCAL_LLM_MODEL_PATH": local_model_path,
        "LOCAL_LLM_MODEL_ALIAS": local_model_alias,
        "LOCAL_LLM_CONTEXT_SIZE": str(max(local_context_size, 512)),
        "LOCAL_LLM_GPU_LAYERS": str(max(local_gpu_layers, 0)),
        "PUBLIC_BASE_URL": _normalize_base_url(
            str(settings.get("public_base_url", PUBLIC_BASE_URL)).strip(),
            "",
        ),
    }

    search_api_key = str(settings.get("search_api_key", "")).strip()
    if search_provider == "brave":
        updates["BRAVE_API_KEY"] = search_api_key
    elif search_provider == "tavily":
        updates["TAVILY_API_KEY"] = search_api_key
    elif search_provider == "serper":
        updates["SERPER_API_KEY"] = search_api_key

    if not ENV_FILE.exists():
        ENV_FILE.write_text("", encoding="utf-8")

    for key, value in updates.items():
        set_key(str(ENV_FILE), key, value)
        os.environ[key] = value

    refresh_runtime_config()
    return get_runtime_settings()


refresh_runtime_config()
