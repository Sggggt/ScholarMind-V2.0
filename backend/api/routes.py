"""REST API routes aligned with the frontend client."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import json
import mimetypes
import os

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import config
from api.schemas import (
    ChatMessageCreateRequest,
    ChatSessionCreateRequest,
    RuntimeSettingsRequest,
    TaskCreateRequest,
    TaskModuleResetRequest,
    TaskReviewRequest,
    MODULE_NAMES,
    module_id_to_int,
    module_int_to_id,
)
from api.ws import manager
from db.database import get_db
from db.models import ChatMessage, ChatSession, Task, TraceLog
from services.conversation_service import create_chat_session, process_user_message
from services.task_service import (
    abort_task_execution,
    create_task_and_start,
    delete_task_with_dependencies,
    get_running_orchestrator,
    pause_task_execution,
    restart_task_execution,
    resume_task_execution,
)

router = APIRouter(prefix="/api")


def _serialize_datetime(value: datetime | None) -> str:
    if not value:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _task_to_response(task: Task) -> dict:
    current_mod = task.current_module or 0
    modules = []

    for i in range(1, 10):
        if i < current_mod:
            status = "completed"
            percent = 100
        elif i == current_mod:
            status = "running" if task.status == "running" else task.status
            percent = task.progress or 0
        else:
            status = "waiting"
            percent = 0

        if task.status == "completed":
            status = "completed"
            percent = 100
        elif task.status in {"failed", "aborted"} and i > current_mod:
            status = "waiting"
            percent = 0
        elif task.status == "failed" and i == current_mod:
            status = "failed"

        modules.append(
            {
                "module_id": f"M{i}",
                "status": status,
                "percent": percent,
                "step": task.current_step if i == current_mod else "",
                "message": MODULE_NAMES.get(i, ""),
                "started_at": None,
                "finished_at": None,
            }
        )

    return {
        "id": task.id,
        "title": task.title or task.topic[:50],
        "topic": task.topic,
        "description": task.domain or "",
        "status": task.status,
        "current_module": module_int_to_id(current_mod) if current_mod > 0 else None,
        "modules": modules,
        "created_at": _serialize_datetime(task.created_at),
        "updated_at": _serialize_datetime(task.updated_at),
        "completed_at": None,
        "output_url": None,
    }


def _log_to_response(log: TraceLog) -> dict:
    return {
        "id": str(log.id),
        "task_id": log.task_id,
        "module_id": module_int_to_id(log.module) if log.module else None,
        "level": log.level or "info",
        "message": log.message or "",
        "timestamp": _serialize_datetime(log.timestamp),
        "metadata": {
            "module_name": MODULE_NAMES.get(log.module, ""),
            "step": log.step,
            "token_usage": log.token_usage,
            "duration_ms": log.duration_ms,
        },
    }


def _chat_message_to_response(message: ChatMessage) -> dict:
    return {
        "id": str(message.id),
        "session_id": message.session_id,
        "role": message.role,
        "kind": message.kind or "text",
        "content": message.content or "",
        "created_at": _serialize_datetime(message.created_at),
        "metadata": message.extra_data or {},
    }


def _chat_session_to_response(session: ChatSession) -> dict:
    last_message = session.messages[-1] if session.messages else None
    return {
        "id": session.id,
        "title": session.title,
        "summary": session.summary or "",
        "task_id": session.task_id,
        "task_status": session.task.status if session.task else None,
        "created_at": _serialize_datetime(session.created_at),
        "updated_at": _serialize_datetime(session.updated_at),
        "last_message_preview": last_message.content[:160] if last_message else "",
    }


async def _get_chat_session_or_404(db: AsyncSession, session_id: str) -> ChatSession:
    stmt = (
        select(ChatSession)
        .where(ChatSession.id == session_id)
        .options(selectinload(ChatSession.messages), selectinload(ChatSession.task))
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "会话不存在")
    return session


async def _get_task_custom_code_dir(task_id: str, db: AsyncSession) -> Optional[Path]:
    """获取任务的自定义代码目录（如果设置了的话）"""
    from db.models import Task
    task = await db.get(Task, task_id)
    if task and task.config:
        work_dir = task.config.get("work_dir")
        if work_dir:
            custom_dir = (Path(work_dir) / task_id / "code").resolve()
            if custom_dir.exists():
                return custom_dir
    return None


def _get_task_workspace(task_id: str) -> Path:
    workspace = (config.WORKSPACE_DIR / task_id).resolve()
    if not workspace.exists():
        raise HTTPException(404, "任务工作区不存在")
    return workspace


def _resolve_workspace_path(task_id: str, relative_path: str, require_exists: bool = True) -> tuple[Path, Path]:
    workspace = _get_task_workspace(task_id)
    target = (workspace / relative_path).resolve()
    if workspace != target and workspace not in target.parents:
        raise HTTPException(400, "非法路径")
    if require_exists and not target.exists():
        raise HTTPException(404, "文件不存在")
    return workspace, target


def _detect_content_type(path: Path) -> str:
    if path.suffix == ".json":
        return "application/json"
    if path.suffix == ".md":
        return "text/markdown"
    if path.suffix in {".txt", ".tex", ".bib", ".py", ".js", ".ts", ".tsx", ".jsx", ".yaml", ".yml"}:
        return "text/plain"
    guessed, _ = mimetypes.guess_type(str(path))
    return guessed or "application/octet-stream"


def _infer_module_name(path: Path) -> str:
    if path.parts and path.parts[0] == "paper":
        return "M8"
    stem = path.parts[0] if path.parts else path.name
    if stem.startswith("m") and "_" in stem:
        return stem.split("_", 1)[0].upper()
    if stem.startswith("project"):
        return "M4"
    return "unknown"


def _find_repo_root(workspace: Path) -> Optional[Path]:
    candidates = sorted(
        path for path in workspace.iterdir() if path.is_dir() and path.name.startswith("project")
    )
    return candidates[0] if candidates else None


def _build_repo_tree(root: Path, current: Path) -> dict:
    relative = current.relative_to(root).as_posix() if current != root else ""
    if current.is_dir():
        # 过滤掉隐藏文件（以 . 开头）和 __pycache__
        children = [
            child for child in current.iterdir()
            if not child.name.startswith(".") and child.name != "__pycache__"
        ]
        children = sorted(children, key=lambda item: (item.is_file(), item.name.lower()))
        return {
            "name": current.name,
            "path": relative,
            "kind": "folder",
            "children": [_build_repo_tree(root, child) for child in children],
        }

    return {
        "name": current.name,
        "path": relative,
        "kind": "file",
    }


@router.post("/tasks")
async def create_task(req: TaskCreateRequest, db: AsyncSession = Depends(get_db)):
    task = await create_task_and_start(
        db,
        topic=req.topic,
        description=req.description,
        config=req.config,
        title=req.topic[:50],
    )
    return _task_to_response(task)


@router.get("/chat/sessions")
async def list_chat_sessions(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(ChatSession)
        .order_by(ChatSession.updated_at.desc())
        .options(selectinload(ChatSession.messages), selectinload(ChatSession.task))
    )
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    return [_chat_session_to_response(session) for session in sessions]


@router.post("/chat/sessions")
async def create_new_chat_session(req: ChatSessionCreateRequest, db: AsyncSession = Depends(get_db)):
    session = await create_chat_session(db, req.title)
    session = await _get_chat_session_or_404(db, session.id)
    return {
        "session": _chat_session_to_response(session),
        "messages": [_chat_message_to_response(message) for message in session.messages],
        "task": _task_to_response(session.task) if session.task else None,
    }


@router.get("/chat/sessions/{session_id}")
async def get_chat_session(session_id: str, db: AsyncSession = Depends(get_db)):
    session = await _get_chat_session_or_404(db, session_id)
    return {
        "session": _chat_session_to_response(session),
        "messages": [_chat_message_to_response(message) for message in session.messages],
        "task": _task_to_response(session.task) if session.task else None,
    }


@router.get("/chat/sessions/{session_id}/messages")
async def list_chat_messages(session_id: str, db: AsyncSession = Depends(get_db)):
    session = await _get_chat_session_or_404(db, session_id)
    return [_chat_message_to_response(message) for message in session.messages]


@router.post("/chat/sessions/{session_id}/messages")
async def send_chat_message(
    session_id: str,
    req: ChatMessageCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    session = await _get_chat_session_or_404(db, session_id)
    user_message, assistant_message, task, task_created = await process_user_message(
        db,
        session=session,
        content=req.content,
        task_description=req.task_description,
        task_config=req.task_config,
    )
    session = await _get_chat_session_or_404(db, session_id)
    if task is not None:
        task = await db.get(Task, task.id)

    return {
        "session": _chat_session_to_response(session),
        "user_message": _chat_message_to_response(user_message),
        "assistant_message": _chat_message_to_response(assistant_message),
        "task": _task_to_response(task) if task else None,
        "task_created": task_created,
    }


@router.delete("/chat/sessions/{session_id}")
async def delete_chat_session(session_id: str, db: AsyncSession = Depends(get_db)):
    session = await _get_chat_session_or_404(db, session_id)
    linked_task = session.task
    await db.delete(session)
    await db.commit()

    if linked_task:
        task = await db.get(Task, linked_task.id)
        if task is not None:
            await delete_task_with_dependencies(db, task)

    return {"ok": True}


@router.get("/settings/runtime")
async def get_runtime_settings():
    return config.get_runtime_settings()


@router.put("/settings/runtime")
async def update_runtime_settings(req: RuntimeSettingsRequest):
    return config.save_runtime_settings(req.model_dump())


@router.get("/tasks")
async def list_tasks(
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Task).order_by(Task.created_at.desc())
    if status:
        stmt = stmt.where(Task.status == status)
    result = await db.execute(stmt)
    tasks = result.scalars().all()
    return [_task_to_response(task) for task in tasks]


@router.get("/tasks/{task_id}")
async def get_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    return _task_to_response(task)


@router.post("/tasks/{task_id}/pause")
async def pause_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    if task.status != "running":
        raise HTTPException(400, f"当前状态 {task.status} 无法暂停")
    task = await pause_task_execution(db, task)
    return _task_to_response(task)


@router.post("/tasks/{task_id}/resume")
async def resume_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    if task.status != "paused":
        raise HTTPException(400, f"当前状态 {task.status} 无法恢复")
    task = await resume_task_execution(db, task)
    return _task_to_response(task)


@router.post("/tasks/{task_id}/abort")
async def abort_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    task = await abort_task_execution(db, task)
    return _task_to_response(task)


@router.post("/tasks/{task_id}/restart")
async def restart_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "浠诲姟涓嶅瓨鍦?")

    # 智能决定重启起点：
    # - 如果在 M3 暂停状态，从 M1 重新开始（让用户重新走一遍流程）
    # - 如果已执行到 M4 之后，从 M4 重新开始（代码生成）
    # - 否则使用当前模块
    current = task.current_module or 1
    if task.status == "paused" and current == 3:
        # M3 完成后暂停，从 M1 重新开始
        start_module = 1
    elif current >= 4:
        # 已进入代码生成阶段，从 M4 重新开始
        start_module = 4
    else:
        # 其他情况，从当前模块继续
        start_module = current

    task = await restart_task_execution(db, task, start_module=start_module)
    return _task_to_response(task)


@router.post("/tasks/{task_id}/reset-module")
async def reset_task_module(
    task_id: str,
    req: TaskModuleResetRequest,
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "浠诲姟涓嶅瓨鍦?")

    try:
        module_number = module_id_to_int(req.module_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    task = await restart_task_execution(db, task, start_module=module_number)
    return _task_to_response(task)


# ── 增量式 Idea 管理 API ──

class SelectIdeaRequest(BaseModel):
    """选择 Idea 推进到下一阶段"""
    idea_index: int = 0  # 要选择的 idea 索引
    replace_existing: bool = False  # 是否替换现有代码（在现有仓库基础上修改）


@router.get("/tasks/{task_id}/ideas")
async def list_task_ideas(task_id: str, db: AsyncSession = Depends(get_db)):
    """获取任务已生成的 Idea 列表"""
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")

    workspace = config.WORKSPACE_DIR / task_id
    ideas_path = workspace / "m3_scored_ideas.json"

    if not ideas_path.exists():
        # 如果还没有生任何 idea，检查是否在 M3 阶段
        if task.current_module == 3:
            return {
                "ideas": [],
                "status": "generating",
                "message": "正在生成 Idea...",
            }
        return {
            "ideas": [],
            "status": "not_started",
            "message": "尚未开始生成 Idea",
        }

    try:
        with open(ideas_path, encoding="utf-8") as f:
            data = json.load(f)

        ideas = data.get("scored_ideas", [])
        best_index = data.get("best_idea_index", 0)
        total_generated = data.get("total_generated", len(ideas))

        return {
            "ideas": ideas,
            "best_idea_index": best_index,
            "total_generated": total_generated,
            "status": "ready" if ideas else "generating",
        }
    except Exception as e:
        raise HTTPException(500, f"读取 Idea 列表失败: {e}")


@router.post("/tasks/{task_id}/select-idea")
async def select_idea_and_proceed(
    task_id: str,
    req: SelectIdeaRequest,
    db: AsyncSession = Depends(get_db),
):
    """选择一个 Idea 并推进到 M4（代码生成）阶段

    支持两种模式：
    - replace_existing=False: 全新创建代码仓库（默认）
    - replace_existing=True: 在现有代码仓库基础上修改
    """
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")

    workspace = config.WORKSPACE_DIR / task_id
    ideas_path = workspace / "m3_scored_ideas.json"

    if not ideas_path.exists():
        raise HTTPException(400, "尚未生成任何 Idea，请先完成 M3 阶段")

    try:
        with open(ideas_path, encoding="utf-8") as f:
            data = json.load(f)

        ideas = data.get("scored_ideas", [])
        if req.idea_index >= len(ideas):
            raise HTTPException(400, f"Idea 索引 {req.idea_index} 超出范围 (共 {len(ideas)} 个)")

        selected_idea = ideas[req.idea_index]

        # 更新 best_idea_index
        data["best_idea_index"] = req.idea_index
        with open(ideas_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        # 保存替换模式配置
        if req.replace_existing:
            # 保存当前选择的 idea 信息
            selection_info = {
                "idea_index": req.idea_index,
                "idea_title": selected_idea.get("title", selected_idea.get("Title", "")),
                "idea_name": selected_idea.get("Name", ""),
                "selected_at": datetime.now(timezone.utc).isoformat(),
                "replace_mode": True,
            }
            selection_path = workspace / "idea_selection.json"
            with open(selection_path, "w", encoding="utf-8") as f:
                json.dump(selection_info, f, ensure_ascii=False, indent=2)

        # 中断当前正在运行的进程（如果在 M3-M9 任何阶段）
        orchestrator = get_running_orchestrator(task_id)
        if orchestrator:
            orchestrator.abort()

        # 重新启动任务，从 M4 开始
        task = await restart_task_execution(db, task, start_module=4)

        return {
            "ok": True,
            "selected_idea": selected_idea,
            "replace_mode": req.replace_existing,
            "task": _task_to_response(task),
        }
    except Exception as e:
        raise HTTPException(500, f"选择 Idea 失败: {e}")


@router.post("/tasks/{task_id}/continue-ideas")
async def continue_idea_generation(task_id: str, db: AsyncSession = Depends(get_db)):
    """继续在后台生成更多 Idea"""
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")

    # 只允许在 M3 或 M3 之后的阶段继续生成
    if task.current_module and task.current_module < 3:
        raise HTTPException(400, "请先完成 M2 阶段")

    # 如果任务正在运行，不允许重复启动
    orchestrator = get_running_orchestrator(task_id)
    if orchestrator and task.status == "running":
        return {
            "ok": True,
            "message": "Idea 生成正在进行中",
        }

    # 启动 M3 阶段（会追加新的 Idea）
    task = await restart_task_execution(db, task, start_module=3)

    return {
        "ok": True,
        "message": "已启动 Idea 生成",
        "task": _task_to_response(task),
    }


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    await delete_task_with_dependencies(db, task)
    return {"ok": True}


@router.post("/tasks/{task_id}/review")
async def submit_review(task_id: str, req: TaskReviewRequest, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    orchestrator = get_running_orchestrator(task_id)
    if orchestrator:
        approved = req.action == "approve"
        await orchestrator.submit_review(approved, req.comment)
    return {"ok": True}


@router.get("/tasks/{task_id}/review-result")
async def get_review_result(task_id: str, db: AsyncSession = Depends(get_db)):
    workspace = os.path.join(config.WORKSPACE_DIR, task_id)
    review_path = os.path.join(workspace, "m9_review_report.json")

    if os.path.exists(review_path):
        with open(review_path, encoding="utf-8") as handle:
            data = json.load(handle)

        meta = data.get("meta_review", {})
        dimensions = []
        for key in [
            "Soundness",
            "Presentation",
            "Contribution",
            "Originality",
            "Quality",
            "Clarity",
            "Significance",
            "LiteratureGrounding",
        ]:
            value = meta.get(key, 0) if meta else 0
            if value:
                dimensions.append(
                    {
                        "name": key,
                        "score": float(value),
                        "max_score": 10.0 if key == "Overall" else 4.0,
                        "comment": "",
                    }
                )

        decision_map = {
            "Accept": "accept",
            "Reject": "reject",
            "Borderline": "weak_accept",
        }
        raw_decision = data.get("decision", "reject")
        decision = decision_map.get(raw_decision, "reject")

        return {
            "task_id": task_id,
            "overall_score": data.get("final_score", 0),
            "decision": decision,
            "dimensions": dimensions,
            "summary": meta.get("Summary", "") if meta else "",
            "created_at": "",
        }

    return {
        "task_id": task_id,
        "overall_score": 0,
        "decision": "reject",
        "dimensions": [],
        "summary": "评审尚未完成",
        "created_at": "",
    }


@router.get("/tasks/{task_id}/logs")
async def get_logs(
    task_id: str,
    module: Optional[int] = Query(None),
    level: Optional[str] = Query(None),
    limit: int = Query(200, le=500),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(TraceLog)
        .where(TraceLog.task_id == task_id)
        .order_by(TraceLog.timestamp.asc())
        .limit(limit)
    )
    if module is not None:
        stmt = stmt.where(TraceLog.module == module)
    if level:
        stmt = stmt.where(TraceLog.level == level)
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return [_log_to_response(log) for log in logs]


@router.get("/tasks/{task_id}/output")
async def get_outputs(task_id: str, db: AsyncSession = Depends(get_db)):
    workspace = os.path.join(config.WORKSPACE_DIR, task_id)

    paper_url = None
    code_url = None
    figures = []

    # 检查 PDF 是否存在并可读
    paper_pdf = os.path.join(workspace, "paper", "paper.pdf")
    if os.path.exists(paper_pdf) and os.path.isfile(paper_pdf):
        # 检查文件大小，避免空文件
        if os.path.getsize(paper_pdf) > 1000:  # 至少 1KB
            paper_url = f"/api/files/{task_id}/paper/paper.pdf"
        else:
            # PDF 文件太小，可能是生成失败
            paper_url = None

    project_dirs = (
        [
            directory
            for directory in os.listdir(workspace)
            if os.path.isdir(os.path.join(workspace, directory)) and directory.startswith("project")
        ]
        if os.path.exists(workspace)
        else []
    )
    if project_dirs:
        code_url = f"/api/files/{task_id}/{project_dirs[0]}"

    for root, _, files in os.walk(workspace):
        for filename in files:
            if filename.endswith(".png"):
                relative = os.path.relpath(os.path.join(root, filename), workspace)
                figures.append(f"/api/files/{task_id}/{relative}")

    return {
        "paper_url": paper_url,
        "code_url": code_url,
        "data_url": None,
        "figures": figures,
    }


@router.get("/tasks/{task_id}/artifacts")
async def get_artifacts(task_id: str):
    workspace = _get_task_workspace(task_id)
    artifacts = []

    for path in sorted(workspace.rglob("*")):
        if not path.is_file():
            continue

        relative = path.relative_to(workspace)
        content_type = _detect_content_type(path)
        url = f"/api/files/{task_id}/{relative.as_posix()}" if not content_type.startswith("application/json") else None

        artifacts.append(
            {
                "path": relative.as_posix(),
                "name": path.name,
                "module": _infer_module_name(relative),
                "content_type": content_type,
                "size": path.stat().st_size,
                "url": url,
            }
        )

    return artifacts


@router.get("/tasks/{task_id}/artifact-content")
async def get_artifact_content(task_id: str, path: str = Query(...)):
    workspace, target = _resolve_workspace_path(task_id, path)

    if target.is_dir():
        raise HTTPException(400, "路径指向目录，不能直接读取")

    if target.suffix.lower() not in {".json", ".md", ".txt", ".tex", ".bib"}:
        raise HTTPException(400, "当前接口仅支持文本和 JSON 产物")

    content_type = _detect_content_type(target)
    text = target.read_text(encoding="utf-8", errors="replace")
    content = json.loads(text) if target.suffix.lower() == ".json" else text

    return {
        "path": target.relative_to(workspace).as_posix(),
        "content_type": content_type,
        "content": content,
    }


@router.get("/tasks/{task_id}/repo/tree")
async def get_repo_tree(task_id: str, db: AsyncSession = Depends(get_db)):
    # 先尝试从自定义代码目录查找
    custom_code_dir = await _get_task_custom_code_dir(task_id, db)
    if custom_code_dir:
        # 在自定义目录中查找项目文件夹
        for child in sorted(custom_code_dir.iterdir()):
            if child.is_dir():
                return [_build_repo_tree(child, child)]

    # 回退到默认 workspace
    workspace = _get_task_workspace(task_id)
    repo_root = _find_repo_root(workspace)
    if not repo_root:
        return []
    return [_build_repo_tree(repo_root, repo_root)]


@router.get("/tasks/{task_id}/repo/file")
async def get_repo_file(task_id: str, path: str = Query(...), db: AsyncSession = Depends(get_db)):
    # 先尝试从自定义代码目录查找
    custom_code_dir = await _get_task_custom_code_dir(task_id, db)
    repo_root = None

    if custom_code_dir:
        # 在自定义目录中查找项目文件夹
        for child in sorted(custom_code_dir.iterdir()):
            if child.is_dir():
                repo_root = child
                break

    if not repo_root:
        # 回退到默认 workspace
        workspace = _get_task_workspace(task_id)
        repo_root = _find_repo_root(workspace)
        if not repo_root:
            raise HTTPException(404, "代码仓库尚未生成")

    normalized_path = path.strip().lstrip("/")
    target_path = (repo_root / normalized_path).resolve()

    # 安全检查
    if repo_root not in target_path.parents and target_path != repo_root:
        raise HTTPException(400, "非法路径")

    if not target_path.exists():
        raise HTTPException(404, "文件不存在")

    if target_path.is_dir():
        raise HTTPException(400, "路径指向目录，不能直接读取")

    return {
        "path": target_path.relative_to(repo_root).as_posix(),
        "content": target_path.read_text(encoding="utf-8", errors="replace"),
        "language": target_path.suffix.lstrip(".").lower() or "text",
    }


@router.get("/tasks/{task_id}/review-report")
async def get_review_report(task_id: str):
    _, target = _resolve_workspace_path(task_id, "m9_review_report.json")
    with open(target, encoding="utf-8") as handle:
        return json.load(handle)


@router.get("/files/{task_id}/{file_path:path}")
async def serve_file(task_id: str, file_path: str):
    full_path = os.path.join(config.WORKSPACE_DIR, task_id, file_path)
    if not os.path.exists(full_path) or not os.path.isfile(full_path):
        raise HTTPException(404, "文件不存在")

    # 显式设置 PDF 的 MIME 类型，确保浏览器正确显示
    media_type = None
    headers = {}
    if full_path.endswith(".pdf"):
        media_type = "application/pdf"
        # 确保浏览器内联显示 PDF 而不是下载
        headers["Content-Disposition"] = "inline; filename=paper.pdf"

    return FileResponse(full_path, media_type=media_type, headers=headers)


@router.get("/tasks/{task_id}/pdf-status")
async def get_pdf_status(task_id: str):
    """检查 PDF 文件状态（调试用）"""
    workspace = _get_task_workspace(task_id)
    paper_pdf = workspace / "paper" / "paper.pdf"

    if not paper_pdf.exists():
        return {
            "task_id": task_id,
            "exists": False,
            "message": "PDF 文件不存在"
        }

    stat = paper_pdf.stat()
    return {
        "task_id": task_id,
        "exists": True,
        "path": str(paper_pdf),
        "size_bytes": stat.st_size,
        "size_kb": round(stat.st_size / 1024, 2),
        "message": "PDF 文件存在" if stat.st_size > 1000 else "PDF 文件太小，可能生成失败"
    }


@router.post("/tasks/{task_id}/recompile-pdf")
async def recompile_paper_pdf(task_id: str):
    """重新编译论文 PDF"""
    import asyncio
    import subprocess

    workspace = _get_task_workspace(task_id)
    paper_dir = workspace / "paper"

    if not paper_dir.exists():
        raise HTTPException(404, "论文目录不存在")

    tex_file = paper_dir / "paper.tex"
    if not tex_file.exists():
        raise HTTPException(404, "LaTeX 源文件不存在")

    # 删除旧的 PDF 文件
    pdf_file = paper_dir / "paper.pdf"
    if pdf_file.exists():
        pdf_file.unlink()

    # 运行 pdflatex 编译
    commands = [
        ["pdflatex", "-interaction=nonstopmode", "paper.tex"],
        ["bibtex", "paper"],
        ["pdflatex", "-interaction=nonstopmode", "paper.tex"],
        ["pdflatex", "-interaction=nonstopmode", "paper.tex"],
    ]

    compilation_errors = []
    for cmd in commands:
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                cmd,
                cwd=str(paper_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                encoding="utf-8",
                errors="replace",
                timeout=60,
            )
            if result.returncode != 0:
                compilation_errors.append(f"{' '.join(cmd)}: failed")
        except FileNotFoundError:
            return {"ok": False, "message": "pdflatex 未安装，请先安装 LaTeX"}
        except asyncio.TimeoutError:
            compilation_errors.append(f"{' '.join(cmd)}: timeout")
        except Exception as e:
            compilation_errors.append(f"{' '.join(cmd)}: {str(e)}")

    # 检查 PDF 是否生成成功
    if pdf_file.exists():
        stat = pdf_file.stat()
        # 验证 PDF 头部
        with open(pdf_file, "rb") as f:
            header = f.read(5)

        if header == b"%PDF" and stat.st_size > 5000:
            return {"ok": True, "message": f"PDF 编译成功 ({round(stat.st_size / 1024, 1)} KB)"}
        else:
            pdf_file.unlink()
            return {"ok": False, "message": "PDF 生成失败或文件损坏"}
    else:
        return {
            "ok": False,
            "message": f"PDF 编译失败" + (f": {', '.join(compilation_errors)}" if compilation_errors else "")
        }


@router.get("/ssh/status")
async def ssh_status():
    from modules.ssh_runner import ssh_runner

    return {
        "enabled": ssh_runner.is_available(),
        "host": config.SSH_HOST or None,
        "user": config.SSH_USER or None,
        "work_dir": config.SSH_WORK_DIR,
    }


@router.post("/ssh/test")
async def ssh_test():
    from modules.ssh_runner import ssh_runner

    if not ssh_runner.is_available():
        raise HTTPException(400, "SSH 未配置。请在 .env 中设置 SSH_HOST 和 SSH_USER")

    try:
        gpu_info = await ssh_runner.check_gpu()
        return {"ok": True, "gpu": gpu_info}
    except Exception as exc:
        raise HTTPException(500, f"SSH 连接失败: {exc}") from exc


@router.websocket("/ws")
async def websocket_global(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.websocket("/ws/{task_id}")
async def websocket_task(websocket: WebSocket, task_id: str):
    await manager.connect(websocket, task_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, task_id)
