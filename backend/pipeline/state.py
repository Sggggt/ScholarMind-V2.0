from __future__ import annotations
"""任务状态机

状态流转:
  pending → running → [review] → completed
                  ↘ failed
                  ↘ paused → running
                  ↘ aborted
"""

import asyncio
from contextlib import suppress
from datetime import datetime, timezone

from sqlalchemy import update
from db.database import async_session
from db.models import Task


def _utcnow():
    return datetime.now(timezone.utc)


class TaskAborted(Exception):
    """Raised when the task is aborted to immediately unwind the call stack."""


class TaskPaused(Exception):
    """Raised when the task is paused to unwind back to the orchestrator."""


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
        # Invalidate Redis cache so next GET returns fresh data
        from services.redis_service import delete_cache
        await delete_cache(f"task:{self.task_id}")

    async def increment_retry(self) -> int:
        async with async_session() as db:
            task = await db.get(Task, self.task_id)
            task.retry_count += 1
            task.updated_at = _utcnow()
            count = task.retry_count
            await db.commit()
            return count

    # ── 控制信号检查（模块调用，立即抛异常） ──────────────

    def check_control(self):
        """Call this at every await point in modules.
        Raises TaskAborted or TaskPaused immediately."""
        if self._aborted:
            raise TaskAborted()
        if not self._paused.is_set():
            raise TaskPaused()

    async def checkpoint(self):
        """Async version — also handles abort + pause.
        When paused, blocks until resumed (or aborted)."""
        if self._aborted:
            raise TaskAborted()
        if not self._paused.is_set():
            await self._paused.wait()
            if self._aborted:
                raise TaskAborted()

    async def wait_if_paused(self):
        """Backward-compatible alias used by modules."""
        await self.checkpoint()

    async def run_interruptible(
        self,
        awaitable,
        *,
        cancel_on_pause: bool = True,
        poll_interval: float = 0.5,
        deadline: float | None = None,
    ):
        """Await a long-running operation while polling pause/abort state.

        When `cancel_on_pause` is True, a pause request cancels the in-flight awaitable
        and unwinds to the orchestrator immediately.

        When `deadline` is set (monotonic timestamp), the awaitable is cancelled
        if it hasn't completed by that time.
        """
        task = asyncio.create_task(awaitable)

        try:
            while True:
                if self._aborted:
                    task.cancel()
                    with suppress(asyncio.CancelledError, Exception):
                        await task
                    raise TaskAborted()

                if cancel_on_pause and not self._paused.is_set():
                    task.cancel()
                    with suppress(asyncio.CancelledError, Exception):
                        await task
                    raise TaskPaused()

                try:
                    wait = poll_interval
                    if deadline is not None:
                        remaining = deadline - asyncio.get_event_loop().time()
                        if remaining <= 0:
                            task.cancel()
                            with suppress(asyncio.CancelledError, Exception):
                                await task
                            raise asyncio.TimeoutError()
                        wait = min(wait, remaining)
                    return await asyncio.wait_for(asyncio.shield(task), timeout=wait)
                except asyncio.TimeoutError:
                    if deadline is not None and asyncio.get_event_loop().time() >= deadline:
                        task.cancel()
                        with suppress(asyncio.CancelledError, Exception):
                            await task
                        raise
                    continue
        except BaseException:
            if not task.done():
                task.cancel()
                with suppress(asyncio.CancelledError, Exception):
                    await task
            raise

    # ── 暂停/恢复 ─────────────────────────────────────

    def pause(self):
        self._paused.clear()

    def resume(self):
        self._paused.set()

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
