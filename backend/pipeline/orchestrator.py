from __future__ import annotations

"""Pipeline orchestrator for modules M1-M9."""

import glob
import json
import os
import traceback
from datetime import datetime, timezone
from pathlib import Path

from db.database import async_session
from db.models import Task
from modules.m1_literature import LiteratureModule
from modules.m2_gap_analysis import GapAnalysisModule
from modules.m3_idea_scoring import IdeaScoringModule
from modules.m4_code_gen import CodeGenModule
from modules.m5_experiment_design import ExperimentDesignModule
from modules.m6_agent_runner import AgentRunnerModule
from modules.m7_analysis import AnalysisModule
from modules.m8_paper_writing import PaperWritingModule
from modules.m9_review import ReviewModule
from pipeline.state import TaskStateMachine, TaskAborted, TaskPaused
from pipeline.tracer import Tracer

import config


def _utcnow():
    return datetime.now(timezone.utc)
from runtime_config import bind_runtime_settings, reset_runtime_settings, resolve_runtime_settings


class PipelineOrchestrator:
    """Execute the research pipeline with instant abort/pause support."""

    def __init__(self, task_id: str, start_module: int = 1):
        self.task_id = task_id
        self.start_module = max(1, min(9, int(start_module)))
        self.state = TaskStateMachine(task_id)
        self.tracer = Tracer(task_id)
        self._task: asyncio.Task | None = None

        self.modules = [
            LiteratureModule(),
            GapAnalysisModule(),
            IdeaScoringModule(),
            CodeGenModule(),
            ExperimentDesignModule(),
            AgentRunnerModule(),
            AnalysisModule(),
            PaperWritingModule(),
            ReviewModule(),
        ]

    # ── public control surface ─────────────────────────

    def pause(self):
        self.state.pause()

    def resume(self):
        self.state.resume()

    def abort(self):
        self.state.abort()
        # Force-cancel the running asyncio.Task if one exists
        if self._task and not self._task.done():
            self._task.cancel()

    async def submit_review(self, approved: bool, feedback: str):
        await self.state.submit_review(approved, feedback)

    # ── internals ──────────────────────────────────────

    async def _load_task(self) -> Task | None:
        async with async_session() as db:
            return await db.get(Task, self.task_id)

    def _read_text(self, path: Path, default: str = "") -> str:
        if not path.exists():
            return default
        return path.read_text(encoding="utf-8", errors="replace")

    def _read_json(self, path: Path, default):
        if not path.exists():
            return default
        try:
            return json.loads(path.read_text(encoding="utf-8", errors="replace"))
        except json.JSONDecodeError:
            return default

    def _find_project_dir(self, workspace: Path) -> Path | None:
        project_root = workspace / "project"
        if not project_root.exists():
            return None

        candidates = sorted(path for path in project_root.iterdir() if path.is_dir())
        return candidates[0] if candidates else None

    def _load_run_results(self, project_dir: Path | None, experiment_results: list[dict] | None = None) -> dict:
        all_run_results: dict = {}
        if project_dir and project_dir.exists():
            for run_dir in sorted(glob.glob(os.path.join(str(project_dir), "run_*"))):
                info_path = os.path.join(run_dir, "final_info.json")
                if not os.path.exists(info_path):
                    continue

                with open(info_path, encoding="utf-8", errors="replace") as handle:
                    data = json.load(handle)
                all_run_results[os.path.basename(run_dir)] = {
                    key: value["means"] if isinstance(value, dict) and "means" in value else value
                    for key, value in data.items()
                }

        for result in experiment_results or []:
            if result.get("status") == "success" and result.get("metrics"):
                all_run_results[result["experiment"]] = result["metrics"]

        return all_run_results

    def _restore_context(self, task: Task) -> dict:
        workspace = Path(config.WORKSPACE_DIR / self.task_id)
        workspace.mkdir(parents=True, exist_ok=True)

        # 从任务配置中获取自定义代码目录（前端设置的本地文件夹）
        custom_work_dir = task.config.get("work_dir") if task.config else None
        code_dir = None
        if custom_work_dir:
            code_dir = config.resolve_task_work_dir(str(custom_work_dir)) / self.task_id / "code"
            code_dir.mkdir(parents=True, exist_ok=True)

        context = {
            "task_id": self.task_id,
            "topic": task.topic,
            "domain": task.domain,
            "config": task.config,
            "runtime_settings": resolve_runtime_settings(task.config),
            "workspace": str(workspace),
            "code_dir": str(code_dir) if code_dir else None,
        }

        if self.start_module <= 1:
            return context

        review_path = workspace / "m1_literature_review.md"
        sources_path = workspace / "m1_sources.json"
        sources_payload = self._read_json(sources_path, {})
        sources = sources_payload.get("sources", []) if isinstance(sources_payload, dict) else []
        context["literature_review"] = self._read_text(review_path)
        context["research_sources"] = sources
        context["visited_urls"] = sources_payload.get("visited_urls", []) if isinstance(sources_payload, dict) else []
        context["selected_papers"] = sources

        if self.start_module <= 2:
            return context

        gap_path = workspace / "m2_gap_analysis.json"
        gap_payload = self._read_json(gap_path, {})
        context["research_gaps"] = gap_payload.get("gaps", []) if isinstance(gap_payload, dict) else []
        ai_scientist_dir = workspace / "ai_scientist_workspace"
        context["ai_scientist_dir"] = str(ai_scientist_dir)
        context["prompt_json"] = self._read_json(ai_scientist_dir / "prompt.json", {})
        context["seed_ideas"] = self._read_json(ai_scientist_dir / "seed_ideas.json", [])

        if self.start_module <= 3:
            return context

        ideas_path = workspace / "m3_scored_ideas.json"
        ideas_payload = self._read_json(ideas_path, {})
        scored_ideas = ideas_payload.get("scored_ideas", []) if isinstance(ideas_payload, dict) else []
        best_index = ideas_payload.get("best_idea_index", 0) if isinstance(ideas_payload, dict) else 0
        best_index = best_index if 0 <= best_index < len(scored_ideas) else 0
        context["scored_ideas"] = scored_ideas
        context["best_idea_index"] = best_index
        context["best_idea"] = scored_ideas[best_index] if scored_ideas else {}
        context["all_ideas_raw"] = self._read_json(ai_scientist_dir / "ideas.json", [])

        # ── 读取 Idea 选择信息（用于替换模式）──
        selection_path = workspace / "idea_selection.json"
        if selection_path.exists():
            selection_info = self._read_json(selection_path, {})
            context["is_replacing_idea"] = selection_info.get("replace_mode", False)
            context["previous_idea_title"] = selection_info.get("idea_title", "")
            if selection_info.get("replace_mode"):
                context["selected_idea_index"] = selection_info.get("idea_index", best_index)
                # 如果是替换模式，使用新选择的 idea
                if selection_info.get("idea_index", best_index) != best_index:
                    new_index = selection_info.get("idea_index", best_index)
                    if 0 <= new_index < len(scored_ideas):
                        context["best_idea"] = scored_ideas[new_index]
                        context["best_idea_index"] = new_index
        else:
            context["is_replacing_idea"] = False

        if self.start_module <= 4:
            return context

        project_dir = self._find_project_dir(workspace)
        if project_dir:
            context["project_dir"] = str(project_dir)
            context["code_dir"] = str(project_dir)
            context["code_files"] = [
                os.path.relpath(os.path.join(root, filename), str(project_dir))
                for root, dirs, files in os.walk(project_dir)
                for filename in files
                if ".git" not in Path(root).parts and not any(part.startswith("run_") for part in Path(root).parts)
            ]
            baseline_path = project_dir / "run_0" / "final_info.json"
            context["baseline_results"] = self._read_json(baseline_path, {})
            context["run_command"] = "python experiment.py --out_dir=run_1"

        if self.start_module <= 5:
            return context

        plan_path = workspace / "m5_experiment_plan.json"
        plan_payload = self._read_json(plan_path, {})
        context["experiment_plan"] = plan_payload
        context["experiments"] = plan_payload.get("experiments", []) if isinstance(plan_payload, dict) else []
        context["max_runs"] = plan_payload.get("total_runs_planned", 5) if isinstance(plan_payload, dict) else 5

        if self.start_module <= 6:
            return context

        results_path = workspace / "m6_experiment_results.json"
        results_payload = self._read_json(results_path, {})
        experiment_results = results_payload.get("results", []) if isinstance(results_payload, dict) else []
        context["experiment_results"] = experiment_results
        context["experiment_full_data"] = self._read_json(workspace / "experiment_data.json", {})
        if project_dir and (project_dir / "figures").exists():
            context["figure_paths"] = [
                str(path) for path in sorted((project_dir / "figures").glob("*")) if path.is_file()
            ]

        if self.start_module <= 7:
            return context

        analysis_path = workspace / "m7_analysis.json"
        analysis_payload = self._read_json(analysis_path, {})
        context["analysis_data"] = analysis_payload if isinstance(analysis_payload, dict) else {}
        context["analysis_passed"] = bool(context["analysis_data"].get("passed", False))
        context["key_findings"] = context["analysis_data"].get("key_findings", [])
        context["analysis_report"] = self._read_text(workspace / "m7_analysis_report.md")
        context["all_run_results"] = self._load_run_results(project_dir, experiment_results)

        if self.start_module <= 8:
            return context

        paper_dir = workspace / "paper"
        if paper_dir.exists():
            context["paper_dir"] = str(paper_dir)
            if (paper_dir / "paper.tex").exists():
                context["paper_latex"] = str(paper_dir / "paper.tex")
            if (paper_dir / "paper.pdf").exists():
                context["paper_pdf"] = str(paper_dir / "paper.pdf")

        return context

    def _save_checkpoint(self, completed_module: int, context: dict):
        """Write checkpoint so restart/resume knows exactly where to pick up."""
        workspace = Path(config.WORKSPACE_DIR / self.task_id)
        workspace.mkdir(parents=True, exist_ok=True)
        checkpoint = {
            "task_id": self.task_id,
            "last_completed_module": completed_module,
            "next_module": completed_module + 1,
            "topic": context.get("topic", ""),
            "saved_at": _utcnow().isoformat(),
        }
        (workspace / "_checkpoint.json").write_text(
            json.dumps(checkpoint, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    async def _execute_module(self, mod, module_number: int, context: dict) -> dict:
        """Run a single module with abort/pause guards."""
        self.state.check_control()

        await self.state.set_progress(module_number, mod.name, 10)
        await self.tracer.log(module_number, "start", f"开始{mod.name}")
        self.tracer.step_start()

        context = await mod.execute(context, self.tracer, self.state)

        self.state.check_control()

        await self.state.set_progress(module_number, mod.name, 100)
        await self.tracer.log(
            module_number,
            "done",
            f"{mod.name} 完成",
            duration_ms=self.tracer.step_elapsed_ms(),
        )
        self._save_checkpoint(module_number, context)
        return context

    async def _run_linear_modules(self, context: dict, start_module: int, end_module: int) -> dict:
        for module_number in range(start_module, end_module + 1):
            mod = self.modules[module_number - 1]
            context = await self._execute_module(mod, module_number, context)
        return context

    async def run(self):
        await self.state.set_status("running")
        task = await self._load_task()
        if not task:
            return

        context = self._restore_context(task)
        runtime_token = bind_runtime_settings(context.get("runtime_settings"))

        try:
            # M1-M2: 文献和缺口分析
            if self.start_module <= 2:
                context = await self._run_linear_modules(context, self.start_module, 2)

            # M3: 构思生成，执行后暂停等待用户选择
            if self.start_module <= 3:
                mod3 = self.modules[2]
                context = await self._execute_module(mod3, 3, context)

                # M3 完成后暂停，等待用户调用 select-idea API
                await self.state.set_status("paused")
                await self.tracer.log(3, "paused", "M3 已完成，任务暂停等待用户选择 Idea")
                return

            # M4-M6: 代码生成、实验设计、Agent运行
            if 4 <= self.start_module <= 6:
                context = await self._run_linear_modules(context, self.start_module, 6)

            max_retries = context.get("config", {}).get(
                "max_retries", config.DEFAULT_EXPERIMENT_RETRIES
            )

            if self.start_module <= 7:
                while True:
                    mod7 = self.modules[6]
                    context = await self._execute_module(mod7, 7, context)

                    if context.get("analysis_passed", False):
                        break

                    retry_count = await self.state.increment_retry()
                    if retry_count >= max_retries:
                        await self.tracer.log(
                            7, "max_retries",
                            f"已达最大重试次数 {max_retries}，使用当前结果继续",
                            level="warn",
                        )
                        break

                    await self.tracer.log(
                        7, "retry",
                        f"结果未达标，回退到 M6 重新实验（第 {retry_count} 次重试）",
                        level="warn",
                    )

                    mod6 = self.modules[5]
                    context = await self._execute_module(mod6, 6, context)

            if self.start_module <= 8:
                context = await self._run_linear_modules(context, 8, 8)

            if self.start_module <= 9:
                context = await self._run_linear_modules(context, 9, 9)

            await self.state.set_progress(9, "completed", 100)
            await self.state.set_status("completed")
            await self.tracer.mark_completed()

        except TaskAborted:
            await self.tracer.log(0, "aborted", "任务已被用户终止")
            await self.state.set_status("aborted")
        except TaskPaused:
            await self.tracer.log(0, "paused", "任务已暂停")
            await self.state.set_status("paused")
        except asyncio.CancelledError:
            # CancelledError means the orchestrator task was force-cancelled (abort)
            await self.tracer.log(0, "cancelled", "任务被强制取消")
            await self.state.set_status("aborted")
        except Exception as exc:
            error_msg = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}"
            await self.tracer.log_error(0, "pipeline_error", error_msg)
            await self.state.set_status("failed")
        finally:
            reset_runtime_settings(runtime_token)


# Need this import at the bottom to avoid circular imports
import asyncio
