from __future__ import annotations
"""流水线编排器

按 M1→M9 顺序执行9个模块，支持：
- 暂停/恢复/终止
- M7结果不达标回退到M6
- 人工审阅干预点
- 全程追溯日志
"""

import traceback

from sqlalchemy import select
from db.database import async_session
from db.models import Task

from pipeline.state import TaskStateMachine
from pipeline.tracer import Tracer

from modules.m1_literature import LiteratureModule
from modules.m2_gap_analysis import GapAnalysisModule
from modules.m3_idea_scoring import IdeaScoringModule
from modules.m4_code_gen import CodeGenModule
from modules.m5_experiment_design import ExperimentDesignModule
from modules.m6_agent_runner import AgentRunnerModule
from modules.m7_analysis import AnalysisModule
from modules.m8_paper_writing import PaperWritingModule
from modules.m9_review import ReviewModule

import config


class PipelineOrchestrator:
    """9模块研究流水线编排"""

    def __init__(self, task_id: str):
        self.task_id = task_id
        self.state = TaskStateMachine(task_id)
        self.tracer = Tracer(task_id)

        self.modules = [
            LiteratureModule(),       # M1
            GapAnalysisModule(),      # M2
            IdeaScoringModule(),      # M3
            CodeGenModule(),          # M4
            ExperimentDesignModule(), # M5
            AgentRunnerModule(),      # M6
            AnalysisModule(),         # M7
            PaperWritingModule(),     # M8
            ReviewModule(),           # M9
        ]

    def pause(self):
        self.state.pause()

    def resume(self):
        self.state.resume()

    def abort(self):
        self.state.abort()

    async def submit_review(self, approved: bool, feedback: str):
        await self.state.submit_review(approved, feedback)

    async def _load_task(self) -> Task:
        async with async_session() as db:
            return await db.get(Task, self.task_id)

    async def run(self):
        """执行完整流水线"""
        await self.state.set_status("running")
        task = await self._load_task()
        if not task:
            return

        # 上下文：在模块间传递的数据
        context = {
            "task_id": self.task_id,
            "topic": task.topic,
            "domain": task.domain,
            "config": task.config,
            "workspace": str(config.WORKSPACE_DIR / self.task_id),
        }

        # 确保工作目录存在
        import os
        os.makedirs(context["workspace"], exist_ok=True)

        try:
            # M1 → M6: 顺序执行
            for i, mod in enumerate(self.modules[:6], start=1):
                if self.state.is_aborted:
                    await self.state.set_status("aborted")
                    return

                await self.state.wait_if_paused()

                # 设置初始进度 (每个模块占 ~11%)
                await self.state.set_progress(i, mod.name, 10)
                await self.tracer.log(i, "start", f"开始 {mod.name}")
                self.tracer.step_start()

                context = await mod.execute(context, self.tracer, self.state)

                # 模块完成后设进度为 100
                await self.state.set_progress(i, mod.name, 100)
                await self.tracer.log(i, "done", f"{mod.name} 完成",
                                      duration_ms=self.tracer.step_elapsed_ms())

            # M6→M7 循环(结果不达标可回退)
            max_retries = context.get("config", {}).get(
                "max_retries", config.DEFAULT_EXPERIMENT_RETRIES
            )

            while True:
                if self.state.is_aborted:
                    await self.state.set_status("aborted")
                    return

                await self.state.wait_if_paused()

                # M7: 结果分析
                mod7 = self.modules[6]
                await self.state.set_progress(7, mod7.name, 10)
                await self.tracer.log(7, "start", f"开始 {mod7.name}")
                self.tracer.step_start()

                context = await mod7.execute(context, self.tracer, self.state)

                await self.state.set_progress(7, mod7.name, 100)
                await self.tracer.log(7, "done", f"{mod7.name} 完成",
                                      duration_ms=self.tracer.step_elapsed_ms())

                # 检查是否达标
                if context.get("analysis_passed", False):
                    break

                retry_count = await self.state.increment_retry()
                if retry_count >= max_retries:
                    await self.tracer.log(7, "max_retries",
                                          f"已达最大重试次数 {max_retries}，使用当前结果继续",
                                          level="warn")
                    break

                await self.tracer.log(7, "retry",
                                      f"结果未达标，回退到M6重新实验 (第{retry_count}次重试)",
                                      level="warn")

                # 回退到M6
                mod6 = self.modules[5]
                await self.state.set_progress(6, mod6.name, 55)
                context = await mod6.execute(context, self.tracer, self.state)

            # M8: 论文写作
            if not self.state.is_aborted:
                mod8 = self.modules[7]
                await self.state.set_progress(8, mod8.name, 10)
                await self.tracer.log(8, "start", f"开始 {mod8.name}")
                self.tracer.step_start()
                context = await mod8.execute(context, self.tracer, self.state)
                await self.state.set_progress(8, mod8.name, 100)
                await self.tracer.log(8, "done", f"{mod8.name} 完成",
                                      duration_ms=self.tracer.step_elapsed_ms())

            # M9: 评审打分
            if not self.state.is_aborted:
                mod9 = self.modules[8]
                await self.state.set_progress(9, mod9.name, 10)
                await self.tracer.log(9, "start", f"开始 {mod9.name}")
                self.tracer.step_start()
                context = await mod9.execute(context, self.tracer, self.state)
                await self.state.set_progress(9, mod9.name, 100)
                await self.tracer.log(9, "done", f"{mod9.name} 完成",
                                      duration_ms=self.tracer.step_elapsed_ms())

            # 完成
            await self.state.set_progress(9, "completed", 100)
            await self.state.set_status("completed")
            await self.tracer.mark_completed()

        except Exception as e:
            error_msg = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
            await self.tracer.log_error(0, "pipeline_error", error_msg)
            await self.state.set_status("failed")
