"""Pydantic 请求/响应模型 — 与前端类型完全对齐"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


MODULE_NAMES = {
    0: "初始化",
    1: "文献调研", 2: "选题开题", 3: "Idea打分",
    4: "代码生成", 5: "实验设计", 6: "Agent实验",
    7: "结果分析", 8: "论文写作", 9: "评审打分",
}


def module_int_to_id(n: int) -> str:
    """0-9 → 'M1'-'M9' (0 → 'M1')"""
    return f"M{max(n, 1)}"


# ── 请求 ──────────────────────────────────────────────

class TaskCreateRequest(BaseModel):
    topic: str = Field(..., description="研究主题详细描述")
    description: str = Field("", description="补充描述")
    config: dict = Field(default_factory=dict, description="自定义配置覆盖")


class TaskReviewRequest(BaseModel):
    action: str = Field(..., description="approve / reject / revise")
    comment: str = Field("", description="人工反馈意见")


# ── 模块进度 ──────────────────────────────────────────

class ModuleProgress(BaseModel):
    module_id: str  # M1-M9
    status: str     # waiting / running / completed / failed / skipped
    percent: float = 0
    step: str = ""
    message: str = ""
    started_at: Optional[str] = None
    finished_at: Optional[str] = None


# ── 任务响应 (对齐前端 Task 类型) ─────────────────────

class TaskResponse(BaseModel):
    id: str
    title: str
    topic: str
    description: str = ""
    status: str
    current_module: Optional[str] = None  # "M1"-"M9"
    modules: List[ModuleProgress] = []
    created_at: str
    updated_at: str
    completed_at: Optional[str] = None
    output_url: Optional[str] = None


# ── 日志 (对齐前端 LogEntry) ─────────────────────────

class LogEntryResponse(BaseModel):
    id: str
    task_id: str
    module_id: Optional[str] = None  # "M1"-"M9"
    level: str = "info"
    message: str = ""
    timestamp: str
    metadata: Optional[dict] = None


# ── 评审结果 (对齐前端 ReviewResult) ─────────────────

class ReviewDimension(BaseModel):
    name: str
    score: float
    max_score: float
    comment: str = ""


class ReviewResultResponse(BaseModel):
    task_id: str
    overall_score: float
    decision: str  # accept / weak_accept / weak_reject / reject
    dimensions: List[ReviewDimension] = []
    summary: str = ""
    created_at: str = ""


# ── 产出物 (对齐前端 TaskOutput) ─────────────────────

class TaskOutputResponse(BaseModel):
    paper_url: Optional[str] = None
    code_url: Optional[str] = None
    data_url: Optional[str] = None
    figures: List[str] = []


# ── WebSocket 消息 (module 用字符串) ─────────────────

class WSMessage(BaseModel):
    type: str  # progress / result / need_review / error / completed
    task_id: str
    module: str = "M1"  # "M1"-"M9"
    step: str = ""
    percent: float = 0
    message: str = ""
    data: Optional[dict] = None
