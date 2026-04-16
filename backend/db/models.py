"""数据库 ORM 模型"""

from typing import Optional, List
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Integer, Float, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


def _uuid():
    return uuid.uuid4().hex[:12]


class Task(Base):
    """研究任务"""
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(200))
    topic: Mapped[str] = mapped_column(Text)                    # 研究主题描述
    domain: Mapped[str] = mapped_column(String(100), default="")  # 研究领域
    status: Mapped[str] = mapped_column(String(20), default="pending")
    # pending / running / paused / review / completed / failed / aborted
    current_module: Mapped[int] = mapped_column(Integer, default=0)   # 0=未开始, 1-9
    current_step: Mapped[str] = mapped_column(String(100), default="")
    progress: Mapped[float] = mapped_column(Float, default=0.0)       # 0-100
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    config: Mapped[dict] = mapped_column(JSON, default=dict)          # 任务级自定义配置
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    # 关系
    logs: Mapped[List["TraceLog"]] = relationship(back_populates="task", cascade="all, delete-orphan")
    outputs: Mapped[List["TaskOutput"]] = relationship(back_populates="task", cascade="all, delete-orphan")
    chat_sessions: Mapped[List["ChatSession"]] = relationship(back_populates="task")
    agent_runs: Mapped[List["AgentRun"]] = relationship(back_populates="task", cascade="all, delete-orphan")


class TraceLog(Base):
    """全程追溯日志"""
    __tablename__ = "trace_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[str] = mapped_column(String(12), ForeignKey("tasks.id"))
    module: Mapped[int] = mapped_column(Integer)       # 1-9
    module_name: Mapped[str] = mapped_column(String(50))
    step: Mapped[str] = mapped_column(String(200))
    level: Mapped[str] = mapped_column(String(10), default="info")  # info/warn/error/debug
    message: Mapped[str] = mapped_column(Text, default="")
    input_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    output_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    token_usage: Mapped[int] = mapped_column(Integer, default=0)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    task: Mapped["Task"] = relationship(back_populates="logs")


class TaskOutput(Base):
    """任务产出物"""
    __tablename__ = "task_outputs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[str] = mapped_column(String(12), ForeignKey("tasks.id"))
    module: Mapped[int] = mapped_column(Integer)
    output_type: Mapped[str] = mapped_column(String(50))
    # literature_review / gap_analysis / ideas / code_repo / experiment_results
    # analysis_report / paper_pdf / paper_latex / review_scores
    file_path: Mapped[str] = mapped_column(Text, default="")
    content: Mapped[str] = mapped_column(Text, default="")      # 短内容直接存
    extra_data: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    task: Mapped["Task"] = relationship(back_populates="outputs")


class ChatSession(Base):
    """对话会话，可选绑定一个研究任务。"""

    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(200), default="New research conversation")
    summary: Mapped[str] = mapped_column(Text, default="")
    task_id: Mapped[Optional[str]] = mapped_column(String(12), ForeignKey("tasks.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    task: Mapped[Optional["Task"]] = relationship(back_populates="chat_sessions")
    messages: Mapped[List["ChatMessage"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )


class ChatMessage(Base):
    """会话消息。"""

    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(12), ForeignKey("chat_sessions.id"))
    role: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(20), default="text")
    content: Mapped[str] = mapped_column(Text, default="")
    extra_data: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    session: Mapped["ChatSession"] = relationship(back_populates="messages")


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[str] = mapped_column(String(12), ForeignKey("tasks.id"), index=True)
    cycle_key: Mapped[str] = mapped_column(String(64), default="", index=True)
    cycle_revision: Mapped[int] = mapped_column(Integer, default=1)
    phase: Mapped[str] = mapped_column(String(32), default="m4")
    status: Mapped[str] = mapped_column(String(20), default="running")
    project_dir: Mapped[str] = mapped_column(Text, default="")
    active_root_agent_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    root_decision: Mapped[dict] = mapped_column(JSON, default=dict)
    latest_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    task: Mapped["Task"] = relationship(back_populates="agent_runs")
    agent_tasks: Mapped[List["AgentTask"]] = relationship(back_populates="run", cascade="all, delete-orphan")
    agent_events: Mapped[List["AgentEvent"]] = relationship(back_populates="run", cascade="all, delete-orphan")


class AgentTask(Base):
    __tablename__ = "agent_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(Integer, ForeignKey("agent_runs.id"), index=True)
    task_id: Mapped[str] = mapped_column(String(12), ForeignKey("tasks.id"), index=True)
    agent_key: Mapped[str] = mapped_column(String(80), default="", index=True)
    parent_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("agent_tasks.id"), nullable=True)
    role: Mapped[str] = mapped_column(String(40), default="")
    phase: Mapped[str] = mapped_column(String(32), default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    ownership: Mapped[dict] = mapped_column(JSON, default=dict)
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    artifact_refs: Mapped[dict] = mapped_column(JSON, default=dict)
    error_fingerprint: Mapped[str] = mapped_column(Text, default="")
    last_message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    run: Mapped["AgentRun"] = relationship(back_populates="agent_tasks")
    parent: Mapped[Optional["AgentTask"]] = relationship(remote_side="AgentTask.id")


class AgentEvent(Base):
    __tablename__ = "agent_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(Integer, ForeignKey("agent_runs.id"), index=True)
    task_id: Mapped[str] = mapped_column(String(12), ForeignKey("tasks.id"), index=True)
    agent_task_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("agent_tasks.id"), nullable=True)
    module: Mapped[int] = mapped_column(Integer, default=0)
    phase: Mapped[str] = mapped_column(String(32), default="")
    kind: Mapped[str] = mapped_column(String(32), default="event")
    level: Mapped[str] = mapped_column(String(10), default="info")
    message: Mapped[str] = mapped_column(Text, default="")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    run: Mapped["AgentRun"] = relationship(back_populates="agent_events")
