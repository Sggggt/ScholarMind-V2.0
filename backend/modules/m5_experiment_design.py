from __future__ import annotations
"""M5: 实验设计模块

基于 AI-Scientist 重构：
使用 AI-Scientist perform_experiments.py 的 coder_prompt 逻辑，
通过 Aider 让 LLM 规划实验方案并修改 experiment.py。

核心依赖: AI-Scientist perform_experiments.py
"""

import json
import os
import shutil

import config
from modules.aider_runner import check_aider_available, run_aider_prompt
from modules.base import BaseModule
from modules.ai_scientist_bridge import (
    create_async_client_zhipu,
    get_response_from_llm_async,
    extract_json_between_markers,
)
from modules.experiment_guard import (
    build_fallback_experiment_code,
    is_valid_python_file,
    rewrite_experiment_with_llm,
    validate_experiment_file,
)
from pipeline.tracer import Tracer
from pipeline.state import TaskStateMachine

# AI-Scientist 的实验 prompt (共享常量，M6 也会引用)
CODER_PROMPT = """Your goal is to implement the following idea: {title}.
The proposed experiment is as follows: {idea}.
You are given a total of up to {max_runs} runs to complete the necessary experiments. You do not need to use all {max_runs}.

First, plan the list of experiments you would like to run. For example, if you are sweeping over a specific hyperparameter, plan each value you would like to test for each run.

Note that we already provide the vanilla baseline results, so you do not need to re-run it.

For reference, the baseline results are as follows:

{baseline_results}

After you complete each change, we will run the command `python experiment.py --out_dir=run_i' where i is the run number and evaluate the results.
YOUR PROPOSED CHANGE MUST USE THIS COMMAND FORMAT, DO NOT ADD ADDITIONAL COMMAND LINE ARGS.
You can then implement the next thing on your list."""


