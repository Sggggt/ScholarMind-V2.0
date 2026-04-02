from __future__ import annotations

import asyncio
import shutil
from pathlib import Path

from sqlalchemy import delete as sql_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import config
from db.models import ChatMessage, ChatSession, Task, TaskOutput, TraceLog
from pipeline.orchestrator import PipelineOrchestrator


_running: dict[str, PipelineOrchestrator] = {}


def _normalize_start_module(task: Task, start_module: int | None = None) -> int:
    module = start_module or task.current_module or 1
    return max(1, min(9, int(module)))


def _safe_remove_path(path: Path) -> None:
    if not path.exists():
        return

    if path.is_dir():
        shutil.rmtree(path, ignore_errors=True)
    else:
        path.unlink(missing_ok=True)


def _cleanup_project_outputs(project_dir: Path, *, keep_baseline: bool) -> None:
    if not project_dir.exists() or not project_dir.is_dir():
        return

    for child in project_dir.iterdir():
        name = child.name
        if name == ".git":
            continue
        if keep_baseline and name == "run_0":
            continue
        if keep_baseline and name == "run_0.py":
            continue
        if keep_baseline and name in {"experiment.py", "experiment_planned.py", "plot.py", "notes.txt", "prompt.json", "seed_ideas.json"}:
            continue

        if name.startswith("run_") or name in {"figures", "aide_solution.py"}:
            _safe_remove_path(child)


def _cleanup_workspace_from_module(task_id: str, start_module: int) -> None:
    workspace = (config.WORKSPACE_DIR / task_id).resolve()
    if not workspace.exists():
        return

    if start_module <= 1:
        for child in workspace.iterdir():
            _safe_remove_path(child)
        return

    file_patterns_by_module = {
        2: ["m2_*", "m3_*", "m5_*", "m6_*", "m7_*", "m9_*", "experiment_data.json"],
        3: ["m3_*", "m5_*", "m6_*", "m7_*", "m9_*", "experiment_data.json"],
        4: ["m5_*", "m6_*", "m7_*", "m9_*", "experiment_data.json"],
        5: ["m5_*", "m6_*", "m7_*", "m9_*", "experiment_data.json"],
        6: ["m6_*", "m7_*", "m9_*", "experiment_data.json"],
        7: ["m7_*", "m9_*"],
        8: ["m9_*"],
        9: ["m9_*"],
    }
    dir_names_by_module = {
        2: ["ai_scientist_workspace", "project", "paper"],
        3: ["project", "paper"],
        4: ["project", "paper"],
        5: ["paper"],
        6: ["paper"],
        7: ["paper"],
        8: ["paper"],
        9: [],
    }

    for pattern in file_patterns_by_module.get(start_module, []):
        for path in workspace.glob(pattern):
            _safe_remove_path(path)

    for name in dir_names_by_module.get(start_module, []):
        _safe_remove_path(workspace / name)

    project_root = workspace / "project"
    if start_module in {5, 6, 7, 8, 9} and project_root.exists():
        for project_dir in project_root.iterdir():
            if not project_dir.is_dir():
                continue
            _cleanup_project_outputs(project_dir, keep_baseline=start_module >= 5)


async def create_task_and_start(
    db: AsyncSession,
    *,
    topic: str,
    description: str = "",
    config: dict | None = None,
    title: str | None = None,
) -> Task:
    task = Task(
        title=(title or topic[:50]).strip() or topic[:50],
        topic=topic,
        domain=description,
        config=config or {},
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    orchestrator = PipelineOrchestrator(task.id)
    _running[task.id] = orchestrator
    asyncio.create_task(_run_pipeline(orchestrator, task.id))
    return task


async def _run_pipeline(orch: PipelineOrchestrator, task_id: str):
    try:
        await orch.run()
    finally:
        if _running.get(task_id) is orch:
            _running.pop(task_id, None)


def get_running_orchestrator(task_id: str) -> PipelineOrchestrator | None:
    return _running.get(task_id)


async def pause_task_execution(db: AsyncSession, task: Task) -> Task:
    task.status = "paused"
    orchestrator = get_running_orchestrator(task.id)
    if orchestrator:
        orchestrator.pause()
    await db.commit()
    await db.refresh(task)
    return task


async def resume_task_execution(db: AsyncSession, task: Task) -> Task:
    task.status = "running"
    orchestrator = get_running_orchestrator(task.id)
    if orchestrator:
        orchestrator.resume()
    await db.commit()
    await db.refresh(task)
    return task


async def abort_task_execution(db: AsyncSession, task: Task) -> Task:
    task.status = "aborted"
    orchestrator = get_running_orchestrator(task.id)
    if orchestrator:
        orchestrator.abort()
    await db.commit()
    await db.refresh(task)
    return task


async def restart_task_execution(
    db: AsyncSession,
    task: Task,
    *,
    start_module: int | None = None,
) -> Task:
    normalized_module = _normalize_start_module(task, start_module)

    existing = get_running_orchestrator(task.id)
    if existing:
        existing.abort()

    _cleanup_workspace_from_module(task.id, normalized_module)

    await db.execute(
        sql_delete(TraceLog).where(
            TraceLog.task_id == task.id,
            TraceLog.module >= normalized_module,
        )
    )
    await db.execute(
        sql_delete(TaskOutput).where(
            TaskOutput.task_id == task.id,
            TaskOutput.module >= normalized_module,
        )
    )

    task.status = "running"
    task.current_module = normalized_module
    task.current_step = ""
    task.progress = 0
    task.retry_count = 0
    await db.commit()
    await db.refresh(task)

    orchestrator = PipelineOrchestrator(task.id, start_module=normalized_module)
    _running[task.id] = orchestrator
    asyncio.create_task(_run_pipeline(orchestrator, task.id))
    return task


async def delete_task_with_dependencies(db: AsyncSession, task: Task) -> None:
    existing = get_running_orchestrator(task.id)
    if existing:
        existing.abort()

    await db.execute(
        sql_delete(ChatMessage).where(
            ChatMessage.session_id.in_(select(ChatSession.id).where(ChatSession.task_id == task.id))
        )
    )
    await db.execute(sql_delete(ChatSession).where(ChatSession.task_id == task.id))
    await db.execute(sql_delete(TraceLog).where(TraceLog.task_id == task.id))
    await db.execute(sql_delete(TaskOutput).where(TaskOutput.task_id == task.id))
    await db.delete(task)
    await db.commit()
