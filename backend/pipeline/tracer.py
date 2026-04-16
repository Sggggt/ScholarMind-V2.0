from __future__ import annotations

"""Pipeline trace logging and WebSocket fan-out."""

import time
from datetime import datetime, timezone

from api.schemas import WSMessage, module_int_to_id
from api.ws import manager
from db.database import async_session
from db.models import Task, TaskOutput, TraceLog
from services.redis_service import delete_cache, set_json

MODULE_NAMES = {
    1: "文献调研",
    2: "研究空白识别",
    3: "Idea生成与打分",
    4: "代码仓库生成",
    5: "实验设计",
    6: "Agent实验执行",
    7: "结果分析",
    8: "论文写作",
    9: "评审打分",
}


class Tracer:
    """Persist trace logs and mirror them to subscribed clients."""

    def __init__(self, task_id: str):
        self.task_id = task_id
        self._step_start: float = 0

    def _module_name(self, module: int) -> str:
        return MODULE_NAMES.get(module, f"模块{module}")

    def _timestamp(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def step_start(self):
        self._step_start = time.time()

    def step_elapsed_ms(self) -> int:
        return int((time.time() - self._step_start) * 1000)

    async def _touch_task(self, db) -> None:
        task = await db.get(Task, self.task_id)
        if task is not None:
            task.updated_at = datetime.now(timezone.utc)

    async def _read_task_progress(self) -> tuple[float, str]:
        async with async_session() as db:
            task = await db.get(Task, self.task_id)
            if not task:
                return 0.0, "M1"
            return float(task.progress or 0.0), module_int_to_id(task.current_module or 1)

    async def _refresh_task_cache(self) -> None:
        """Update Redis cache for this task (heavy — only call at key points)."""
        from api.routes import _task_to_response

        async with async_session() as db:
            task = await db.get(Task, self.task_id)
            if task:
                data = _task_to_response(task)
                await set_json(f"task:{self.task_id}", data, ttl=120)

    async def _invalidate_task_cache(self) -> None:
        """Lightweight cache invalidation — delete stale entries so next GET refetches."""
        await delete_cache(f"task:{self.task_id}", f"task:{self.task_id}:logs")

    async def log(
        self,
        module: int,
        step: str,
        message: str = "",
        level: str = "info",
        input_data: dict | None = None,
        output_data: dict | None = None,
        token_usage: int = 0,
        duration_ms: int | None = None,
    ):
        if duration_ms is None:
            duration_ms = self.step_elapsed_ms() if self._step_start else 0

        async with async_session() as db:
            log = TraceLog(
                task_id=self.task_id,
                module=module,
                module_name=self._module_name(module),
                step=step,
                level=level,
                message=message,
                input_data=input_data,
                output_data=output_data,
                token_usage=token_usage,
                duration_ms=duration_ms,
            )
            db.add(log)
            await self._touch_task(db)
            await db.commit()

        progress, current_module = await self._read_task_progress()
        await manager.send(
            WSMessage(
                type="progress",
                task_id=self.task_id,
                module=module_int_to_id(module),
                step=step,
                percent=progress,
                message=f"[{self._module_name(module)}] {message}",
                timestamp=self._timestamp(),
                data={"current_module": current_module},
            )
        )
        # Only invalidate (delete) — do NOT open extra DB session to rewrite cache.
        await delete_cache(f"task:{self.task_id}:logs")

    async def log_error(self, module: int, step: str, error: str):
        await self.log(module, step, error, level="error")
        progress, current_module = await self._read_task_progress()
        await manager.send(
            WSMessage(
                type="error",
                task_id=self.task_id,
                module=module_int_to_id(module),
                step=step,
                percent=progress,
                message=error,
                timestamp=self._timestamp(),
                data={"current_module": current_module},
            )
        )
        await self._invalidate_task_cache()

    async def save_output(
        self,
        module: int,
        output_type: str,
        content: str = "",
        file_path: str = "",
        metadata: dict | None = None,
    ):
        async with async_session() as db:
            out = TaskOutput(
                task_id=self.task_id,
                module=module,
                output_type=output_type,
                content=content,
                file_path=file_path,
                extra_data=metadata or {},
            )
            db.add(out)
            await self._touch_task(db)
            await db.commit()

        progress, current_module = await self._read_task_progress()
        await manager.send(
            WSMessage(
                type="result",
                task_id=self.task_id,
                module=module_int_to_id(module),
                percent=progress,
                message=f"产出: {output_type}",
                timestamp=self._timestamp(),
                data={
                    "output_type": output_type,
                    "file_path": file_path,
                    "current_module": current_module,
                },
            )
        )
        # save_output is infrequent — full cache refresh is acceptable here.
        await self._refresh_task_cache()

    async def request_review(self, module: int, content: dict):
        async with async_session() as db:
            await self._touch_task(db)
            await db.commit()
        progress, current_module = await self._read_task_progress()
        await manager.send(
            WSMessage(
                type="need_review",
                task_id=self.task_id,
                module=module_int_to_id(module),
                step="review",
                percent=progress,
                message="需要人工审阅",
                timestamp=self._timestamp(),
                data={**content, "current_module": current_module},
            )
        )

    async def mark_completed(self):
        async with async_session() as db:
            await self._touch_task(db)
            await db.commit()
        progress, current_module = await self._read_task_progress()
        await manager.send(
            WSMessage(
                type="completed",
                task_id=self.task_id,
                module=current_module,
                percent=max(progress, 100.0),
                message="研究任务全部完成",
                timestamp=self._timestamp(),
                data={"current_module": current_module},
            )
        )
        await self._refresh_task_cache()
        await delete_cache("tasks:list:all")
