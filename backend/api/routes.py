"""REST API 路由 — 与前端类型完全对齐"""

from typing import Optional, List
import asyncio
import os
import json
import mimetypes
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import config
from db.database import get_db
from db.models import Task, TraceLog, TaskOutput
from api.schemas import (
    RuntimeSettingsRequest,
    RuntimeSettingsResponse,
    TaskCreateRequest, TaskReviewRequest,
    TaskResponse, ModuleProgress, LogEntryResponse,
    TaskOutputResponse, ReviewResultResponse, ReviewDimension,
    module_int_to_id, MODULE_NAMES,
)
from api.ws import manager
from pipeline.orchestrator import PipelineOrchestrator

router = APIRouter(prefix="/api")

# 存储运行中的任务 orchestrator 引用
_running: dict[str, PipelineOrchestrator] = {}


# ── 工具函数 ─────────────────────────────────────────

def _task_to_response(task: Task) -> dict:
    """将 DB Task 转为前端期望的格式"""
    current_mod = task.current_module or 0

    # 构建 modules 数组 (M1-M9)
    modules = []
    for i in range(1, 10):
        mid = f"M{i}"
        if i < current_mod:
            status = "completed"
            percent = 100
        elif i == current_mod:
            status = "running" if task.status == "running" else task.status
            percent = task.progress or 0
        else:
            status = "waiting"
            percent = 0

        # 如果任务已完成/失败/终止，调整所有模块状态
        if task.status in ("completed",):
            status = "completed"
            percent = 100
        elif task.status in ("failed", "aborted") and i > current_mod:
            status = "waiting"
            percent = 0
        elif task.status in ("failed",) and i == current_mod:
            status = "failed"

        modules.append({
            "module_id": mid,
            "status": status,
            "percent": percent,
            "step": task.current_step if i == current_mod else "",
            "message": MODULE_NAMES.get(i, ""),
            "started_at": None,
            "finished_at": None,
        })

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
    """将 DB TraceLog 转为前端期望的格式"""
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


def _get_task_workspace(task_id: str) -> Path:
    import config as cfg

    workspace = (cfg.WORKSPACE_DIR / task_id).resolve()
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
        path for path in workspace.iterdir()
        if path.is_dir() and path.name.startswith("project")
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


# ── 任务 CRUD ─────────────────────────────────────────

