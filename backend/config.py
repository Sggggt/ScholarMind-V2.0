from __future__ import annotations
"""全局配置"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

# ── 路径 ──────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
REPOS_DIR = BASE_DIR / "repos"
WORKSPACE_DIR = BASE_DIR / "workspace"  # 每个任务的工作目录
WORKSPACE_DIR.mkdir(exist_ok=True)

# ── LLM 配置 ─────────────────────────────────────────
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai")  # openai / anthropic / local
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")

# ── 搜索 / 学术 API ──────────────────────────────────
SEMANTIC_SCHOLAR_API_KEY = os.getenv("SEMANTIC_SCHOLAR_API_KEY", "")
SERPER_API_KEY = os.getenv("SERPER_API_KEY", "")  # Google搜索
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")  # Tavily搜索
BRAVE_API_KEY = os.getenv("BRAVE_API_KEY", "")    # Brave搜索

# ── GPT API (图片生成 + 实验数据生成) ──
GPT_API_KEY = os.getenv("GPT_API_KEY", "")
GPT_API_BASE = os.getenv("GPT_API_BASE", "https://api.gptsapi.net/v1")

# ── SSH 远程 GPU 服务器 ──
SSH_HOST = os.getenv("SSH_HOST", "")              # GPU服务器地址
SSH_PORT = int(os.getenv("SSH_PORT", "22"))
SSH_USER = os.getenv("SSH_USER", "")
SSH_KEY_PATH = os.getenv("SSH_KEY_PATH", "")      # SSH私钥路径
SSH_PASSWORD = os.getenv("SSH_PASSWORD", "")       # 或密码
SSH_WORK_DIR = os.getenv("SSH_WORK_DIR", "/tmp/scholarmind")  # 远程工作目录
SSH_CONDA_ENV = os.getenv("SSH_CONDA_ENV", "")    # conda环境名
SSH_ENABLED = bool(SSH_HOST and SSH_USER)

# ── 数据库 ────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{BASE_DIR / 'research.db'}")

# ── 实验沙箱 ──────────────────────────────────────────
SANDBOX_ENABLED = os.getenv("SANDBOX_ENABLED", "false").lower() == "true"
SANDBOX_IMAGE = os.getenv("SANDBOX_IMAGE", "research-sandbox:latest")
SANDBOX_TIMEOUT = int(os.getenv("SANDBOX_TIMEOUT", "600"))  # 秒

# ── 流水线默认参数 ────────────────────────────────────
DEFAULT_MAX_PAPERS = 20          # M1 文献调研最大论文数
DEFAULT_MAX_IDEAS = 5            # M3 最多生成idea数
DEFAULT_EXPERIMENT_RETRIES = 3   # M7 结果不达标最多回退次数
DEFAULT_REVIEW_ROUNDS = 4        # M9 评审轮数

# ── 服务 ──────────────────────────────────────────────
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
