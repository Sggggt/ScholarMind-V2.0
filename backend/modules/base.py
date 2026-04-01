from __future__ import annotations
"""模块基类 — 所有9个模块的统一接口"""

from abc import ABC, abstractmethod
from pipeline.tracer import Tracer
from pipeline.state import TaskStateMachine


class BaseModule(ABC):
    """研究模块基类"""

    # 子类必须设置
    module_id: int = 0
    name: str = ""

    @abstractmethod
    async def execute(
        self,
        context: dict,
        tracer: Tracer,
        state: TaskStateMachine,
    ) -> dict:
        """
        执行模块逻辑。

        Args:
            context: 上游模块传下来的上下文(累积)
            tracer: 追溯日志记录器
            state: 状态机(暂停/终止检测)

        Returns:
            更新后的 context
        """
        ...