@router.post("/tasks")
async def create_task(req: TaskCreateRequest, db: AsyncSession = Depends(get_db)):
    task = Task(
        title=req.topic[:50],
        topic=req.topic,
        domain=req.description,
        config=req.config,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    # 立即启动流水线(后台运行)
    orch = PipelineOrchestrator(task.id)
    _running[task.id] = orch
    asyncio.create_task(_run_pipeline(orch, task.id))

    return _task_to_response(task)


@router.get("/settings/runtime")
async def get_runtime_settings():
    return config.get_runtime_settings()


@router.put("/settings/runtime")
async def update_runtime_settings(req: RuntimeSettingsRequest):
    return config.save_runtime_settings(req.model_dump())


async def _run_pipeline(orch: PipelineOrchestrator, task_id: str):
    try:
        await orch.run()
    finally:
        _running.pop(task_id, None)


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
    return [_task_to_response(t) for t in tasks]


@router.get("/tasks/{task_id}")
async def get_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    return _task_to_response(task)


# ── 任务控制 ──────────────────────────────────────────

@router.post("/tasks/{task_id}/pause")
async def pause_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    if task.status != "running":
        raise HTTPException(400, f"当前状态 {task.status} 无法暂停")
    task.status = "paused"
    if task_id in _running:
        _running[task_id].pause()
    await db.commit()
    return _task_to_response(task)


@router.post("/tasks/{task_id}/resume")
async def resume_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    if task.status != "paused":
        raise HTTPException(400, f"当前状态 {task.status} 无法恢复")
    task.status = "running"
    if task_id in _running:
        _running[task_id].resume()
    await db.commit()
    return _task_to_response(task)


@router.post("/tasks/{task_id}/abort")
async def abort_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    task.status = "aborted"
    if task_id in _running:
        _running[task_id].abort()
    await db.commit()
    return _task_to_response(task)


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    # Delete related logs and outputs
    await db.execute(select(TraceLog).where(TraceLog.task_id == task_id).execution_options(synchronize_session=False))
    from sqlalchemy import delete as sql_delete
    await db.execute(sql_delete(TraceLog).where(TraceLog.task_id == task_id))
    await db.execute(sql_delete(TaskOutput).where(TaskOutput.task_id == task_id))
    await db.delete(task)
    await db.commit()
    return {"ok": True}


# ── 人工审阅 ──────────────────────────────────────────

@router.post("/tasks/{task_id}/review")
async def submit_review(task_id: str, req: TaskReviewRequest, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "任务不存在")
    if task_id in _running:
        approved = req.action == "approve"
        await _running[task_id].submit_review(approved, req.comment)
    return {"ok": True}


# ── 评审结果 ──────────────────────────────────────────

@router.get("/tasks/{task_id}/review-result")
async def get_review_result(task_id: str, db: AsyncSession = Depends(get_db)):
    """获取 M9 评审结果"""
    # 从 workspace 查找评审报告
    import config as cfg
    workspace = os.path.join(cfg.WORKSPACE_DIR, task_id)
    review_path = os.path.join(workspace, "m9_review_report.json")

    if os.path.exists(review_path):
        with open(review_path) as f:
            data = json.load(f)

        # 转换为前端期望的格式
        meta = data.get("meta_review", {})
        dimensions = []
        for key in ["Soundness", "Presentation", "Contribution", "Originality",
                     "Quality", "Clarity", "Significance", "LiteratureGrounding"]:
            val = meta.get(key, 0) if meta else 0
            if val:
                dimensions.append({
                    "name": key,
                    "score": float(val),
                    "max_score": 10.0 if key == "Overall" else 4.0,
                    "comment": "",
                })

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

    # 没有评审结果
    return {
        "task_id": task_id,
        "overall_score": 0,
        "decision": "reject",
        "dimensions": [],
        "summary": "评审尚未完成",
        "created_at": "",
    }


# ── 日志 ─────────────────────────────────────────────

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


# ── 产出物 ────────────────────────────────────────────

@router.get("/tasks/{task_id}/output")
async def get_outputs(task_id: str, db: AsyncSession = Depends(get_db)):
    """获取产出物 — 返回前端期望的格式"""
    import config as cfg
    workspace = os.path.join(cfg.WORKSPACE_DIR, task_id)

    paper_url = None
    code_url = None
    figures = []

    # 查找论文
    paper_pdf = os.path.join(workspace, "paper", "paper.pdf")
    if os.path.exists(paper_pdf):
        paper_url = f"/api/files/{task_id}/paper/paper.pdf"

    # 查找代码目录
    project_dirs = [
        d for d in os.listdir(workspace)
        if os.path.isdir(os.path.join(workspace, d)) and d.startswith("project")
    ] if os.path.exists(workspace) else []
    if project_dirs:
        code_url = f"/api/files/{task_id}/{project_dirs[0]}"

    # 查找图片
    for root, dirs, files in os.walk(workspace):
        for f in files:
            if f.endswith(".png"):
                rel = os.path.relpath(os.path.join(root, f), workspace)
                figures.append(f"/api/files/{task_id}/{rel}")

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

        artifacts.append({
            "path": relative.as_posix(),
            "name": path.name,
            "module": _infer_module_name(relative),
            "content_type": content_type,
            "size": path.stat().st_size,
            "url": url,
        })

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
    with open(target, encoding="utf-8") as f:
        return json.load(f)


# ── 文件服务 ──────────────────────────────────────────

@router.get("/files/{task_id}/{file_path:path}")
async def serve_file(task_id: str, file_path: str):
    """静态文件服务 — 用于下载论文PDF等"""
    import config as cfg
    full_path = os.path.join(cfg.WORKSPACE_DIR, task_id, file_path)
    if not os.path.exists(full_path) or not os.path.isfile(full_path):
        raise HTTPException(404, "文件不存在")
    return FileResponse(full_path)


# ── SSH 配置与测试 ────────────────────────────────────

@router.get("/ssh/status")
async def ssh_status():
    """检查 SSH 配置状态"""
    from modules.ssh_runner import ssh_runner
    return {
        "enabled": ssh_runner.is_available(),
        "host": config.SSH_HOST or None,
        "user": config.SSH_USER or None,
        "work_dir": config.SSH_WORK_DIR,
    }


@router.post("/ssh/test")
async def ssh_test():
    """测试 SSH 连接"""
    from modules.ssh_runner import ssh_runner
    if not ssh_runner.is_available():
        raise HTTPException(400, "SSH 未配置。请在 .env 中设置 SSH_HOST 和 SSH_USER")
    try:
        gpu_info = await ssh_runner.check_gpu()
        return {"ok": True, "gpu": gpu_info}
    except Exception as e:
        raise HTTPException(500, f"SSH 连接失败: {e}")


# ── WebSocket ─────────────────────────────────────────

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
