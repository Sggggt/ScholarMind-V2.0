"""REST API routes aligned with the frontend client."""

from __future__ import annotations

from pathlib import Path
from typing import Optional
import json
import mimetypes
import os

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
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
        "created_at": task.created_at.isoformat() if task.created_at else "",
        "updated_at": task.updated_at.isoformat() if task.updated_at else "",
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
        "timestamp": log.timestamp.isoformat() if log.timestamp else "",
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
        "created_at": message.created_at.isoformat() if message.created_at else "",
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
        "created_at": session.created_at.isoformat() if session.created_at else "",
        "updated_at": session.updated_at.isoformat() if session.updated_at else "",
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
        children = sorted(current.iterdir(), key=lambda item: (item.is_file(), item.name.lower()))
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

    task = await restart_task_execution(db, task, start_module=task.current_module or 1)
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

    paper_pdf = os.path.join(workspace, "paper", "paper.pdf")
    if os.path.exists(paper_pdf):
        paper_url = f"/api/files/{task_id}/paper/paper.pdf"

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
async def get_repo_tree(task_id: str):
    workspace = _get_task_workspace(task_id)
    repo_root = _find_repo_root(workspace)
    if not repo_root:
        return []
    return [_build_repo_tree(repo_root, repo_root)]


@router.get("/tasks/{task_id}/repo/file")
async def get_repo_file(task_id: str, path: str = Query(...)):
    workspace = _get_task_workspace(task_id)
    repo_root = _find_repo_root(workspace)
    if not repo_root:
        raise HTTPException(404, "代码仓库尚未生成")

    normalized_path = path.strip().lstrip("/")
    _, target = _resolve_workspace_path(
        task_id,
        repo_root.name if not normalized_path else f"{repo_root.name}/{normalized_path}",
    )

    if target.is_dir():
        raise HTTPException(400, "路径指向目录，不能直接读取")

    return {
        "path": target.relative_to(repo_root).as_posix(),
        "content": target.read_text(encoding="utf-8", errors="replace"),
        "language": target.suffix.lstrip(".").lower() or "text",
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
    return FileResponse(full_path)


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
