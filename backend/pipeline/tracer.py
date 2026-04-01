from __future__ import annotations
"""全程追溯日志系统

每个模块的每一步操作都被记录：输入/输出/耗时/token用量。
同时通过 WebSocket 推送给手机端和桌面端。
"""

import time
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from db.database import async_session
from db.models import TraceLog, TaskOutput
from api.ws import manager
from api.schemas import WSMessage, module_int_to_id

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
    """追溯记录器，绑定到一个 task"""

    def __init__(self, task_id: str):
        self.task_id = task_id
        self._step_start: float = 0

    def _module_name(self, module: int) -> str:
        return MODULE_NAMES.get(module, f"模块{module}")

    def step_start(self):
        self._step_start = time.time()

    def step_elapsed_ms(self) -> int:
        return int((time.time() - self._step_start) * 1000)

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

        # 写数据库
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
            await db.commit()

        # WebSocket 推送
        await manager.send(WSMessage(
            type="progress",
            task_id=self.task_id,
            module=module_int_to_id(module),
            step=step,
            message=f"[{self._module_name(module)}] {message}",
        ))

    async def log_error(self, module: int, step: str, error: str):
        await self.log(module, step, error, level="error")
        await manager.send(WSMessage(
            type="error",
            task_id=self.task_id,
            module=module_int_to_id(module),
            step=step,
            message=error,
        ))

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
            await db.commit()

        await manager.send(WSMessage(
            type="result",
            task_id=self.task_id,
            module=module_int_to_id(module),
            message=f"产出: {output_type}",
            data={"output_type": output_type, "file_path": file_path},
        ))

    async def request_review(self, module: int, content: dict):
        await manager.send(WSMessage(
            type="need_review",
            task_id=self.task_id,
            module=module_int_to_id(module),
            message="需要人工审阅",
            data=content,
        ))

    async def mark_completed(self):
        await manager.send(WSMessage(
            type="completed",
            task_id=self.task_id,
            message="研究任务全部完成",
        ))