class ExperimentDesignModule(BaseModule):
    module_id = 5
    name = "实验设计"

    MAX_RUNS = 5

    async def _write_fallback_experiment(
        self,
        experiment_path: str,
        idea_title: str,
        idea_experiment: str,
        tracer: Tracer,
        reason: str,
    ) -> None:
        code = build_fallback_experiment_code(idea_title, idea_experiment)
        with open(experiment_path, "w", encoding="utf-8") as handle:
            handle.write(code)
        await tracer.log(5, "implement_experiments", f"使用本地 fallback experiment.py: {reason}", level="warn")

    async def execute(self, context: dict, tracer: Tracer, state: TaskStateMachine) -> dict:
        best_idea = context.get("best_idea", {})
        project_dir = context.get("project_dir", context.get("code_dir", ""))
        baseline_results = context.get("baseline_results", {})
        workspace = context["workspace"]

        raw_idea = best_idea.get("_raw", best_idea)
        idea_title = raw_idea.get("Title", best_idea.get("title", ""))
        idea_experiment = raw_idea.get("Experiment", best_idea.get("experiment_plan", ""))

        # ── Step 1: 用 LLM 设计实验方案 (AI-Scientist 风格) ──
        tracer.step_start()
        await tracer.log(5, "design_experiments", "设计实验方案 (AI-Scientist coder_prompt)")

        client, model = create_async_client_zhipu()

        prompt = CODER_PROMPT.format(
            title=idea_title,
            idea=idea_experiment,
            max_runs=self.MAX_RUNS,
            baseline_results=json.dumps(baseline_results, indent=2),
        )

        text, _ = await get_response_from_llm_async(
            prompt + "\n\nPlease output your experiment plan as a JSON with the following format:\n"
            '```json\n{"experiments": [{"run_num": 1, "description": "...", '
            '"changes": "what to modify in experiment.py", "expected_outcome": "..."}], '
            '"total_runs_planned": 3}\n```',
            client, model,
            system_message="You are an ambitious AI PhD student planning experiments.",
            temperature=0.7,
        )

        plan_data = extract_json_between_markers(text) or {"experiments": [], "total_runs_planned": 1}
        experiments = plan_data.get("experiments", [])

        await tracer.log(5, "design_experiments",
                         f"设计了 {len(experiments)} 个实验 (最多 {self.MAX_RUNS} runs)")

        # ── Step 2: 用 Aider 实现实验修改 ──
        tracer.step_start()
        await tracer.log(5, "implement_experiments", "使用 Aider 实现实验代码修改")

        experiment_path = os.path.join(project_dir, "experiment.py")
        used_llm_rewrite = False
        aider_status = await check_aider_available()
        full_prompt = CODER_PROMPT.format(
            title=idea_title,
            idea=idea_experiment,
            max_runs=self.MAX_RUNS,
            baseline_results=json.dumps(baseline_results, indent=2),
        )

        if not aider_status.available:
            await tracer.log(
                5,
                "implement_experiments",
                f"Aider 不可用，改为 LLM 全量重写 experiment.py: {aider_status.detail}",
                level="warn",
            )
            code = await rewrite_experiment_with_llm(
                idea_title=idea_title,
                idea_experiment=idea_experiment,
                baseline_results=baseline_results,
                plan_data=plan_data,
            )
            with open(experiment_path, "w", encoding="utf-8") as handle:
                handle.write(code)
            used_llm_rewrite = True
        else:
            try:
                result = await run_aider_prompt(
                    prompt=full_prompt,
                    files=[experiment_path],
                    cwd=project_dir,
                    edit_format="diff",
                    timeout=max(config.AI_SCIENTIST_TIMEOUT, 300),
                )
                if result.ok:
                    await tracer.log(5, "implement_experiments", "Aider 完成实验代码修改")
                else:
                    raise RuntimeError(result.output or result.detail)

            except Exception as e:
                await tracer.log(5, "implement_experiments",
                                 f"Aider 失败，改为 LLM 全量重写: {e}", level="warn")
                code = await rewrite_experiment_with_llm(
                    idea_title=idea_title,
                    idea_experiment=idea_experiment,
                    baseline_results=baseline_results,
                    plan_data=plan_data,
                )
                with open(experiment_path, "w", encoding="utf-8") as handle:
                    handle.write(code)
                used_llm_rewrite = True

        if not is_valid_python_file(experiment_path) and not used_llm_rewrite:
            await tracer.log(
                5,
                "implement_experiments",
                "代码未通过语法校验，改为 LLM 全量重写",
                level="warn",
            )
            code = await rewrite_experiment_with_llm(
                idea_title=idea_title,
                idea_experiment=idea_experiment,
                baseline_results=baseline_results,
                plan_data=plan_data,
            )
            with open(experiment_path, "w", encoding="utf-8") as handle:
                handle.write(code)
            used_llm_rewrite = True

        if not is_valid_python_file(experiment_path):
            await self._write_fallback_experiment(
                experiment_path,
                idea_title,
                idea_experiment,
                tracer,
                "LLM/Aider 结果不是有效 Python",
            )

        if not is_valid_python_file(experiment_path):
            raise RuntimeError("M5 generated experiment.py is not valid Python")

        validation = validate_experiment_file(experiment_path, idea_title, idea_experiment)
        if not validation.ok and not used_llm_rewrite:
            await tracer.log(
                5,
                "implement_experiments",
                f"代码未通过静态门禁，改为 LLM 全量重写: {validation.summary()}",
                level="warn",
            )
            code = await rewrite_experiment_with_llm(
                idea_title=idea_title,
                idea_experiment=idea_experiment,
                baseline_results=baseline_results,
                plan_data=plan_data,
            )
            with open(experiment_path, "w", encoding="utf-8") as handle:
                handle.write(code)
            if not is_valid_python_file(experiment_path):
                await self._write_fallback_experiment(
                    experiment_path,
                    idea_title,
                    idea_experiment,
                    tracer,
                    "LLM 全量重写后仍然不是有效 Python",
                )
                if not is_valid_python_file(experiment_path):
                    raise RuntimeError("M5 fallback experiment.py is not valid Python")
            validation = validate_experiment_file(experiment_path, idea_title, idea_experiment)

        if not validation.ok:
            await self._write_fallback_experiment(
                experiment_path,
                idea_title,
                idea_experiment,
                tracer,
                f"静态门禁失败: {validation.summary()}",
            )
            validation = validate_experiment_file(experiment_path, idea_title, idea_experiment)
            if not validation.ok:
                raise RuntimeError(f"M5 experiment gate failed: {validation.summary()}")
        await tracer.log(5, "implement_experiments", "experiment.py 通过静态门禁")

        # ── 保存产出 ──
        plan_path = os.path.join(workspace, "m5_experiment_plan.json")
        with open(plan_path, "w", encoding="utf-8") as f:
            json.dump(plan_data, f, ensure_ascii=False, indent=2)

        # 复制当前 experiment.py 作为备份
        exp_src = os.path.join(project_dir, "experiment.py")
        if os.path.exists(exp_src):
            shutil.copy2(exp_src, os.path.join(project_dir, "experiment_planned.py"))

        await tracer.save_output(5, "experiment_plan", file_path=plan_path,
                                  metadata={"experiment_count": len(experiments)})

        context["experiment_plan"] = plan_data
        context["experiments"] = experiments
        context["max_runs"] = self.MAX_RUNS

        return context
