from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import config
from modules.llm_client import call_llm_json
from services.task_service import (
    abort_task_execution,
    create_task_and_start,
    pause_task_execution,
    resume_task_execution,
)

from db.models import ChatMessage, ChatSession, Task
from sqlalchemy.ext.asyncio import AsyncSession


TASK_STAGE_ACTIONS = [
    {"label": "View Workflow", "path": "/workflow"},
    {"label": "Open Literature", "path": "/literature"},
    {"label": "Open Run Log", "path": "/agent-run"},
]


CONTROL_KEYWORDS = {
    "pause": ("pause", "暂停", "先停", "stop for now"),
    "resume": ("resume", "继续", "恢复", "接着跑"),
    "abort": ("abort", "终止", "停止任务", "取消任务", "结束任务"),
}

GENERIC_SESSION_TITLES = {
    "new research conversation",
    "research conversation",
    "new conversation",
}


STATUS_KEYWORDS = ("progress", "status", "进展", "状态", "到哪", "进行到", "现在怎么样")
QUESTION_MARKERS = ("?", "？", "how", "what", "why", "可以", "能否", "怎么")


@dataclass
class AgentDecision:
    assistant_reply: str
    should_create_task: bool = False
    control_action: str | None = None
    title: str = ""
    topic: str = ""
    description: str = ""
    quick_actions: list[dict[str, str]] = field(default_factory=list)


def _clip(text: str, limit: int = 120) -> str:
    clean = " ".join(text.split())
    if len(clean) <= limit:
        return clean
    return f"{clean[: limit - 1].rstrip()}…"


def _merge_description_context(base: str, extra: str) -> str:
    base_clean = (base or "").strip()
    extra_clean = (extra or "").strip()

    if not extra_clean:
        return base_clean
    if not base_clean:
        return extra_clean
    if extra_clean in base_clean:
        return base_clean

    return f"{base_clean}\n\nConversation context:\n{extra_clean}"


def _normalize_title_candidate(title: str) -> str:
    normalized = " ".join((title or "").split()).strip()
    if not normalized:
        return ""
    if normalized.lower() in GENERIC_SESSION_TITLES:
        return ""
    return normalized


def _stage_name(task: Task | None) -> str:
    current_module = task.current_module if task else 0
    stage_map = {
        0: "Planning",
        1: "Literature Review",
        2: "Gap Analysis",
        3: "Idea Scoring",
        4: "Code Generation",
        5: "Experiment Design",
        6: "Agent Experiment",
        7: "Result Analysis",
        8: "Paper Writing",
        9: "Review",
    }
    return stage_map.get(current_module, "Workflow")


def _task_status_summary(task: Task) -> str:
    return (
        f"Current task \"{task.title}\" is {task.status}. "
        f"Stage: {_stage_name(task)}. Progress: {int(task.progress or 0)}%."
    )


def _default_welcome_message() -> str:
    return (
        "Tell me your research goal, constraints, and expected outputs. "
        "I can clarify the plan in conversation and create a real workflow task when the brief is ready."
    )


def _looks_like_create_request(content: str) -> bool:
    lowered = content.lower()
    create_markers = (
        "create task",
        "start research",
        "run this",
        "开始研究",
        "创建任务",
        "启动任务",
        "开始跑",
        "开始做",
    )
    if any(marker in lowered for marker in create_markers):
        return True
    return len(content.strip()) >= 24 and not any(marker in lowered for marker in QUESTION_MARKERS)


def _detect_control_action(content: str) -> str | None:
    lowered = content.lower()
    for action, keywords in CONTROL_KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return action
    return None


def _fallback_decision(content: str, session: ChatSession, task: Task | None, task_description: str) -> AgentDecision:
    control_action = _detect_control_action(content) if task else None
    if control_action == "pause":
        return AgentDecision(
            assistant_reply="I will pause the current workflow task and keep the conversation context intact.",
            control_action="pause",
        )
    if control_action == "resume":
        return AgentDecision(
            assistant_reply="I will resume the current workflow task and continue monitoring progress here.",
            control_action="resume",
        )
    if control_action == "abort":
        return AgentDecision(
            assistant_reply="I will stop the current workflow task. You can still discuss changes and start a new run later.",
            control_action="abort",
        )

    lowered = content.lower()
    if task and any(keyword in lowered for keyword in STATUS_KEYWORDS):
        return AgentDecision(
            assistant_reply=(
                f"{_task_status_summary(task)} You can ask me to pause, resume, inspect artifacts, or start a fresh task."
            ),
            quick_actions=TASK_STAGE_ACTIONS,
        )

    if not task and _looks_like_create_request(content):
        title = _clip(content, 48)
        return AgentDecision(
            assistant_reply=(
                "Your brief is specific enough. I am creating a workflow task now and will keep using this conversation "
                "as the control surface for the run."
            ),
            should_create_task=True,
            title=title,
            topic=content.strip(),
            description=task_description.strip(),
            quick_actions=TASK_STAGE_ACTIONS,
        )

    if task:
        return AgentDecision(
            assistant_reply=(
                f"{_task_status_summary(task)} If you want a concrete action, ask me to pause, resume, stop, "
                "summarize results, or start a new task."
            ),
            quick_actions=TASK_STAGE_ACTIONS,
        )

    title = session.title if session.title and session.title != "New research conversation" else "this research plan"
    return AgentDecision(
        assistant_reply=(
            f"I can help shape {title}. Tell me the research question, target domain, constraints, data or tools you want "
            "to use, and the deliverables you expect. Once the brief is concrete enough, I will create the workflow task automatically."
        ),
    )


