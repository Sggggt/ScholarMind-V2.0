from __future__ import annotations
"""任务状态机

状态流转:
  pending → running → [review] → completed
                  ↘ failed
                  ↘ paused → running
                  ↘ aborted

模块内回退: M7结果不达标 → 回退到M6重新实验(最多 N 次)
"""

import asyncio
from datetime import datetime, timezone

from sqlalchemy import update
from db.database import async_session
from db.models import Task


def _utcnow():
    return datetime.now(timezone.utc)


class TaskStateMachine:
    """管理单个任务的状态"""

    def __init__(self, task_id: str):
        self.task_id = task_id
        self._paused = asyncio.Event()
        self._paused.set()  # 初始未暂停
        self._aborted = False
        self._review_event = asyncio.Event()
        self._review_approved: bool = True
        self._review_feedback: str = ""
        self._review_pending: bool = False

    # ── 状态更新(写库) ────────────────────────────────

    async def set_status(self, status: str):
        async with async_session() as db:
            await db.execute(
                update(Task).where(Task.id == self.task_id).values(
                    status=status,
                    updated_at=_utcnow(),
                )
            )
            await db.commit()

    async def set_progress(self, module: int, step: str, progress: float):
        async with async_session() as db:
            await db.execute(
                update(Task)
                .where(Task.id == self.task_id)
                .values(
                    current_module=module,
                    current_step=step,
                    progress=progress,
                    updated_at=_utcnow(),
                )
            )
            await db.commit()

    async def increment_retry(self) -> int:
        async with async_session() as db:
            task = await db.get(Task, self.task_id)
            task.retry_count += 1
            task.updated_at = _utcnow()
            count = task.retry_count
            await db.commit()
            return count

    # ── 暂停/恢复 ─────────────────────────────────────

    def pause(self):
        self._paused.clear()

    def resume(self):
        self._paused.set()

    async def wait_if_paused(self):
        await self._paused.wait()

    # ── 终止 ──────────────────────────────────────────

    def abort(self):
        self._aborted = True
        self._paused.set()       # 解除暂停阻塞
        self._review_event.set() # 解除审阅阻塞

    @property
    def is_aborted(self) -> bool:
        return self._aborted

    # ── 人工审阅 ──────────────────────────────────────

    async def wait_for_review(self) -> tuple[bool, str]:
        """阻塞等待人工审阅结果"""
        await self.set_status("review")
        if not self._review_pending:
            self._review_event.clear()
            await self._review_event.wait()
        self._review_pending = False
        self._review_event.clear()
        return self._review_approved, self._review_feedback

    async def submit_review(self, approved: bool, feedback: str):
        self._review_approved = approved
        self._review_feedback = feedback
        self._review_pending = True
        self._review_event.set()