async def _llm_decision(
    content: str,
    session: ChatSession,
    task: Task | None,
    task_description: str,
) -> AgentDecision | None:
    if not config.has_llm_completion_config():
        return None

    history_lines = []
    for message in session.messages[-8:]:
        history_lines.append(f"{message.role.upper()}: {message.content.strip()}")

    task_snapshot = _task_status_summary(task) if task else "No task is linked yet."
    prompt = f"""
You are ScholarMind's conversation controller.

Decide how to respond to the latest user message.

Rules:
1. Keep the assistant reply concise, direct, and natural.
2. If there is no linked task, only create a task when the brief is sufficiently concrete or the user explicitly asks to start.
3. If a task exists, prefer helping the user control or understand that task instead of creating another one.
4. Only use one control action from: pause, resume, abort, or null.
5. Return valid JSON only.

Session title: {session.title}
Task snapshot: {task_snapshot}
Default task description template result: {task_description or "(empty)"}

Recent conversation:
{chr(10).join(history_lines) if history_lines else "(no prior messages)"}

Latest user message:
{content}

Return JSON with keys:
assistant_reply: string
should_create_task: boolean
control_action: string or null
title: string
topic: string
description: string
""".strip()

    try:
        payload, _ = await call_llm_json(
            prompt=prompt,
            system="You control a research conversation and must reply with strict JSON.",
            temperature=0.2,
            max_tokens=600,
        )
    except Exception:
        return None

    assistant_reply = str(payload.get("assistant_reply", "")).strip()
    if not assistant_reply:
        return None

    should_create_task = bool(payload.get("should_create_task", False))
    control_action = payload.get("control_action") or None
    if control_action not in {"pause", "resume", "abort", None}:
        control_action = None

    title = _normalize_title_candidate(str(payload.get("title", "")).strip())
    topic = str(payload.get("topic", "")).strip()
    description = str(payload.get("description", "")).strip()

    if task:
        should_create_task = False

    if should_create_task and not topic:
        topic = content.strip()

    return AgentDecision(
        assistant_reply=assistant_reply,
        should_create_task=should_create_task,
        control_action=control_action,
        title=title,
        topic=topic,
        description=description or task_description.strip(),
        quick_actions=TASK_STAGE_ACTIONS if (task or should_create_task) else [],
    )


async def create_chat_session(db: AsyncSession, title: str = "") -> ChatSession:
    session = ChatSession(title=title.strip() or "New research conversation")
    db.add(session)
    await db.flush()

    welcome = ChatMessage(
        session_id=session.id,
        role="assistant",
        kind="text",
        content=_default_welcome_message(),
        extra_data={},
    )
    db.add(welcome)
    await db.commit()
    await db.refresh(session)
    return session


async def append_message(
    db: AsyncSession,
    *,
    session_id: str,
    role: str,
    content: str,
    kind: str = "text",
    metadata: dict[str, Any] | None = None,
) -> ChatMessage:
    message = ChatMessage(
        session_id=session_id,
        role=role,
        kind=kind,
        content=content.strip(),
        extra_data=metadata or {},
    )
    db.add(message)
    await db.flush()
    return message


async def process_user_message(
    db: AsyncSession,
    *,
    session: ChatSession,
    content: str,
    task_description: str = "",
    task_config: dict[str, Any] | None = None,
) -> tuple[ChatMessage, ChatMessage, Task | None, bool]:
    user_message = await append_message(
        db,
        session_id=session.id,
        role="user",
        content=content,
    )

    task = session.task
    decision = await _llm_decision(content, session, task, task_description)
    if decision is None:
        decision = _fallback_decision(content, session, task, task_description)

    task_created = False
    if decision.control_action == "pause" and task and task.status == "running":
        task = await pause_task_execution(db, task)
        decision.assistant_reply = (
            f"The task is paused. {_task_status_summary(task)} Ask me to resume it whenever you are ready."
        )
    elif decision.control_action == "resume" and task and task.status == "paused":
        task = await resume_task_execution(db, task)
        decision.assistant_reply = f"The task is running again. {_task_status_summary(task)}"
    elif decision.control_action == "abort" and task and task.status not in {"completed", "aborted"}:
        task = await abort_task_execution(db, task)
        decision.assistant_reply = (
            f"The task has been stopped. {_task_status_summary(task)} You can refine the plan here before starting a new run."
        )

    if decision.should_create_task and task is None:
        task_topic = decision.topic or content.strip()
        task_description_value = decision.description or task_description.strip()
        if session.summary and session.summary not in task_topic:
            task_description_value = _merge_description_context(task_description_value, session.summary)
        created_task = await create_task_and_start(
            db,
            topic=task_topic,
            description=task_description_value,
            config=task_config or {},
            title=_normalize_title_candidate(decision.title) or _clip(task_topic, 50),
        )
        session.task_id = created_task.id
        session.title = created_task.title
        session.summary = _clip(created_task.topic, 240)
        task = created_task
        task_created = True
        decision.assistant_reply = (
            f"{decision.assistant_reply} Task \"{created_task.title}\" is now running. "
            f"{_task_status_summary(created_task)}"
        )

    if not session.title or session.title == "New research conversation":
        session.title = _clip(content, 50)

    if not session.summary:
        session.summary = _clip(content, 240)
    session.updated_at = datetime.now(timezone.utc)

    assistant_metadata: dict[str, Any] = {}
    if task:
        assistant_metadata["task_id"] = task.id
        assistant_metadata["task_status"] = task.status
    if decision.quick_actions:
        assistant_metadata["quick_actions"] = decision.quick_actions
    if task_created:
        assistant_metadata["task_created"] = True

    assistant_message = await append_message(
        db,
        session_id=session.id,
        role="assistant",
        content=decision.assistant_reply,
        metadata=assistant_metadata,
    )

    await db.commit()
    await db.refresh(session)
    if task is not None:
        await db.refresh(task)

    return user_message, assistant_message, task, task_created
